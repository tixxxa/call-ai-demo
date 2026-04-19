import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { deleteCalls, fetchCalls } from "../api/calls";
import { formatStatusLabel, normalizeStatus } from "../lib/callStatus";
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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [selectedCallIds, setSelectedCallIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

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
      setLastUpdatedAt(new Date().toLocaleTimeString());
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

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadCalls(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [autoRefresh]);

  useEffect(() => {
    setSelectedCallIds((currentSelectedIds) =>
      currentSelectedIds.filter((selectedId) => calls.some((call) => call.id === selectedId)),
    );
  }, [calls]);

  const filteredAndSortedCalls = useMemo(() => {
    const filtered = calls.filter((call) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        String(call.id).includes(searchQuery.trim()) ||
        (call.from_number ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (call.status ?? "").toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
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
  }, [calls, urgencyFilter, searchQuery, sortField, sortDirection]);

  const stats = useMemo(() => {
    const openCalls = calls.filter((call) => normalizeStatus(call.status) !== "completed").length;
    const completedCalls = calls.filter((call) => normalizeStatus(call.status) === "completed").length;
    const criticalCalls = calls.filter((call) => (call.urgency ?? "").toLowerCase() === "critical").length;

    return [
      { label: "Total Calls", value: String(calls.length) },
      { label: "Open Calls", value: String(openCalls) },
      { label: "Completed", value: String(completedCalls) },
      { label: "Critical", value: String(criticalCalls) },
    ];
  }, [calls]);

  const filteredCallIds = filteredAndSortedCalls.map((call) => call.id);
  const allFilteredSelected =
    filteredCallIds.length > 0 && filteredCallIds.every((callId) => selectedCallIds.includes(callId));

  function toggleCallSelection(callId: number) {
    setSelectedCallIds((currentSelectedIds) =>
      currentSelectedIds.includes(callId)
        ? currentSelectedIds.filter((selectedId) => selectedId !== callId)
        : [...currentSelectedIds, callId],
    );
  }

  function toggleSelectAllFiltered() {
    setSelectedCallIds((currentSelectedIds) => {
      if (allFilteredSelected) {
        return currentSelectedIds.filter((selectedId) => !filteredCallIds.includes(selectedId));
      }

      return [...new Set([...currentSelectedIds, ...filteredCallIds])];
    });
  }

  async function handleDeleteSelected() {
    const sortedSelectedIds = [...selectedCallIds].sort((a, b) => a - b);
    if (sortedSelectedIds.length === 0) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      const response = await deleteCalls(sortedSelectedIds);
      setCalls((currentCalls) =>
        currentCalls.filter((call) => !response.deleted_call_ids.includes(call.id)),
      );
      setSelectedCallIds([]);
      setConfirmDeleteOpen(false);
    } catch (err) {
      console.error(err);
      setError("Failed to delete selected calls.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header calls-header">
        <div>
          <div className="page-nav">
            <span className="nav-link active">Calls</span>
            <span className="nav-separator">/</span>
            <Link to="/board" className="nav-link">Tickets Board</Link>
          </div>
          <h1>Call Dashboard</h1>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadCalls(false)}
          disabled={loading || refreshing || deleting}
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
        <div className="toolbar-actions">
          <button
            className="danger-button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={selectedCallIds.length === 0 || deleting}
          >
            {deleting ? "Deleting..." : `Delete Selected (${selectedCallIds.length})`}
          </button>
        </div>

        <div className="toolbar-group toolbar-search">
          <label htmlFor="searchQuery">Search</label>
          <input
            id="searchQuery"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by call id, caller, or status"
          />
        </div>

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

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span>Auto-refresh every 15s</span>
        </label>

        <div className="toolbar-meta">
          <span>Visible calls: {filteredAndSortedCalls.length}</span>
          <span>Last updated: {lastUpdatedAt ?? "Not yet loaded"}</span>
        </div>
      </div>

      {loading && <p>Loading calls...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <div className="table-card">
          <table className="calls-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all visible calls"
                  />
                </th>
                <th>Call ID</th>
                <th>Caller</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Created</th>
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
                      <input
                        type="checkbox"
                        checked={selectedCallIds.includes(call.id)}
                        onChange={() => toggleCallSelection(call.id)}
                        aria-label={`Select call ${call.id}`}
                      />
                    </td>
                    <td>
                      <Link to={`/calls/${call.id}`} className="table-link">
                        {call.id}
                      </Link>
                    </td>
                    <td>{call.from_number ?? "Unknown"}</td>
                    <td>
                      <span className={`badge status-${normalizeStatus(call.status)}`}>
                        {formatStatusLabel(call.status)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge urgency-${(call.urgency ?? "none").toLowerCase()}`}>
                        {call.urgency ?? "N/A"}
                      </span>
                    </td>
                    <td>{formatDate(call.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="modal-backdrop" onClick={() => !deleting && setConfirmDeleteOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Calls?</h2>
            <p>
              Are you sure you want to delete{" "}
              {selectedCallIds.length === 1 ? "call" : "calls"}{" "}
              <strong>{[...selectedCallIds].sort((a, b) => a - b).join(", ")}</strong>?
            </p>
            <p className="modal-copy">
              This will permanently remove the selected calls and any linked tickets, transcript,
              analysis, and recording records from the dashboard.
            </p>

            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button className="danger-button" onClick={handleDeleteSelected} disabled={deleting}>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
