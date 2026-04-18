import os
import requests
from requests.auth import HTTPBasicAuth


def download_twilio_recording(recording_url: str, output_path: str) -> str:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if not account_sid or not auth_token:
        raise ValueError("Missing Twilio credentials in environment variables.")

    media_url = f"{recording_url}.mp3"

    response = requests.get(
        media_url,
        auth=HTTPBasicAuth(account_sid, auth_token),
        timeout=60,
    )
    response.raise_for_status()

    with open(output_path, "wb") as f:
        f.write(response.content)

    return output_path