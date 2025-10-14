import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceClient } from '../services/serviceClient';
import {
  ApiSuccessResponse,
  ComponentInfo,
  GeneratedTest,
  ServiceError,
  StatusReport
} from '../types';
import { validateRequest } from '../middlewares/validateRequest';
import { httpStatus } from '../utils/httpStatus';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const router = Router();
const serviceClient = new ServiceClient();

const componentSchema = z.object({
  name: z.string().min(1),
  filePath: z.string().min(1),
  code: z.string().min(1, 'Component source code is required.'),
  props: z.string().nullable().optional(),
  imports: z.array(z.string()).default([]),
  hasTests: z.boolean(),
  displayName: z.string().optional(),
  instructions: z.string().optional(),
  source: z.enum(['full', 'selection']).optional()
});

const buildSuccessResponse = <T>(correlationId: string | undefined, data: T): ApiSuccessResponse<T> => ({
  success: true,
  data,
  correlationId: correlationId ?? ''
});

router.get('/health', (req: Request, res: Response<ApiSuccessResponse<{ status: string; service: string; timestamp: string }>>) => {
  const correlationId = res.locals.correlationId ?? req.correlationId;
  const payload = {
    status: 'ok',
    service: config.serviceName,
    timestamp: new Date().toISOString()
  };
  res.status(httpStatus.ok).json(buildSuccessResponse(correlationId, payload));
});

router.get('/status', async (req: Request, res: Response<ApiSuccessResponse<StatusReport>>, next: NextFunction) => {
  const correlationId = res.locals.correlationId ?? req.correlationId;
  try {
    const [codeAnalysis, llmService, testValidation] = await Promise.all([
      serviceClient.checkServiceHealth('code-analysis', correlationId),
      serviceClient.checkServiceHealth('llm-service', correlationId),
      serviceClient.checkServiceHealth('test-validation', correlationId)
    ]);

    const status: StatusReport = {
      gateway: {
        service: config.serviceName,
        healthy: true,
        timestamp: new Date().toISOString()
      },
      dependencies: [codeAnalysis, llmService, testValidation]
    };

    res.status(httpStatus.ok).json(buildSuccessResponse(correlationId, status));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/generate-test',
  validateRequest(componentSchema),
  async (
    req: Request<unknown, unknown, ComponentInfo>,
    res: Response<ApiSuccessResponse<GeneratedTest>>,
    next: NextFunction
  ) => {
    const correlationId = res.locals.correlationId ?? req.correlationId;

    try {
      const componentInfo = req.body;

      if (componentInfo.displayName) {
        const trimmedDisplayName = componentInfo.displayName.trim();
        componentInfo.displayName = trimmedDisplayName.length ? trimmedDisplayName : undefined;
      }

      if (componentInfo.instructions) {
        const trimmedInstructions = componentInfo.instructions.trim();
        componentInfo.instructions = trimmedInstructions.length ? trimmedInstructions : undefined;
      }

      logger.info(`Generating test for component ${componentInfo.name}`, { correlationId });

      const analysis = await serviceClient.analyzeCode(componentInfo, correlationId);
      const enrichedAnalysis = {
        ...analysis,
        metadata: {
          ...(analysis.metadata ?? {}),
          displayName: componentInfo.displayName ?? componentInfo.name,
          source: componentInfo.source ?? 'full',
          instructions:
            typeof componentInfo.instructions === 'string' && componentInfo.instructions.trim().length
              ? componentInfo.instructions.trim()
              : undefined
        }
      };
      const generatedTest = await serviceClient.generateTest(enrichedAnalysis, correlationId);
      const validation = await serviceClient.validateTest(generatedTest, enrichedAnalysis, correlationId);

      if (!validation.valid) {
        throw ServiceError.validation(
          'Generated test failed validation.',
          validation.issues,
          correlationId
        );
      }

      const displayName = componentInfo.displayName ?? analysis.name ?? componentInfo.name;
      const normalizedFileName =
        validation.generatedTest.fileName ??
        generatedTest.fileName ??
        `${displayName.replace(/\s+/g, '')}.test.tsx`;
      const instructions =
        typeof componentInfo.instructions === 'string' && componentInfo.instructions.trim().length
          ? componentInfo.instructions.trim()
          : undefined;

      const testWithMetadata: GeneratedTest = {
        ...validation.generatedTest,
        fileName: normalizedFileName,
        relativePath: validation.generatedTest.relativePath ?? generatedTest.relativePath
      };

      if (!testWithMetadata.generatedAt) {
        testWithMetadata.generatedAt = new Date().toISOString();
      }

      if (instructions || enrichedAnalysis.metadata) {
        testWithMetadata.metadata = {
          ...(generatedTest.metadata ?? {}),
          ...(validation.generatedTest.metadata ?? {}),
          instructions,
          displayName,
          source: componentInfo.source ?? 'full'
        };
      }

      res.status(httpStatus.ok).json(buildSuccessResponse(correlationId, testWithMetadata));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
