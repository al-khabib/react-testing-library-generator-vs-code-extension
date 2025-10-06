export type DiagnosticKind = "warning" | "error";

export interface BackendDiagnostic {
  type: DiagnosticKind;
  message: string;
}

export interface GenerateResponse {
  tests: string;
  metadata: {
    warnings?: string[];
    diagnostics?: BackendDiagnostic[];
    promptTokens?: number;
    completionTokens?: number;
    model?: string;
  };
}

export interface ChatMessagePayload {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  messages: ChatMessagePayload[];
  lastMessage: ChatMessagePayload;
  metadata?: GenerateResponse["metadata"] & {
    conversationId: string;
  };
}

export interface ErrorResponse {
  message: string;
  code?: string;
  diagnostics?: BackendDiagnostic[];
}

function isDiagnostic(value: unknown): value is BackendDiagnostic {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.type === "warning" || record.type === "error") &&
    typeof record.message === "string"
  );
}

export function parseGenerateResponse(value: unknown): GenerateResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid response: expected object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.tests !== "string") {
    throw new Error("Invalid response: missing tests string");
  }
  const metadataValue = record.metadata;
  if (!metadataValue || typeof metadataValue !== "object") {
    throw new Error("Invalid response: missing metadata");
  }
  const metadata = metadataValue as GenerateResponse["metadata"];
  if (metadata.warnings && !Array.isArray(metadata.warnings)) {
    throw new Error("Invalid response: warnings must be array");
  }
  if (metadata.diagnostics) {
    if (!Array.isArray(metadata.diagnostics) || !metadata.diagnostics.every(isDiagnostic)) {
      throw new Error("Invalid response: diagnostics must be array");
    }
  }
  return {
    tests: record.tests,
    metadata,
  };
}

export function parseErrorResponse(value: unknown): ErrorResponse {
  if (!value || typeof value !== "object") {
    return { message: "Unknown error" };
  }
  const record = value as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "Unknown error";
  const diagnostics = Array.isArray(record.diagnostics)
    ? (record.diagnostics.filter(isDiagnostic) as BackendDiagnostic[])
    : undefined;
  const code = typeof record.code === "string" ? record.code : undefined;
  return { message, diagnostics, code };
}
