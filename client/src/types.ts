export interface Patient {
  id: string;
  name: string | null;
  phone_number: string;
  chronic_conditions: string[];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  status: "open" | "busy" | "closed";
  staff_available: number;
  avg_wait_time: number;
  is_emergency: boolean;
  queue_count: number;
}

export type UrgencyTier = "critical" | "high" | "medium" | "low";
export type TriageUrgency = "critical" | "high" | "medium" | "low";

export type QueueStatus = "waiting" | "checked_in" | "in_progress" | "completed" | "no_show";

export interface QueueEntry {
  id: string;
  queue_number: string;
  urgency_tier: UrgencyTier;
  urgency_color: string;
  position_in_queue: number | null;
  status: QueueStatus;
  estimated_wait_time: number | null;
  critical_alert_acknowledged: boolean;
  patient: Patient | null;
  department: Department | null;
  chief_complaint: string | null;
  red_flag_details: string | null;
  inserted_at: string;
}

export interface QueueStats {
  total: number;
  waiting: number;
  checked_in: number;
  in_progress: number;
  critical: number;
  avg_wait: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  clinic_id: string;
}

export interface PatientHistory {
  id: string;
  date: string;
  chief_complaint: string | null;
  symptoms: string[];
  urgency_tier: UrgencyTier | null;
  recommended_department: string | null;
  red_flag_detected: boolean;
  language_code: string;
}
