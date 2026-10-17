export type TriageUrgency = "critical" | "high" | "medium" | "low";
export type AssessmentStatus =
  | "pending"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "superseded";

export interface Recommendation {
  id: string;
  clinic_id: string;
  patient_id: string;
  queue_entry_id?: string | null;
  kind: string;
  recommended_urgency: TriageUrgency;
  sats_colour: "red" | "orange" | "yellow" | "green";
  target_minutes: number | null;
  tews_score: number | null;
  tews_breakdown?: any[];
  clinical_signs?: any[];
  rationale: string | null;
  confidence: string | null;
  missing_data?: string[];
  needs_more_data: boolean;
  status: AssessmentStatus;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  applied_at?: string | null;
  inserted_at: string;
  patient?: {
    id: string;
    name: string | null;
    age_years?: number | null;
    phone_number?: string | null;
  } | null;
  queue_entry?: {
    id: string;
    queue_number?: string | null;
    status?: string;
    current_urgency?: string;
    position_in_queue?: number | null;
  } | null;
  recommended_department?: string | null;
}

export interface Approval {
  id: string;
  assessment_id: string;
  decision: "approved" | "rejected";
  decided_by: string;
  decided_by_name: string;
  decided_by_role?: string | null;
  note?: string | null;
  inserted_at: string;
}

export interface AgentRun {
  id: string;
  clinic_id: string;
  patient_id?: string | null;
  queue_entry_id?: string | null;
  trigger: string;
  language: string;
  model?: string | null;
  provider?: string | null;
  status: string;
  summary?: string | null;
  assessment_id?: string | null;
  error?: string | null;
  duration_ms?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  step_count?: number;
  started_at: string;
  finished_at?: string | null;
  steps?: any[];
}

export interface AuditEvent {
  id: string;
  actor_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  subject_type?: string | null;
  subject_id?: string | null;
  run_id?: string | null;
  payload?: any;
  inserted_at: string;
}
