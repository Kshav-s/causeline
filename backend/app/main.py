import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, auth, complaints, insights, meta, ml, notifications, public, reports, uploads
from app.core.config import get_settings
from app.database.session import SessionLocal, init_db
from app.ml.registry import registry
from app.services.ml_service import sync_model_versions
from app.utils.responses import SafeJSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("causeline")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    def persist_status(_key: str) -> None:  # C5: e.g. nlp-similarity loading -> ready after the encoder thread finishes
        with SessionLocal() as db:
            sync_model_versions(db)
    registry.on_status_change = None  # avoid one DB write per model during the initial load
    registry.load_all()
    # Attach the hook BEFORE the sync: a background loader (e.g. the sentence encoder failing fast) that finishes
    # between load_all() and this point is then caught by the sync below, and anything later by the hook.
    registry.on_status_change = persist_status
    with SessionLocal() as db:
        sync_model_versions(db)
    log.info("Models: %s", {k: m.status for k, m in registry.models.items()})
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="CauseLine API", version="0.1.0", lifespan=lifespan, default_response_class=SafeJSONResponse,
                  description="ABT CPD complaint analytics and prediction platform. All model outputs are labelled; "
                              "the supplied data is synthetic demonstration data.",
                  docs_url="/api/docs" if s.environment != "production" else None, openapi_url="/api/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type", "Authorization", "X-Access-Key"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        try:
            resp = await call_next(request)
        except Exception:  # safe 500 without leaking internals or dropping the connection
            log.exception("Unhandled error on %s %s", request.method, request.url.path)
            resp = JSONResponse(status_code=500, content={"detail": "Internal server error"})
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if request.url.path.startswith("/api/") and request.method == "GET":
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errors = [{"field": ".".join(str(p) for p in e["loc"][1:]) or e["loc"][0], "message": e["msg"].removeprefix("Value error, ")}
                  for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": "Validation failed", "errors": errors})

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    for r in (auth.router, meta.router, notifications.router, complaints.router, ml.router, insights.dashboard, insights.analytics,
              insights.capa, insights.root_cause, insights.risk, uploads.router, admin.router, reports.router, public.router):
        app.include_router(r)
    return app


app = create_app()
