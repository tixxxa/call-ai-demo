import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchCalls } from "../api/calls";
import type { CallListItem } from "../types/call";

type SortField = "created_at" | "urgency";
type SortDirection = "asc" | "desc";

const urgencyOrder: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function getUrgencyRank(urgency: string | null): number {
  if (!urgency) return 0;
  return urgencyOrder[urgency.toLowerCase()] ?? 0;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  async function loadCalls(showFullLoading = true) {
    try {
      setError("");
      if (showFullLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await fetchCalls();
      setCalls(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load calls.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadCalls(true);
  }, []);

  const filteredAndSortedCalls = useMemo(() => {
    const filtered = calls.filter((call) => {
      if (urgencyFilter === "all") return true;
      return (call.urgency ?? "").toLowerCase() === urgencyFilter;
    });

    return [...filtered].sort((a, b) => {
      if (sortField === "created_at") {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aRank = getUrgencyRank(a.urgency);
      const bRank = getUrgencyRank(b.urgency);
      return sortDirection === "asc" ? aRank - bRank : bRank - aRank;
    });
  }, [calls, urgencyFilter, sortField, sortDirection]);

  return (
    <div className="page">
      <header className="page-header calls-header">
        <div>
          <h1>Call Review Dashboard</h1>
          <p>Monitor inbound calls, review transcripts, and inspect AI-generated insights.</p>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadCalls(false)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="toolbar card">
        <div className="toolbar-group">
          <label htmlFor="urgencyFilter">Filter by urgency</label>
          <select
            id="urgencyFilter"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="toolbar-group">
          <label htmlFor="sortField">Sort by</label>
          <select
            id="sortField"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="created_at">Created date</option>
            <option value="urgency">Urgency</option>
          </select>
        </div>

        <div className="toolbar-group">
          <label htmlFor="sortDirection">Direction</label>
          <select
            id="sortDirection"
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as SortDirection)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {loading && <p>Loading calls...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <div className="table-card">
          <table className="calls-table">
            <thead>
              <tr>
                <th>Call ID</th>
                <th>Caller</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Created</th>
                <th>Recordings</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No calls found.
                  </td>
                </tr>
              ) : (
                filteredAndSortedCalls.map((call) => (
                  <tr key={call.id}>
                    <td>
                      <Link to={`/calls/${call.id}`} className="table-link">
                        {call.id}
                      </Link>
                    </td>
                    <td>{call.from_number ?? "Unknown"}</td>
                    <td>
                      <span className={`badge status-${(call.status ?? "unknown").toLowerCase()}`}>
                        {call.status ?? "Unknown"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge urgency-${(call.urgency ?? "none").toLowerCase()}`}>
                        {call.urgency ?? "N/A"}
                      </span>
                    </td>
                    <td>{formatDate(call.created_at)}</td>
                    <td>{call.recordings_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}