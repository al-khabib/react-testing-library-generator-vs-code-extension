import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  ApiSuccessResponse,
  ComponentAnalysis,
  ComponentInfo,
  GeneratedTest,
  ServiceError,
  ServiceHealth,
  ServiceName,
  ValidationResult
} from '../types';

type RequestConfig = AxiosRequestConfig;

interface ServiceClientOptions {
  codeAnalysisUrl: string;
  llmServiceUrl: string;
  testValidationUrl: string;
  requestTimeoutMs: number;
  retryAttempts: number;
  failureThreshold: number;
  cooldownMs: number;
}

class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  private failureCount = 0;

  private nextAttemptTimestamp = 0;

  constructor(
    private readonly service: ServiceName,
    private readonly failureThreshold: number,
    private readonly cooldownMs: number
  ) {}

  async execute<T>(correlationId: string | undefined, action: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTimestamp) {
        this.state = 'HALF_OPEN';
      } else {
        throw ServiceError.unavailable(
          this.service,
          correlationId,
          `Circuit breaker open. Next attempt after ${new Date(this.nextAttemptTimestamp).toISOString()}`
        );
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.cooldownMs;
    } else {
      this.state = 'HALF_OPEN';
    }
  }
}

export class ServiceClient {
  private readonly codeAnalysisClient: AxiosInstance;

  private readonly llmServiceClient: AxiosInstance;

  private readonly testValidationClient: AxiosInstance;

  private readonly retryAttempts: number;

  private readonly circuits: Record<ServiceName, CircuitBreaker>;

  constructor(options?: Partial<ServiceClientOptions>) {
    const resolvedOptions: ServiceClientOptions = {
      codeAnalysisUrl: options?.codeAnalysisUrl ?? config.codeAnalysisUrl,
      llmServiceUrl: options?.llmServiceUrl ?? config.llmServiceUrl,
      testValidationUrl: options?.testValidationUrl ?? config.testValidationUrl,
      requestTimeoutMs: options?.requestTimeoutMs ?? config.requestTimeoutMs,
      retryAttempts: options?.retryAttempts ?? config.retryAttempts,
      failureThreshold: options?.failureThreshold ?? config.circuitBreaker.failureThreshold,
      cooldownMs: options?.cooldownMs ?? config.circuitBreaker.cooldownMs
    };

    this.retryAttempts = resolvedOptions.retryAttempts;

    this.codeAnalysisClient = this.createClient(resolvedOptions.codeAnalysisUrl, resolvedOptions.requestTimeoutMs);
    this.llmServiceClient = this.createClient(resolvedOptions.llmServiceUrl, resolvedOptions.requestTimeoutMs);
    this.testValidationClient = this.createClient(
      resolvedOptions.testValidationUrl,
      resolvedOptions.requestTimeoutMs
    );

    this.circuits = {
      'code-analysis': new CircuitBreaker(
        'code-analysis',
        resolvedOptions.failureThreshold,
        resolvedOptions.cooldownMs
      ),
      'llm-service': new CircuitBreaker(
        'llm-service',
        resolvedOptions.failureThreshold,
        resolvedOptions.cooldownMs
      ),
      'test-validation': new CircuitBreaker(
        'test-validation',
        resolvedOptions.failureThreshold,
        resolvedOptions.cooldownMs
      )
    };
  }

  async analyzeCode(component: ComponentInfo, correlationId?: string): Promise<ComponentAnalysis> {
    return this.executeWithCircuit('code-analysis', correlationId, () =>
      this.requestWithRetry<ApiSuccessResponse<ComponentAnalysis>>(
        this.codeAnalysisClient,
        {
          method: 'POST',
          url: '/api/analyze',
          data: component
        },
        'code-analysis',
        correlationId
      ).then((response) => response.data)
    );
  }

  async generateTest(
    analysisResult: ComponentAnalysis,
    correlationId?: string
  ): Promise<GeneratedTest> {
    return this.executeWithCircuit('llm-service', correlationId, () =>
      this.requestWithRetry<ApiSuccessResponse<GeneratedTest>>(
        this.llmServiceClient,
        {
          method: 'POST',
          url: '/api/generate',
          data: { analysis: analysisResult }
        },
        'llm-service',
        correlationId
      ).then((response) => response.data)
    );
  }

  async validateTest(
    generatedTest: GeneratedTest,
    componentAnalysis: ComponentAnalysis,
    correlationId?: string
  ): Promise<ValidationResult> {
    return this.executeWithCircuit('test-validation', correlationId, () =>
      this.requestWithRetry<ApiSuccessResponse<ValidationResult>>(
        this.testValidationClient,
        {
          method: 'POST',
          url: '/api/validate',
          data: {
            generatedTest,
            component: {
              name: componentAnalysis.name,
              complexity: componentAnalysis.complexity
            }
          }
        },
        'test-validation',
        correlationId
      ).then((response) => response.data)
    );
  }

  async checkServiceHealth(service: ServiceName, correlationId?: string): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      const client = this.resolveClient(service);
      await client.get('/health', {
        headers: this.buildHeaders(correlationId)
      });
      return {
        service,
        healthy: true,
        latencyMs: Date.now() - startTime
      };
    } catch (error) {
      const mappedError = this.mapAxiosError(error, service, correlationId);
      logger.warn(`Health check failed for ${service}`, {
        correlationId,
        error: mappedError.message
      });
      return {
        service,
        healthy: false,
        message: mappedError.message,
        latencyMs: Date.now() - startTime
      };
    }
  }

  private createClient(baseURL: string, timeout: number): AxiosInstance {
    return axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private resolveClient(service: ServiceName): AxiosInstance {
    switch (service) {
      case 'code-analysis':
        return this.codeAnalysisClient;
      case 'llm-service':
        return this.llmServiceClient;
      case 'test-validation':
        return this.testValidationClient;
      default:
        return this.codeAnalysisClient;
    }
  }

  private async executeWithCircuit<T>(
    service: ServiceName,
    correlationId: string | undefined,
    action: () => Promise<T>
  ): Promise<T> {
    const circuit = this.circuits[service];
    return circuit.execute(correlationId, action);
  }

  private async requestWithRetry<T>(
    client: AxiosInstance,
    requestConfig: RequestConfig,
    service: ServiceName,
    correlationId?: string
  ): Promise<T> {
    let attempt = 0;

    while (attempt <= this.retryAttempts) {
      try {
        const response = await client.request<T>({
          ...requestConfig,
          headers: {
            ...requestConfig.headers,
            ...this.buildHeaders(correlationId)
          }
        });
        return response.data;
      } catch (error) {
        attempt += 1;
        const mappedError = this.mapAxiosError(error, service, correlationId);
        logger.warn(`Attempt ${attempt} failed for ${service}`, {
          correlationId,
          code: mappedError.code,
          statusCode: mappedError.statusCode,
          message: mappedError.message
        });

        if (attempt > this.retryAttempts) {
          throw mappedError;
        }

        await this.delay(Math.pow(2, attempt) * 100);
      }
    }

    throw ServiceError.unavailable(service, correlationId);
  }

  private mapAxiosError(
    error: unknown,
    service: ServiceName | string,
    correlationId?: string
  ): ServiceError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;

      if (axiosError.code === 'ECONNABORTED') {
        return ServiceError.timeout(service, correlationId);
      }

      if (!axiosError.response) {
        return ServiceError.unavailable(service, correlationId, axiosError.message);
      }

      const status = axiosError.response.status;
      const message =
        axiosError.response.data?.message ??
        axiosError.message ??
        `Unexpected response from ${service}`;

      if (status >= 500) {
        return ServiceError.unavailable(service, correlationId, message);
      }

      return new ServiceError(message, status, 'upstream_error', correlationId, axiosError.response.data);
    }

    if (error instanceof ServiceError) {
      return error;
    }

    return new ServiceError(
      `Unexpected error while communicating with ${service}`,
      500,
      'internal_error',
      correlationId,
      error
    );
  }

  private buildHeaders(correlationId?: string): Record<string, string> {
    return correlationId ? { 'x-correlation-id': correlationId } : {};
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
