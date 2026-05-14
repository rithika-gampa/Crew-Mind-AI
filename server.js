const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

loadDotEnv();

const PRIMARY_PROVIDER = String(process.env.PRIMARY_PROVIDER || "xai").trim().toLowerCase();
const BACKUP_PROVIDERS = String(process.env.BACKUP_PROVIDERS || "groq,gemini")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.20-reasoning";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const formatRules = {
  "Single Line": "Return exactly one short sentence. No heading, markdown, bullet, or extra line breaks.",
  "Short Paragraph": "Return one compact paragraph in 3 to 4 lines maximum with no heading.",
  Article: "Return a structured article with a title and clear sections.",
  "Video Script": "Return exactly three sections labeled Intro:, Body:, and Outro:.",
};

const providerConfig = {
  xai: {
    label: "Grok",
    key: () => XAI_API_KEY,
    model: () => XAI_MODEL,
  },
  groq: {
    label: "Groq",
    key: () => GROQ_API_KEY,
    model: () => GROQ_MODEL,
  },
  gemini: {
    label: "Gemini",
    key: () => GEMINI_API_KEY,
    model: () => GEMINI_MODEL,
  },
};

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fsSync.existsSync(envPath)) return;

  const source = fsSync.readFileSync(envPath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendSSE(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function availableProviders() {
  const configured = [PRIMARY_PROVIDER, ...BACKUP_PROVIDERS];
  const uniqueProviders = [];

  for (const provider of configured) {
    if (!providerConfig[provider]) continue;
    if (!providerConfig[provider].key()) continue;
    if (uniqueProviders.includes(provider)) continue;
    uniqueProviders.push(provider);
  }

  return uniqueProviders;
}

function providerLabel(provider) {
  return providerConfig[provider]?.label || provider;
}

function providerModel(provider) {
  return providerConfig[provider]?.model() || "unknown";
}

function isOpenAiCompatProvider(provider) {
  return provider === "xai" || provider === "groq";
}

function normalizedError(provider, responseText, statusCode) {
  return new Error(`${providerLabel(provider)} request failed with ${statusCode}: ${responseText}`);
}

async function xaiMessage({ system, prompt, maxTokens = 600, stream = false }) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    throw normalizedError("xai", await response.text(), response.status);
  }

  return response;
}

async function groqMessage({ system, prompt, maxTokens = 600, stream = false }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    throw normalizedError("groq", await response.text(), response.status);
  }

  return response;
}

async function geminiMessage({ system, prompt, maxTokens = 600, stream = false }) {
  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    throw normalizedError("gemini", await response.text(), response.status);
  }

  return response;
}

async function providerRequest(provider, options) {
  if (provider === "xai") return xaiMessage(options);
  if (provider === "groq") return groqMessage(options);
  return geminiMessage(options);
}

function extractOpenAiCompatText(payload) {
  return (payload.choices || [])
    .map((choice) => {
      const content = choice?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((item) => item?.type === "text")
          .map((item) => item.text || "")
          .join("");
      }
      return "";
    })
    .join("")
    .trim();
}

function extractGeminiText(payload) {
  return (payload.candidates || [])
    .map((candidate) =>
      (candidate?.content?.parts || [])
        .map((part) => part?.text || "")
        .join(""),
    )
    .join("")
    .trim();
}

async function readJsonTextWithFallback(options, hooks = {}) {
  const providers = availableProviders();
  if (!providers.length) {
    throw new Error("Missing provider keys. Configure XAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY.");
  }

  let lastError = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      const response = await providerRequest(provider, { ...options, stream: false });
      const payload = await response.json();
      hooks.onProvider?.(provider, index > 0);
      return isOpenAiCompatProvider(provider) ? extractOpenAiCompatText(payload) : extractGeminiText(payload);
    } catch (error) {
      lastError = error;
      hooks.onFallback?.(provider, error, index + 1 < providers.length ? providers[index + 1] : null);
    }
  }

  throw lastError;
}

async function streamProviderToAnthropicShape(provider, options, response) {
  const upstream = await providerRequest(provider, { ...options, stream: true });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let eventName = "message";
  let dataLines = [];

  const emitChunk = (chunk) => {
    if (!chunk) return;
    fullText += chunk;
    response.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text: chunk } })}\n\n`);
  };

  const flushOpenAiCompatEvent = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    dataLines = [];
    if (raw === "[DONE]") return;
    const payload = JSON.parse(raw);
    const chunk = payload?.choices?.[0]?.delta?.content || "";
    emitChunk(chunk);
  };

  const flushGeminiEvent = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    dataLines = [];
    const payload = JSON.parse(raw);
    const chunk = extractGeminiText(payload);
    emitChunk(chunk);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        if (isOpenAiCompatProvider(provider)) {
          flushOpenAiCompatEvent();
        } else {
          flushGeminiEvent();
        }
        eventName = "message";
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        const valueLine = line.slice(5).trim();
        if (provider === "gemini" || eventName === "message") {
          dataLines.push(valueLine);
        } else {
          dataLines.push(valueLine);
        }
      }
    }
  }

  if (dataLines.length) {
    if (isOpenAiCompatProvider(provider)) {
      flushOpenAiCompatEvent();
    } else {
      flushGeminiEvent();
    }
  }

  response.write("data: [DONE]\n\n");
  return fullText.trim();
}

async function streamTextWithFallback(options, onChunk, hooks = {}) {
  const providers = availableProviders();
  if (!providers.length) {
    throw new Error("Missing provider keys. Configure XAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY.");
  }

  let lastError = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      hooks.onProvider?.(provider, index > 0);
      const upstream = await providerRequest(provider, { ...options, stream: true });
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let dataLines = [];

      const flush = () => {
        if (!dataLines.length) return;
        const raw = dataLines.join("\n");
        dataLines = [];
        if (raw === "[DONE]") return;
        const payload = JSON.parse(raw);
        let chunk = "";

        if (isOpenAiCompatProvider(provider)) {
          chunk = payload?.choices?.[0]?.delta?.content || "";
        } else {
          chunk = extractGeminiText(payload);
        }

        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            flush();
            continue;
          }

          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
      }

      flush();
      return fullText.trim();
    } catch (error) {
      lastError = error;
      hooks.onFallback?.(provider, error, index + 1 < providers.length ? providers[index + 1] : null);
    }
  }

  throw lastError;
}

function countSentences(content) {
  const matches = content.match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : content.trim() ? 1 : 0;
}

function validateOutput(content, format) {
  const trimmed = content.trim();
  if (!trimmed) return false;

  if (format === "Single Line") {
    return !/\n/.test(trimmed) && countSentences(trimmed) <= 1 && trimmed.length <= 170;
  }

  if (format === "Short Paragraph") {
    const lines = trimmed.split(/\n/).filter(Boolean);
    return lines.length <= 4 && !trimmed.startsWith("#");
  }

  if (format === "Video Script") {
    return /Intro:/i.test(trimmed) && /Body:/i.test(trimmed) && /Outro:/i.test(trimmed);
  }

  return trimmed.length > 120;
}

function enforceOutput(content, format) {
  const trimmed = content.trim();

  if (format === "Single Line") {
    const firstLine = (trimmed.split(/\n/).find(Boolean) || "").replace(/^[-#*\s]+/, "").trim();
    const firstSentence = firstLine.match(/[^.!?]+[.!?]/);
    return (firstSentence ? firstSentence[0] : firstLine).trim();
  }

  if (format === "Short Paragraph") {
    return trimmed
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join("\n");
  }

  if (format === "Video Script" && !validateOutput(trimmed, format)) {
    return `Intro:\nThis piece introduces the topic clearly.\n\nBody:\n${trimmed}\n\nOutro:\nThat is the key takeaway.`;
  }

  return trimmed;
}

function buildSystemPrompt(agentName, topic, format) {
  return [
    `You are the ${agentName} in a five-agent AI research and content creation system.`,
    `The exact user topic is: ${topic}`,
    `The requested final format is: ${format}`,
    `Always stay focused on the exact topic: ${topic}`,
  ].join("\n");
}

async function runAgent(agentName, prompt, topic, format, maxTokens = 600, hooks = {}) {
  return readJsonTextWithFallback(
    {
      system: buildSystemPrompt(agentName, topic, format),
      prompt,
      maxTokens,
    },
    hooks,
  );
}

async function proxyClaudeStream(request, response) {
  try {
    const body = JSON.parse((await readRequestBody(request)) || "{}");
    const system = String(body.system || "").trim();
    const user = String(body.user || "").trim();
    const maxTokens = Number(body.max_tokens || 1200);

    if (!user) {
      sendJson(response, 400, { error: "User prompt is required." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const providers = availableProviders();
    if (!providers.length) {
      response.write(`data: ${JSON.stringify({ type: "error", message: "Missing provider keys. Configure XAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY." })}\n\n`);
      response.end();
      return;
    }

    let lastError = null;

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      try {
        await streamProviderToAnthropicShape(
          provider,
          { system, prompt: user, maxTokens },
          response,
        );
        response.end();
        return;
      } catch (error) {
        lastError = error;
        const nextProvider = index + 1 < providers.length ? providers[index + 1] : null;
        if (nextProvider) {
          response.write(`event: provider_fallback\n`);
          response.write(`data: ${JSON.stringify({
            from: providerLabel(provider),
            to: providerLabel(nextProvider),
            message: `${providerLabel(provider)} failed, so the app switched to ${providerLabel(nextProvider)} backup.`,
            reason: error.message,
          })}\n\n`);
        }
      }
    }

    throw lastError;
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Provider proxy failed." });
  }
}

async function handleResearchRequest(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const log = (agent, message) => sendSSE(response, "log", { agent, message });
  const agent = (name, state) => sendSSE(response, "agent", { agent: name, state });
  const status = (message) => sendSSE(response, "status", { message });
  const providerHooks = {
    onProvider(provider, isFallback) {
      if (isFallback) {
        log("system", `Primary provider unavailable. Switched to ${providerLabel(provider)} backup.`);
      }
    },
    onFallback(provider, error, nextProvider) {
      if (nextProvider) {
        log("system", `${providerLabel(provider)} failed. Trying ${providerLabel(nextProvider)} backup.`);
        console.warn(`[Provider fallback] ${providerLabel(provider)} -> ${providerLabel(nextProvider)} | ${error.message}`);
      }
    },
  };

  try {
    const body = JSON.parse((await readRequestBody(request)) || "{}");
    const topic = String(body.topic || "").trim();
    const format = String(body.format || "Single Line").trim();

    if (!topic) {
      sendSSE(response, "error", { message: "Topic is required." });
      response.end();
      return;
    }

    status(`Planning the crew for "${topic}"...`);

    agent("manager", "active");
    log("manager", `Planning research strategy for "${topic}"`);
    const managerPlan = await runAgent(
      "Manager Agent",
      [
        `Create a concise plan for researching "${topic}" and producing a final ${format} output.`,
        `Format rule: ${formatRules[format] || formatRules["Single Line"]}`,
        "Return 4 short bullets only.",
      ].join("\n"),
      topic,
      format,
      240,
      providerHooks,
    );
    agent("manager", "done");

    agent("monitor", "active");
    log("monitor", `Gathering facts and core context for "${topic}"`);
    const scoutNotes = await runAgent(
      "Scout Agent",
      [
        managerPlan,
        `Collect factual base information for "${topic}".`,
        "Return a concise findings list with definition, key facts, names, stats if relevant, and why it matters.",
      ].join("\n\n"),
      topic,
      format,
      480,
      providerHooks,
    );
    agent("monitor", "done");

    agent("researcher", "active");
    log("researcher", `Deep-diving into mechanisms and implications for "${topic}"`);
    const researchNotes = await runAgent(
      "Research Agent",
      [
        `Manager plan:\n${managerPlan}`,
        `Scout findings:\n${scoutNotes}`,
        `Expand the findings for "${topic}" with mechanisms, implications, and context.`,
        "Return structured research notes only.",
      ].join("\n\n"),
      topic,
      format,
      700,
      providerHooks,
    );
    agent("researcher", "done");

    agent("summarizer", "active");
    log("summarizer", `Distilling research into a tight brief for "${topic}"`);
    const synthesisBrief = await runAgent(
      "Synthesizer Agent",
      [
        `Research notes:\n${researchNotes}`,
        `Create a content brief for a writer covering "${topic}".`,
        `The final format is ${format}.`,
        `Format rule: ${formatRules[format] || formatRules["Single Line"]}`,
        "Return a compact brief with main message, must-include points, tone, and risks to avoid.",
      ].join("\n\n"),
      topic,
      format,
      420,
      providerHooks,
    );
    agent("summarizer", "done");

    agent("writer", "active");
    log("writer", `Writing the final ${format} output for "${topic}"`);
    status(`Streaming output for "${topic}"...`);

    let writerOutput = await streamTextWithFallback(
      {
        system: buildSystemPrompt("Writer Agent", topic, format),
        prompt: [
          `Topic: ${topic}`,
          `Requested format: ${format}`,
          `Strict rule: ${formatRules[format] || formatRules["Single Line"]}`,
          `Content brief:\n${synthesisBrief}`,
          "Generate the final user-facing content now.",
          "Do not mention the agents, workflow, prompts, or internal steps.",
          "Adapt length to topic complexity while obeying the requested format.",
        ].join("\n\n"),
        maxTokens: format === "Single Line" ? 100 : format === "Short Paragraph" ? 220 : 1200,
      },
      (chunk) => sendSSE(response, "content", { chunk }),
      providerHooks,
    );

    agent("writer", "done");

    if (!validateOutput(writerOutput, format)) {
      log("manager", "Output needed correction to match the requested format.");
      agent("manager", "active");
      writerOutput = enforceOutput(writerOutput, format);
      sendSSE(response, "replace_output", { content: writerOutput });
      agent("manager", "done");
    }

    log("manager", `Crew completed output for "${topic}"`);
    status("Output ready.");
    sendSSE(response, "done", { topic, format });
    response.end();
  } catch (error) {
    sendSSE(response, "error", { message: error.message || "Unexpected server error." });
    response.end();
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/claude-stream") {
    await proxyClaudeStream(request, response);
    return;
  }

  if (request.method === "POST" && request.url === "/api/research") {
    await handleResearchRequest(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => {
  const configuredProviders = availableProviders();
  console.log(`CrewMindAI running at http://localhost:${PORT}`);
  console.log(
    `Provider chain: ${
      configuredProviders.length
        ? configuredProviders.map((provider) => `${providerLabel(provider)} (${providerModel(provider)})`).join(" -> ")
        : "not configured"
    }`,
  );
  console.log(`Primary preference: ${providerLabel(PRIMARY_PROVIDER)} (${PRIMARY_PROVIDER})`);
  console.log(
    `Backup preferences: ${
      BACKUP_PROVIDERS.length ? BACKUP_PROVIDERS.map((provider) => `${providerLabel(provider)} (${provider})`).join(" -> ") : "none"
    }`,
  );
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. CrewMindAI is likely already running at http://localhost:${PORT}`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
