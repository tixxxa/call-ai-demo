import json

from sqlalchemy.orm import Session

from app.models import Call, Ticket


def build_ticket_title(
    summary: str | None,
    topics_json: str | None = None,
    ai_ticket_title: str | None = None,
) -> str:
    title = (ai_ticket_title or "").strip()
    if title:
        return title[:120]

    topic_list = json.loads(topics_json or "[]")
    if topic_list:
        return f"{topic_list[0][:90]} follow-up"

    summary_text = (summary or "").strip()
    if summary_text:
        return summary_text.split(".")[0][:120]

    return "Call follow-up needed"


def build_recommended_action(
    action_items_json: str | None = None,
    ai_recommended_action: str | None = None,
) -> str:
    recommended_action = (ai_recommended_action or "").strip()
    if recommended_action:
        return recommended_action

    action_items = json.loads(action_items_json or "[]")
    if action_items:
        return action_items[0]

    return "Review the call summary and determine the next step."


def upsert_ticket_for_call(
    db: Session,
    call: Call,
    ai_ticket_title: str | None = None,
    ai_recommended_action: str | None = None,
) -> Ticket | None:
    if not call.analysis:
        return None

    ticket = call.ticket or db.query(Ticket).filter(Ticket.call_id == call.id).first()
    title = build_ticket_title(
        summary=call.analysis.summary,
        topics_json=call.analysis.topics_json,
        ai_ticket_title=ai_ticket_title,
    )
    recommended_action = build_recommended_action(
        action_items_json=call.analysis.action_items_json,
        ai_recommended_action=ai_recommended_action,
    )

    if not ticket:
        ticket = Ticket(
            call_id=call.id,
            title=title,
            description=call.analysis.summary,
            recommended_action=recommended_action,
            status=call.status,
        )
        db.add(ticket)
    else:
        ticket.title = title
        ticket.description = call.analysis.summary
        ticket.recommended_action = recommended_action
        ticket.status = call.status

    db.flush()
    return ticket
