const statusLabels: Record<string, string> = {
  "in-progress": "in_progress",
};

export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return "unknown";

  const normalized = status.toLowerCase().trim();
  return statusLabels[normalized] ?? normalized.replace(/[^a-z0-9]+/g, "_");
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
