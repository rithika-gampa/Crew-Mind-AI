const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  handleClaudeStreamRequest,
  handleResearchRequest,
  loadDotEnv,
  providerSummary,
  sendJson,
} = require("./lib/backend");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

loadDotEnv(ROOT);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

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
    await handleClaudeStreamRequest(request, response);
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
  const summary = providerSummary();
  console.log(`CrewMindAI running at http://localhost:${PORT}`);
  console.log(`Provider chain: ${summary.chainText}`);
  console.log(`Primary preference: ${summary.primaryText}`);
  console.log(`Backup preferences: ${summary.backupText}`);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. CrewMindAI is likely already running at http://localhost:${PORT}`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
