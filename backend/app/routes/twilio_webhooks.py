import os

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from twilio.twiml.voice_response import Connect, Start, VoiceResponse

from app.db import get_db
from app.models import Call
from app.services.ticket_service import upsert_ticket_for_call

router = APIRouter()

BASE_URL = os.getenv("BASE_URL", "").rstrip("/")


def to_wss_url(base_url: str) -> str:
    if base_url.startswith("https://"):
        return base_url.replace("https://", "wss://", 1)
    if base_url.startswith("http://"):
        return base_url.replace("http://", "ws://", 1)
    return base_url


@router.post("/voice/incoming")
def incoming_call(
    request: Request,
    CallSid: str = Form(default=""),
    From: str = Form(default=""),
    To: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Incoming AI call:", CallSid, From, To)

    existing_call = db.query(Call).filter(Call.twilio_call_sid == CallSid).first()
    if not existing_call:
        new_call = Call(
            twilio_call_sid=CallSid,
            from_number=From,
            to_number=To,
            status="in_progress",
        )
        db.add(new_call)
        db.commit()

    if BASE_URL:
        ws_base = to_wss_url(BASE_URL)
        callback_base = BASE_URL
    else:
        host = request.url.hostname
        scheme = "https" if request.url.scheme == "https" else "http"
        ws_scheme = "wss" if request.url.scheme == "https" else "ws"
        callback_base = f"{scheme}://{host}"
        ws_base = f"{ws_scheme}://{host}"

    media_stream_url = f"{ws_base}/media-stream"
    recording_callback_url = f"{callback_base}/twilio/voice/recording-complete"

    response = VoiceResponse()

    start = Start()
    start.recording(
        recording_status_callback=recording_callback_url,
        recording_status_callback_method="POST",
        trim="do-not-trim",
    )
    response.append(start)

    connect = Connect()
    connect.stream(url=media_stream_url)
    response.append(connect)

    return Response(content=str(response), media_type="application/xml")


@router.post("/voice/recording-complete")
def recording_complete(
    CallSid: str = Form(default=""),
    RecordingSid: str = Form(default=""),
    RecordingUrl: str = Form(default=""),
    RecordingDuration: str = Form(default="0"),
    RecordingStatus: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Recording callback received:")
    print("CallSid:", CallSid)
    print("RecordingSid:", RecordingSid)
    print("RecordingUrl:", RecordingUrl)
    print("RecordingDuration:", RecordingDuration)
    print("RecordingStatus:", RecordingStatus)

    from app.models import Analysis, Recording, Transcript
    from app.services.twilio_service import download_twilio_recording
    from app.services.transcription_service import transcribe_audio_file
    from app.services.analysis_service import analyze_transcript

    call = db.query(Call).filter(Call.twilio_call_sid == CallSid).first()
    if not call:
        return {"ok": False, "message": "Call not found"}

    existing_recording = db.query(Recording).filter(Recording.recording_sid == RecordingSid).first()
    if not existing_recording:
        recording = Recording(
            call_id=call.id,
            recording_sid=RecordingSid,
            recording_url=RecordingUrl,
            duration_sec=int(RecordingDuration or 0),
        )
        db.add(recording)
        db.commit()
        db.refresh(recording)
    else:
        recording = existing_recording

    existing_transcript = db.query(Transcript).filter(Transcript.call_id == call.id).first()
    if existing_transcript:
        return {"ok": True, "message": "Transcript already exists"}

    temp_dir = "temp_recordings"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{RecordingSid}.mp3")

    try:
        download_twilio_recording(RecordingUrl, temp_file_path)
        transcript_text = transcribe_audio_file(temp_file_path)

        transcript = Transcript(
            call_id=call.id,
            text=transcript_text,
        )
        db.add(transcript)
        db.commit()

        existing_analysis = db.query(Analysis).filter(Analysis.call_id == call.id).first()
        if not existing_analysis:
            analysis_result = analyze_transcript(transcript_text)

            import json
            analysis = Analysis(
                call_id=call.id,
                summary=analysis_result.get("summary"),
                topics_json=json.dumps(analysis_result.get("topics", [])),
                action_items_json=json.dumps(analysis_result.get("action_items", [])),
                sentiment=analysis_result.get("sentiment"),
                urgency=analysis_result.get("urgency"),
            )
            db.add(analysis)
            db.commit()

            db.refresh(call)
            upsert_ticket_for_call(
                db,
                call,
                ai_ticket_title=analysis_result.get("ticket_title"),
                ai_recommended_action=analysis_result.get("recommended_action"),
            )
            db.commit()

        print("Post-call transcript and analysis saved for call:", call.id)

    except Exception as e:
        print("Error during post-call pipeline:", str(e))
        return {"ok": False, "message": str(e)}

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    return {"ok": True}


@router.post("/voice/status")
def voice_status(
    CallSid: str = Form(default=""),
    CallStatus: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Voice status update:", CallSid, CallStatus)

    call = db.query(Call).filter(Call.twilio_call_sid == CallSid).first()
    if call:
        call.status = CallStatus
        if call.ticket:
            call.ticket.status = CallStatus
        db.commit()

    return {"ok": True}
