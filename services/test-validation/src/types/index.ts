export type { EnvironmentConfig } from './environment';

export interface GeneratedTest {
  content: string;
  model?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  issues?: string[];
  generatedTest: GeneratedTest;
}
