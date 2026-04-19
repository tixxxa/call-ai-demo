from dotenv import load_dotenv
load_dotenv()

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
from app.routes.twilio_webhooks import router as twilio_router
from app.routes.calls import router as calls_router
from app.routes.media_streams import router as media_streams_router
from app.routes.tickets import router as tickets_router

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Call AI Demo", version="1.0.0")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twilio_router, prefix="/twilio", tags=["twilio"])
app.include_router(calls_router, prefix="/calls", tags=["calls"])
app.include_router(tickets_router, prefix="/tickets", tags=["tickets"])
app.include_router(media_streams_router, tags=["media-streams"])


@app.get("/")
def root():
    return {"message": "Backend is running", "version": app.version}


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}


@app.get("/ready")
def ready():
    required_env = {
        "OPENAI_API_KEY": bool(os.getenv("OPENAI_API_KEY")),
        "TWILIO_ACCOUNT_SID": bool(os.getenv("TWILIO_ACCOUNT_SID")),
        "TWILIO_AUTH_TOKEN": bool(os.getenv("TWILIO_AUTH_TOKEN")),
    }

    db_ok = False
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        db_ok = True
    except Exception:
        logger.exception("Database readiness check failed.")

    ready_state = db_ok and all(required_env.values())

    return {
        "status": "ready" if ready_state else "degraded",
        "database": db_ok,
        "env": required_env,
        "cors_origins": cors_origins,
        "version": app.version,
    }
