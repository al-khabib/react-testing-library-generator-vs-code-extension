import { getSettings } from "../config";
import { logger } from "../logger";
import {
  parseGenerateResponse,
  parseErrorResponse,
  GenerateResponse,
  ChatResponse,
  ChatMessagePayload,
} from "./schema";

export interface GenerateRequest {
  source: string;
  filePath?: string;
  selection?: {
    text: string;
    start: { line: number; character: number };
    end: { line: number; character: number };
  } | null;
  promptOverride?: string;
  intent?: "unit" | "edge" | "mock-heavy" | "update";
  imports?: string[];
  metadata?: Record<string, unknown>;
}

export interface ChatRequest {
  filePath?: string;
  source?: string;
  selection?: GenerateRequest["selection"];
  messages: ChatMessagePayload[];
  stylePreset?: string;
  runtime?: Record<string, unknown>;
}

export class BackendClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async health() {
    return this.request<{ ok: boolean; ollama?: { reachable: boolean; models: string[] } }>(
      "/v1/health",
      { method: "GET" },
    );
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const payload = this.enrichGeneratePayload(request);
    const response = await this.request<unknown>("/v1/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return parseGenerateResponse(response);
  }

  async generateSelection(request: GenerateRequest): Promise<GenerateResponse> {
    const payload = this.enrichGeneratePayload(request);
    const response = await this.request<unknown>("/v1/generate/selection", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return parseGenerateResponse(response);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const settings = getSettings();
    const response = await this.request<ChatResponse>("/v1/chat", {
      method: "POST",
      body: JSON.stringify({
        model: settings.model,
        ...request,
        stylePreset: request.stylePreset ?? settings.stylePreset,
        runtime: {
          strictA11y: settings.strictA11y,
          useUserEvent: settings.useUserEvent,
          timeoutMs: settings.timeoutMs,
          ...(request.runtime || {}),
        },
      }),
    });
    if (!response.lastMessage) {
      throw new Error("Chat response missing lastMessage");
    }
    return response;
  }

  private enrichGeneratePayload(request: GenerateRequest) {
    const settings = getSettings();
    return {
      model: settings.model,
      filePath: request.filePath,
      source: request.source,
      selection: request.selection,
      promptOverride: request.promptOverride,
      stylePreset: settings.stylePreset,
      strictA11y: settings.strictA11y,
      useUserEvent: settings.useUserEvent,
      intent: request.intent ?? "unit",
      imports: request.imports,
      metadata: request.metadata,
      timeoutMs: settings.timeoutMs,
    };
  }

  private async request<T>(path: string, init: RequestInit & { body?: string }) {
    const settings = getSettings();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const res = await fetch(`${settings.backendUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { "x-api-key": settings.apiKey } : {}),
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch (error) {
          logger.error("Failed to parse error response", error);
        }
        const parsed = parseErrorResponse(body);
        const err = new BackendError(parsed.message, res.status, parsed.diagnostics);
        throw err;
      }

      if (res.status === 204) {
        return undefined as T;
      }

      const data = (await res.json()) as T;
      return data;
    } catch (error) {
      if (error instanceof BackendError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Backend request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class BackendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly diagnostics?: { type: string; message: string }[],
  ) {
    super(message);
    this.name = "BackendError";
  }
}
