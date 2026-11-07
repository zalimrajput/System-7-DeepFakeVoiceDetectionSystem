import type { AnalysisResponse, HealthResponse } from "./types";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, code = "unknown_error", status = 0, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

interface ServerError {
  code?: string;
  message?: string;
  detail?: string | null;
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ServerError | null = null;
  try {
    payload = (await response.json()) as ServerError;
  } catch {
    payload = null;
  }

  const fallback =
    response.status === 413
      ? "That file is too large to analyze."
      : response.status >= 500
        ? "The detection server ran into a problem."
        : "The audio could not be analyzed.";

  return new ApiError(
    payload?.message || fallback,
    payload?.code || `http_${response.status}`,
    response.status,
    payload?.detail ?? undefined,
  );
}

export async function analyzeAudio(
  file: File,
  signal?: AbortSignal,
): Promise<AnalysisResponse> {
  const body = new FormData();
  body.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      body,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      "Could not reach the detection server.",
      "network_error",
      0,
      `Make sure the FastAPI backend is running at ${API_URL}.`,
    );
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as AnalysisResponse;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}
