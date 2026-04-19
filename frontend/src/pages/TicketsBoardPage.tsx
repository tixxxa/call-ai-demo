import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { completeTicket, fetchTickets } from "../api/tickets";
import { formatStatusLabel, normalizeStatus } from "../lib/callStatus";
import type { TicketBoardItem } from "../types/ticket";

const statusOrder = [
  "queued",
  "ringing",
  "in_progress",
  "completed",
  "busy",
  "failed",
  "no_answer",
  "canceled",
  "unknown",
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TicketsBoardPage() {
  const [tickets, setTickets] = useState<TicketBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadTickets(showFullLoading = true) {
    try {
      setError("");
      if (showFullLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await fetchTickets();
      setTickets(data);
      setLastUpdatedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setError("Failed to load tickets.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadTickets(true);
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadTickets(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [autoRefresh]);

  async function handleCompleteTicket(ticketId: number) {
    try {
      setUpdatingTicketId(ticketId);
      const updatedTicket = await completeTicket(ticketId);
      setTickets((currentTickets) =>
        currentTickets.map((ticket) => (ticket.id === ticketId ? updatedTicket : ticket)),
      );
    } catch (err) {
      console.error(err);
      setError("Failed to update ticket status.");
    } finally {
      setUpdatingTicketId(null);
    }
  }

  const visibleTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        return (
          ticket.title.toLowerCase().includes(query) ||
          String(ticket.id).includes(query) ||
          String(ticket.call_id).includes(query) ||
          (ticket.from_number ?? "").toLowerCase().includes(query)
        );
      }),
    [searchQuery, tickets],
  );

  const groupedTickets = useMemo(() => {
    const groups = new Map<string, TicketBoardItem[]>();

    visibleTickets.forEach((ticket) => {
      const key = normalizeStatus(ticket.status);
      const current = groups.get(key) ?? [];
      current.push(ticket);
      groups.set(key, current);
    });

    const sortedStatuses = [...groups.keys()].sort((a, b) => {
      const aIndex = statusOrder.indexOf(a);
      const bIndex = statusOrder.indexOf(b);
      const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return safeA - safeB || a.localeCompare(b);
    });

    return sortedStatuses.map((statusKey) => ({
      statusKey,
      tickets: groups.get(statusKey) ?? [],
    }));
  }, [visibleTickets]);

  const stats = useMemo(() => {
    const completed = tickets.filter((ticket) => normalizeStatus(ticket.status) === "completed").length;
    const open = tickets.length - completed;

    return [
      { label: "Total Tickets", value: String(tickets.length) },
      { label: "Open Tickets", value: String(open) },
      { label: "Completed", value: String(completed) },
      { label: "Visible", value: String(visibleTickets.length) },
    ];
  }, [tickets, visibleTickets.length]);

  return (
    <div className="page page-wide">
      <header className="page-header calls-header">
        <div>
          <div className="page-nav">
            <Link to="/" className="nav-link">Calls</Link>
            <span className="nav-separator">/</span>
            <span className="nav-link active">Tickets Board</span>
          </div>
          <h1>Very Simple Ticket Board</h1>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadTickets(false)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="card stat-card">
            <p className="stat-label">{stat.label}</p>
            <strong className="stat-value">{stat.value}</strong>
          </article>
        ))}
      </section>

      <div className="toolbar card">
        <div className="toolbar-group toolbar-search">
          <label htmlFor="ticketSearchQuery">Search</label>
          <input
            id="ticketSearchQuery"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket, call, title, or caller"
          />
        </div>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span>Auto-refresh every 15s</span>
        </label>

        <div className="toolbar-meta">
          <span>Visible tickets: {visibleTickets.length}</span>
          <span>Last updated: {lastUpdatedAt ?? "Not yet loaded"}</span>
        </div>
      </div>

      {loading && <p>Loading tickets...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <section className="card">
          <p>No tickets yet. A ticket will appear after a call gets an AI summary.</p>
        </section>
      )}

      {!loading && !error && tickets.length > 0 && (
        <section className="board-grid">
          {groupedTickets.map((column) => (
            <div key={column.statusKey} className="board-column">
              <div className="board-column-header">
                <span className={`badge status-${column.statusKey}`}>
                  {formatStatusLabel(column.statusKey)}
                </span>
                <span className="column-count">{column.tickets.length}</span>
              </div>

              <div className="board-column-body">
                {column.tickets.map((ticket) => (
                  <article key={ticket.id} className="ticket-card">
                    <div className="ticket-card-meta">
                      <span className="ticket-key">TKT-{ticket.id}</span>
                      {ticket.urgency && (
                        <span className={`badge urgency-${ticket.urgency.toLowerCase()}`}>
                          {ticket.urgency}
                        </span>
                      )}
                    </div>

                    <h3>{ticket.title}</h3>
                    <p>{ticket.description ?? "No description available."}</p>

                    <div className="ticket-card-section">
                      <strong>Recommended action</strong>
                      <p>{ticket.recommended_action ?? "No action suggested."}</p>
                    </div>

                    <div className="ticket-card-footer">
                      <span>{ticket.from_number ?? "Unknown caller"}</span>
                      <span>{formatDate(ticket.created_at)}</span>
                    </div>

                    {normalizeStatus(ticket.status) !== "completed" && (
                      <button
                        className="secondary-button"
                        onClick={() => handleCompleteTicket(ticket.id)}
                        disabled={updatingTicketId === ticket.id}
                      >
                        {updatingTicketId === ticket.id ? "Updating..." : "Mark Complete"}
                      </button>
                    )}

                    <Link to={`/calls/${ticket.call_id}`} className="table-link">
                      Open call #{ticket.call_id}
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
