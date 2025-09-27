// services/backend-api/src/server.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyOauth2 from "@fastify/oauth2";
import crypto from "node:crypto";

// ---------- Env ----------
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deep-seek-rtl-gen";
const PORT = Number(process.env.PORT ?? 7070);
const JWT_SECRET = process.env.JWT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ??
  `http://localhost:${PORT}/auth/github/callback`;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET)
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");

// ---------- Fastify + plugins ----------
const fastify = Fastify({ logger: false });

await fastify.register(cors, {
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});

// JWT
await fastify.register(fastifyJwt, { secret: JWT_SECRET });

// augment fastify types for TS
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

// auth guard
fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

// GitHub OAuth2
await fastify.register(fastifyOauth2, {
  name: "githubOAuth2",
  scope: ["read:user", "user:email"],
  credentials: {
    client: { id: GITHUB_CLIENT_ID!, secret: GITHUB_CLIENT_SECRET! },
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

// ---------- Health ----------
fastify.get("/health", async () => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return {
      status: "ok",
      ollama: r.ok ? "connected" : "disconnected",
      model: OLLAMA_MODEL,
    };
  } catch {
    return { status: "ok", ollama: "disconnected", model: OLLAMA_MODEL };
  }
});

// ---------- GitHub OAuth helper state (in-memory) ----------
type AuthBucket = { token?: string; user?: any; createdAt: number };
const authStates = new Map<string, AuthBucket>();
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of authStates.entries()) {
      if (now - v.createdAt > STATE_TTL_MS) authStates.delete(k);
    }
  },
  10 * 60 * 1000,
).unref();

async function buildAuthorizeUrl(request: any, reply: any) {
  const state = crypto.randomBytes(16).toString("hex");
  authStates.set(state, { createdAt: Date.now() });

  const uri = await fastify.githubOAuth2.generateAuthorizationUri(
    request,
    reply,
  );
  const url = new URL(String(uri));
  url.searchParams.set("state", state);
  return { authUrl: url.toString(), state };
}

// Start OAuth: Extension calls this to get {authUrl, state}
fastify.get("/auth/github/url", async (request, reply) => {
  try {
    const { authUrl, state } = await buildAuthorizeUrl(request, reply);
    return reply.send({ authUrl, state });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: "Failed to create auth URL" });
  }
});

// GitHub callback: exchanges code → token → user, issues JWT, stores in state
fastify.get("/auth/github/callback", async (request, reply) => {
  try {
    const q = request.query as {
      state?: string;
      code?: string;
      error?: string;
      error_description?: string;
    };
    if (q.error) {
      return reply
        .code(400)
        .send(`GitHub error: ${q.error} - ${q.error_description ?? ""}`);
    }

    const state = q.state;
    if (!state || !authStates.has(state)) {
      return reply
        .code(400)
        .send("Invalid or expired state. Start login again.");
    }

    // Exchange code -> token
    let accessToken: string | undefined;
    try {
      const { token } =
        await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(
          request as any,
        );
      accessToken = token?.access_token as string | undefined;
    } catch (ex: any) {
      console.error("[OAuth] token exchange failed:", ex?.response?.data ?? ex);
      return reply
        .code(500)
        .send("Token exchange failed. Check redirect URL & client/secret.");
    }
    if (!accessToken) return reply.code(400).send("Missing access token");

    // Fetch user profile
    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "rtl-extension",
      },
    });
    const userText = await userResp.text();
    if (!userResp.ok) {
      console.error("[OAuth] GitHub /user failed:", userResp.status, userText);
      return reply.code(500).send("Failed to fetch GitHub user profile.");
    }
    const ghUser = JSON.parse(userText);

    // Primary email (optional)
    let email: string | undefined = ghUser?.email ?? undefined;
    if (!email) {
      try {
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
      } catch (e) {
        console.warn("[OAuth] /user/emails fetch skipped:", e);
      }
    }

    const jwtPayload = {
      sub: String(ghUser.id),
      login: ghUser.login,
      name: ghUser.name ?? ghUser.login,
      email,
      avatarUrl: ghUser.avatar_url,
      provider: "github",
    };
    const jwt = await reply.jwtSign(jwtPayload, { expiresIn: "7d" });

    const bucket = authStates.get(state)!;
    bucket.token = jwt;
    bucket.user = jwtPayload;

    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login complete</title><style>body{font-family:ui-sans-serif,system-ui;max-width:560px;margin:48px auto;padding:0 16px;}</style>
<h2>✅ GitHub login complete</h2><p>You can close this tab and return to VS Code.</p>`);
  } catch (err) {
    console.error("[OAuth] callback unhandled error:", err);
    return reply.code(500).send("OAuth callback failed");
  }
});

// Extension polls this to get the JWT
fastify.get("/auth/github/token", async (request, reply) => {
  const { state } = request.query as { state?: string };
  if (!state) return reply.code(400).send({ error: "state is required" });
  const bucket = authStates.get(state);
  if (!bucket)
    return reply.code(404).send({ error: "state not found or expired" });
  if (!bucket.token) return reply.code(202).send({ status: "pending" });
  const payload = { token: bucket.token, user: bucket.user };
  authStates.delete(state);
  return reply.send(payload);
});

// ---------- Types ----------
type Body = {
  componentCode: string; // required
  testStyle?: "minimal" | "comprehensive";
  stream?: boolean; // default false
};

// ---------- Main generation endpoint (PROTECTED) ----------
fastify.post<{ Body: Body }>(
  "/api/generate-tests",
  { preValidation: [fastify.authenticate] },
  async (request, reply) => {
    const {
      componentCode,
      testStyle = "comprehensive",
      stream = false,
    } = request.body ?? {};
    if (!componentCode)
      return reply
        .code(400)
        .send({ success: false, error: "componentCode is required" });

    const prompt = buildPrompt(componentCode, testStyle);

    const body = {
      model: OLLAMA_MODEL,
      prompt,
      stream,
      keep_alive: "0",
      options: {
        temperature: 0.2,
        top_p: 0.95,
        repeat_penalty: 1.05,
        num_ctx: 3072,
        num_predict: 1200,
      },
    };

    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return reply
        .code(502)
        .send({ success: false, error: `Ollama error ${r.status}: ${text}` });
    }

    if (stream) {
      reply.raw.setHeader("Content-Type", "text/plain; charset=utf-8");
      reply.raw.setHeader("Transfer-Encoding", "chunked");
      let acc = "";
      for await (const chunk of r.body as any) {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            if (j.response) {
              const cleaned = cleanChunk(j.response);
              acc += cleaned;
              process.stdout.write(cleaned);
              reply.raw.write(cleaned);
            }
            if (j.done) {
              reply.raw.end();
              return;
            }
          } catch {
            /* ignore partial lines */
          }
        }
      }
      reply.raw.end();
      return;
    } else {
      const data = (await r.json()) as { response: string };
      const cleaned = cleanCode(data.response);
      console.log("[GEN]", cleaned.slice(0, 200));
      return reply.send({ success: true, testCode: cleaned });
    }
  },
);

// ---------- Helpers ----------
function buildPrompt(componentCode: string, style: string) {
  const styleLine =
    style === "minimal"
      ? "Write basic but correct RTL tests focusing on rendering and a couple of interactions."
      : "Write comprehensive RTL tests covering rendering, user flows, edge cases, and accessibility.";

  return `You are an expert in React Testing Library and Jest.
${styleLine}

Component:
\`\`\`tsx
${componentCode}
\`\`\`

Rules:
- Use: import { render, screen } from "@testing-library/react"; import userEvent from "@testing-library/user-event";
- Prefer accessible queries (getByRole/findByRole) and jest-dom matchers.
- Test user behavior, not implementation details. Use userEvent.
- Use describe/test structure.
- Output ONLY the test file content (no backticks, no explanations).`;
}

function cleanCode(output: string): string {
  return output
    .replace(/^\s*```[a-z]*\s*/i, "") // opening ```
    .replace(/```+$/i, "") // trailing ```
    .trim();
}

// streaming variant (more permissive)
function cleanChunk(chunk: string): string {
  return chunk.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "");
}

// ---------- Start ----------
const start = async () => {
  const ok = await fetch(`${OLLAMA_URL}/api/tags`)
    .then((r) => r.ok)
    .catch(() => false);
  console.log(
    `[INFO] Ollama: ${ok ? "connected" : "disconnected"}  model=${OLLAMA_MODEL}`,
  );
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[INFO] Backend API on http://localhost:${PORT}`);
};
start();
