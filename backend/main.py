"""FastAPI application entrypoint: CORS, logging, error handling, and route
registration for the Agent Commerce Adapter backend."""

import os
import socket

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.errors import register_exception_handlers
from core.logging_config import configure_logging, get_logger
from routes.audit import router as audit_router
from routes.catalog import router as catalog_router
from routes.failure_injector import router as failure_injector_router
from routes.payment import router as payment_router
from routes.policy import router as policy_router
from routes.session import router as session_router

load_dotenv()
configure_logging()
logger = get_logger(__name__)

app = FastAPI(title="Agent Commerce Adapter")
register_exception_handlers(app)


def _detect_lan_ip() -> str | None:
    """Best-effort LAN-facing IP for this host (e.g. WSL2's eth0 address,
    which changes on every WSL restart). Opens no real connection — UDP
    connect() just asks the OS which local interface would route to the
    internet, so this works even offline."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return None


def _build_allowed_origins() -> list[str]:
    origins = {
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
        if origin.strip()
    }

    # In production this should come entirely from FRONTEND_ORIGIN — trusting
    # whatever interface IP the host happens to have is a dev-only shortcut.
    if os.getenv("ENVIRONMENT", "development") != "production":
        lan_ip = _detect_lan_ip()
        if lan_ip:
            origins.add(f"http://{lan_ip}:3000")

    return list(origins)


_allowed_origins = _build_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("cors_configured", allowed_origins=_allowed_origins)


@app.get("/")
def root() -> dict:
    """Unauthenticated liveness probe for the bare root path."""
    return {"status": "ok", "service": "agent-commerce-adapter-backend"}


@app.get("/api/health")
def health() -> dict:
    """Liveness probe. Reports only that the process is up — see Phase 5 for
    checks against downstream dependencies (DB, Groq)."""
    return {"status": "ok", "service": "agent-commerce-adapter-backend"}


app.include_router(catalog_router)
app.include_router(policy_router)
app.include_router(audit_router)
app.include_router(session_router)
app.include_router(payment_router)
app.include_router(failure_injector_router)
