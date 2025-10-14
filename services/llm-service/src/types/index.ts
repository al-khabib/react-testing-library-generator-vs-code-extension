export type { EnvironmentConfig } from './environment';

export type ComponentType = 'functional' | 'class';

export interface PropDefinition {
  name: string;
  type?: string | null;
  required: boolean;
  defaultValue?: string | null;
}

export interface StateUsage {
  name: string;
  initialValue?: string | null;
}

export interface HookUsage {
  name: string;
  dependencies?: string[];
  details?: string | null;
}

export interface EventHandler {
  name: string;
  handler: string;
  element?: string | null;
  eventType?: string | null;
}

export interface ImportDefinition {
  source: string;
  imported: string[];
  namespace?: string | null;
  defaultImport?: string | null;
}

export interface ComponentAnalysis {
  name: string;
  type: ComponentType;
  props: PropDefinition[];
  state: StateUsage[];
  hooks: HookUsage[];
  eventHandlers: EventHandler[];
  imports: ImportDefinition[];
  dataTestIds: string[];
  complexity: number;
  testingRecommendations: string[];
  metadata?: Record<string, unknown>;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  format?: 'plain' | 'json';
  stream?: boolean;
  includeExamples?: string[];
}

export interface GenerationRequestPayload {
  analysis: ComponentAnalysis;
  options?: GenerationOptions;
}

export interface ModelInfo {
  name: string;
  modifiedAt?: string;
  size?: number;
}

export interface GeneratedTest {
  content: string;
  model: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface StreamingChunk {
  content: string;
  done: boolean;
}

export class ServiceError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'internal_error', details?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static validation(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 400, 'validation_error', details);
  }

  static upstream(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 502, 'upstream_error', details);
  }

  static unavailable(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 503, 'service_unavailable', details);
  }

  static timeout(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 504, 'service_timeout', details);
  }
}
