import dotenv from 'dotenv'
import { EnvironmentConfig } from '../types'

dotenv.config()

const DEFAULT_PORT = 3000
const DEFAULT_SERVICE_NAME = 'api-gateway'
const DEFAULT_TIMEOUT_MS = 60000
const DEFAULT_RETRY_ATTEMPTS = 2
const DEFAULT_FAILURE_THRESHOLD = 3
const DEFAULT_COOLDOWN_MS = 15000
const DEFAULT_RATE_WINDOW_MS = 60000
const DEFAULT_RATE_LIMIT_MAX = 60

const DEFAULT_CODE_ANALYSIS_URL = 'http://localhost:3001'
const DEFAULT_LLM_SERVICE_URL = 'http://localhost:3002'
const DEFAULT_TEST_VALIDATION_URL = 'http://localhost:3003'

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'vscode-webview://*'
]

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const parseOrigins = (
  value: string | undefined,
  fallback: string[]
): string[] => {
  if (!value) {
    return fallback
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

export const config: EnvironmentConfig = {
  port: parsePort(process.env.PORT, DEFAULT_PORT),
  serviceName: process.env.SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME,
  codeAnalysisUrl:
    process.env.CODE_ANALYSIS_URL?.trim() || DEFAULT_CODE_ANALYSIS_URL,
  llmServiceUrl: process.env.LLM_SERVICE_URL?.trim() || DEFAULT_LLM_SERVICE_URL,
  testValidationUrl:
    process.env.TEST_VALIDATION_URL?.trim() || DEFAULT_TEST_VALIDATION_URL,
  requestTimeoutMs: parseNumber(
    process.env.REQUEST_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  ),
  retryAttempts: parseNumber(
    process.env.RETRY_ATTEMPTS,
    DEFAULT_RETRY_ATTEMPTS
  ),
  circuitBreaker: {
    failureThreshold: parseNumber(
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      DEFAULT_FAILURE_THRESHOLD
    ),
    cooldownMs: parseNumber(
      process.env.CIRCUIT_BREAKER_COOLDOWN_MS,
      DEFAULT_COOLDOWN_MS
    )
  },
  rateLimit: {
    windowMs: parseNumber(
      process.env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_WINDOW_MS
    ),
    max: parseNumber(process.env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX)
  },
  allowedOrigins: parseOrigins(
    process.env.ALLOWED_ORIGINS,
    DEFAULT_ALLOWED_ORIGINS
  )
}
