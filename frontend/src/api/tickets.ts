import axios from "axios";
import type { TicketBoardItem } from "../types/ticket";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

export async function fetchTickets(): Promise<TicketBoardItem[]> {
  const response = await api.get<{ tickets: TicketBoardItem[] }>("/tickets/");
  return response.data.tickets;
}

export async function completeTicket(ticketId: number): Promise<TicketBoardItem> {
  const response = await api.patch<TicketBoardItem>(`/tickets/${ticketId}/complete`);
  return response.data;
}
