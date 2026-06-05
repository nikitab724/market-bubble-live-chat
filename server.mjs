import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionCookieName,
  hashPassword,
  parseCookies,
  verifyPassword,
} from "./src/admin-auth.mjs";
import { DEFAULT_SOURCES, normalizeSources, toPublicConfig } from "./src/source-config.mjs";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(ROOT_DIR, "data", "sources.json");
const DEFAULT_PORT = 4178;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const PUBLIC_ASSETS = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/chat", "chat/index.html"],
  ["/chat/", "chat/index.html"],
  ["/chat/index.html", "chat/index.html"],
  ["/admin", "admin/index.html"],
  ["/admin/", "admin/index.html"],
  ["/admin/index.html", "admin/index.html"],
  ["/admin/admin.mjs", "admin/admin.mjs"],
  ["/styles.css", "styles.css"],
  ["/src/app.mjs", "src/app.mjs"],
  ["/src/chat-model.mjs", "src/chat-model.mjs"],
  ["/src/twitch-connector.mjs", "src/twitch-connector.mjs"],
]);

export function createAppServer(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const adminPasswordHash = options.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || "";
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";
  const sessions = new Map();

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");

      if (url.pathname === "/api/public-config" && request.method === "GET") {
        return sendJson(response, 200, toPublicConfig(await readSources(configPath)));
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (!adminPasswordHash) {
          return sendJson(response, 503, { error: "ADMIN_PASSWORD_HASH is required" });
        }

        const body = await readJsonBody(request);
        const valid = await verifyPassword(body.password || "", adminPasswordHash);
        if (!valid) {
          return sendJson(response, 401, { error: "Invalid password" });
        }

        const token = createSessionToken();
        sessions.set(token, Date.now() + SESSION_TTL_MS);
        response.writeHead(204, {
          "Set-Cookie": buildSessionCookie(token, {
            maxAgeSeconds: SESSION_TTL_MS / 1000,
            secure: secureCookies,
          }),
        });
        return response.end();
      }

      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        const token = getSessionToken(request, secureCookies);
        if (token) sessions.delete(token);

        response.writeHead(204, {
          "Set-Cookie": buildExpiredSessionCookie({ secure: secureCookies }),
        });
        return response.end();
      }

      if (url.pathname === "/api/admin/sources") {
        if (!isAuthenticated(request, sessions, secureCookies)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        if (request.method === "GET") {
          return sendJson(response, 200, { sources: await readSources(configPath) });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const sources = normalizeSources(body.sources || []);
          await writeSources(configPath, sources);
          return sendJson(response, 200, { sources });
        }
      }

      if (request.method !== "GET") {
        return sendJson(response, 405, { error: "Method not allowed" });
      }

      return serveStatic(rootDir, url.pathname, response);
    } catch (error) {
      return sendJson(response, 500, { error: error.message || "Server error" });
    }
  });
}

export async function readSources(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    return normalizeSources(parsed.sources || []);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeSources(configPath, DEFAULT_SOURCES);
      return DEFAULT_SOURCES;
    }

    throw error;
  }
}

export async function writeSources(configPath, sources) {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(`${configPath}.tmp`, `${JSON.stringify({ sources }, null, 2)}\n`);
  await rename(`${configPath}.tmp`, configPath);
}

function isAuthenticated(request, sessions, secureCookies) {
  const token = getSessionToken(request, secureCookies);
  if (!token) return false;

  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }

  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function getSessionToken(request, secureCookies) {
  return parseCookies(request.headers.cookie || "")[getSessionCookieName({ secure: secureCookies })];
}

async function readJsonBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;
  }

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function serveStatic(rootDir, pathname, response) {
  const filePath = resolveStaticPath(rootDir, pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
    });
    return response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }

    throw error;
  }
}

function resolveStaticPath(rootDir, pathname) {
  const routePath = decodeURIComponent(pathname);
  const relativePath = PUBLIC_ASSETS.get(routePath);
  if (!relativePath) {
    return null;
  }

  const filePath = normalize(join(rootDir, relativePath));

  if (relative(rootDir, filePath).startsWith("..")) {
    return null;
  }

  return filePath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--hash-password") {
    const password = process.argv[3];
    if (!password) {
      console.error("Usage: node server.mjs --hash-password <password>");
      process.exit(1);
    }

    console.log(await hashPassword(password));
    process.exit(0);
  }

  const port = Number(process.env.PORT || DEFAULT_PORT);
  createAppServer().listen(port, () => {
    console.log(`Market Bubble server listening on http://localhost:${port}`);
  });
}
