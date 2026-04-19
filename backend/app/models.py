from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, index=True)
    twilio_call_sid = Column(String, unique=True, index=True, nullable=False)
    from_number = Column(String, nullable=True)
    to_number = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recordings = relationship("Recording", back_populates="call", cascade="all, delete-orphan")
    transcript = relationship("Transcript", back_populates="call", uselist=False, cascade="all, delete-orphan")
    analysis = relationship("Analysis", back_populates="call", uselist=False, cascade="all, delete-orphan")
    ticket = relationship("Ticket", back_populates="call", uselist=False, cascade="all, delete-orphan")


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"), nullable=False)
    recording_sid = Column(String, unique=True, index=True, nullable=False)
    recording_url = Column(String, nullable=True)
    duration_sec = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    call = relationship("Call", back_populates="recordings")


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"), unique=True, nullable=False)
    text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    call = relationship("Call", back_populates="transcript")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"), unique=True, nullable=False)
    summary = Column(Text, nullable=True)
    topics_json = Column(Text, nullable=True)
    action_items_json = Column(Text, nullable=True)
    sentiment = Column(String, nullable=True)
    urgency = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    call = relationship("Call", back_populates="analysis")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id"), unique=True, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    call = relationship("Call", back_populates="ticket")
