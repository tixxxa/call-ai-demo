import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def analyze_transcript(transcript_text: str) -> dict:
    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "system",
                "content": (
                    "You analyze customer support call transcripts and return only structured data."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Analyze this transcript and extract a short summary, key topics, "
                    "action items, sentiment, and urgency.\n\n"
                    f"Transcript:\n{transcript_text}"
                ),
            },
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "call_analysis",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "A short 1-3 sentence summary of the call."
                        },
                        "topics": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Short topic labels."
                        },
                        "action_items": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Concrete follow-up actions."
                        },
                        "sentiment": {
                            "type": "string",
                            "enum": ["positive", "neutral", "frustrated", "angry"]
                        },
                        "urgency": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "critical"]
                        }
                    },
                    "required": [
                        "summary",
                        "topics",
                        "action_items",
                        "sentiment",
                        "urgency"
                    ],
                    "additionalProperties": False
                }
            }
        },
    )

    if hasattr(response, "output_text") and response.output_text:
        import json
        return json.loads(response.output_text)

    for item in getattr(response, "output", []):
        for content in getattr(item, "content", []):
            if hasattr(content, "text") and content.text:
                import json
                return json.loads(content.text)

    raise ValueError("No structured analysis content returned from OpenAI.")