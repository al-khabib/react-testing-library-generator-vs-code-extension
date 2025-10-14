export interface ComponentInfo {
  name: string;
  filePath: string;
  code: string;
  props: string | null;
  imports: string[];
  hasTests: boolean;
  displayName?: string;
  instructions?: string;
  source?: 'full' | 'selection';
}

export interface GeneratedTest {
  fileName: string;
  content: string;
  relativePath?: string;
  generatedAt?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  summary?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ExtensionSettings {
  apiGatewayUrl: string;
  testOutputDirectory: string;
  autoSaveGeneratedTests: boolean;
}

export interface ServiceStatus {
  healthy: boolean;
  message?: string;
  lastChecked: string;
}

export type TestGenerationStatus = 'success' | 'error' | 'pending';

export interface TestHistoryEntry {
  componentName: string;
  filePath: string;
  timestamp: string;
  status: TestGenerationStatus;
  errorMessage?: string;
  generatedTest?: GeneratedTest;
}
