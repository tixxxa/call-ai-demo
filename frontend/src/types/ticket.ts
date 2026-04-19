export type TicketBoardItem = {
  id: number;
  call_id: number;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string | null;
  created_at: string;
  from_number: string | null;
  urgency: string | null;
};
