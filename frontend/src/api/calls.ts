import axios from "axios";
import type { CallDetail, CallListItem } from "../types/call";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

export async function fetchCalls(): Promise<CallListItem[]> {
  const response = await api.get<{ calls: CallListItem[] }>("/calls/");
  return response.data.calls;
}

export async function fetchCallById(callId: string): Promise<CallDetail> {
  const response = await api.get<CallDetail>(`/calls/${callId}`);
  return response.data;
}