import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { parse } from '@babel/parser';
import { ZodError } from 'zod';
import { ValidationResult } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../utils/appError';

const generatedTestSchema = z.object({
  content: z.string().min(1, 'Generated test content is required.'),
  model: z.string().optional(),
  prompt: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const envelopeSchema = z.union([
  generatedTestSchema,
  z.object({
    generatedTest: generatedTestSchema,
    component: z
      .object({
        name: z.string().min(1),
        complexity: z.number().optional()
      })
      .optional()
  })
]);

const evaluateTest = (content: string): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];
  const normalized = content.trim();

  if (!normalized.length) {
    issues.push('Generated test content is empty.');
  }

  if (!normalized.includes('describe(') && !normalized.includes('test(') && !normalized.includes('it(')) {
    issues.push('Test should include at least one describe/test/it block.');
  }

  if (!normalized.includes('@testing-library/react')) {
    issues.push('Test should import from @testing-library/react.');
  }

  return {
    valid: issues.length === 0,
    issues
  };
};

const detectSyntaxIssues = (content: string): string[] => {
  try {
    parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy']
    });
    return [];
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.replace(/\s*\(\d+:\d+\)$/, '').trim();
      return [`Syntax error detected in generated test: ${message}`];
    }
    return ['Syntax error detected in generated test.'];
  }
};

export const validateGeneratedTest = (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = envelopeSchema.parse(req.body);
    const generatedTest =
      'generatedTest' in parsed ? parsed.generatedTest : parsed;
    const component = 'generatedTest' in parsed ? parsed.component : undefined;

    const baseResult = evaluateTest(generatedTest.content);
    const syntaxIssues = detectSyntaxIssues(generatedTest.content);
    const combinedIssues = [...baseResult.issues, ...syntaxIssues];
    const isValid = combinedIssues.length === 0;

    const response: ValidationResult = {
      valid: isValid,
      issues: combinedIssues,
      generatedTest
    };

    if (isValid) {
      logger.info('Generated test passed validation.', {
        component: component?.name,
        issues: combinedIssues.length
      });
    } else {
      logger.warn('Generated test reported validation issues.', {
        component: component?.name,
        issues: combinedIssues
      });
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, 'Invalid validation payload.', error.flatten()));
      return;
    }
    next(error);
  }
};
