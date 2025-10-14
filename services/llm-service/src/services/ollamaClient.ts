import axios, { AxiosError, AxiosInstance } from 'axios';
import { Readable } from 'stream';
import { config } from '../utils/config';
import {
  GeneratedTest,
  GenerationOptions,
  ModelInfo,
  ServiceError,
  StreamingChunk
} from '../types';
import { logger } from '../utils/logger';

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

interface GeneratePayload {
  model: string;
  prompt: string;
  stream: boolean;
  options: Record<string, unknown>;
}

interface StreamChunkPayload {
  response?: string;
  done?: boolean;
  context?: number[];
  error?: string;
}

type ChunkHandler = (chunk: StreamingChunk) => void | Promise<void>;

export class OllamaClient {
  private readonly client: AxiosInstance;

  private readonly model: string;

  private readonly defaultTemperature: number;

  private readonly defaultMaxTokens: number;

  private readonly timeoutMs: number;

  constructor() {
    this.client = axios.create({
      baseURL: config.ollama.baseUrl,
      timeout: config.ollama.timeoutMs
    });
    this.model = config.ollama.modelName;
    this.defaultTemperature = config.ollama.temperature;
    this.defaultMaxTokens = config.ollama.maxTokens;
    this.timeoutMs = config.ollama.timeoutMs;
  }

  async generateTest(prompt: string, options?: GenerationOptions): Promise<GeneratedTest> {
    let content = '';
    const result = await this.streamGenerate(prompt, options, async (chunk) => {
      content += chunk.content;
    });

    return {
      content: content.trim(),
      model: result.model,
      prompt,
      metadata: {
        streamed: true,
        durationMs: result.durationMs
      }
    };
  }

  async streamGenerate(
    prompt: string,
    options: GenerationOptions | undefined,
    onChunk: ChunkHandler,
    signal?: AbortSignal
  ): Promise<{ model: string; durationMs: number }> {
    const payload = this.buildPayload(prompt, options, true);
    const startedAt = Date.now();

    return this.executeWithRetry(async () => {
      const response = await this.client.post('/api/generate', payload, {
        responseType: 'stream',
        timeout: this.timeoutMs,
        signal
      });

      const stream = response.data as Readable;
      let buffer = '';

      let doneSignalled = false;

      const handleLine = async (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.length) {
          return;
        }
        let parsed: StreamChunkPayload;
        try {
          parsed = JSON.parse(trimmed) as StreamChunkPayload;
        } catch (error) {
          logger.warn('Failed to parse Ollama stream chunk', { line: trimmed });
          return;
        }

        if (parsed.error) {
          throw ServiceError.upstream(parsed.error);
        }

        if (parsed.response) {
          await onChunk({ content: parsed.response, done: false });
        }

        if (parsed.done) {
          doneSignalled = true;
          await onChunk({ content: '', done: true });
        }
      };

      return await new Promise<{ model: string; durationMs: number }>((resolve, reject) => {
        const abort = (error: unknown) => {
          stream.destroy();
          reject(error);
        };

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            Promise.resolve(handleLine(line)).catch(abort);
            newlineIndex = buffer.indexOf('\n');
          }
        });

        stream.on('end', () => {
          const finalize = () => {
            if (!doneSignalled) {
              Promise.resolve(onChunk({ content: '', done: true })).finally(() => {
                resolve({
                  model: payload.model,
                  durationMs: Date.now() - startedAt
                });
              });
            } else {
              resolve({
                model: payload.model,
                durationMs: Date.now() - startedAt
              });
            }
          };

          if (buffer.trim().length) {
            Promise.resolve(handleLine(buffer))
              .then(() => {
                finalize();
              })
              .catch((error) => abort(error));
          } else {
            finalize();
          }
        });

        stream.on('error', (error: Error) => {
          abort(this.mapAxiosError(error, 'generateTest'));
        });

        if (signal) {
          signal.addEventListener('abort', () => {
            abort(ServiceError.timeout('Generation aborted by client.'));
          });
        }
      });
    }, 'generateTest');
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.executeWithRetry(async () => {
      const { data } = await this.client.get<{ models: Array<{ name: string; modified_at?: string; size?: number }> }>(
        '/api/tags'
      );
      return data;
    }, 'listModels');

    return response.models.map((modelEntry: { name: string; modified_at?: string; size?: number }) => ({
      name: modelEntry.name,
      modifiedAt: modelEntry.modified_at,
      size: modelEntry.size
    }));
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/api/version');
      return true;
    } catch (error) {
      throw this.mapAxiosError(error, 'health');
    }
  }

  private buildPayload(
    prompt: string,
    options: GenerationOptions | undefined,
    stream: boolean
  ): GeneratePayload {
    const model = options?.model?.trim() || this.model;
    const temperature = options?.temperature ?? this.defaultTemperature;
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;

    const ollamaOptions: Record<string, unknown> = {
      temperature,
      num_predict: maxTokens
    };

    if (options?.format) {
      ollamaOptions.format = options.format;
    }

    return {
      model,
      prompt,
      stream,
      options: ollamaOptions
    };
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, action: string): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > RETRY_ATTEMPTS) {
          throw this.mapAxiosError(lastError, action);
        }
        await this.delay(RETRY_DELAY_MS * attempt);
      }
    }

    throw this.mapAxiosError(lastError, action);
  }

  private mapAxiosError(error: unknown, action: string): ServiceError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;

      if (axiosError.code === 'ECONNABORTED') {
        return ServiceError.timeout(`Ollama request timed out (${action}).`, axiosError.message);
      }

      if (!axiosError.response) {
        return ServiceError.unavailable(`Ollama is unavailable (${action}).`, axiosError.message);
      }

      const status = axiosError.response.status;
      const message =
        axiosError.response.data?.error || axiosError.response.data?.message || axiosError.message;

      if (status === 404) {
        return ServiceError.validation(message ?? 'Requested model was not found.');
      }

      if (status >= 500) {
        return ServiceError.unavailable(message ?? 'Ollama service error.', axiosError.response.data);
      }

      return new ServiceError(message ?? 'Unexpected Ollama response.', status, 'upstream_error');
    }

    if (error instanceof ServiceError) {
      return error;
    }

    return new ServiceError('Unexpected error communicating with Ollama.', 500, 'internal_error', error);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export const ollamaClient = new OllamaClient();
