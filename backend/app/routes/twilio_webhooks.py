import json
import os

from fastapi import APIRouter, Depends, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from twilio.twiml.voice_response import VoiceResponse

from app.db import get_db
from app.models import Analysis, Call, Recording, Transcript
from app.services.analysis_service import analyze_transcript
from app.services.transcription_service import transcribe_audio_file
from app.services.twilio_service import download_twilio_recording

router = APIRouter()

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
TEMP_DIR = "temp_recordings"


@router.post("/voice/incoming")
def incoming_call(
    CallSid: str = Form(default=""),
    From: str = Form(default=""),
    To: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Incoming call:", CallSid, From, To)

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

    response = VoiceResponse()
    response.say(
        "Welcome to the A I call analysis demo. Please describe your issue after the beep. Press pound when you are done.",
        voice="alice",
    )
    response.record(
        max_length=60,
        play_beep=True,
        finish_on_key="#",
        timeout=3,
        action=f"{BASE_URL}/twilio/voice/recording-finished",
        method="POST",
        recording_status_callback=f"{BASE_URL}/twilio/voice/recording-complete",
        recording_status_callback_method="POST",
    )
    return Response(content=str(response), media_type="application/xml")


@router.post("/voice/recording-finished")
def recording_finished(
    CallSid: str = Form(default=""),
    RecordingUrl: str = Form(default=""),
    RecordingDuration: str = Form(default=""),
    Digits: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Recording finished:")
    print("CallSid:", CallSid)
    print("RecordingUrl:", RecordingUrl)
    print("RecordingDuration:", RecordingDuration)
    print("Digits:", Digits)

    call = db.query(Call).filter(Call.twilio_call_sid == CallSid).first()
    if call:
        call.status = "completed"
        db.commit()

    response = VoiceResponse()
    response.say("Thanks. Your recording has been saved. Goodbye.", voice="alice")
    response.hangup()
    return Response(content=str(response), media_type="application/xml")


@router.post("/voice/recording-complete")
def recording_complete(
    RecordingUrl: str = Form(default=""),
    RecordingSid: str = Form(default=""),
    RecordingDuration: str = Form(default=""),
    CallSid: str = Form(default=""),
    db: Session = Depends(get_db),
):
    print("Recording complete:")
    print("CallSid:", CallSid)
    print("RecordingSid:", RecordingSid)
    print("RecordingUrl:", RecordingUrl)
    print("RecordingDuration:", RecordingDuration)

    call = db.query(Call).filter(Call.twilio_call_sid == CallSid).first()
    if not call:
        return {"ok": False, "message": "Call not found"}

    existing_recording = db.query(Recording).filter(Recording.recording_sid == RecordingSid).first()
    if not existing_recording:
        recording = Recording(
            call_id=call.id,
            recording_sid=RecordingSid,
            recording_url=RecordingUrl,
            duration_sec=int(RecordingDuration) if RecordingDuration else None,
        )
        db.add(recording)
        db.commit()
        db.refresh(recording)
    else:
        recording = existing_recording

    existing_transcript = db.query(Transcript).filter(Transcript.call_id == call.id).first()
    if existing_transcript:
        return {"ok": True, "message": "Transcript already exists"}

    os.makedirs(TEMP_DIR, exist_ok=True)
    temp_file_path = os.path.join(TEMP_DIR, f"{RecordingSid}.mp3")

    try:
        download_twilio_recording(RecordingUrl, temp_file_path)
        transcript_text = transcribe_audio_file(temp_file_path)

        transcript = Transcript(
            call_id=call.id,
            text=transcript_text,
        )
        db.add(transcript)
        db.commit()

        print("Transcript saved for call:", call.id)

        existing_analysis = db.query(Analysis).filter(Analysis.call_id == call.id).first()
        if not existing_analysis:
            analysis_result = analyze_transcript(transcript_text)

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

            print("Analysis saved for call:", call.id)

    except Exception as e:
        print("Error during transcription/analysis pipeline:", str(e))
        return {"ok": False, "message": str(e)}

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    return {"ok": True}