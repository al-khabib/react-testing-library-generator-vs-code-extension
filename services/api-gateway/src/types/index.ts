export type ServiceName = 'code-analysis' | 'llm-service' | 'test-validation';

export interface EnvironmentConfig {
  port: number;
  serviceName: string;
  codeAnalysisUrl: string;
  llmServiceUrl: string;
  testValidationUrl: string;
  requestTimeoutMs: number;
  retryAttempts: number;
  circuitBreaker: {
    failureThreshold: number;
    cooldownMs: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  allowedOrigins: string[];
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  code: string;
  props?: string | null;
  imports: string[];
  hasTests: boolean;
  displayName?: string;
  instructions?: string | null;
  source?: 'full' | 'selection';
}

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

export interface GeneratedTest {
  content: string;
  model?: string;
  prompt: string;
  metadata?: Record<string, unknown>;
  fileName?: string;
  relativePath?: string;
  summary?: string;
  generatedAt?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues?: string[];
  generatedTest: GeneratedTest;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  correlationId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    correlationId?: string;
    details?: unknown;
  };
}

export interface ServiceHealth {
  service: ServiceName;
  healthy: boolean;
  message?: string;
  latencyMs?: number;
}

export type StatusReport = {
  gateway: {
    service: string;
    healthy: boolean;
    timestamp: string;
  };
  dependencies: ServiceHealth[];
};

export class ServiceError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly correlationId?: string;

  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'internal_error',
    correlationId?: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message: string, details?: unknown, correlationId?: string): ServiceError {
    return new ServiceError(message, 400, 'validation_error', correlationId, details);
  }

  static timeout(service: ServiceName | string, correlationId?: string): ServiceError {
    return new ServiceError(
      `${service} did not respond in time.`,
      504,
      'service_timeout',
      correlationId
    );
  }

  static unavailable(service: ServiceName | string, correlationId?: string, details?: unknown): ServiceError {
    return new ServiceError(
      `${service} is currently unavailable.`,
      503,
      'service_unavailable',
      correlationId,
      details
    );
  }
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      correlationId?: string;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Response {
      locals: Record<string, unknown> & {
        correlationId?: string;
        requestStartTime?: number;
      };
    }
  }
}

export {};
