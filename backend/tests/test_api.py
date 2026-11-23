"""API tests: auth, authorization, validation, persistence, ML workflow, uploads, bookings."""
import io

from sqlalchemy import func, select

from app.models import AuditLog, Complaint, Prediction, PredictionReview


# ---------------------------------------------------------------- auth
def test_protected_requires_login(client):
    client.cookies.clear()
    for path in ("/api/dashboard", "/api/complaints", "/api/ml/models", "/api/capa", "/api/uploads"):
        assert client.get(path).status_code == 401


def test_login_failure_generic_message(client):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "admin@test.local", "password": "wrong"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid email or password"
    r = client.post("/api/auth/login", json={"email": "nobody@test.local", "password": "wrong"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid email or password"


def test_session_cookie_is_httponly(client):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "analyst@test.local", "password": "TestPassw0rd!"})
    sc = r.headers["set-cookie"].lower()
    assert "httponly" in sc and "samesite=strict" in sc


def test_analyst_cannot_access_admin(analyst):
    assert analyst.get("/api/admin/users").status_code == 403
    assert analyst.get("/api/admin/audit").status_code == 403


def test_capabilities(admin):
    j = admin.get("/api/meta/capabilities").json()
    assert j["modules"]["ai_analysis"] is True and j["data"]["demo_data"] is True and j["role"] == "admin"


# ---------------------------------------------------------------- complaints
def test_list_filters_and_tabs(admin):
    j = admin.get("/api/complaints", params={"page_size": 5, "severity": "Critical"}).json()
    assert all(i["complaint_severity"] == "Critical" for i in j["items"])
    assert j["tab_counts"]["all"] >= j["tab_counts"]["open"]
    assert admin.get("/api/complaints", params={"sort": "drop table"}).status_code == 422


def test_create_complaint_validation_and_persistence(analyst, db):
    bad = analyst.post("/api/complaints", json={"complaint_received_date": "2099-01-01", "product_name": "X", "complaint_description": "short"})
    assert bad.status_code == 422
    fields = {e["field"] for e in bad.json()["errors"]}
    assert {"complaint_received_date", "product_name", "complaint_description"} <= fields
    ok = analyst.post("/api/complaints", json={"complaint_received_date": "2026-11-01", "product_name": "Wheat flour",
                                               "food_family": "Grains & cereals",
                                               "complaint_description": "Customer found small insects moving inside a sealed flour bag."})
    assert ok.status_code == 201
    cid = ok.json()["complaint_id"]
    assert cid.startswith("CL-2026-")
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == cid))
    assert c.source == "manual" and c.is_synthetic is False and c.complaint_category is None
    assert db.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == "complaint.create", AuditLog.entity_id == cid)) == 1


def test_update_requires_reason_and_is_audited(analyst, first_complaint, db):
    cid = first_complaint.complaint_id
    assert analyst.patch(f"/api/complaints/{cid}", json={"owner": "QA Lead"}).status_code == 422
    r = analyst.patch(f"/api/complaints/{cid}", json={"owner": "QA Lead", "change_reason": "Assigned for investigation"})
    assert r.status_code == 200 and r.json()["owner"] == "QA Lead"
    log = db.scalar(select(AuditLog).where(AuditLog.action == "complaint.update", AuditLog.entity_id == cid))
    assert log.details["changes"]["owner"]["to"] == "QA Lead"


# ---------------------------------------------------------------- ML workflow (end to end through the API)
def test_analyze_complaint_persists_every_model_output(analyst, first_complaint, db):
    r = analyst.post(f"/api/ml/analyze/complaint/{first_complaint.complaint_id}")
    assert r.status_code == 200
    preds = r.json()["predictions"]
    assert set(preds) == {"nlp-category", "nlp-subcategory", "food-safety-flag", "nlp-similarity", "root-cause"}
    cat = preds["nlp-category"]
    assert cat["status"] == "completed" and cat["model"]["version"] == "0.1.0" and cat["reference"].startswith("PRD-")
    assert cat["review_status"] == "pending"
    assert preds["food-safety-flag"]["review_status"] == "not_applicable"
    rows = db.scalars(select(Prediction).where(Prediction.run_id == r.json()["run_id"])).all()
    assert len(rows) == 5 and all(p.model_version_id for p in rows)


def test_second_run_does_not_overwrite_history(analyst, first_complaint):
    analyst.post(f"/api/ml/analyze/complaint/{first_complaint.complaint_id}")
    runs = analyst.get(f"/api/ml/complaints/{first_complaint.id}/runs").json()["runs"]
    assert len(runs) >= 2


def test_review_rules_and_human_verified_category(analyst, db):
    new = analyst.post("/api/complaints", json={"complaint_received_date": "2026-10-02", "product_name": "Set yoghurt",
                                                "food_family": "Dairy products",
                                                "complaint_description": "Yoghurt cup lid was swollen and the product smelled sour before expiry."}).json()
    run = analyst.post(f"/api/ml/analyze/complaint/{new['complaint_id']}").json()
    rc = run["predictions"]["root-cause"]
    assert rc["status"] == "insufficient_data"  # no recorded category yet -> no root-cause guess
    ref = run["predictions"]["nlp-category"]["reference"]
    assert analyst.post(f"/api/ml/predictions/{ref}/review", json={"action": "corrected"}).status_code == 422
    assert analyst.post(f"/api/ml/predictions/{ref}/review", json={"action": "corrected", "corrected_label": "Not a label", "reason": "x"}).status_code == 422
    r = analyst.post(f"/api/ml/predictions/{ref}/review", json={"action": "corrected", "corrected_label": "Sensory characteristic", "reason": "Odour complaint"})
    assert r.status_code == 200 and r.json()["review_status"] == "corrected"
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == new["complaint_id"]))
    assert c.complaint_category == "Sensory characteristic" and c.category_source == "human_verified"
    sim = run["predictions"]["food-safety-flag"]["reference"]
    assert analyst.post(f"/api/ml/predictions/{sim}/review", json={"action": "confirmed"}).status_code == 400
    # root-cause now runs because the category is human-verified
    run2 = analyst.post(f"/api/ml/analyze/complaint/{new['complaint_id']}").json()
    assert run2["predictions"]["root-cause"]["status"] == "completed"
    assert db.scalar(select(func.count(PredictionReview.id))) >= 1


def test_analyze_text_validation(analyst):
    assert analyst.post("/api/ml/analyze/text", json={"text": ""}).status_code == 422
    r = analyst.post("/api/ml/analyze/text", json={"text": "?? !!"}).json()
    assert r["predictions"]["nlp-category"]["status"] == "insufficient_data"


def test_batch_risk_endpoint(analyst):
    opts = analyst.get("/api/ml/batch-risk/options").json()["categorical_levels"]
    body = {"production_date": "2025-06-01", "dispatch_date": "2025-06-03", "incoming_material_quality_score": 80, "process_deviation_count": 2,
            "final_inspection_pass_rate_pct": 96, "remaining_shelf_life_days_at_dispatch": 6, "shelf_life_days": 10, "storage_hours_before_dispatch": 20,
            "prior_product_complaints_90d": 1, "prior_food_family_complaints_90d": 5, "prior_customer_complaints_90d": 0,
            "production_quantity_tonnes": 3, "target_storage_temp_min_c": 0, "target_storage_temp_max_c": 4, **{k: v[0] for k, v in opts.items()}}
    r = analyst.post("/api/ml/batch-risk", json=body)
    assert r.status_code == 200 and r.json()["status"] == "completed" and r.json()["review_status"] == "not_applicable"
    assert analyst.post("/api/ml/batch-risk", json={**body, "final_inspection_pass_rate_pct": 140}).status_code == 422


# ---------------------------------------------------------------- analytics
def test_dashboard_and_analytics(analyst):
    d = analyst.get("/api/dashboard").json()
    assert d["kpis"]["total_complaints"] >= 400 and d["category_pareto"]["rows"][-1]["cum_pct"] <= 100.01
    assert analyst.get("/api/analytics/pareto", params={"dimension": "password_hash"}).status_code == 422
    assert analyst.get("/api/analytics/recurrence").status_code == 200
    assert analyst.get("/api/capa").json()["unavailable_reason"]
    assert analyst.get("/api/reports/complaint-summary").json()["meta"]["records_in_scope"] >= 400


# ---------------------------------------------------------------- uploads
CSV_OK = (b"complaint_id,complaint_received_date,product_name,complaint_description,complaint_severity,Plant note\n"
          b"UP-1,2025-03-01,Wheat flour,Weevils found in the opened flour bag,Major,line 2\n"
          b"UP-2,2025-03-02,Wheat flour,Torn outer bag on delivery to store,Routine,\n"
          b"UP-2,2025-03-02,Wheat flour,Duplicate row in the same file here,Routine,\n"
          b"UP-3,not-a-date,Wheat flour,Bad date row should fail validation,Routine,\n"
          b"UP-4,2025-03-04,,Missing product name should fail here,Severe,\n")


def test_upload_wizard_end_to_end(analyst, db):
    r = analyst.post("/api/uploads", files={"file": ("complaints.csv", io.BytesIO(CSV_OK), "text/csv")})
    assert r.status_code == 201
    uid = r.json()["upload"]["id"]
    cols = analyst.get(f"/api/uploads/{uid}/columns").json()
    sug = {c: v["target"] for c, v in cols["suggested_mapping"].items()}
    assert sug["complaint_id"] == "complaint_id" and sug["Plant note"] is None
    assert analyst.post(f"/api/uploads/{uid}/commit").status_code == 409  # must validate first
    v = analyst.post(f"/api/uploads/{uid}/validate", json={"mapping": sug}).json()["summary"]
    assert v["rows_total"] == 5 and v["rows_valid"] == 2 and v["duplicates_in_file"] == 1 and v["rows_with_errors"] == 2
    msgs = {(e["row"], e["field"]) for e in v["errors"]}
    assert (5, "complaint_received_date") in msgs and (6, "product_name") in msgs and (6, "complaint_severity") in msgs
    c = analyst.post(f"/api/uploads/{uid}/commit").json()["upload"]
    assert c["status"] == "imported" and c["rows_inserted"] == 2
    row = db.scalar(select(Complaint).where(Complaint.complaint_id == "UP-1"))
    assert row.extra == {"Plant note": "line 2"} and row.upload_id == uid
    # re-uploading the same content: duplicates detected against the database
    r2 = analyst.post("/api/uploads", files={"file": ("again.csv", io.BytesIO(CSV_OK), "text/csv")}).json()
    assert r2["already_imported"]
    v2 = analyst.post(f"/api/uploads/{r2['upload']['id']}/validate", json={"mapping": sug}).json()["summary"]
    assert v2["duplicates_existing"] == 3 and v2["rows_valid"] == 0  # all three ids now exist in the DB


def test_upload_rejects_bad_files(analyst):
    assert analyst.post("/api/uploads", files={"file": ("x.exe", io.BytesIO(b"MZ"), "application/octet-stream")}).status_code == 415
    assert analyst.post("/api/uploads", files={"file": ("x.xlsx", io.BytesIO(b"not a zip"), "application/octet-stream")}).status_code == 415
    assert analyst.post("/api/uploads", files={"file": ("x.csv", io.BytesIO(b""), "text/csv")}).status_code == 400


def test_mapping_missing_required_field(analyst):
    uid = analyst.post("/api/uploads", files={"file": ("m.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}).json()["upload"]["id"]
    v = analyst.post(f"/api/uploads/{uid}/validate", json={"mapping": {"a": "product_name", "b": None}}).json()["summary"]
    assert v["rows_valid"] == 0 and any(e["field"] == "complaint_description" for e in v["errors"])


def test_admin_cannot_remove_last_admin(admin):
    me = admin.get("/api/auth/me").json()
    assert admin.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}).status_code == 400


def test_create_complaint_survives_id_race(analyst, first_complaint, monkeypatch):
    """Two simultaneous creates can compute the same next ID; the loser must retry, not 500."""
    from app.services import complaint_ids as api_c
    real, calls = api_c.next_manual_id, {"n": 0}

    def racing(db, year):
        calls["n"] += 1
        return first_complaint.complaint_id if calls["n"] == 1 else real(db, year)  # first attempt collides
    monkeypatch.setattr(api_c, "next_manual_id", racing)
    r = analyst.post("/api/complaints", json={"complaint_received_date": "2026-09-01", "product_name": "Rice",
                                              "complaint_description": "Stones found in a sealed rice bag by the customer."})
    assert r.status_code == 201 and r.json()["complaint_id"] != first_complaint.complaint_id and calls["n"] == 2
