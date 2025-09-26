// services/backend-api/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deep-seek-rtl-gen";
const PORT = Number(process.env.PORT ?? 7070);

const fastify = Fastify({ logger: false });

await fastify.register(cors, {
  origin: true,
  allowedHeaders: ["Content-Type"],
});

// health
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

type Body = {
  componentCode: string; // required
  testStyle?: "minimal" | "comprehensive";
  stream?: boolean; // default false
};

// main endpoint
fastify.post<{ Body: Body }>("/api/generate-tests", async (request, reply) => {
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
    // pass-through streaming to client and mirror to server console
    reply.raw.setHeader("Content-Type", "text/plain; charset=utf-8");
    reply.raw.setHeader("Transfer-Encoding", "chunked");
    let acc = "";
    for await (const chunk of r.body as any) {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          if (j.response) {
            acc += j.response;
            process.stdout.write(j.response); // console
            reply.raw.write(j.response); // client
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
    // also log a snippet to console
    const cleaned = cleanCode(data.response);
    console.log("[GEN]", cleaned.slice(0, 200));
    return reply.send({ success: true, testCode: cleaned });
  }
});

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
    .replace(/^\s*```[a-z]*\s*/i, "") // remove opening ```
    .replace(/```$/, "") // remove closing ```
    .trim();
}

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
