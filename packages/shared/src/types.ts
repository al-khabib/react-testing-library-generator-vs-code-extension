import { z } from "zod";

// API Request/Response types
export const GenerateTestRequestSchema = z.object({
  componentCode: z.string().min(1),
  filePath: z.string().min(1),
  testStyle: z.enum(["minimal", "comprehensive"]).default("comprehensive"),
});

export const GenerateTestResponseSchema = z.object({
  success: z.boolean(),
  testCode: z.string().optional(),
  error: z.string().optional(),
});

export type GenerateTestRequest = z.infer<typeof GenerateTestRequestSchema>;
export type GenerateTestResponse = z.infer<typeof GenerateTestResponseSchema>;

// LLM Service types
export interface LLMRequest {
  prompt: string;
  model?: string;
  temperature?: number;
}

export interface LLMResponse {
  response: string;
  model: string;
  timestamp: string;
}
