"""Item 11: prove every dashboard metric comes from database records.

Recomputes each KPI with independent raw SQL (no pandas, no app code) against the live SQLite file and compares it
with what the running API returns. Read-only.

    CL_EMAIL=... CL_PASSWORD=... backend/.venv/Scripts/python scripts/verify_metrics.py [--api http://127.0.0.1:8000]
"""
import json
import os
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DB = Path(os.environ.get("CL_DB", ROOT / "backend/data/causeline.db"))
API = sys.argv[sys.argv.index("--api") + 1] if "--api" in sys.argv else "http://127.0.0.1:8000"
OPEN = ("Open", "Under investigation", "Awaiting customer information")


def sql_metrics(c: sqlite3.Connection) -> dict:
    one = lambda q, *a: c.execute(q, a).fetchone()[0]
    m = {
        "total_complaints": one("select count(*) from complaints"),
        "open_complaints": one(f"select count(*) from complaints where complaint_status in ({','.join('?' * len(OPEN))})", *OPEN),
        "critical_complaints": one("select count(*) from complaints where complaint_severity='Critical'"),
        "food_safety_related": one("select count(*) from complaints where food_safety_related_flag=1"),
        "recurred_after_prior_capa": one("select count(*) from complaints where recurrence_after_prior_capa=1"),
        "public_submissions": one("select count(*) from complaints where source='public'"),
        "new_last_30_days": one("select count(*) from complaints where complaint_received_date >= ?", (date.today() - timedelta(days=30)).isoformat()),
        "analysis_incomplete": one("select count(*) from complaints where analysis_status in ('pending','partial','failed')"),
        "pending_reviews": one("select count(*) from predictions where review_status='pending'"),
        "date_min": one("select min(complaint_received_date) from complaints"),
        "date_max": one("select max(complaint_received_date) from complaints"),
        "synthetic_share": round(one("select avg(is_synthetic) from complaints"), 4),
    }
    # CAPA: one CAPA per capa_id; its label = most frequent recorded effectiveness status among its originating complaints
    labels = defaultdict(Counter)
    for cid, st in c.execute("select capa_id, capa_effectiveness_status from complaints where capa_id is not null"):
        labels[cid][st] += 1
    first_word = {}
    for cid, cnt in labels.items():
        top = max(cnt.values())
        st = sorted(k for k, v in cnt.items() if v == top and k is not None)  # ties -> alphabetical (pandas mode order)
        first_word[cid] = (st[0] if st else "").split(" ")[0]
    eff = Counter(first_word.values())
    # Zombie CAPAs: closed (label not "CAPA not closed", not open in watchlist) with >= 1 identifier-linked recurrence
    full_label = {}
    for cid, cnt in labels.items():
        top = max(cnt.values())
        st = sorted(k for k, v in cnt.items() if v == top and k is not None)
        full_label[cid] = st[0] if st else ""
    open_wl = {r[0] for r in c.execute("select capa_id from capa_watchlist where capa_status != 'Closed'")}
    recurred = {r[0] for r in c.execute("select distinct prior_capa_id from complaints where prior_capa_id is not null and recurrence_after_prior_capa=1")}
    closed = {k for k, lab in full_label.items() if "CAPA not closed" not in lab and k not in open_wl}
    m.update(closed_capas=len(closed), zombie_capas=len(closed & recurred))
    assess = eff["Effective"] + eff["Ineffective"]
    m.update(capas_total=len(labels), capas_pending=eff["Pending"], capa_assessable=assess,
             capa_ineffective_rate=round(eff["Ineffective"] / assess, 4) if assess else None)
    # AI food-safety escalations: latest completed food-safety prediction per complaint
    latest = {}
    for pk, out in c.execute("""select p.complaint_pk, p.output_payload from predictions p join model_versions v on v.id=p.model_version_id
                                where v.model_key='food-safety-flag' and p.status='completed' and p.complaint_pk is not null order by p.created_at"""):
        latest[pk] = bool((json.loads(out) if out else {}).get("escalate_for_food_safety_review"))
    m.update(ai_food_safety_assessed=len(latest), ai_food_safety_escalations=sum(latest.values()))
    return m


def main():
    c = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    s = httpx.Client(base_url=API, timeout=60)
    r = s.post("/api/auth/login", json={"email": os.environ["CL_EMAIL"], "password": os.environ["CL_PASSWORD"]})
    r.raise_for_status()
    d = s.get("/api/dashboard").json()
    k, exp = d["kpis"], sql_metrics(c)
    rows, ok = [], True
    for name, want in exp.items():
        got = k.get(name)
        if name.startswith("date_"):
            want = str(want)[:10]
        good = got == want
        ok &= good
        rows.append((name, got, want, "OK" if good else "MISMATCH"))
    # chart totals
    total = exp["total_complaints"]
    month_sum = sum(x["total"] for x in d["monthly"])
    cat_total = c.execute("select count(*) from complaints where complaint_category is not null").fetchone()[0]
    top_cat = c.execute("select complaint_category, count(*) n from complaints where complaint_category is not null group by 1 order by n desc limit 1").fetchone()
    p = d["category_pareto"]["rows"][0]
    top_prod = c.execute("select product_name, count(*) n from complaints group by 1 order by n desc limit 1").fetchone()
    for name, got, want in [("monthly_trend_sum", month_sum, total), ("pareto_total", d["category_pareto"]["total"], cat_total),
                            ("pareto_top_category", [p["label"], int(p["value"])], list(top_cat)),
                            ("top_product", [d["top_products"][0]["label"], d["top_products"][0]["count"]], list(top_prod))]:
        good = got == want
        ok &= good
        rows.append((name, got, want, "OK" if good else "MISMATCH"))
    w = max(len(r[0]) for r in rows)
    for n, g, e, st in rows:
        print(f"{n:<{w}}  api={g!s:<28} sql={e!s:<28} {st}")
    print(f"\n{sum(r[3] == 'OK' for r in rows)}/{len(rows)} metrics match the database" + ("" if ok else "  <-- MISMATCHES"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
