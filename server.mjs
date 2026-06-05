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
import { createChatEventHub } from "./src/chat-events.mjs";
import { createKickApiClient } from "./src/kick-api.mjs";
import {
  isKickChatEvent,
  normalizeKickChatWebhook,
  verifyKickWebhookSignature,
} from "./src/kick-webhook.mjs";
import { DEFAULT_SOURCES, normalizeSources, toPublicConfig } from "./src/source-config.mjs";
import { createTwitchApiClient } from "./src/twitch-api.mjs";
import { createTwitchEmoteClient } from "./src/twitch-emotes.mjs";

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
  ["/src/emote-renderer.mjs", "src/emote-renderer.mjs"],
  ["/src/twitch-connector.mjs", "src/twitch-connector.mjs"],
]);

export function createAppServer(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const adminPasswordHash = options.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || "";
  const chatHub = options.chatHub || createChatEventHub();
  const enableDevRoutes = options.enableDevRoutes ?? process.env.NODE_ENV !== "production";
  const kickWebhookVerifier = options.kickWebhookVerifier || verifyKickWebhookSignature;
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";
  const kickClient = options.kickClient || createKickApiClient();
  const twitchClient = options.twitchClient || createTwitchApiClient();
  const twitchEmoteClient = options.twitchEmoteClient || createTwitchEmoteClient({ twitchClient });
  const sessions = new Map();

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");

      if (url.pathname === "/api/public-config" && request.method === "GET") {
        return sendJson(response, 200, toPublicConfig(await readSources(configPath)));
      }

      if (url.pathname === "/api/live-state" && request.method === "GET") {
        return sendJson(response, 200, await getLiveState(await readSources(configPath), [twitchClient, kickClient]));
      }

      if (url.pathname === "/api/twitch-emotes" && request.method === "GET") {
        const channel = url.searchParams.get("channel") || "";
        if (!channel) {
          return sendJson(response, 400, { error: "channel is required" });
        }

        return sendJson(response, 200, await twitchEmoteClient.getEmotes(channel));
      }

      if (url.pathname === "/api/chat-events" && request.method === "GET") {
        return chatHub.connect(response);
      }

      if (url.pathname === "/api/webhooks/kick" && request.method === "POST") {
        const rawBody = await readRawBody(request);

        if (!isKickChatEvent(request.headers)) {
          response.writeHead(204);
          return response.end();
        }

        const validSignature = kickWebhookVerifier({ headers: request.headers, rawBody });
        if (!validSignature) {
          return sendJson(response, 401, { error: "Invalid Kick webhook signature" });
        }

        const message = normalizeKickChatWebhook({
          payload: JSON.parse(rawBody),
          sources: await readSources(configPath),
        });
        chatHub.broadcast("chat", message);

        response.writeHead(204);
        return response.end();
      }

      if (url.pathname === "/api/dev/kick-chat" && request.method === "POST") {
        if (!enableDevRoutes) {
          return sendJson(response, 404, { error: "Not found" });
        }

        const sources = await readSources(configPath);
        const body = await readJsonBody(request);
        const message = normalizeKickChatWebhook({
          payload: buildDevKickChatPayload(body, sources),
          sources,
        });
        chatHub.broadcast("chat", message);

        return sendJson(response, 200, { message });
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (!adminPasswordHash) {
          response.writeHead(204);
          return response.end();
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
        if (adminPasswordHash && !isAuthenticated(request, sessions, secureCookies)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        if (request.method === "GET") {
          return sendJson(response, 200, { sources: await readSources(configPath) });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const sources = normalizeSources(stripEditableViewerCounts(body.sources || []));
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

async function getLiveState(sources, clients) {
  const states = await Promise.all(clients.map((client) => client.getLiveState(sources)));

  return {
    providers: Object.assign({}, ...states.map((state) => state.providers || {})),
    sources: states.flatMap((state) => state.sources || []),
  };
}

function buildDevKickChatPayload(body, sources) {
  const source = getDevKickSource(body, sources);
  const handle = String(body.handle || body.author || "localtester").replace(/^@/, "").trim();
  const author = String(body.author || handle || "Local Tester").trim();

  return {
    message_id: `dev-${Date.now()}`,
    broadcaster: {
      username: source.sourceName,
      channel_slug: source.sourceHandle,
    },
    sender: {
      username: author,
      channel_slug: handle || author,
    },
    content: body.body || "",
    created_at: new Date().toISOString(),
  };
}

function getDevKickSource(body, sources) {
  const requestedHandle = String(body.sourceHandle || "").replace(/^@/, "").toLowerCase().trim();
  const kickSources = sources.filter((source) => source.platform === "kick");
  const source = kickSources.find((item) => item.sourceHandle === requestedHandle) || kickSources[0];

  return source || {
    sourceHandle: requestedHandle || "marketbubble",
    sourceId: `kick-${requestedHandle || "marketbubble"}`,
    sourceLabel: "Market Bubble",
    sourceName: "Market Bubble",
  };
}

function stripEditableViewerCounts(sources) {
  return (Array.isArray(sources) ? sources : []).map(({ viewerCount, ...source }) => source);
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
  const raw = await readRawBody(request);

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function readRawBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;
  }

  return raw;
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
