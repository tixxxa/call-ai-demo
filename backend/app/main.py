from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
from app.routes.twilio_webhooks import router as twilio_router
from app.routes.calls import router as calls_router
from app.routes.media_streams import router as media_streams_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Call AI Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twilio_router, prefix="/twilio", tags=["twilio"])
app.include_router(calls_router, prefix="/calls", tags=["calls"])
app.include_router(media_streams_router, tags=["media-streams"])


@app.get("/")
def root():
    return {"message": "Backend is running"}