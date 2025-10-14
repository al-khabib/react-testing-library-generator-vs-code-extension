export interface EnvironmentConfig {
  port: number;
  serviceName: string;
  ollama: {
    baseUrl: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
}
