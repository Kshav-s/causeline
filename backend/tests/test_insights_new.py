"""Zombie CAPA detector, Zero Complaint Path Simulator, recurring batches, HACCP control points."""
from collections import Counter, defaultdict

from sqlalchemy import select

from app.models import CapaWatchlistEntry, Complaint


def _independent_zombies(db):
    """Recompute zombies from raw rows without the analytics module."""
    labels = defaultdict(Counter)
    origin = {}
    for c in db.scalars(select(Complaint).where(Complaint.capa_id.is_not(None))).all():
        labels[c.capa_id][c.capa_effectiveness_status] += 1
        origin.setdefault(c.capa_id, c)
    open_wl = {w.capa_id for w in db.scalars(select(CapaWatchlistEntry)).all() if w.capa_status != "Closed"}
    rec = Counter(c.prior_capa_id for c in db.scalars(select(Complaint).where(Complaint.prior_capa_id.is_not(None),
                                                                            Complaint.recurrence_after_prior_capa.is_(True))).all())
    closed = {k for k, v in labels.items() if "CAPA not closed" not in (v.most_common(1)[0][0] or "") and k not in open_wl}
    return {k: rec[k] for k in closed if rec[k]}, closed


def test_zombie_capas_match_independent_computation(admin, db):
    want, closed = _independent_zombies(db)
    r = admin.get("/api/capa/zombies", params={"page_size": 100}).json()
    assert r["summary"]["zombies"] == len(want) and r["summary"]["closed_capas"] == len(closed)
    assert r["total"] == len(want)
    for it in r["items"]:
        assert want[it["capa_id"]] == it["recurrences"] > 0                       # identifier-linked recurrences only
        assert "CAPA not closed" not in (it["effectiveness_label"] or "")          # only closed CAPAs
        assert it["same_cause"] + it["different_cause"] + it["unknown_cause"] == it["recurrences"]
    assert "identifier" in r["rule"] and "Closure dates are not in the supplied data" in r["rule"]
    k = admin.get("/api/dashboard").json()["kpis"]
    assert k["zombie_capas"] == len(want)


def test_zombie_detail_links_previous_investigations(admin, db):
    want, _ = _independent_zombies(db)
    if not want:
        return
    cid = sorted(want)[0]
    d = admin.get(f"/api/capa/{cid}").json()
    assert d["zombie"]["is_zombie"] is True and d["zombie"]["recurrences"] == want[cid]
    assert all("investigation_id" in c and "root_cause_category" in c for c in d["originating_complaints"] + d["recurrences"])


def test_zombie_endpoint_requires_login_and_validates(client):
    client.cookies.clear()
    assert client.get("/api/capa/zombies").status_code == 401


def test_zombie_sort_and_filter(admin):
    r = admin.get("/api/capa/zombies", params={"sort": "days_to_first", "order": "asc", "page_size": 100}).json()
    days = [i["days_to_first_recurrence"] for i in r["items"] if i["days_to_first_recurrence"] is not None]
    assert days == sorted(days)
    same = admin.get("/api/capa/zombies", params={"cause": "same", "page_size": 100}).json()
    assert all(i["same_cause"] > 0 for i in same["items"])
    assert admin.get("/api/capa/zombies", params={"sort": "drop table"}).status_code == 422


# ---------------------------------------------------------------- reference date (data-gap fix)
def _frame(dates):
    import pandas as pd
    return pd.DataFrame({"complaint_received_date": pd.to_datetime(dates)})


def test_reference_date_is_latest_complaint_when_coverage_is_continuous():
    import pandas as pd
    from app.analytics.complaints import reference_date
    dates = pd.date_range("2022-01-15", "2025-12-15", freq="MS") + pd.Timedelta(days=14)
    ref, note = reference_date(_frame(dates))
    assert ref == dates.max() and note is None


def test_reference_date_moves_back_over_an_empty_gap_and_says_why():
    """Historical import ends 2025-12, one live complaint in 2026-11: windows must not be anchored in the empty gap."""
    import pandas as pd
    from app.analytics.complaints import reference_date
    dates = list(pd.date_range("2022-01-10", "2025-12-10", freq="MS") + pd.Timedelta(days=9)) + [pd.Timestamp("2026-11-23")]
    ref, note = reference_date(_frame(dates))
    assert ref == pd.Timestamp("2025-12-31") and "2026-01 to 2026-10" in note


# ---------------------------------------------------------------- Zero Complaint Path Simulator
def test_simulator_is_labelled_estimate_and_internally_consistent(admin):
    r = admin.get("/api/analytics/zero-complaint-path", params={"months": 12}).json()
    assert r["label"] == "ESTIMATE" and len(r["assumptions"]) >= 5 and "Wilson" in r["method"]
    assert r["baseline"] == r["attributable"] + r["unattributed"]
    sel = [x for x in r["rows"] if x["selected"]]
    assert all(x["estimable"] and x["assessed_capas"] >= 10 for x in sel)              # no estimate from thin data
    assert all(x["avoidable_estimate"] is None for x in r["rows"] if not x["estimable"])
    for x in sel:
        lo, hi = x["avoidable_range"]
        assert lo <= x["avoidable_estimate"] <= hi <= x["baseline_complaints"]
        assert abs(x["avoidable_estimate"] - x["baseline_complaints"] * x["effectiveness_rate"]) < 0.11
    assert abs(r["avoidable_estimate"] - sum(x["avoidable_estimate"] for x in sel)) < 0.5
    assert r["remaining_estimate"] >= r["unattributed"]                                  # unattributed complaints never reduced
    assert r["path"][0]["remaining"] == r["baseline"] and len(r["path"]) == len(sel) + 1
    rem = [p["remaining"] for p in r["path"]]
    assert rem == sorted(rem, reverse=True)


def test_simulator_selection_and_validation(admin):
    full = admin.get("/api/analytics/zero-complaint-path").json()
    est = [x["root_cause_category"] for x in full["rows"] if x["estimable"]]
    if est:
        one = admin.get("/api/analytics/zero-complaint-path", params={"cause": est[0]}).json()
        assert [x["root_cause_category"] for x in one["rows"] if x["selected"]] == [est[0]]
    none = admin.get("/api/analytics/zero-complaint-path", params={"all_causes": "false"}).json()
    assert none["avoidable_estimate"] == 0 and none["remaining_estimate"] == none["baseline"]
    assert admin.get("/api/analytics/zero-complaint-path", params={"months": 1}).status_code == 422


def test_simulator_matches_recorded_effectiveness(admin):
    r = admin.get("/api/analytics/zero-complaint-path").json()
    eff = {x["label"]: x for x in admin.get("/api/capa/effectiveness", params={"dimension": "root_cause_category"}).json()["rows"]}
    for x in r["rows"]:
        if x["estimable"]:
            assert abs(x["effectiveness_rate"] - (1 - eff[x["root_cause_category"]]["ineffective_rate"])) < 1e-3


def test_simulator_on_full_supplied_dataset_matches_independent_recount():
    """The 400-row test sample has no cause with >= 10 assessed CAPAs, so the estimate branch is exercised on the full file."""
    import pandas as pd
    from app.analytics import complaints as an
    from app.core.config import get_settings
    raw = pd.read_csv(get_settings().nlp_dir / "data" / "01_ABT_CPD_Complaints_18000.csv", encoding="utf-8-sig")
    df = raw.assign(id=range(len(raw)), complaint_received_date=pd.to_datetime(raw.complaint_received_date))
    df["sev_w"] = df.complaint_severity.map(an.SEV_W).fillna(1)
    df["eff"] = df.capa_effectiveness_status.fillna("").str.split(" ").str[0]
    r = an.zero_complaint_path(df, 12)
    est = [x for x in r["rows"] if x["estimable"]]
    assert len(est) >= 10 and r["window"]["to"] == "2025-12-31"
    # independent recount: one label per CAPA (most frequent), effectiveness = Effective / (Effective + Ineffective)
    capa = df[df.capa_id.notna()].groupby("capa_id").agg(rc=("root_cause_category", "first"),
                                                          lab=("capa_effectiveness_status", lambda s: s.mode().iloc[0]))
    capa["w"] = capa.lab.str.split(" ").str[0]
    a = capa[capa.w.isin(["Effective", "Ineffective"])]
    for x in est:
        g = a[a.rc == x["root_cause_category"]]
        assert len(g) == x["assessed_capas"]
        assert abs(x["effectiveness_rate"] - (g.w == "Effective").mean()) < 1e-3
        assert x["avoidable_range"][0] <= x["avoidable_estimate"] <= x["avoidable_range"][1]
    w = df[(df.complaint_received_date >= "2025-01-01") & (df.complaint_received_date <= "2025-12-31")]
    assert r["baseline"] == len(w)
    assert r["attributable"] == int((w.root_cause_status.isin(["Confirmed", "Probable"]) & w.root_cause_category.notna()).sum())
    assert r["remaining_range"][0] <= r["remaining_estimate"] <= r["remaining_range"][1]
    assert r["remaining_estimate"] >= r["unattributed"]


# ---------------------------------------------------------------- recurring batches + HACCP control points
def test_recurring_batches_match_supplied_report_on_full_dataset():
    import pandas as pd
    from app.analytics import complaints as an
    from app.core.config import get_settings
    raw = pd.read_csv(get_settings().nlp_dir / "data" / "01_ABT_CPD_Complaints_18000.csv", encoding="utf-8-sig")
    df = raw.assign(id=range(len(raw)), complaint_received_date=pd.to_datetime(raw.complaint_received_date))
    df["sev_w"] = df.complaint_severity.map(an.SEV_W).fillna(1)
    b, s = an.recurring_batches(df)
    ref = pd.read_csv(get_settings().ml_dir / "outputs" / "reports" / "recurring_batches.csv")
    assert s["batches_with_complaints"] == len(ref)
    assert s["recurring_batches"] == int(ref.recurring_batch_flag.sum())
    assert s["max_complaints_single_batch"] == int(ref.complaints.max())
    top = b.iloc[0]
    assert top.batch_id == ref.sort_values(["complaints", "severity_weighted"], ascending=False).iloc[0].batch_id


def test_recurring_batches_endpoint(admin, db):
    r = admin.get("/api/risk/recurring-batches", params={"page_size": 100}).json()
    assert all(i["complaints"] >= 2 for i in r["items"]) and "batch_id" in r["rule"]
    for i in r["items"][:5]:
        n = db.query(Complaint).filter(Complaint.batch_id == i["batch_id"]).count()
        assert n == i["complaints"]
    allb = admin.get("/api/risk/recurring-batches", params={"recurring_only": "false", "page_size": 1}).json()
    assert allb["total"] == r["summary"]["batches_with_complaints"]


def test_haccp_states_plan_missing_and_lists_control_points(admin, db):
    r = admin.get("/api/analytics/haccp").json()
    assert r["plan_available"] is False and "No HACCP plan was supplied" in r["plan_note"]
    assert r["controls"] and sum(c["complaints"] for c in r["controls"]) == db.query(Complaint).filter(Complaint.haccp_control_id.is_not(None)).count()
    c0 = r["controls"][0]
    assert c0["potential_gap_flags"] == db.query(Complaint).filter(Complaint.haccp_control_id == c0["control_id"],
                                                                  Complaint.potential_haccp_gap_flag.is_(True)).count()
