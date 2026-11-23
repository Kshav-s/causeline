"""Public (no-account) complaint workflow: submission, images, privacy, failure handling, register, staff view, NLP client."""
import io

import httpx
from app.core.config import get_settings
import pytest
from PIL import Image
from sqlalchemy import func, select

from app.models import AuditLog, Complaint, ComplaintAttachment, Prediction

DESC = "Customer found a hard plastic fragment inside a sealed yoghurt cup after opening it at home."


def png(w=40, h=30, color=(200, 30, 30), fmt="PNG") -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), color).save(b, fmt)
    return b.getvalue()


def form(**over):
    d = {"customer_name": "Asha Verma", "product_name": "Set yoghurt", "complaint_date": "2026-11-20", "description": DESC,
         "organisation": "Verma Stores", "email": "asha@example.com", "severity": "Major", "additional_info": "Bought on 18 Nov"}
    d.update(over)
    return {k: v for k, v in d.items() if v is not None}


def submit(client, files=None, **over):
    client.cookies.clear()
    return client.post("/api/public/complaints", data=form(**over), files=files or [])


# ---------------------------------------------------------------- submission
def test_submit_without_login_with_images(client, db):
    files = [("images", ("a.png", png(), "image/png")), ("images", ("b.jpg", png(fmt="JPEG"), "image/jpeg")),
             ("images", ("c.webp", png(fmt="WEBP"), "image/webp"))]
    r = submit(client, files)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["complaint_id"].startswith("CL-2026-") and len(j["access_key"]) >= 30
    assert j["analysis_status"] in ("completed", "partial")
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == j["complaint_id"]))
    assert c.source == "public" and c.submitter_email == "asha@example.com" and c.access_key_hash and j["access_key"] not in c.access_key_hash
    assert db.scalar(select(func.count(ComplaintAttachment.id)).where(ComplaintAttachment.complaint_pk == c.id)) == 3
    preds = db.scalars(select(Prediction).where(Prediction.complaint_pk == c.id)).all()
    assert {p.model_version.model_key for p in preds} >= {"nlp-category", "nlp-subcategory", "food-safety-flag", "nlp-similarity", "root-cause"}
    assert all(p.created_by_id is None for p in preds)  # anonymous run, still versioned
    assert db.scalar(select(AuditLog).where(AuditLog.action == "complaint.public_submit", AuditLog.entity_id == c.complaint_id))


@pytest.mark.parametrize("name,data,code", [
    ("evil.exe", b"MZ\x90\x00", 415),                     # wrong extension
    ("fake.png", b"<html>not an image</html>", 415),      # renamed non-image
    ("trunc.png", png()[:40], 415),                       # corrupt/truncated
    ("empty.jpg", b"", 400),
    ("anim.gif", png(fmt="GIF"), 415),                    # real image, disallowed type
])
def test_image_validation(client, name, data, code):
    assert submit(client, [("images", (name, data, "image/png"))]).status_code == code


def test_image_size_and_count_limits(client):
    big = png(4000, 4000, fmt="PNG") + b"\0" * (5 * 1024 * 1024)
    assert submit(client, [("images", ("big.png", big, "image/png"))]).status_code == 413
    seven = [("images", (f"i{i}.png", png(), "image/png")) for i in range(7)]
    assert submit(client, seven).status_code == 422


def test_required_fields_and_rules(client):
    r = client.post("/api/public/complaints", data={"product_name": "x"})
    assert r.status_code == 422 and {e["field"] for e in r.json()["errors"]} >= {"customer_name", "description", "complaint_date"}
    assert submit(client, complaint_date="2099-01-01").status_code == 422
    assert submit(client, email="not-an-email").status_code == 422
    assert submit(client, severity="Apocalyptic").status_code == 422
    assert submit(client, description="too short").status_code == 422
    assert submit(client, email=None, organisation=None, severity=None).status_code == 201  # optional fields really optional


def test_honeypot_blocks_bots(client, db):
    before = db.scalar(select(func.count(Complaint.id)))
    assert submit(client, website="http://spam").status_code == 400
    assert db.scalar(select(func.count(Complaint.id))) == before


def test_rate_limit(client):
    from app.api.public import submit_limiter
    submit_limiter.max_calls = 2
    try:
        codes = [submit(client).status_code for _ in range(3)]
        assert codes == [201, 201, 429]
    finally:
        submit_limiter.max_calls = get_settings().public_submit_per_hour


# ---------------------------------------------------------------- privacy
def test_access_key_required_for_details_and_images(client):
    j = submit(client, [("images", ("a.png", png(), "image/png"))]).json()
    cid, key = j["complaint_id"], j["access_key"]
    assert client.get(f"/api/public/complaints/{cid}").status_code == 404
    assert client.get(f"/api/public/complaints/{cid}", headers={"X-Access-Key": "wrong"}).status_code == 404
    assert client.get("/api/public/complaints/ABT-CMP-2007-014934", headers={"X-Access-Key": key}).status_code == 404  # key is per complaint
    v = client.get(f"/api/public/complaints/{cid}", headers={"X-Access-Key": key}).json()
    assert v["complaint"]["description"] == DESC and v["attachments"] and v["analysis"]["predictions"]["nlp-category"]["status"] == "completed"
    aid = v["attachments"][0]["id"]
    assert client.get(f"/api/public/complaints/{cid}/attachments/{aid}").status_code == 404
    img = client.get(f"/api/public/complaints/{cid}/attachments/{aid}", headers={"X-Access-Key": key})
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    # C7: the served file is the metadata-stripped copy (re-encoded), so compare pixels, not bytes
    assert Image.open(io.BytesIO(img.content)).convert("RGB").tobytes() == Image.open(io.BytesIO(png())).convert("RGB").tobytes()
    assert "no-store" in img.headers["cache-control"]


def test_register_is_anonymised(client):
    j = submit(client).json()
    r = client.get("/api/public/register", params={"q": j["complaint_id"]}).json()
    assert r["total"] == 1
    row = r["items"][0]
    assert set(row) == {"complaint_id", "submitted", "product_name", "category", "category_source", "predicted_category", "severity", "status",
                        "analysis_status", "source", "is_synthetic"}
    assert row["category"] is None and row["predicted_category"]  # AI suggestion is labelled separately, never as the category
    text = str(r)
    assert "asha@example.com" not in text and "Asha" not in text and "yoghurt cup" not in text


def test_register_filters_sort_paging(client):
    r = client.get("/api/public/register", params={"severity": "Critical", "page_size": 5, "sort": "date", "order": "asc"}).json()
    assert len(r["items"]) <= 5 and all(i["severity"] == "Critical" for i in r["items"])
    assert client.get("/api/public/register", params={"sort": "password"}).status_code == 422


def test_public_cannot_reach_staff_endpoints(client):
    client.cookies.clear()
    for path in ("/api/complaints", "/api/complaints/ABT-CMP-2007-014934", "/api/dashboard", "/api/uploads", "/api/admin/users", "/api/capa"):
        assert client.get(path).status_code == 401


# ---------------------------------------------------------------- failure handling
def test_analysis_failure_keeps_complaint_and_retry_works(client, db, monkeypatch):
    from app.services import ml_service

    def boom(*a, **k):
        raise RuntimeError("model service down")
    monkeypatch.setattr(ml_service, "_nlp_results", boom)
    j = submit(client).json()
    assert j["analysis_status"] == "failed"
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == j["complaint_id"]))
    assert c is not None and c.analysis_attempts == 1  # complaint persisted despite the failure
    monkeypatch.undo()
    r = client.post(f"/api/public/complaints/{j['complaint_id']}/analyze", headers={"X-Access-Key": j["access_key"]})
    assert r.status_code == 200 and r.json()["complaint"]["analysis_status"] in ("completed", "partial")
    assert r.json()["analysis"]["predictions"]["nlp-category"]["status"] == "completed"
    if r.json()["complaint"]["analysis_status"] == "completed":
        assert client.post(f"/api/public/complaints/{j['complaint_id']}/analyze", headers={"X-Access-Key": j["access_key"]}).status_code == 409


# ---------------------------------------------------------------- staff side
def test_staff_sees_submitter_images_notes_activity(client, admin):
    j = submit(client, [("images", ("a.png", png(), "image/png"))]).json()
    from tests.conftest import _login
    _login(client, "analyst@test.local")
    d = client.get(f"/api/complaints/{j['complaint_id']}").json()
    assert d["submitter"]["email"] == "asha@example.com" and len(d["attachments"]) == 1
    assert client.get(f"/api/complaints/{j['complaint_id']}/attachments/{d['attachments'][0]['id']}").status_code == 200
    assert client.post(f"/api/complaints/{j['complaint_id']}/notes", json={"note": "Retained sample requested from store."}).status_code == 201
    assert client.get(f"/api/complaints/{j['complaint_id']}/notes").json()["items"][0]["author"] == "Analyst"
    acts = [a["action"] for a in client.get(f"/api/complaints/{j['complaint_id']}/activity").json()["items"]]
    assert {"complaint.public_submit", "ml.analyze", "complaint.note"} <= set(acts)


def test_confirmed_root_cause_is_recorded_separately(client, analyst):
    client.cookies.clear()
    j = submit(client).json()
    from tests.conftest import _login
    _login(client, "analyst@test.local")
    cid = j["complaint_id"]
    assert client.patch(f"/api/complaints/{cid}", json={"root_cause_status": "Confirmed", "change_reason": "x" * 5}).status_code == 422  # no category yet
    r = client.patch(f"/api/complaints/{cid}", json={"root_cause_category": "Incoming material contamination", "root_cause_status": "Confirmed",
                                                     "change_reason": "Supplier lot test positive"})
    assert r.status_code == 200
    d = client.get(f"/api/complaints/{cid}").json()
    assert d["root_cause_confirmation"]["by"] == "Analyst"
    hyp = client.get(f"/api/ml/complaints/{d['complaint']['id']}/runs").json()["runs"][0]["predictions"]["root-cause"]
    assert hyp["review_status"] in ("pending", "not_applicable")  # the model suggestion was NOT converted into the confirmed cause


def test_dashboard_counts_match_database(admin, db):
    k = admin.get("/api/dashboard").json()["kpis"]
    assert k["total_complaints"] == db.scalar(select(func.count(Complaint.id)))
    assert k["public_submissions"] == db.scalar(select(func.count(Complaint.id)).where(Complaint.source == "public"))
    assert k["critical_complaints"] == db.scalar(select(func.count(Complaint.id)).where(Complaint.complaint_severity == "Critical"))


def test_haccp_endpoint_labels_review(admin):
    h = admin.get("/api/analytics/haccp").json()
    assert h["rows"] and "does not show that a control point failed" in h["basis"]


# ---------------------------------------------------------------- external NLP service client
REMOTE = {"classification": {"category_predictions": [{"label": "Packaging issue", "probability": 0.7}, {"label": "Physical defect / foreign matter", "probability": 0.2}],
                             "subcategory_predictions": [{"label": "Seal failure", "probability": 0.6}],
                             "food_safety_flag": {"escalate_for_food_safety_review": False, "reason_keywords": [], "reason_category_in_safety_bucket": False, "note": "n"}},
          "similar": [{"complaint_id": "ABT-CMP-2020-000001", "complaint_received_date": "2020-01-01", "complaint_category": "Packaging issue",
                       "defect_subcategory": "s", "product_name": "p", "complaint_summary": "x", "complaint_description": "PRIVATE", "similarity": 0.81}],
          "similar_error": None, "food_safety_flag": {"escalate_for_food_safety_review": False, "reason_keywords": [], "reason_category_in_safety_bucket": False, "note": "n"},
          "disclaimer": "synthetic"}


def _settings_with_url(monkeypatch, url):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "nlp_service_url", url)


def test_remote_nlp_contract_used_when_configured(monkeypatch):
    from app.services import ml_service
    _settings_with_url(monkeypatch, "http://nlp.example")
    seen = {}

    def fake_post(url, json, timeout):
        seen.update(url=url, body=json)
        return httpx.Response(200, json=REMOTE, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", fake_post)
    res = {r.model_key: r for r in ml_service._nlp_results("seal broken", "X-1")}
    assert seen["url"] == "http://nlp.example/analyze" and seen["body"] == {"text": "seal broken", "top_k_similar": 5, "exclude_complaint_id": "X-1"}
    assert res["nlp-category"].top_label == "Packaging issue" and res["nlp-category"].output["served_by"].startswith("remote:")
    assert "complaint_description" not in res["nlp-similarity"].output["results"][0]  # never forwards private text


def test_remote_nlp_failure_falls_back_to_in_process(monkeypatch):
    from app.services import ml_service
    _settings_with_url(monkeypatch, "http://nlp.example")

    def down(*a, **k):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx, "post", down)
    res = {r.model_key: r for r in ml_service._nlp_results("hard plastic fragment in sealed pack", None)}
    assert res["nlp-category"].status == "completed" and any("in-process" in w for w in res["nlp-category"].warnings)


def test_remote_nlp_invalid_payload_rejected(monkeypatch):
    from app.services import ml_service
    _settings_with_url(monkeypatch, "http://nlp.example")
    bad = {**REMOTE, "classification": {**REMOTE["classification"], "category_predictions": [{"label": "A", "probability": 1.7}]}}
    monkeypatch.setattr(httpx, "post", lambda url, json, timeout: httpx.Response(200, json=bad, request=httpx.Request("POST", url)))
    res = {r.model_key: r for r in ml_service._nlp_results("hard plastic fragment in sealed pack", None)}
    assert res["nlp-category"].top_label != "A"  # invalid remote output never shown; in-process result used instead


def test_root_cause_runs_after_staff_verify_category_and_visitor_sees_it(client, first_complaint, db):
    """Known product -> food family from recorded data; staff confirm category -> root-cause model runs; visitor view shows it."""
    client.cookies.clear()
    j = client.post("/api/public/complaints", data=form(product_name=first_complaint.product_name.upper())).json()
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == j["complaint_id"]))
    assert c.food_family == first_complaint.food_family and c.product_id == first_complaint.product_id
    v = client.get(f"/api/public/complaints/{j['complaint_id']}", headers={"X-Access-Key": j["access_key"]}).json()
    assert v["analysis"]["predictions"]["root-cause"]["status"] == "insufficient_data"  # no guessed category is fed to the model
    ref = v["analysis"]["predictions"]["nlp-category"]["reference"]
    from tests.conftest import _login
    _login(client, "analyst@test.local")
    assert client.post(f"/api/ml/predictions/{ref}/review", json={"action": "corrected", "corrected_label": "Physical defect / foreign matter",
                                                                  "reason": "Fragment seen on photo"}).status_code == 200
    client.cookies.clear()
    v2 = client.get(f"/api/public/complaints/{j['complaint_id']}", headers={"X-Access-Key": j["access_key"]}).json()
    rc = v2["analysis"]["predictions"]["root-cause"]
    assert rc["status"] == "completed" and len(rc["output"]["hypotheses"]) == 3
    assert v2["analysis"]["predictions"]["nlp-category"]["review_status"] == "corrected"  # NLP output still present
    assert v2["complaint"]["verified_category"] == "Physical defect / foreign matter"
    assert v2["complaint"]["confirmed_root_cause"] is None  # a hypothesis is never a confirmed cause


def test_public_products_list(client):
    client.cookies.clear()
    p = client.get("/api/public/products").json()["products"]
    assert p and all(isinstance(x, str) for x in p)



# ---------------------------------------------------------------- C7: location metadata stripped, original retained (restricted)
def gps_jpeg() -> bytes:
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90 degrees when displayed
    exif[0x010F] = "TestCam"
    exif[0x8825] = {1: "N", 2: (12.0, 58.0, 30.0), 3: "E", 4: (77.0, 35.0, 10.0)}  # GPS IFD
    b = io.BytesIO()
    img = Image.new("RGB", (40, 20), (10, 120, 200))
    img.paste((240, 200, 20), (0, 0, 20, 20))  # asymmetric so orientation is checkable
    img.save(b, "JPEG", quality=100, exif=exif.tobytes())
    return b.getvalue()


def png_with_text() -> bytes:
    from PIL.PngImagePlugin import PngInfo
    meta = PngInfo(); meta.add_text("GPSLocation", "12.975,77.594"); meta.add_text("Comment", "home address")
    b = io.BytesIO(); Image.new("RGB", (8, 8), (1, 2, 3)).save(b, "PNG", pnginfo=meta)
    return b.getvalue()


def test_location_metadata_stripped_and_original_restricted(client, db):
    original_jpg = gps_jpeg()
    assert Image.open(io.BytesIO(original_jpg)).getexif().get_ifd(0x8825)  # fixture really carries GPS
    j = submit(client, [("images", ("phone.jpg", original_jpg, "image/jpeg")), ("images", ("scan.png", png_with_text(), "image/png"))]).json()
    v = client.get(f"/api/public/complaints/{j['complaint_id']}", headers={"X-Access-Key": j["access_key"]}).json()
    served = [client.get(f"/api/public/complaints/{j['complaint_id']}/attachments/{a['id']}", headers={"X-Access-Key": j["access_key"]}).content for a in v["attachments"]]
    jpg = Image.open(io.BytesIO(served[0]))
    assert len(jpg.getexif()) == 0 and "exif" not in jpg.info  # no EXIF at all, so no GPS
    assert jpg.size == (20, 40)  # orientation baked into pixels: still displays the right way up
    ref = __import__("PIL.ImageOps", fromlist=["x"]).exif_transpose(Image.open(io.BytesIO(original_jpg))).convert("RGB")
    import numpy as np
    diff = float(np.abs(np.asarray(ref, dtype=int) - np.asarray(jpg.convert("RGB"), dtype=int)).mean())
    assert diff < 4  # image content preserved (JPEG q95 re-encode)
    pngc = Image.open(io.BytesIO(served[1]))
    assert not getattr(pngc, "text", {}) and pngc.convert("RGB").tobytes() == Image.open(io.BytesIO(png_with_text())).convert("RGB").tobytes()  # lossless, text chunks gone
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == j["complaint_id"]))
    rows = db.scalars(select(ComplaintAttachment).where(ComplaintAttachment.complaint_pk == c.id).order_by(ComplaintAttachment.id)).all()
    assert rows[0].sanitized and rows[0].metadata_removed["gps"] is True and rows[1].metadata_removed["png_text_chunks"] == ["Comment", "GPSLocation"]
    from tests.conftest import _login
    _login(client, "analyst@test.local")
    assert client.get(f"/api/complaints/{j['complaint_id']}/attachments/{rows[0].id}/original").status_code == 403  # analysts: display copy only
    staff_img = client.get(f"/api/complaints/{j['complaint_id']}/attachments/{rows[0].id}")
    assert len(Image.open(io.BytesIO(staff_img.content)).getexif()) == 0
    _login(client, "admin@test.local")
    orig = client.get(f"/api/complaints/{j['complaint_id']}/attachments/{rows[0].id}/original")
    assert orig.status_code == 200 and orig.content == original_jpg  # untouched evidence retained
    assert db.scalar(select(AuditLog).where(AuditLog.action == "attachment.original_download", AuditLog.entity_id == j["complaint_id"]))
    client.cookies.clear()
    assert client.get(f"/api/complaints/{j['complaint_id']}/attachments/{rows[0].id}/original").status_code == 401


# ---------------------------------------------------------------- C2: synthetic labelling of retrieved historical records
def test_similar_results_labelled_synthetic(client, db, first_complaint):
    from app.ml.engines import EngineResult
    from app.services import ml_service
    j = submit(client).json()
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == j["complaint_id"]))
    # store a similarity output that references one synthetic historical record and one non-synthetic (public) record
    r = EngineResult("nlp-similarity", "completed", output={"results": [{"complaint_id": first_complaint.complaint_id, "similarity": 0.9},
                                                                         {"complaint_id": j["complaint_id"], "similarity": 0.5}]})
    ml_service._persist(db, "c2-run", r, {"text": "x"}, None, c, "complaint"); db.commit()
    v = client.get(f"/api/public/complaints/{j['complaint_id']}", headers={"X-Access-Key": j["access_key"]}).json()
    res = v["analysis"]["predictions"]["nlp-similarity"]["output"]["results"]
    assert res[0]["is_synthetic"] is True and res[0]["data_label"] == "SYNTHETIC DEMO DATA"
    assert res[1]["is_synthetic"] is False and res[1]["data_label"] is None
    stored = db.scalar(select(Prediction).where(Prediction.run_id == "c2-run"))
    assert "is_synthetic" not in stored.output_payload["results"][0]  # labelled at read time; stored output unchanged
    reg = client.get("/api/public/register", params={"q": first_complaint.complaint_id}).json()["items"][0]
    assert reg["is_synthetic"] is True


# ---------------------------------------------------------------- C5: late model status changes are persisted
def test_late_status_change_written_to_model_versions(client, db):
    from app.ml.registry import registry
    from app.models import ModelVersion
    lm = registry.get("nlp-similarity")
    before = (lm.status, lm.reason)
    try:
        registry._set("nlp-similarity", "ready")
        db.expire_all()
        assert db.scalar(select(ModelVersion.status).where(ModelVersion.model_key == "nlp-similarity")) == "ready"
    finally:
        registry._set("nlp-similarity", *before)
    db.expire_all()
    assert db.scalar(select(ModelVersion.status).where(ModelVersion.model_key == "nlp-similarity")) == before[0]


# ---------------------------------------------------------------- C1: temporary tunnels refused in production
def test_temporary_tunnel_url_refused_in_production():
    from pydantic import ValidationError
    from app.core.config import Settings
    with pytest.raises(ValidationError):
        Settings(environment="production", jwt_secret="x" * 40, nlp_service_url="https://abc-def.trycloudflare.com")
    assert Settings(environment="production", jwt_secret="x" * 40, nlp_service_url="https://nlp.abtcpd.example").nlp_service_url
    assert Settings(environment="production", jwt_secret="x" * 40).nlp_service_url == ""  # built-in pipeline = official mode


def test_new_last_30_days_counts_received_date_not_import_time(admin, db):
    """Regression: the historical import was inserted today; 'new' must use the complaint received date."""
    from datetime import date, timedelta
    k = admin.get("/api/dashboard").json()["kpis"]
    expected = db.scalar(select(func.count(Complaint.id)).where(Complaint.complaint_received_date >= date.today() - timedelta(days=30)))
    assert k["new_last_30_days"] == expected and k["new_last_30_days"] < k["total_complaints"]
