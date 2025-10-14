import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  ComponentAnalysis,
  AnalysisRequestPayload,
  ServiceError
} from '../types';
import {
  detectComponentType,
  extractComponentName,
  extractDataTestIds,
  extractEventHandlers,
  extractHooks,
  extractPropsInterface,
  parseComponent
} from '../parsers/componentParser';
import { analyzeImports, identifyTestingLibraryNeeds } from '../parsers/dependencyAnalyzer';
import { logger } from '../utils/logger';

const requestSchema = z.object({
  code: z.string().min(1, 'Component code is required.'),
  filePath: z.string().optional(),
  componentName: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const calculateComplexity = (analysis: Pick<ComponentAnalysis, 'props' | 'hooks' | 'eventHandlers' | 'imports'>): number => {
  const base = 1;
  const propWeight = analysis.props.length;
  const hookWeight = analysis.hooks.length * 2;
  const eventWeight = analysis.eventHandlers.length * 2;
  const dependencyWeight = Math.min(analysis.imports.length, 10);
  return Math.max(base, propWeight + hookWeight + eventWeight + dependencyWeight);
};

export const analyzeComponent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const parseResult = requestSchema.safeParse(req.body);
  if (!parseResult.success) {
    next(ServiceError.validation('Invalid request payload.', parseResult.error.flatten()));
    return;
  }

  const payload: AnalysisRequestPayload = parseResult.data;

  try {
    const ast = parseComponent(payload.code);

    const detectedNameFromCode = extractComponentName(ast);
    const componentName = payload.componentName ?? detectedNameFromCode;

    if (!componentName) {
      throw ServiceError.parsing('Unable to determine component name. Provide componentName in the payload.');
    }

    const componentType = detectComponentType(ast, componentName);
    const props = extractPropsInterface(ast, payload.code, componentName);
    const { hooks, state } = extractHooks(ast, payload.code);
    const eventHandlers = extractEventHandlers(ast, payload.code);
    const dataTestIds = extractDataTestIds(ast);
    const imports = analyzeImports(ast);

    const testingRecommendations = identifyTestingLibraryNeeds({
      hooks,
      eventHandlers,
      dataTestIds,
      imports
    });

    const analysis: ComponentAnalysis = {
      name: componentName,
      type: componentType,
      props,
      state,
      hooks,
      eventHandlers,
      imports,
      dataTestIds,
      complexity: calculateComplexity({ props, hooks, eventHandlers, imports }),
      testingRecommendations,
      metadata: {
        filePath: payload.filePath,
        receivedComponentName: payload.componentName,
        ...payload.metadata
      }
    };

    logger.info(`Analysis completed for ${componentName}`, {
      complexity: analysis.complexity,
      hooks: analysis.hooks.length,
      props: analysis.props.length
    });

    res.json({ success: true, data: analysis });
  } catch (error) {
    if (error instanceof ServiceError) {
      next(error);
      return;
    }

    if (error instanceof SyntaxError) {
      next(ServiceError.parsing('Failed to parse component code.', error.message));
      return;
    }

    next(new ServiceError('Unexpected error while analyzing component.', 500, 'internal_error', error));
  }
};
