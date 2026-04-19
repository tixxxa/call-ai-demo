import json
import os
import requests
from requests.auth import HTTPBasicAuth

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Call, Recording
from app.services.ticket_service import upsert_ticket_for_call

router = APIRouter()


class DeleteCallsPayload(BaseModel):
    call_ids: list[int]


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

    if call.analysis and not call.ticket:
        upsert_ticket_for_call(db, call)
        db.commit()
        db.refresh(call)

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
        },
        "ticket": None if not call.ticket else {
            "id": call.ticket.id,
            "call_id": call.ticket.call_id,
            "title": call.ticket.title,
            "description": call.ticket.description,
            "recommended_action": call.ticket.recommended_action,
            "status": call.ticket.status,
            "created_at": str(call.ticket.created_at),
        },
    }


@router.delete("/")
def delete_calls(payload: DeleteCallsPayload, db: Session = Depends(get_db)):
    call_ids = sorted(set(payload.call_ids))
    if not call_ids:
        raise HTTPException(status_code=400, detail="No call ids provided")

    calls = db.query(Call).filter(Call.id.in_(call_ids)).all()
    found_ids = sorted(call.id for call in calls)
    missing_ids = [call_id for call_id in call_ids if call_id not in found_ids]

    for call in calls:
        db.delete(call)

    db.commit()

    return {
        "deleted_call_ids": found_ids,
        "missing_call_ids": missing_ids,
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
