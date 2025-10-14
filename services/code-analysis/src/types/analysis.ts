export type ComponentType = 'functional' | 'class';

export interface PropDefinition {
  name: string;
  type?: string | null;
  required: boolean;
  defaultValue?: string | null;
  description?: string | null;
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
  eventType?: string | null;
  element?: string | null;
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
  metadata: Record<string, unknown>;
}

export interface AnalysisRequestPayload {
  code: string;
  filePath?: string;
  componentName?: string;
  metadata?: Record<string, unknown>;
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
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 400, 'validation_error', details);
  }

  static parsing(message: string, details?: unknown): ServiceError {
    return new ServiceError(message, 422, 'parsing_error', details);
  }
}
