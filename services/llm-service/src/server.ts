import Fastify from "fastify";
import { logger } from "shared/logger";
import type { LLMRequest, LLMResponse } from "shared/types";

const fastify = Fastify({ logger: false });

// Health check
fastify.get("/health", async () => {
  // Check Ollama connection
  const ollamaStatus = await checkOllama();
  return {
    status: "ok",
    service: "llm-service",
    ollama: ollamaStatus ? "connected" : "disconnected",
  };
});

// Generate endpoint (proxy to Ollama)
fastify.post<{ Body: LLMRequest; Reply: LLMResponse }>(
  "/generate",
  async (request, reply) => {
    try {
      const {
        prompt,
        model = "deepseek-coder-v2",
        temperature = 0.1,
      } = request.body;

      logger.info(`Generating with model: ${model}`);

      const ollamaResponse = await fetch(
        "http://localhost:11434/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
              temperature,
              top_p: 0.9,
              num_ctx: 4096,
            },
          }),
        },
      );

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama API error: ${ollamaResponse.status}`);
      }

      const data = await ollamaResponse.json();

      return {
        response: data.response,
        model: model,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("LLM generation error:", error);
      return reply.status(500).send({
        response: "",
        model: request.body.model || "unknown",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    return response.ok;
  } catch {
    return false;
  }
}

const start = async () => {
  try {
    await fastify.listen({ port: 7071, host: "0.0.0.0" });
    logger.info("LLM Service running on port 7071");
  } catch (err) {
    logger.error("Failed to start LLM service:", err);
    process.exit(1);
  }
};

start();
