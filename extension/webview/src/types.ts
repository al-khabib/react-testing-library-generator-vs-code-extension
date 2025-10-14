export interface ExtensionSettings {
  apiGatewayUrl: string;
  testOutputDirectory: string;
  autoSaveGeneratedTests: boolean;
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

export interface ServiceStatus {
  healthy: boolean;
  message?: string;
  lastChecked: string;
}

export interface HistoryItem {
  componentName: string;
  filePath: string;
  generatedTest?: GeneratedTest;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
}

export type WebviewMessage =
  | { type: 'settings'; payload: ExtensionSettings }
  | { type: 'status'; payload: ServiceStatus }
  | { type: 'testGenerated'; payload: GeneratedTest & { componentName: string } }
  | { type: 'history'; payload: HistoryItem[] }
  | { type: 'error'; payload: string };
