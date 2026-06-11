import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createLoginThrottle,
  createSessionToken,
  deriveIngestToken,
  getSessionCookieName,
  hashPassword,
  parseCookies,
  verifyIngestToken,
  verifyPassword,
} from "./src/admin-auth.mjs";
import { createChatEventHub } from "./src/chat-events.mjs";
import { createKickApiClient } from "./src/kick-api.mjs";
import {
  isKickChatEvent,
  normalizeKickChatWebhook,
  verifyKickWebhookSignature,
} from "./src/kick-webhook.mjs";
import { createSqliteChatEventStore } from "./src/chat-event-store.mjs";
import { DEFAULT_SOURCES, normalizeSources, toPublicConfig } from "./src/source-config.mjs";
import { createTwitchApiClient } from "./src/twitch-api.mjs";
import { createTwitchChatService } from "./src/twitch-chat-service.mjs";
import { createTwitchEmoteClient } from "./src/twitch-emotes.mjs";
import { createXChatService } from "./src/x-chat-service.mjs";
import { createXApiClient, extractBroadcastId } from "./src/x-api.mjs";
import { createYoutubeApiClient } from "./src/youtube-api.mjs";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

const YT_CHANNEL_ID = "UC2Yw4-WyejthY7OLpbVX4Ug";
const YT_RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;
const TWITCH_CONTENT_CHANNEL = "FaZeBanks";
const YT_CACHE_TTL_MS = 30 * 60 * 1000;
const YT_CONTENT_LIMIT = 15;
let ytCache = null;
let ytCacheTime = 0;
const youtubeClient = createYoutubeApiClient();

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function getYoutubeVideosFromRss() {
  const res = await fetch(YT_RSS_URL);
  if (!res.ok) return { longform: [], shorts: [] };
  const xml = await res.text();
  const longform = [];
  const entries = xml.split("<entry>");
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>([^<]+)<\/title>/) || [])[1];
    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
    if (videoId && title) {
      longform.push({
        videoId,
        title: decodeXmlEntities(title),
        published: published ? published.slice(0, 10) : "",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
  }
  return { longform, shorts: [] };
}

async function getYoutubeVideos() {
  if (ytCache && Date.now() - ytCacheTime < YT_CACHE_TTL_MS) return ytCache;

  let payload = { longform: [], shorts: [] };
  if (youtubeClient.isConfigured()) {
    try {
      payload = await youtubeClient.getChannelVideos(YT_CHANNEL_ID, { limitPerType: YT_CONTENT_LIMIT });
    } catch {
      payload = ytCache ?? { longform: [], shorts: [] };
    }
  } else {
    payload = await getYoutubeVideosFromRss();
  }

  ytCache = payload;
  ytCacheTime = Date.now();
  return ytCache;
}
const DEFAULT_CONFIG_PATH = join(ROOT_DIR, "data", "sources.json");
const DEFAULT_PORT = 4178;
let devChatMessageSequence = 0;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Matches the minimum enforced by scripts/hash-admin-password.mjs.
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const DEFAULT_CHAT_REPLAY_LIMIT = 1000;
const DEFAULT_CHAT_RETENTION_HOURS = 2;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_CHAT_BODY_LENGTH = 2000;
const MAX_CHAT_NAME_LENGTH = 120;

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const PUBLIC_ASSETS = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/v2", "v2/index.html"],
  ["/v2/", "v2/index.html"],
  ["/v2/index.html", "v2/index.html"],
  ["/styles-v2.css", "styles-v2.css"],
  ["/src/app-v2.mjs", "src/app-v2.mjs"],
  ["/assets/kick-logo.png", "assets/kick-logo.png"],
  ["/assets/logo.png", "assets/logo.png"],
  ["/assets/market-bubble-logo.jpg", "assets/market-bubble-logo.jpg"],
  ["/assets/bg.png", "assets/bg.png"],
  ["/assets/twitch-icon.png", "assets/twitch-icon.png"],
  ["/assets/x-icon.png", "assets/x-icon.png"],
  ["/assets/tiktok-icon.png", "assets/tiktok-icon.png"],
  ["/assets/spotify-icon.png", "assets/spotify-icon.png"],
  ["/content", "content/index.html"],
  ["/content/", "content/index.html"],
  ["/content/index.html", "content/index.html"],
  ["/content/content.mjs", "content/content.mjs"],
  ["/community", "community/index.html"],
  ["/community/", "community/index.html"],
  ["/community/index.html", "community/index.html"],
  ["/community/community.mjs", "community/community.mjs"],
  ["/chat", "chat/index.html"],
  ["/chat/", "chat/index.html"],
  ["/chat/index.html", "chat/index.html"],
  ["/admin", "admin/index.html"],
  ["/admin/", "admin/index.html"],
  ["/admin/index.html", "admin/index.html"],
  ["/admin/admin.mjs", "admin/admin.mjs"],
  ["/admin/profile-model.mjs", "admin/profile-model.mjs"],
  ["/styles.css", "styles.css"],
  ["/src/app.mjs", "src/app.mjs"],
  ["/src/chat-model.mjs", "src/chat-model.mjs"],
  ["/src/chat-renderer.mjs", "src/chat-renderer.mjs"],
  ["/src/chat-runtime.mjs", "src/chat-runtime.mjs"],
  ["/src/client-sources.mjs", "src/client-sources.mjs"],
  ["/src/demo-chat.mjs", "src/demo-chat.mjs"],
  ["/src/emote-renderer.mjs", "src/emote-renderer.mjs"],
  ["/src/platforms.mjs", "src/platforms.mjs"],
  ["/src/twitch-connector.mjs", "src/twitch-connector.mjs"],
  ["/src/viewer-stream.mjs", "src/viewer-stream.mjs"],
]);

export function createAppServer(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  // Passwords set from the admin UI land next to sources.json (the persistent
  // data mount in production), and outrank the ADMIN_PASSWORD_HASH env seed so
  // a changed password survives restarts and redeploys.
  const adminPasswordFile = options.adminPasswordFile || join(dirname(configPath), "admin-password.json");
  let adminPasswordHash = readAdminPasswordHashFile(adminPasswordFile)
    || options.adminPasswordHash
    || process.env.ADMIN_PASSWORD_HASH
    || "";
  const loginThrottle = options.loginThrottle || createLoginThrottle();
  const chatReplayLimit = getPositiveNumber(
    options.chatReplayLimit ?? process.env.CHAT_REPLAY_LIMIT,
    DEFAULT_CHAT_REPLAY_LIMIT,
  );
  const chatEventStore = options.chatEventStore === undefined
    ? createSqliteChatEventStore({
      dbPath: process.env.CHAT_DB_PATH || join(rootDir, "data", "chat-events.sqlite"),
      replayLimit: chatReplayLimit,
      retentionHours: getChatRetentionHours(process.env),
    })
    : options.chatEventStore;
  const chatHub = options.chatHub || createChatEventHub({
    eventStore: chatEventStore || undefined,
    replayLimit: chatReplayLimit,
  });
  const enableDevRoutes = options.enableDevRoutes ?? process.env.NODE_ENV !== "production";
  const kickWebhookVerifier = options.kickWebhookVerifier || verifyKickWebhookSignature;
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";
  const kickClient = options.kickClient || createKickApiClient();
  const twitchClient = options.twitchClient || createTwitchApiClient();
  const twitchVodsCache = new Map();
  const TWITCH_VODS_CACHE_TTL_MS = 30 * 60 * 1000;
  const twitchChatService = options.twitchChatService === undefined
    ? createTwitchChatService({ chatHub })
    : options.twitchChatService;
  const xChatService = options.xChatService === undefined
    ? createXChatService({ chatHub })
    : options.xChatService;
  const twitchEmoteClient = options.twitchEmoteClient || createTwitchEmoteClient({ twitchClient });
  const xApiClient = options.xApiClient || createXApiClient();
  const sessions = new Map();
  let ensuredKickSubscriptionKey = "";
  let kickSubscriptionEnsurePromise = null;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");

      if (url.pathname === "/api/public-config" && request.method === "GET") {
        const sources = await readSources(configPath);
        syncChatConnectorSources(sources);
        await ensureKickChatSubscriptionsOnce(sources);
        return sendJson(response, 200, toPublicConfig(sources));
      }

      if (url.pathname === "/api/live-state" && request.method === "GET") {
        const sources = await readSources(configPath);
        syncChatConnectorSources(sources);
        await ensureKickChatSubscriptionsOnce(sources);
        // The X chat connector doubles as the X live-state provider: it
        // reports occupancy from the broadcast chat socket, no HTTP poll.
        return sendJson(
          response,
          200,
          await getLiveState(sources, [twitchClient, kickClient, xChatService].filter((client) => client?.getLiveState)),
        );
      }

      if (url.pathname === "/api/twitch-emotes" && request.method === "GET") {
        const channel = url.searchParams.get("channel") || "";
        if (!channel) {
          return sendJson(response, 400, { error: "channel is required" });
        }

        return sendJson(response, 200, await twitchEmoteClient.getEmotes(channel));
      }

      if (url.pathname === "/api/x-profile" && request.method === "GET") {
        const handle = url.searchParams.get("handle") || "";
        if (!handle) {
          return sendJson(response, 400, { error: "handle is required" });
        }

        try {
          return sendJson(response, 200, { profile: await xApiClient.getUserProfile(handle) });
        } catch {
          // Unofficial lookup; the popover simply skips its X identity card.
          return sendJson(response, 200, { profile: null });
        }
      }

      if (url.pathname === "/api/twitch-badges" && request.method === "GET") {
        const channel = url.searchParams.get("channel") || "";
        if (!channel) {
          return sendJson(response, 400, { error: "channel is required" });
        }

        return sendJson(response, 200, await twitchClient.getChatBadges(channel));
      }

      if (url.pathname === "/api/twitch-vod" && request.method === "GET") {
        const channel = url.searchParams.get("channel") || "";
        if (!channel) {
          return sendJson(response, 400, { error: "channel is required" });
        }

        const vod = await twitchClient.getLatestVod(channel);
        return sendJson(response, 200, vod ? { vod } : { vod: null });
      }

      if (url.pathname === "/api/twitch-vods" && request.method === "GET") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 15, 1), 100);
        const cacheKey = String(limit);
        const cached = twitchVodsCache.get(cacheKey);
        if (cached && Date.now() - cached.time < TWITCH_VODS_CACHE_TTL_MS) {
          return sendJson(response, 200, cached.payload);
        }

        const payload = { channel: TWITCH_CONTENT_CHANNEL, vods: await twitchClient.getVods(TWITCH_CONTENT_CHANNEL, limit) };
        twitchVodsCache.set(cacheKey, { payload, time: Date.now() });
        return sendJson(response, 200, payload);
      }

      if (url.pathname === "/api/youtube-videos" && request.method === "GET") {
        return sendJson(response, 200, await getYoutubeVideos());
      }

      if (url.pathname === "/api/chat-events" && request.method === "GET") {
        return chatHub.connect(response, request);
      }

      if (url.pathname === "/api/x-chat") {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-MB-Ingest-Token");

        if (request.method === "OPTIONS") {
          response.writeHead(204);
          return response.end();
        }

        if (!isIngestAuthorized(request, adminPasswordHash)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          const sources = await readSources(configPath);
          const message = normalizeXChatMessage(body, sources);

          if (!message) {
            return sendJson(response, 404, { error: "No matching X source" });
          }

          // A source with a broadcast id is served by the server-side X chat
          // connector. Ignore the extension DOM bridge for it so its messages
          // are not delivered twice (once from each path).
          const ownedByConnector = sources.some(
            (source) => source.platform === "x" && source.sourceId === message.sourceId && source.broadcastId,
          );

          if (!ownedByConnector) {
            chatHub.broadcast("chat", message);
            console.log(`[x-chat] ${message.sourceLabel} | ${message.author}: ${message.body}`);
          }

          response.writeHead(204);
          return response.end();
        }
      }

      if (url.pathname === "/api/x-broadcast") {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-MB-Ingest-Token");

        if (request.method === "OPTIONS") {
          response.writeHead(204);
          return response.end();
        }

        if (!isIngestAuthorized(request, adminPasswordHash)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          const sources = await readSources(configPath);
          const result = applyXBroadcastId(body, sources);

          if (!result.ok) {
            return sendJson(response, result.status, { error: result.error });
          }

          if (result.changed) {
            await writeSources(configPath, sources);
            syncChatConnectorSources(sources);
            console.log(`[x-broadcast] ${result.sourceId} -> ${result.broadcastId}`);
          }

          return sendJson(response, 200, { ok: true, sourceId: result.sourceId, broadcastId: result.broadcastId });
        }
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

        // A signed webhook for an unconfigured broadcaster (a stale app
        // subscription) is acknowledged with 2xx so Kick does not retry or
        // disable the webhook, but it never enters the chat stream.
        if (!message) {
          response.writeHead(204);
          return response.end();
        }

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

        if (!message) {
          return sendJson(response, 404, { error: "No matching Kick source" });
        }

        chatHub.broadcast("chat", message);

        return sendJson(response, 200, { message });
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (!adminPasswordHash) {
          response.writeHead(204);
          return response.end();
        }

        // Brute-force guard: lock a client out after repeated failures before
        // spending a PBKDF2 verification on the attempt.
        const clientKey = getClientKey(request);
        const gate = loginThrottle.check(clientKey);
        if (!gate.allowed) {
          response.setHeader("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
          return sendJson(response, 429, { error: "Too many attempts. Try again later." });
        }

        const body = await readJsonBody(request);
        const valid = await verifyPassword(body.password || "", adminPasswordHash);
        if (!valid) {
          loginThrottle.recordFailure(clientKey);
          return sendJson(response, 401, { error: "Invalid password" });
        }

        loginThrottle.recordSuccess(clientKey);
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

      if (url.pathname === "/api/admin/password" && request.method === "POST") {
        if (adminPasswordHash && !isAuthenticated(request, sessions, secureCookies)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        // Same brute-force guard as login, so a stolen session cookie cannot
        // grind the current password out of this route.
        const clientKey = getClientKey(request);
        const gate = loginThrottle.check(clientKey);
        if (!gate.allowed) {
          response.setHeader("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
          return sendJson(response, 429, { error: "Too many attempts. Try again later." });
        }

        const body = await readJsonBody(request);
        const newPassword = String(body.newPassword || "");
        if (newPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
          return sendJson(response, 400, {
            error: `New password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
          });
        }

        if (adminPasswordHash) {
          const valid = await verifyPassword(body.currentPassword || "", adminPasswordHash);
          if (!valid) {
            loginThrottle.recordFailure(clientKey);
            return sendJson(response, 401, { error: "Current password is incorrect." });
          }
          loginThrottle.recordSuccess(clientKey);
        }

        adminPasswordHash = await hashPassword(newPassword);
        await writeAdminPasswordFile(adminPasswordFile, adminPasswordHash);

        // Sessions minted under the old password die; the caller stays logged
        // in on a fresh one. The X ingest token rotates with the hash.
        sessions.clear();
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

      if (url.pathname === "/api/admin/x-ingest-token" && request.method === "GET") {
        if (adminPasswordHash && !isAuthenticated(request, sessions, secureCookies)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        return sendJson(response, 200, { token: deriveIngestToken(adminPasswordHash) });
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
          const previousSources = await readSources(configPath);
          const sources = await resolveKickBroadcasterUserIds(
            carryXBroadcastIds(normalizeSources(stripEditableViewerCounts(body.sources || [])), previousSources),
            kickClient,
          );
          await ensureKickChatSubscriptions(sources, kickClient);
          await removeKickChatSubscriptions(
            getRemovedKickBroadcasterUserIds(previousSources, sources),
            kickClient,
          );
          ensuredKickSubscriptionKey = getKickSubscriptionKey(sources);
          await writeSources(configPath, sources);
          syncChatConnectorSources(sources);
          return sendJson(response, 200, { sources });
        }
      }

      if (url.pathname === "/api/admin/chat-events" && request.method === "DELETE") {
        if (adminPasswordHash && !isAuthenticated(request, sessions, secureCookies)) {
          return sendJson(response, 401, { error: "Unauthorized" });
        }

        chatHub.clearEvents();
        response.writeHead(204);
        return response.end();
      }

      if (request.method !== "GET") {
        return sendJson(response, 405, { error: "Method not allowed" });
      }

      return serveStatic(rootDir, url.pathname, response);
    } catch (error) {
      return sendJson(response, 500, { error: error.message || "Server error" });
    }
  });

  server.on("close", () => {
    twitchChatService?.stop?.();
    xChatService?.stop?.();
    chatEventStore?.close?.();
  });

  return server;

  async function ensureKickChatSubscriptionsOnce(sources) {
    const subscriptionKey = getKickSubscriptionKey(sources);

    if (!subscriptionKey || subscriptionKey === ensuredKickSubscriptionKey) {
      return;
    }

    if (!kickSubscriptionEnsurePromise) {
      kickSubscriptionEnsurePromise = ensureKickChatSubscriptions(sources, kickClient)
        .then(() => {
          ensuredKickSubscriptionKey = subscriptionKey;
        })
        .catch((error) => {
          console.warn(`[kick] chat subscription ensure failed: ${error.message || error}`);
        })
        .finally(() => {
          kickSubscriptionEnsurePromise = null;
        });
    }

    await kickSubscriptionEnsurePromise;
  }

  function syncChatConnectorSources(sources) {
    twitchChatService?.syncSources?.(sources);
    xChatService?.syncSources?.(sources);
  }
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function getChatRetentionHours(env = process.env) {
  const hours = getPositiveNumber(env.CHAT_RETENTION_HOURS, 0);
  if (hours) {
    return hours;
  }

  const days = getPositiveNumber(env.CHAT_RETENTION_DAYS, 0);
  if (days) {
    return days * 24;
  }

  return DEFAULT_CHAT_RETENTION_HOURS;
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
    message_id: `dev-${Date.now()}-${devChatMessageSequence++}`,
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

function normalizeXChatMessage(body, sources) {
  const requestedHandle = String(body.sourceHandle || "").replace(/^@/, "").toLowerCase().trim();
  const xSources = (Array.isArray(sources) ? sources : []).filter((s) => s.platform === "x");
  // A named handle must match its configured source: after an admin handle
  // change, an extension still watching the previous account keeps posting
  // with the old handle, and a first-source fallback would leak that stream's
  // chat into the new one.
  const source = requestedHandle
    ? xSources.find((s) => s.sourceHandle === requestedHandle)
    : xSources[0];

  if (!source) {
    return null;
  }

  const handle = String(body.handle || body.author || "viewer")
    .replace(/^@/, "").toLowerCase().trim().slice(0, MAX_CHAT_NAME_LENGTH);
  const author = String(body.author || handle).trim().slice(0, MAX_CHAT_NAME_LENGTH);

  return {
    platform: "x",
    author,
    handle,
    body: String(body.body || "").trim().slice(0, MAX_CHAT_BODY_LENGTH),
    timestamp: body.timestamp || new Date().toISOString(),
    sourceUrl: `https://x.com/${handle}`,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceHandle: source.sourceHandle,
    sourceLabel: source.sourceLabel,
  };
}

// Bridge endpoint for the Chrome extension: when the operator is on their own
// X live page, the extension reports the broadcast id so the server-side X chat
// connector can attach without a manual paste. It can only set broadcastId on an
// existing enabled X source matched by handle — no source creation or other edits.
function applyXBroadcastId(body, sources) {
  const requestedHandle = String(body.sourceHandle || "").replace(/^@/, "").toLowerCase().trim();
  if (!requestedHandle) {
    return { ok: false, status: 400, error: "sourceHandle is required" };
  }

  let broadcastId;
  try {
    broadcastId = extractBroadcastId(body.broadcastId || body.broadcastUrl || "");
  } catch {
    return { ok: false, status: 400, error: "A valid X broadcast id or URL is required" };
  }

  const source = sources.find(
    (item) => item.platform === "x" && item.enabled !== false && item.sourceHandle === requestedHandle,
  );
  if (!source) {
    return { ok: false, status: 404, error: `No enabled X source for handle @${requestedHandle}` };
  }

  const changed = source.broadcastId !== broadcastId;
  source.broadcastId = broadcastId;

  return { ok: true, changed, sourceId: source.sourceId, broadcastId };
}

// The X broadcast id is server-captured state: the extension reports it while
// the admin editor only echoes whatever it loaded, which goes stale the moment
// a capture lands after the page load. Saves therefore restore each X source's
// stored id instead of trusting the client copy — except when the save changes
// the source's X handle, because the id identifies the previous account's
// broadcast; then it is dropped and the connector disconnects until the new
// handle's id is captured.
function carryXBroadcastIds(sources, previousSources) {
  const previousXSourcesById = new Map(
    previousSources
      .filter((source) => source.platform === "x")
      .map((source) => [source.sourceId, source]),
  );

  return sources.map((source) => {
    if (source.platform !== "x") {
      return source;
    }

    const { broadcastId, ...rest } = source;
    const previous = previousXSourcesById.get(source.sourceId);
    if (previous?.broadcastId && previous.sourceHandle === source.sourceHandle) {
      return { ...rest, broadcastId: previous.broadcastId };
    }

    return rest;
  });
}

function stripEditableViewerCounts(sources) {
  return (Array.isArray(sources) ? sources : []).map(({ viewerCount, ...source }) => source);
}

async function resolveKickBroadcasterUserIds(sources, kickClient) {
  if (!sources.some((source) => source.platform === "kick")) {
    return sources;
  }

  if (typeof kickClient.resolveBroadcasterUserId !== "function") {
    throw new Error("Kick broadcaster resolver is not configured");
  }

  return Promise.all(
    sources.map(async (source) => {
      if (source.platform !== "kick") {
        return source;
      }

      const broadcasterUserId = Number(await kickClient.resolveBroadcasterUserId(source.sourceHandle));
      if (!Number.isFinite(broadcasterUserId) || broadcasterUserId <= 0) {
        throw new Error(`Kick broadcaster not found for @${source.sourceHandle}`);
      }

      return {
        ...source,
        broadcasterUserId: Math.round(broadcasterUserId),
      };
    }),
  );
}

async function ensureKickChatSubscriptions(sources, kickClient) {
  if (!sources.some((source) => source.platform === "kick" && source.broadcasterUserId)) {
    return null;
  }

  if (typeof kickClient.ensureChatEventSubscriptions !== "function") {
    return null;
  }

  return kickClient.ensureChatEventSubscriptions(sources);
}

// Only the broadcasters this save drops are unsubscribed — never "everything
// not in the config" — so one environment's save cannot tear down chat
// subscriptions another environment created on the same Kick app.
function getRemovedKickBroadcasterUserIds(previousSources, sources) {
  const keptIds = new Set(
    sources
      .filter((source) => source.platform === "kick" && source.broadcasterUserId)
      .map((source) => Number(source.broadcasterUserId)),
  );

  return [...new Set(
    previousSources
      .filter((source) => source.platform === "kick" && source.broadcasterUserId)
      .map((source) => Number(source.broadcasterUserId))
      .filter((broadcasterUserId) => !keptIds.has(broadcasterUserId)),
  )];
}

async function removeKickChatSubscriptions(broadcasterUserIds, kickClient) {
  if (broadcasterUserIds.length === 0) {
    return null;
  }

  if (typeof kickClient.removeChatEventSubscriptions !== "function") {
    return null;
  }

  try {
    return await kickClient.removeChatEventSubscriptions(broadcasterUserIds);
  } catch (error) {
    // A failed cleanup must not block saving config; webhook attribution
    // drops events from unconfigured broadcasters either way.
    console.warn(`[kick] chat subscription cleanup failed: ${error.message || error}`);
    return null;
  }
}

function getKickSubscriptionKey(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source.platform === "kick" && source.broadcasterUserId)
    .map((source) => `${source.sourceId || source.sourceHandle}:${source.broadcasterUserId}`)
    .sort()
    .join("|");
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

function readAdminPasswordHashFile(filePath) {
  try {
    return String(JSON.parse(readFileSync(filePath, "utf8")).passwordHash || "");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    // A present-but-unreadable password file fails startup loudly rather than
    // silently falling back to an older password.
    throw error;
  }
}

async function writeAdminPasswordFile(filePath, passwordHash) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify({ passwordHash }, null, 2)}\n`, { mode: 0o600 });
  await rename(`${filePath}.tmp`, filePath);
}

function isIngestAuthorized(request, adminPasswordHash) {
  // No admin password configured means local/dev: ingest stays open so the
  // bridge works without setup. Once a password exists, the X bridge must
  // present the ingest token minted behind the admin session.
  if (!adminPasswordHash) {
    return true;
  }

  return verifyIngestToken(getIngestToken(request), adminPasswordHash);
}

function getIngestToken(request) {
  const header = request.headers["x-mb-ingest-token"];
  if (typeof header === "string" && header) {
    return header.trim();
  }

  const authorization = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : "";
}

function getClientKey(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
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
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error("Request body too large");
    }

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
  const filePaths = resolveStaticPaths(rootDir, pathname);

  if (filePaths.length === 0) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }

  for (const filePath of filePaths) {
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      });
      return response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  return response.end("Not found");
}

function resolveStaticPaths(rootDir, pathname) {
  const routePath = decodeURIComponent(pathname);
  const paths = [];
  const distPath = resolveDistPath(rootDir, routePath);
  if (distPath) paths.push(distPath);

  const sourcePath = resolveSourceStaticPath(rootDir, routePath);
  if (sourcePath) paths.push(sourcePath);

  return paths;
}

function resolveDistPath(rootDir, routePath) {
  const relativePath = getDistRelativePath(routePath);
  if (!relativePath) return null;

  const distRoot = join(rootDir, "dist", "client");
  const filePath = normalize(join(distRoot, relativePath));

  if (relative(distRoot, filePath).startsWith("..")) {
    return null;
  }

  return filePath;
}

function getDistRelativePath(routePath) {
  if (routePath === "/" || routePath === "/index.html") return "index.html";
  if (routePath === "/chat" || routePath === "/chat/" || routePath === "/chat/index.html") {
    return "chat/index.html";
  }
  if (routePath === "/admin" || routePath === "/admin/" || routePath === "/admin/index.html") {
    return "admin/index.html";
  }
  if (routePath.startsWith("/assets/")) return routePath.slice(1);
  return null;
}

function resolveSourceStaticPath(rootDir, routePath) {
  const relativePath = PUBLIC_ASSETS.get(routePath);
  if (!relativePath) return null;

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
