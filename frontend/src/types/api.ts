export type Role = "admin" | "analyst";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  theme: "light" | "dark";
  table_density: "comfortable" | "compact";
  last_login_at: string | null;
  created_at: string;
}

export interface Capabilities {
  role: Role;
  data: { complaints: number; synthetic_complaints: number; demo_data: boolean; complaints_with_root_cause: number; capas: number; historical_batch_scores: number };
  models: Record<string, "ready" | "degraded" | "blocked" | "loading">;
  modules: Record<string, boolean | string>;
  missing_datasets: string[];
}

export interface ComplaintListItem {
  id: number;
  complaint_id: string;
  complaint_received_date: string;
  product_name: string;
  batch_id: string | null;
  complaint_category: string | null;
  category_source: string | null;
  complaint_severity: string | null;
  complaint_status: string;
  owner: string | null;
  complaint_summary: string | null;
  is_synthetic: boolean;
  complaint_closed_date: string | null;
  nlp_prediction: { label: string; review_status: string } | null;
}

export interface Complaint extends Omit<ComplaintListItem, "nlp_prediction"> {
  source: string;
  upload_id: number | null;
  source_row_number: number | null;
  data_origin: string | null;
  event_date: string | null;
  complaint_channel: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_segment: string | null;
  customer_region: string | null;
  product_id: string | null;
  food_family: string | null;
  product_category: string | null;
  shipment_id: string | null;
  dispatch_date: string | null;
  complaint_description: string;
  defect_subcategory: string | null;
  reported_units_affected: number | null;
  severity_score: number | null;
  food_safety_related_flag: boolean | null;
  health_impact_reported: boolean | null;
  investigation_id: string | null;
  investigation_status: string | null;
  root_cause_category: string | null;
  root_cause_status: string | null;
  root_cause_confidence: number | null;
  root_cause_evidence: string | null;
  capa_id: string | null;
  prior_capa_id: string | null;
  recurrence_after_prior_capa: boolean | null;
  capa_follow_up_days: number | null;
  capa_effectiveness_status: string | null;
  haccp_control_id: string | null;
  haccp_process_step: string | null;
  potential_haccp_gap_flag: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  key: string;
  version: string;
  name: string;
  kind: string;
  status: string;
  confidence_supported: boolean;
  low_confidence_threshold: number | null;
  limitations: string[];
  metrics: Record<string, unknown>;
}

export interface Prediction {
  id: number;
  reference: string;
  run_id: string;
  status: "completed" | "insufficient_data" | "error";
  subject_type: string;
  complaint_pk: number | null;
  complaint_id?: string | null;
  model: ModelInfo;
  input: Record<string, unknown>;
  output: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  top_label: string | null;
  top_score: number | null;
  low_confidence: boolean;
  message: string | null;
  review_status: "pending" | "confirmed" | "rejected" | "corrected" | "not_applicable";
  reviews: { action: string; corrected_label: string | null; reason: string | null; reviewer: string; created_at: string }[];
  created_at: string;
}

export interface AnalysisRun {
  run_id: string;
  created_at: string;
  created_by?: string;
  complaint_pk?: number | null;
  predictions: Record<string, Prediction>;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface ParetoRow { label: string; value: number; pct: number; cum_pct: number; vital_few: boolean }
export interface Pareto { rows: ParetoRow[]; n_items: number; n_vital_few: number; total: number; truncated?: boolean }
