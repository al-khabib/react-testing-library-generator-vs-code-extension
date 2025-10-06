// services/backend-api/src/server.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyOauth2 from "@fastify/oauth2";
import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

// ---------- Env ----------
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deep-seek-rtl-gen";
const PORT = Number(process.env.PORT ?? 7070);
const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY || ""; // NEW: optional API key for /v1/*
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ??
  `http://localhost:${PORT}/auth/github/callback`;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET)
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");

const StylePresetSchema = z.enum(["strict-a11y", "balanced", "legacy"]);
const SelectionSchema = z.object({
  text: z.string().min(1),
  start: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
  end: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
});

const GenerateSchema = z.object({
  model: z.string().min(1).optional(),
  filePath: z.string().optional(),
  source: z.string().min(1),
  selection: SelectionSchema.optional(),
  promptOverride: z.string().max(6000).optional(),
  stylePreset: StylePresetSchema.default("strict-a11y"),
  strictA11y: z.boolean().default(true),
  useUserEvent: z.boolean().default(true),
  intent: z.union([z.literal("unit"), z.literal("edge"), z.literal("mock-heavy"), z.literal("update")]).default("unit"),
  imports: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  timeoutMs: z.number().int().optional(),
});

const ChatMessageSchema = z.object({
  role: z.union([z.literal("system"), z.literal("user"), z.literal("assistant")]),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const ChatSchema = z.object({
  model: z.string().min(1).optional(),
  filePath: z.string().optional(),
  source: z.string().optional(),
  selection: SelectionSchema.optional(),
  messages: z.array(ChatMessageSchema).min(1),
  stylePreset: StylePresetSchema.default("strict-a11y"),
  runtime: z
    .object({
      strictA11y: z.boolean().optional(),
      useUserEvent: z.boolean().optional(),
      timeoutMs: z.number().int().optional(),
      applyToWorkspace: z.boolean().optional(),
      targetFile: z.string().optional(),
      imports: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
});

type GenerateInput = z.infer<typeof GenerateSchema>;
type ChatInput = z.infer<typeof ChatSchema>;

// ---------- Fastify + plugins ----------
const fastify = Fastify({ logger: false });

await fastify.register(cors, {
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"], // x-api-key for /v1/*
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

// auth guards
fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

const apiKeyGuard = async (request: any, reply: any) => {
  if (!API_KEY) return; // not enforced
  const key = request.headers["x-api-key"];
  if (key !== API_KEY) {
    return reply.code(401).send({ error: "unauthorized" });
  }
};

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

// Mirror to v1 for the extension Status Bar
fastify.get("/v1/health", { preHandler: apiKeyGuard }, async () => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const models = r.ok
      ? (((await r.json()) as any).models?.map((m: any) => m.name) ?? [])
      : [];
    return {
      ok: true,
      ollama: { reachable: r.ok, models },
      model: OLLAMA_MODEL,
    };
  } catch {
    return {
      ok: true,
      ollama: { reachable: false, models: [] },
      model: OLLAMA_MODEL,
    };
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

type Diagnostic = { type: "warning" | "error"; message: string };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public diagnostics?: Diagnostic[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const diagnosticsFromZod = (error: z.ZodError): Diagnostic[] =>
  error.issues.map((issue: z.ZodIssue) => ({
    type: "error" as const,
    message: `${issue.path.join(".") || "body"}: ${issue.message}`,
  }));

const sendError = (
  reply: any,
  status: number,
  code: string,
  message: string,
  diagnostics?: Diagnostic[],
) =>
  reply.code(status).send({ code, message, diagnostics });

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
type LegacyBody = {
  componentCode: string; // required
  testStyle?: "minimal" | "comprehensive";
  stream?: boolean; // default false
};

// ---------- Protected (JWT) legacy endpoint (kept) ----------
fastify.post<{ Body: LegacyBody }>(
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

    const prompt = buildLegacyPrompt(componentCode, testStyle);

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
      for await (const chunk of r.body as any) {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            if (j.response) {
              reply.raw.write(cleanChunk(j.response));
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
      return reply.send({ success: true, testCode: cleaned });
    }
  },
);

// ---------- New v1 endpoints for the VS Code extension ----------

// Generate tests (unified shape)
fastify.post(
  "/v1/generate",
  { preHandler: apiKeyGuard },
  async (request, reply) => {
    const parsed = GenerateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "Request body failed validation",
        diagnosticsFromZod(parsed.error),
      );
    }
    try {
      const result = await runGeneration(parsed.data);
      return reply.send(result);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(reply, error.status, error.code, error.message, error.diagnostics);
      }
      request.log.error({ err: error }, "Unhandled /v1/generate error");
      return sendError(reply, 500, "internal_error", "Generation failed");
    }
  },
);

fastify.post(
  "/v1/generate/selection",
  { preHandler: apiKeyGuard },
  async (request, reply) => {
    const parsed = GenerateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "Request body failed validation",
        diagnosticsFromZod(parsed.error),
      );
    }
    if (!parsed.data.selection) {
      return sendError(
        reply,
        400,
        "missing_selection",
        "Selection payload required for this endpoint.",
      );
    }
    try {
      const result = await runGeneration(parsed.data);
      return reply.send(result);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(reply, error.status, error.code, error.message, error.diagnostics);
      }
      request.log.error({ err: error }, "Unhandled /v1/generate/selection error");
      return sendError(reply, 500, "internal_error", "Generation failed");
    }
  },
);

fastify.post(
  "/v1/chat",
  { preHandler: apiKeyGuard },
  async (request, reply) => {
    const parsed = ChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "Chat payload failed validation",
        diagnosticsFromZod(parsed.error),
      );
    }
    try {
      const result = await runChat(parsed.data);
      return reply.send(result);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(reply, error.status, error.code, error.message, error.diagnostics);
      }
      request.log.error({ err: error }, "Unhandled /v1/chat error");
      return sendError(reply, 500, "internal_error", "Chat request failed");
    }
  },
);

// Review existing test and suggest diffs
fastify.post(
  "/v1/review",
  { preHandler: apiKeyGuard },
  async (request, reply) => {
    const body = request.body as {
      content?: string;
      policy?: any;
      model?: string;
    };
    const {
      content,
      policy = { preferGetByRole: true, preferUserEvent: true },
      model,
    } = body || {};
    if (!content)
      return reply.code(400).send({ error: "missing 'content' (test file)" });

    const prompt = [
      "You are an expert React Testing Library reviewer.",
      `Policy: ${JSON.stringify(policy)}`,
      "Test file:",
      "```tsx",
      content,
      "```",
      "---",
      "Return concise, actionable diffs and a brief reason for each.",
    ].join("\n");

    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || OLLAMA_MODEL,
        prompt,
        stream: false,
        keep_alive: "0",
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_ctx: 3072,
          num_predict: 800,
        },
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return reply
        .code(502)
        .send({ error: `Ollama error ${r.status}: ${text}` });
    }

    const data = (await r.json()) as { response: string };
    return reply.send({ suggestions: data.response });
  },
);

// ---------- Prompt builders & helpers ----------

async function runGeneration(input: GenerateInput) {
  const prompt = composeGeneratePrompt(input);
  const completion = await callOllamaGenerate({
    prompt,
    model: input.model,
    temperature: 0.18,
    topP: 0.92,
    numPredict: 1400,
    timeoutMs: input.timeoutMs,
  });

  const parsed = parseModelOutput(completion.response);
  const tests = parsed.tests.trim();
  if (!tests) {
    throw new HttpError(422, "Model returned empty test file", "empty_output", [
      ...parsed.diagnostics,
      { type: "error", message: "Model response did not contain a tsx code block" },
    ]);
  }

  const normalized = normalizeModelMetadata(parsed.metadata);
  const heuristics = heuristicsWarnings(tests, {
    stylePreset: input.stylePreset,
    strictA11y: input.strictA11y,
    useUserEvent: input.useUserEvent,
  });

  const metadata = buildResponseMetadata({
    base: input,
    completion,
    normalized,
    diagnostics: [...parsed.diagnostics, ...normalized.diagnostics],
    extraWarnings: heuristics,
  });

  return { tests, metadata };
}

async function runChat(input: ChatInput) {
  const prompt = composeChatPrompt(input);
  const completion = await callOllamaGenerate({
    prompt,
    model: input.model,
    temperature: 0.2,
    topP: 0.9,
    numPredict: 1500,
    timeoutMs: input.runtime?.timeoutMs,
  });

  const parsed = parseModelOutput(completion.response);
  const normalized = normalizeModelMetadata(parsed.metadata);
  const stylePreset = input.stylePreset ?? "strict-a11y";
  const strictA11y = input.runtime?.strictA11y ?? true;
  const useUserEvent = input.runtime?.useUserEvent ?? true;
  const warnings = heuristicsWarnings(parsed.tests, {
    stylePreset,
    strictA11y,
    useUserEvent,
  });

  const metadata = buildResponseMetadata({
    base: {
      filePath: input.filePath,
      stylePreset,
      strictA11y,
      useUserEvent,
    },
    completion,
    normalized,
    diagnostics: [...parsed.diagnostics, ...normalized.diagnostics],
    extraWarnings: warnings,
  });

  const assistantMetadata = {
    tests: parsed.tests,
    modelMetadata: normalized.original,
  };

  const assistantContent = composeAssistantContent(parsed.tests, metadata);
  const assistantMessage = {
    role: "assistant" as const,
    content: assistantContent,
    metadata: assistantMetadata,
  };

  const conversationId = crypto.randomUUID();
  return {
    messages: [...input.messages, assistantMessage],
    lastMessage: assistantMessage,
    metadata: {
      ...metadata,
      conversationId,
    },
  };
}

function composeGeneratePrompt(input: GenerateInput) {
  const style = input.stylePreset;
  const contextLines = [] as string[];
  if (input.filePath) contextLines.push(`FILE_PATH: ${input.filePath}`);
  if (input.selection) {
    const label = selectionRangeLabel(input.selection);
    contextLines.push(
      `TARGET_SELECTION ${label}:\n\n\`\`\`tsx\n${input.selection.text}\n\`\`\``,
    );
  }
  contextLines.push(`FULL_COMPONENT_SOURCE:\n\n\`\`\`tsx\n${input.source}\n\`\`\``);
  if (input.imports?.length) {
    contextLines.push(`EXISTING_IMPORTS:\n${formatImports(input.imports)}`);
  }
  if (input.metadata) {
    contextLines.push(`ADDITIONAL_METADATA: ${JSON.stringify(input.metadata)}`);
  }

  const guidance = styleGuidelines(style, input.strictA11y, input.useUserEvent);
  const override = input.promptOverride?.trim();

  return [
    "You are RTL-GEN, a senior engineer generating deterministic React Testing Library tests in TypeScript.",
    `STYLE_PRESET=${style}`,
    `STRICT_A11Y=${input.strictA11y}`,
    `USE_USER_EVENT=${input.useUserEvent}`,
    `INTENT=${input.intent}`,
    guidance.map((rule) => `- ${rule}`).join("\n"),
    "Response contract:",
    "1. Output a fenced ```tsx code block containing the complete, import-ready test file.",
    "2. Immediately after, output a fenced ```json block containing metadata with keys warnings (string[]), diagnostics (array of {type,message}), suggestedPath (string).",
    override ? `Additional directives: ${override}` : undefined,
    contextLines.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function composeChatPrompt(input: ChatInput) {
  const runtime = input.runtime ?? {};
  const style = input.stylePreset ?? "strict-a11y";
  const strict = runtime.strictA11y ?? true;
  const useUserEvent = runtime.useUserEvent ?? true;
  const guidance = styleGuidelines(style, strict, useUserEvent);

  const contextParts: string[] = [];
  if (input.filePath) contextParts.push(`FILE_PATH: ${input.filePath}`);
  if (input.selection) {
    const label = selectionRangeLabel(input.selection);
    contextParts.push(
      `TARGET_SELECTION ${label}:\n\n\`\`\`tsx\n${input.selection.text}\n\`\`\``,
    );
  }
  if (input.source) {
    contextParts.push(`COMPONENT_SOURCE:\n\n\`\`\`tsx\n${input.source}\n\`\`\``);
  }
  if (runtime.imports?.length) {
    contextParts.push(`IMPORT_HINTS:\n${formatImports(runtime.imports)}`);
  }

  const history = input.messages
    .map((msg: ChatInput["messages"][number]) => `[${msg.role.toUpperCase()}]\n${msg.content}`)
    .join("\n\n");

  return [
    "You are RTL Test Assistant, a collaborative LLM that edits and generates React Testing Library tests.",
    `STYLE_PRESET=${style}`,
    `STRICT_A11Y=${strict}`,
    `USE_USER_EVENT=${useUserEvent}`,
    runtime.applyToWorkspace ? "APPLY_TO_WORKSPACE=true" : "APPLY_TO_WORKSPACE=false",
    guidance.map((rule) => `- ${rule}`).join("\n"),
    "Always follow the same output contract as generation requests (tsx block + json metadata block).",
    "Conversation so far:",
    history,
    contextParts.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function callOllamaGenerate(options: {
  prompt: string;
  model?: string;
  temperature?: number;
  topP?: number;
  numPredict?: number;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 60000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model || OLLAMA_MODEL,
        prompt: options.prompt,
        stream: false,
        keep_alive: "0",
        options: {
          temperature: options.temperature ?? 0.2,
          top_p: options.topP ?? 0.9,
          repeat_penalty: 1.05,
          num_ctx: 4096,
          num_predict: options.numPredict ?? 1400,
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HttpError(502, `Ollama error ${response.status}`, "ollama_error", [
        { type: "error", message: text || "Ollama returned non-200 response" },
      ]);
    }
    const json = (await response.json()) as {
      response: string;
      model?: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };
    return json;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "Ollama request timed out", "ollama_timeout");
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, "Failed to call Ollama", "ollama_failure", [
      { type: "error", message: error?.message ?? "Unknown error" },
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parseModelOutput(raw: string) {
  const fence = /```([\w-]*)\s*\n([\s\S]*?)```/g;
  const matches = [...raw.matchAll(fence)];
  let testBlock: string | undefined;
  let metadataBlock: string | undefined;
  for (const match of matches) {
    const lang = (match[1] || "").toLowerCase();
    if (!testBlock && (lang.includes("tsx") || lang.includes("typescript") || lang === "ts")) {
      testBlock = match[2];
    }
  }
  for (const match of matches) {
    const lang = (match[1] || "").toLowerCase();
    if (!metadataBlock && lang.includes("json")) {
      metadataBlock = match[2];
    }
  }

  let testsSource = testBlock ?? raw;
  if (!testBlock && metadataBlock) {
    testsSource = testsSource.replace(metadataBlock, "");
  }

  const diagnostics: Diagnostic[] = [];
  let metadata: Record<string, unknown> | undefined;
  if (metadataBlock) {
    try {
      metadata = JSON.parse(metadataBlock);
    } catch (error: any) {
      diagnostics.push({
        type: "warning",
        message: `Metadata JSON parse failed: ${error?.message ?? "unknown"}`,
      });
    }
  } else {
    diagnostics.push({
      type: "warning",
      message: "Metadata block missing from model response",
    });
  }

  return {
    tests: cleanCode(testsSource),
    metadata,
    diagnostics,
  };
}

function normalizeModelMetadata(value: unknown) {
  const warnings: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let suggestedPath: string | undefined;
  const original = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
  if (original) {
    if (Array.isArray(original.warnings)) {
      for (const entry of original.warnings) {
        if (typeof entry === "string") warnings.push(entry);
      }
    }
    if (Array.isArray(original.diagnostics)) {
      for (const entry of original.diagnostics) {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as any).type &&
          (entry as any).message &&
          (entry as any).type !== ""
        ) {
          diagnostics.push({
            type: ((entry as any).type === "error" ? "error" : "warning") as Diagnostic["type"],
            message: String((entry as any).message),
          });
        }
      }
    }
    if (typeof original.suggestedPath === "string") {
      suggestedPath = original.suggestedPath;
    }
  }
  return { warnings, diagnostics, suggestedPath, original };
}

function heuristicsWarnings(
  tests: string,
  options: { stylePreset: z.infer<typeof StylePresetSchema>; strictA11y: boolean; useUserEvent: boolean },
) {
  const warnings: string[] = [];
  if (options.useUserEvent && /fireEvent\./.test(tests)) {
    warnings.push("Tests use fireEvent even though userEvent is preferred.");
  }
  if (options.strictA11y && /getByTestId/.test(tests)) {
    warnings.push("Avoid getByTestId when strict accessibility mode is enabled.");
  }
  if (options.stylePreset === "legacy" && !/getByTestId/.test(tests) && /data-testid/.test(tests)) {
    warnings.push("Ensure data-testid selectors are necessary in legacy mode.");
  }
  return warnings;
}

function buildResponseMetadata({
  base,
  completion,
  normalized,
  diagnostics,
  extraWarnings,
}: {
  base: { filePath?: string; stylePreset: z.infer<typeof StylePresetSchema>; strictA11y: boolean; useUserEvent: boolean };
  completion: { model?: string; eval_count?: number; prompt_eval_count?: number };
  normalized: ReturnType<typeof normalizeModelMetadata>;
  diagnostics: Diagnostic[];
  extraWarnings: string[];
}) {
  const warnings = [...normalized.warnings, ...extraWarnings];
  const dedupedWarnings = Array.from(new Set(warnings));
  const dedupedDiagnostics = collapseDiagnostics(diagnostics);

  return {
    warnings: dedupedWarnings.length ? dedupedWarnings : undefined,
    diagnostics: dedupedDiagnostics.length ? dedupedDiagnostics : undefined,
    suggestedPath: normalized.suggestedPath ?? suggestTestPath(base.filePath),
    model: completion.model || OLLAMA_MODEL,
    promptTokens: completion.prompt_eval_count,
    completionTokens: completion.eval_count,
    stylePreset: base.stylePreset,
    strictA11y: base.strictA11y,
    useUserEvent: base.useUserEvent,
  };
}

function collapseDiagnostics(items: Diagnostic[]) {
  const map = new Map<string, Diagnostic>();
  for (const item of items) {
    const key = `${item.type}:${item.message}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function styleGuidelines(
  preset: z.infer<typeof StylePresetSchema>,
  strictA11y: boolean,
  useUserEvent: boolean,
) {
  const lines = [
    "Write complete Jest test files with describe/test blocks and clear names.",
    "Import { render, screen } from '@testing-library/react' and userEvent from '@testing-library/user-event'.",
    "Include edge cases: loading, error, disabled states, async flows, and prop variations.",
    "Minimize mocks; prefer realistic user flows.",
  ];
  if (strictA11y) {
    lines.push("Prefer getByRole/findByRole with accessible name checks; avoid getByTestId unless unavoidable.");
  }
  if (preset === "balanced") {
    lines.push("If accessible roles are unavailable, fall back to getByTestId sparingly.");
  }
  if (preset === "legacy") {
    lines.push("Data-testid selectors are permitted, but still prefer role queries when available.");
  }
  if (useUserEvent) {
    lines.push("Use userEvent for interactions and assert via screen queries.");
  } else {
    lines.push("userEvent is optional; you may use fireEvent when appropriate.");
  }
  lines.push("Do not generate TODOs or commentary outside the code block.");
  lines.push("Ensure output is deterministic; do not introduce randomness or placeholders.");
  return lines;
}

function formatImports(imports: string[] = []) {
  return imports.join("\n");
}

function composeAssistantContent(
  tests: string,
  metadata: Record<string, unknown>,
) {
  const meta = JSON.stringify(metadata, null, 2);
  return ["```tsx", tests, "```", "```json", meta, "```"].join("\n");
}

function selectionRangeLabel(selection: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}) {
  return `${selection.start.line + 1}:${selection.start.character}-${selection.end.line + 1}:${selection.end.character}`;
}

function buildLegacyPrompt(componentCode: string, style: string) {
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
  let trimmed = output.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```[a-zA-Z-]*\s*\n/, "");
  }
  if (trimmed.endsWith("```")) {
    trimmed = trimmed.replace(/```\s*$/, "");
  }
  return trimmed.trim();
}

// streaming variant (legacy endpoint)
function cleanChunk(chunk: string): string {
  return chunk.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "");
}

function suggestTestPath(filePath?: string) {
  if (!filePath) return "__tests__/Component.test.tsx";
  const normalized = filePath.replace(/\\/g, "/");
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);
  if (normalized.includes("/src/")) {
    const [head] = normalized.split("/src/");
    return `${head}/src/__tests__/${base}.test.tsx`;
  }
  const dir = path.dirname(normalized);
  return `${dir}/__tests__/${base}.test.tsx`;
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
