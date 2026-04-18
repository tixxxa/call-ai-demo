import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def transcribe_audio_file(file_path: str) -> str:
    with open(file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=audio_file,
        )

    return transcript.text if hasattr(transcript, "text") else str(transcript)