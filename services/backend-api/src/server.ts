import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "shared/logger";
import { GenerateTestRequest, GenerateTestResponse } from "shared/types";

const fastify = Fastify({ logger: false });

await fastify.register(cors, { origin: true });

// Health check
fastify.get("/health", async () => {
  return { status: "ok", service: "backend-api" };
});

// Main endpoint - generate tests
fastify.post<{ Body: GenerateTestRequest; Reply: GenerateTestResponse }>(
  "/api/generate-tests",
  async (request, reply) => {
    try {
      const { componentCode, filePath, testStyle } =
        request.body as GenerateTestRequest;

      logger.info(`Generating ${testStyle} tests for: ${filePath}`);

      // Call LLM service
      const llmResponse = await fetch("http://localhost:7071/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildPrompt(componentCode, testStyle),
          model: "deepseek-coder-v2",
        }),
      });

      if (!llmResponse.ok) {
        throw new Error("LLM service failed");
      }

      const llmData = (await llmResponse.json()) as { response: string };

      return {
        success: true,
        testCode: llmData.response,
      };
    } catch (error) {
      logger.error("Generate tests error:", error);
      return reply.status(500).send({
        success: false,
        error: "Failed to generate tests",
      });
    }
  },
);

function buildPrompt(componentCode: string, style: string): string {
  const styleInstructions =
    style === "minimal"
      ? "Generate basic RTL tests focusing on rendering and simple interactions."
      : "Generate comprehensive RTL tests covering all functionality, edge cases, and accessibility.";

  return `You are an expert React Testing Library developer. ${styleInstructions}

Component code:
\`\`\`tsx
${componentCode}
\`\`\`

Generate ONLY the test code using React Testing Library. Follow these rules:
- Use render, screen from @testing-library/react
- Use userEvent for interactions
- Test user behavior, not implementation
- Include accessibility queries where appropriate
- Use describe/test structure
- Add proper imports

Test code:`;
}

const start = async () => {
  try {
    await fastify.listen({ port: 7070, host: "0.0.0.0" });
    logger.info("Backend API running on port 7070");
  } catch (err) {
    logger.error("Failed to start backend:", err);
    process.exit(1);
  }
};

start();
