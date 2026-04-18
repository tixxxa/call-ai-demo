import json
import os
import requests
from requests.auth import HTTPBasicAuth

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Call, Recording

router = APIRouter()


@router.get("/")
def list_calls(db: Session = Depends(get_db)):
    calls = db.query(Call).order_by(Call.id.desc()).all()

    return {
        "calls": [
            {
                "id": call.id,
                "twilio_call_sid": call.twilio_call_sid,
                "from_number": call.from_number,
                "to_number": call.to_number,
                "status": call.status,
                "created_at": str(call.created_at),
                "recordings_count": len(call.recordings),
                "urgency": call.analysis.urgency if call.analysis else None,
                "sentiment": call.analysis.sentiment if call.analysis else None,
            }
            for call in calls
        ]
    }


@router.get("/{call_id}")
def get_call(call_id: int, db: Session = Depends(get_db)):
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    return {
        "id": call.id,
        "twilio_call_sid": call.twilio_call_sid,
        "from_number": call.from_number,
        "to_number": call.to_number,
        "status": call.status,
        "created_at": str(call.created_at),
        "recordings": [
            {
                "id": r.id,
                "recording_sid": r.recording_sid,
                "recording_url": r.recording_url,
                "duration_sec": r.duration_sec,
                "created_at": str(r.created_at),
                "audio_url": f"/calls/{call.id}/recordings/{r.id}/audio",
            }
            for r in call.recordings
        ],
        "transcript": None if not call.transcript else {
            "id": call.transcript.id,
            "text": call.transcript.text,
            "created_at": str(call.transcript.created_at),
        },
        "analysis": None if not call.analysis else {
            "id": call.analysis.id,
            "summary": call.analysis.summary,
            "topics": json.loads(call.analysis.topics_json or "[]"),
            "action_items": json.loads(call.analysis.action_items_json or "[]"),
            "sentiment": call.analysis.sentiment,
            "urgency": call.analysis.urgency,
            "created_at": str(call.analysis.created_at),
        }
    }


@router.get("/{call_id}/recordings/{recording_id}/audio")
def stream_recording_audio(
    call_id: int,
    recording_id: int,
    db: Session = Depends(get_db),
):
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    recording = (
        db.query(Recording)
        .filter(Recording.id == recording_id, Recording.call_id == call_id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if not account_sid or not auth_token:
        raise HTTPException(status_code=500, detail="Missing Twilio credentials")

    media_url = f"{recording.recording_url}.mp3"

    try:
        twilio_response = requests.get(
            media_url,
            auth=HTTPBasicAuth(account_sid, auth_token),
            stream=True,
            timeout=60,
        )
        twilio_response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch recording: {exc}")

    return StreamingResponse(
        twilio_response.iter_content(chunk_size=8192),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="{recording.recording_sid}.mp3"'
        },
    )