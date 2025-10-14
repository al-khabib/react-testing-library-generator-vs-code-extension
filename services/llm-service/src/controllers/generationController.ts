import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GenerationRequestPayload, ServiceError } from '../types';
import { buildPrompt } from '../prompts/testPromptBuilder';
import { ollamaClient } from '../services/ollamaClient';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { formatGeneratedTest } from '../utils/formatter';

const propSchema = z.object({
  name: z.string(),
  type: z.string().nullable().optional(),
  required: z.boolean(),
  defaultValue: z.string().nullable().optional()
});

const stateSchema = z.object({
  name: z.string(),
  initialValue: z.string().nullable().optional()
});

const hookSchema = z.object({
  name: z.string(),
  dependencies: z.array(z.string()).optional(),
  details: z.string().nullable().optional()
});

const handlerSchema = z.object({
  name: z.string(),
  handler: z.string(),
  element: z.string().nullable().optional(),
  eventType: z.string().nullable().optional()
});

const importSchema = z.object({
  source: z.string(),
  imported: z.array(z.string()),
  namespace: z.string().nullable().optional(),
  defaultImport: z.string().nullable().optional()
});

const analysisSchema = z.object({
  name: z.string(),
  type: z.enum(['functional', 'class']),
  props: z.array(propSchema).default([]),
  state: z.array(stateSchema).default([]),
  hooks: z.array(hookSchema).default([]),
  eventHandlers: z.array(handlerSchema).default([]),
  imports: z.array(importSchema).default([]),
  dataTestIds: z.array(z.string()).default([]),
  complexity: z.number().default(1),
  testingRecommendations: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional()
});

const generationOptionsSchema = z
  .object({
    model: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    format: z.enum(['plain', 'json']).optional(),
    stream: z.boolean().optional(),
    includeExamples: z.array(z.string()).optional()
  })
  .partial();

const requestSchema = z.object({
  analysis: analysisSchema,
  options: generationOptionsSchema.optional()
});

const parseRequest = (body: unknown): GenerationRequestPayload => {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw ServiceError.validation('Invalid generation payload.', parsed.error.flatten());
  }
  return parsed.data as GenerationRequestPayload;
};

export const generateTest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = parseRequest(req.body);
    const prompt = buildPrompt(payload.analysis, {
      examples: payload.options?.includeExamples,
      options: payload.options
    });

    const result = await ollamaClient.generateTest(prompt, payload.options);
    const formattedContent = await formatGeneratedTest(result.content);

    res.json({
      success: true,
      data: {
        ...result,
        content: formattedContent,
        metadata: {
          ...(result.metadata ?? {}),
          component: payload.analysis.name,
          complexity: payload.analysis.complexity
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const streamGenerate = async (req: Request, res: Response, next: NextFunction) => {
  let payload: GenerationRequestPayload;
  try {
    payload = parseRequest(req.body);
  } catch (error) {
    next(error);
    return;
  }

  const prompt = buildPrompt(payload.analysis, {
    examples: payload.options?.includeExamples,
    options: payload.options
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const abortController = new AbortController();
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':heartbeat\n\n');
    }
  }, 15000);

  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const writeData = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  req.on('close', () => {
    clearInterval(heartbeat);
    abortController.abort();
  });

  try {
    writeEvent('start', {
      model: payload.options?.model ?? config.ollama.modelName,
      component: payload.analysis.name
    });

    await ollamaClient.streamGenerate(
      prompt,
      { ...payload.options, stream: true },
      async (chunk) => {
        if (chunk.done) {
          writeEvent('done', { component: payload.analysis.name });
        } else if (chunk.content) {
          writeData({ token: chunk.content });
        }
      },
      abortController.signal
    );

    res.end();
    clearInterval(heartbeat);
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError('Generation failed.', 500, 'internal_error', error);
    logger.error('Streaming generation failed', {
      error: serviceError.message,
      details: serviceError.details
    });

    if (!res.writableEnded) {
      writeEvent('error', { message: serviceError.message, code: serviceError.code });
      res.end();
    } else {
      next(serviceError);
    }
    clearInterval(heartbeat);
  }
};

export const listModels = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await ollamaClient.listModels();
    res.json({ success: true, data: models });
  } catch (error) {
    next(error);
  }
};
