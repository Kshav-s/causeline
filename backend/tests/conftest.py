"""Test fixtures: isolated temporary SQLite DB, real model artifacts, a 400-row sample of the supplied complaints."""
import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="causeline-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["ENABLE_SBERT"] = os.environ.get("TEST_ENABLE_SBERT", "false")
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["UPLOAD_DIR"] = str(Path(_tmp, "uploads"))
os.environ["ATTACHMENT_DIR"] = str(Path(_tmp, "attachments"))
os.environ["ENVIRONMENT"] = "test"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ratelimit import booking_limiter, inference_limiter, login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.session import SessionLocal, init_db  # noqa: E402
from app.ingestion import complaints as ing  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Complaint, User  # noqa: E402

PASSWORD = "TestPassw0rd!"
SAMPLE_ROWS = 400


@pytest.fixture(scope="session", autouse=True)
def _db():
    init_db()
    with SessionLocal() as db:
        for email, role in (("admin@test.local", "admin"), ("analyst@test.local", "analyst")):
            db.add(User(email=email, full_name=role.title(), role=role, password_hash=hash_password(PASSWORD)))
        df = ing.read_table(get_settings().nlp_dir / "data" / "01_ABT_CPD_Complaints_18000.csv").head(SAMPLE_ROWS)
        res = ing.validate(df, {c: (c if c in ing.FIELDS else None) for c in df.columns}, db)
        assert not res.errors
        ing.import_records(db, res.records, None, None, synthetic=True)
        db.commit()
    yield


@pytest.fixture(scope="session")
def client(_db):
    with TestClient(app) as c:  # runs lifespan -> loads models once
        yield c


@pytest.fixture(autouse=True)
def _reset_limits():
    from app.api.public import retry_limiter, submit_limiter, view_limiter
    for lim in (login_limiter, booking_limiter, inference_limiter, submit_limiter, retry_limiter, view_limiter):
        lim.reset()


def _login(client, email):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def admin(client):
    return _login(client, "admin@test.local")


@pytest.fixture
def analyst(client):
    return _login(client, "analyst@test.local")


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def first_complaint(db) -> Complaint:
    from sqlalchemy import select
    return db.scalar(select(Complaint).order_by(Complaint.id).limit(1))
