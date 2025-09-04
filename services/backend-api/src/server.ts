import Fastify from "fastify";
import cors from "@fastify/cors";

// Temporary: Define types locally until shared import works
interface GenerateTestRequest {
  componentCode: string;
  filePath: string;
  testStyle: "minimal" | "comprehensive";
}

interface GenerateTestResponse {
  success: boolean;
  testCode?: string;
  error?: string;
}

// Simple logger until shared import works
const logger = {
  info: (message: string, ...args: any[]) =>
    console.log(`[INFO] ${message}`, ...args),
  error: (message: string, ...args: any[]) =>
    console.error(`[ERROR] ${message}`, ...args),
  warn: (message: string, ...args: any[]) =>
    console.warn(`[WARN] ${message}`, ...args),
};

const fastify = Fastify({ logger: false });

await fastify.register(cors, { origin: true });

// Health check
fastify.get("/health", async () => {
  const ollamaStatus = await checkOllama();
  return {
    status: "ok",
    service: "backend-api",
    ollama: ollamaStatus ? "connected" : "disconnected",
  };
});

// Main endpoint - generate tests
fastify.post<{ Body: GenerateTestRequest; Reply: GenerateTestResponse }>(
  "/api/generate-tests",
  async (request, reply) => {
    try {
      const { componentCode, filePath, testStyle } = request.body;

      logger.info(`Generating ${testStyle} tests for: ${filePath}`);

      // Call Ollama directly
      const ollamaResponse = await fetch(
        "http://localhost:11434/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "deepseek-coder-v2",
            prompt: buildPrompt(componentCode, testStyle),
            stream: false,
            options: {
              temperature: 0.1,
              top_p: 0.9,
              num_ctx: 4096,
            },
          }),
        },
      );

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama error: ${ollamaResponse.status}`);
      }

      const ollamaData = (await ollamaResponse.json()) as { response: string };

      return {
        success: true,
        testCode: cleanupTestCode(ollamaData.response),
      };
    } catch (error) {
      logger.error("Generate tests error:", error);
      return reply.status(500).send({
        success: false,
        error:
          "Failed to generate tests. Make sure Ollama is running with deepseek-coder-v2.",
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

Rules:
- Use render, screen from @testing-library/react  
- Use userEvent from @testing-library/user-event
- Test user behavior, not implementation details
- Include proper imports at the top
- Use describe/test structure
- Focus on accessibility where possible
- Generate ONLY the test code, no explanations

Test code:`;
}

function cleanupTestCode(response: string): string {
  const codeMatch = response.match(/``````/);
  if (codeMatch) {
    return codeMatch[1].trim();
  }

  return response
    .replace(/^Here's.*?:\s*/i, "")
    .replace(/^This test.*?:\s*/i, "")
    .trim();
}

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function verifyOllamaSetup(): Promise<void> {
  logger.info("Checking Ollama connection...");

  try {
    // Check if Ollama is running
    const response = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error(
        `Ollama API returned status: ${response.status}. Is Ollama running on localhost:11434?`,
      );
      process.exit(1);
    }

    const data = (await response.json()) as { models?: { name: string }[] };

    process.exit(1);
  } catch (error) {
    logger.error(
      "Ollama connection failed. Make sure Ollama is running and deepseek-coder-v2 model is installed.",
      error,
    );
    process.exit(1);
  }

  logger.info("Ollama is connected and ready.");
}

const start = async () => {
  try {
    await verifyOllamaSetup();
    await fastify.listen({ port: 7070, host: "0.0.0.0" });
    logger.info("Backend API running on port 7070");
    logger.info("Ready to generate RTL tests!");
  } catch (err) {
    logger.error("Failed to start backend:", err);
    process.exit(1);
  }
};

start();
