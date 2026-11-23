import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, auth, bookings, complaints, insights, meta, ml, notifications, reports, uploads
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
    registry.load_all()
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
                       allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type", "Authorization"])

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
              insights.capa, insights.root_cause, insights.risk, uploads.router, bookings.router, admin.router, reports.router):
        app.include_router(r)
    return app


app = create_app()
