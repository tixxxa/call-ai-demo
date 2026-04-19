from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Call, Ticket
from app.services.ticket_service import upsert_ticket_for_call

router = APIRouter()


@router.get("/")
def list_tickets(db: Session = Depends(get_db)):
    analyzed_calls_without_ticket = (
        db.query(Call)
        .filter(Call.analysis != None, Call.ticket == None)  # noqa: E711
        .all()
    )

    for call in analyzed_calls_without_ticket:
        upsert_ticket_for_call(db, call)

    if analyzed_calls_without_ticket:
        db.commit()

    tickets = db.query(Ticket).order_by(Ticket.id.desc()).all()

    return {
        "tickets": [
            {
                "id": ticket.id,
                "call_id": ticket.call_id,
                "title": ticket.title,
                "description": ticket.description,
                "recommended_action": ticket.recommended_action,
                "status": ticket.status,
                "created_at": str(ticket.created_at),
                "from_number": ticket.call.from_number if ticket.call else None,
                "urgency": ticket.call.analysis.urgency if ticket.call and ticket.call.analysis else None,
            }
            for ticket in tickets
        ]
    }


@router.patch("/{ticket_id}/complete")
def complete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = "completed"
    if ticket.call:
        ticket.call.status = "completed"

    db.commit()
    db.refresh(ticket)

    return {
        "id": ticket.id,
        "call_id": ticket.call_id,
        "title": ticket.title,
        "description": ticket.description,
        "recommended_action": ticket.recommended_action,
        "status": ticket.status,
        "created_at": str(ticket.created_at),
        "from_number": ticket.call.from_number if ticket.call else None,
        "urgency": ticket.call.analysis.urgency if ticket.call and ticket.call.analysis else None,
    }
