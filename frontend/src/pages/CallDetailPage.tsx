import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { fetchCallById } from "../api/calls";
import { completeTicket } from "../api/tickets";
import { formatStatusLabel, normalizeStatus } from "../lib/callStatus";
import type { CallDetail } from "../types/call";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CallDetailPage() {
  const { id } = useParams();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCall() {
      if (!id) {
        setError("Missing call id.");
        setLoading(false);
        return;
      }

      try {
        const data = await fetchCallById(id);
        setCall(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load call details.");
      } finally {
        setLoading(false);
      }
    }

    loadCall();
  }, [id]);

  async function handleCompleteTicket() {
    if (!call?.ticket) return;

    try {
      setUpdatingTicket(true);
      const updatedTicket = await completeTicket(call.ticket.id);
      setCall((currentCall) => {
        if (!currentCall) return currentCall;

        return {
          ...currentCall,
          status: updatedTicket.status,
          ticket: {
            ...currentCall.ticket!,
            status: updatedTicket.status,
          },
        };
      });
    } catch (err) {
      console.error(err);
      setError("Failed to update ticket status.");
    } finally {
      setUpdatingTicket(false);
    }
  }

  if (loading) {
    return <div className="page"><p>Loading call details...</p></div>;
  }

  if (error || !call) {
    return (
      <div className="page">
        <p className="error">{error || "Call not found."}</p>
        <Link to="/" className="button-link">Back to calls</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="detail-header">
        <div>
          <div className="page-nav">
            <Link to="/" className="nav-link">Calls</Link>
            <span className="nav-separator">/</span>
            <Link to="/board" className="nav-link">Tickets Board</Link>
          </div>
          <h1>Call Details #{call.id}</h1>
          <p>Review the call metadata, transcript, recording, and AI-generated analysis.</p>
        </div>

        <div>
          <Link to="/" className="button-link">Back to calls</Link>
        </div>
      </div>

      <section className="card">
        <h2>Call Overview</h2>
        <div className="overview-grid">
          <div>
            <p><strong>Caller:</strong> {call.from_number ?? "Unknown"}</p>
            <p><strong>Destination:</strong> {call.to_number ?? "Unknown"}</p>
            <p><strong>Created:</strong> {formatDate(call.created_at)}</p>
          </div>

          <div className="badge-stack">
            <div>
              <span className={`badge status-${normalizeStatus(call.status)}`}>
                {formatStatusLabel(call.status)}
              </span>
            </div>

            {call.analysis?.urgency && (
              <div>
                <span className={`badge urgency-${call.analysis.urgency.toLowerCase()}`}>
                  Urgency: {call.analysis.urgency}
                </span>
              </div>
            )}

            {call.analysis?.sentiment && (
              <div>
                <span className={`badge sentiment-${call.analysis.sentiment.toLowerCase()}`}>
                  Sentiment: {call.analysis.sentiment}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Transcript</h2>
        {call.transcript ? (
          <p className="transcript-box">{call.transcript.text}</p>
        ) : (
          <p>No transcript available.</p>
        )}
      </section>

      <section className="card">
        <h2>AI Summary</h2>
        {call.analysis ? (
          <>
            <p>{call.analysis.summary}</p>

            <div className="list-block">
              <h3>Detected Topics</h3>
              <ul>
                {call.analysis.topics.map((topic, index) => (
                  <li key={index}>{topic}</li>
                ))}
              </ul>
            </div>

            <div className="list-block">
              <h3>Recommended Actions</h3>
              <ul>
                {call.analysis.action_items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p>No AI analysis available.</p>
        )}
      </section>

      <section className="card">
        <h2>Auto-Created Ticket</h2>
        {call.ticket ? (
          <div className="ticket-detail">
            <div className="ticket-card-meta">
              <span className="ticket-key">TKT-{call.ticket.id}</span>
              <span className={`badge status-${normalizeStatus(call.ticket.status)}`}>
                {formatStatusLabel(call.ticket.status)}
              </span>
            </div>

            <h3>{call.ticket.title}</h3>
            <p>{call.ticket.description ?? "No description available."}</p>

            <div className="list-block">
              <h3>Recommended Action</h3>
              <p>{call.ticket.recommended_action ?? "No action suggested."}</p>
            </div>

            {normalizeStatus(call.ticket.status) !== "completed" && (
              <button
                className="secondary-button"
                onClick={handleCompleteTicket}
                disabled={updatingTicket}
              >
                {updatingTicket ? "Updating..." : "Mark Ticket Complete"}
              </button>
            )}

            <Link to="/board" className="table-link">View on ticket board</Link>
          </div>
        ) : (
          <p>No ticket yet. A ticket is created automatically after the AI summary is available.</p>
        )}
      </section>

      <section className="card">
        <h2>Call Recording</h2>
        {call.recordings.length > 0 ? (
          <div className="recordings-list">
            {call.recordings.map((recording) => (
              <div key={recording.id} className="recording-item">
                <p><strong>Recording ID:</strong> {recording.recording_sid}</p>
                <p><strong>Duration:</strong> {recording.duration_sec ?? "Unknown"} seconds</p>
                <p><strong>Created:</strong> {formatDate(recording.created_at)}</p>

                <audio
                  controls
                  preload="none"
                  src={`${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"}${recording.audio_url}`}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            ))}
          </div>
        ) : (
          <p>No recordings available.</p>
        )}
      </section>
    </div>
  );
}
