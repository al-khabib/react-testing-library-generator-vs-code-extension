import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyOauth2 from "@fastify/oauth2";
import "dotenv/config";

// Type augmentation so Fastify “sees” githubOAuth2 and authenticate
declare module "fastify" {
  interface FastifyInstance {
    githubOAuth2: {
      getAccessTokenFromAuthorizationCodeFlow: (
        request: any,
      ) => Promise<{ token: { access_token: string } }>;
      generateAuthorizationUri: (
        request: any,
        reply: any,
      ) => string | Promise<string>;
    };
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}

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

interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
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

// CORS: allow Authorization header for JWT
await fastify.register(cors, {
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});
[1];

// JWT registration
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
});
[2];

// Auth hook decoration + typing
fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});
[2];

// GitHub OAuth2 registration
if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
}
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ??
  "http://localhost:7070/auth/github/callback";

await fastify.register(fastifyOauth2, {
  name: "githubOAuth2",
  scope: ["read:user", "user:email"],
  credentials: {
    client: {
      id: process.env.GITHUB_CLIENT_ID!,
      secret: process.env.GITHUB_CLIENT_SECRET!,
    },
    auth: {
      tokenHost: "https://github.com",
      tokenPath: "/login/oauth/access_token",
      authorizeHost: "https://github.com",
      authorizePath: "/login/oauth/authorize",
    },
  },
  startRedirectPath: "/auth/github/login",
  callbackUri: GITHUB_REDIRECT_URI,
});
[1];

// Health check
fastify.get("/health", async () => {
  const ollamaStatus = await checkOllama();
  return {
    status: "ok",
    service: "backend-api",
    ollama: ollamaStatus ? "connected" : "disconnected",
  };
});

// Optional convenience endpoint to obtain GitHub authorize URL (for clients that handle redirects)
fastify.get("/auth/github/url", async (request, reply) => {
  try {
    const uri = fastify.githubOAuth2.generateAuthorizationUri(request, reply);
    const url =
      typeof (uri as any).then === "function"
        ? await (uri as any)
        : (uri as string);
    return reply.send({ authUrl: url });
  } catch (err) {
    logger.error("Failed to generate GitHub auth URL:", err);
    return reply.code(500).send({ error: "Failed to generate auth URL" });
  }
});
[1];

// OAuth callback → exchange code, fetch GitHub user, issue JWT
fastify.get("/auth/github/callback", async (request, reply) => {
  try {
    const { token } =
      await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(
        request,
      );
    const accessToken = token?.access_token as string;
    if (!accessToken) {
      return reply
        .code(400)
        .send({ error: "Missing access token from GitHub" });
    }

    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "rtl-extension",
      },
    });
    if (!userResp.ok) {
      return reply.code(401).send({ error: "Failed to get GitHub user" });
    }
    const ghUser = (await userResp.json()) as GitHubUser;

    // Fetch primary email if not present
    let email: string | null | undefined = ghUser.email;
    if (!email) {
      const emailsResp = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "rtl-extension",
        },
      });
      if (emailsResp.ok) {
        const arr = (await emailsResp.json()) as Array<{
          email: string;
          primary: boolean;
        }>;
        email = arr.find((e) => e.primary)?.email ?? undefined;
      }
    }

    const jwtPayload = {
      sub: String(ghUser.id),
      login: ghUser.login,
      name: ghUser.name ?? ghUser.login,
      email: email ?? undefined,
      avatarUrl: ghUser.avatar_url,
      provider: "github",
    };
    const jwt = await reply.jwtSign(jwtPayload, { expiresIn: "7d" });

    return reply.send({ token: jwt, user: jwtPayload });
  } catch (err) {
    logger.error("GitHub OAuth callback error:", err);
    return reply.code(500).send({ error: "OAuth callback failed" });
  }
});
[1][2];

// Token verification helper
fastify.get(
  "/auth/verify",
  { preValidation: [fastify.authenticate] },
  async (request: any) => {
    return { valid: true, user: request.user };
  },
);
[2];

// Main endpoint - generate tests (protected)
fastify.post<{ Body: GenerateTestRequest; Reply: GenerateTestResponse }>(
  "/api/generate-tests",
  { preValidation: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { componentCode, filePath, testStyle } = request.body;

      logger.info(`Generating ${testStyle} tests for: ${filePath}`);

      const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
      const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
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
      });

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama error: ${ollamaResponse.status}`);
      }

      const ollamaData = (await ollamaResponse.json()) as { response: string };

      return {
        success: true,
        testCode: ollamaData.response,
      };
    } catch (error) {
      logger.error("Generate tests error:", error);
      return reply.status(500).send({
        success: false,
        error:
          "Failed to generate tests. Make sure Ollama is reachable and deepseek-coder-v2 is installed.",
      });
    }
  },
);

// ----- Helpers (ensure they are in scope) -----
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
- Neglect the first 6 characters, and the last 3 characters if they are backticks

Test code:`;
}

async function checkOllama(): Promise<boolean> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const response = await fetch(`${ollamaUrl}/api/tags`, {
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
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error(
        `Ollama API returned status: ${response.status}. Is Ollama running?`,
      );
      process.exit(1);
    }

    const data = (await response.json()) as { models?: { name: string }[] };

    const hasModel =
      data.models?.some((m) => m.name === "deepseek-coder-v2:latest") ||
      data.models?.some((m) => m.name?.startsWith("deepseek-coder-v2")) ||
      false;

    if (!hasModel) {
      logger.error(
        "deepseek-coder-v2 model is not installed in Ollama. Please install it.",
      );
      process.exit(1);
    }
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
