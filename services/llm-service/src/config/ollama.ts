import dotenv from 'dotenv';
import { EnvironmentConfig } from '../types';

dotenv.config();

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL_NAME = 'deep-seek-rtl-gen:latest';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 60000;

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const ollamaConfig: EnvironmentConfig['ollama'] = {
  baseUrl: process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL,
  modelName: process.env.MODEL_NAME?.trim() || DEFAULT_MODEL_NAME,
  temperature: parseNumber(process.env.TEMPERATURE, DEFAULT_TEMPERATURE),
  maxTokens: parseInteger(process.env.MAX_TOKENS, DEFAULT_MAX_TOKENS),
  timeoutMs: parseInteger(process.env.TIMEOUT, DEFAULT_TIMEOUT_MS)
};
