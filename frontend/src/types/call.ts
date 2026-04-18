export type Recording = {
  id: number;
  recording_sid: string;
  recording_url: string;
  audio_url: string;
  duration_sec: number | null;
  created_at: string;
};

export type Transcript = {
  id: number;
  text: string;
  created_at: string;
};

export type Analysis = {
  id: number;
  summary: string;
  topics: string[];
  action_items: string[];
  sentiment: string;
  urgency: string;
  created_at: string;
};

export type CallListItem = {
  id: number;
  twilio_call_sid: string;
  from_number: string | null;
  to_number: string | null;
  status: string | null;
  created_at: string;
  recordings_count: number;
  urgency: string | null;
  sentiment: string | null;
};

export type CallDetail = {
  id: number;
  twilio_call_sid: string;
  from_number: string | null;
  to_number: string | null;
  status: string | null;
  created_at: string;
  recordings: Recording[];
  transcript: Transcript | null;
  analysis: Analysis | null;
};