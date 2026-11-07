export type Prediction = "REAL" | "FAKE";

export interface Probabilities {
  fake: number;
  real: number;
}

export interface AudioInfo {
  filename: string;
  content_type: string | null;
  size_bytes: number;
  format: string | null;
  original_sample_rate: number;
  original_channels: number;
  sample_rate: number;
  channels: number;
  duration_seconds: number;
  samples: number;
  padded_or_cropped: boolean;
  processing_ms: number;
}

export interface ModelInfo {
  name: string;
  architecture: string;
  device: string;
  checkpoint: string;
  classes: Record<string, number>;
  sample_rate: number;
  audio_length: number;
}

export interface AnalysisResponse {
  prediction: Prediction;
  verified: boolean;
  confidence: number;
  probabilities: Probabilities;
  logits: number[];
  audio: AudioInfo;
  model: ModelInfo;
  analyzed_at: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  model_loaded: boolean;
  detail: string | null;
  device: string | null;
  version: string;
  uptime_seconds: number;
}
