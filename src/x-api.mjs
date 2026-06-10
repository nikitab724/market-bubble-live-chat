// Server-side X (Twitter) live broadcast chat access.
//
// X Live chat is not tweet replies; it runs on the legacy Periscope chat
// service. The public web player reaches it through a guest-token handshake
// that needs no login and no paid API access:
//
//   1. POST  api.x.com/1.1/guest/activate.json            -> guest token
//   2. GET   x.com/i/api/1.1/broadcasts/show.json          -> media_key
//   3. GET   x.com/i/api/1.1/live_video_stream/status/<mk> -> chatToken
//   4. POST  proxsee-cf.pscp.tv/api/v2/accessChatPublic    -> chat endpoint + access token
//
// These are unofficial endpoints (the same ones x.com's web player calls), so
// they can change without notice. The connector treats every failure as a
// soft "disconnected" status and lets the Chrome extension bridge remain a
// fallback path.

// Long-standing public bearer token embedded in the X web client.
export const X_WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const GUEST_ACTIVATE_URL = "https://api.x.com/1.1/guest/activate.json";
const BROADCAST_SHOW_URL = "https://x.com/i/api/1.1/broadcasts/show.json";
const LIVE_STATUS_URL = "https://x.com/i/api/1.1/live_video_stream/status";
const ACCESS_CHAT_PUBLIC_URL = "https://proxsee-cf.pscp.tv/api/v2/accessChatPublic";
const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export function createXApiClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("X API client requires a fetch implementation");
  }

  return { bootstrapBroadcast };

  async function bootstrapBroadcast(input) {
    const broadcastId = extractBroadcastId(input);
    const guestToken = await activateGuestToken();

    const show = await requestJson(
      `${BROADCAST_SHOW_URL}?ids=${encodeURIComponent(broadcastId)}`,
      { headers: xApiHeaders(guestToken) },
    );
    const broadcast = show.broadcasts?.[broadcastId];
    const mediaKey = broadcast?.media_key;
    if (!mediaKey) {
      throw new Error(`No media_key for X broadcast ${broadcastId}`);
    }

    const status = await requestJson(
      `${LIVE_STATUS_URL}/${encodeURIComponent(mediaKey)}?client=web&use_syndication_guest_id=false&cookie_set_host=x.com`,
      { headers: xApiHeaders(guestToken) },
    );
    if (!status.chatToken) {
      throw new Error(`No chatToken for X broadcast ${broadcastId}`);
    }

    const access = await requestJson(ACCESS_CHAT_PUBLIC_URL, {
      method: "POST",
      headers: periscopeHeaders(),
      body: JSON.stringify({ chat_token: status.chatToken }),
    });

    const endpoint = access.endpoint || access.replay_endpoint;
    const accessToken = access.access_token || access.replay_access_token;
    if (!endpoint || !accessToken) {
      throw new Error(`Could not resolve chat endpoint for X broadcast ${broadcastId}`);
    }

    return {
      accessToken,
      broadcastId,
      chatToken: status.chatToken,
      endpoint,
      isLive: String(broadcast?.state || "").toUpperCase() !== "ENDED",
      mediaKey,
      readOnly: access.read_only ?? true,
      url: `https://x.com/i/broadcasts/${broadcastId}`,
    };
  }

  async function activateGuestToken() {
    const response = await requestJson(GUEST_ACTIVATE_URL, {
      method: "POST",
      headers: xApiHeaders(),
    });
    if (!response.guest_token) {
      throw new Error("Could not activate X guest token");
    }
    return response.guest_token;
  }

  async function requestJson(url, init = {}) {
    const response = await fetchImpl(url, {
      ...init,
      headers: { "user-agent": WEB_USER_AGENT, ...(init.headers || {}) },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`X request failed (${response.status}) for ${url}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}`);
    }
  }
}

export function xApiHeaders(guestToken) {
  return {
    authorization: `Bearer ${X_WEB_BEARER}`,
    accept: "application/json, text/plain, */*",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    ...(guestToken ? { "x-guest-token": guestToken } : {}),
  };
}

function periscopeHeaders() {
  return {
    accept: "*/*",
    origin: "https://x.com",
    referer: "https://x.com/",
    "content-type": "application/json",
    "x-periscope-user-agent": "Twitter/m5",
    "x-attempt": "1",
    "x-idempotence": `${Date.now()}`,
  };
}

export function buildChatSocketUrl(endpoint) {
  return `${String(endpoint).replace(/^http/, "ws").replace(/\/$/, "")}/chatapi/v1/chatnow`;
}

// Subscribe frames the Periscope chat socket expects after it opens:
// kind 3 authenticates with the access token, kind 2 joins the broadcast room.
export function buildChatSubscribeFrames(bootstrap) {
  return [
    JSON.stringify({ payload: JSON.stringify({ access_token: bootstrap.accessToken }), kind: 3 }),
    JSON.stringify({
      payload: JSON.stringify({ body: JSON.stringify({ room: bootstrap.broadcastId }), kind: 1 }),
      kind: 2,
    }),
  ];
}

export function extractBroadcastId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("An X broadcast id or URL is required");
  }

  const urlMatch = trimmed.match(/\/i\/broadcasts\/([A-Za-z0-9]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[A-Za-z0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(`Could not extract an X broadcast id from: ${trimmed}`);
}

// Resolve a broadcast id from a saved source without guessing: only an explicit
// broadcastId field or a /i/broadcasts/<id> URL counts. Numeric post ids in
// conversationId are X post ids, not broadcast ids, so they are ignored.
export function getSourceBroadcastId(source = {}) {
  if (source.broadcastId) {
    return String(source.broadcastId).trim();
  }

  for (const candidate of [source.sourceUrl, source.conversationId]) {
    const match = String(candidate || "").match(/\/i\/broadcasts\/([A-Za-z0-9]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

// Normalize a raw Periscope chat frame (kind 1) into the shared chat shape.
// The payload is double/triple JSON-encoded: { payload: "{ body: "{...}" }" }.
export function normalizeXBroadcastMessage(rawFrame, source = {}) {
  if (!rawFrame || rawFrame.kind !== 1 || !rawFrame.payload) {
    return null;
  }

  const outer = safeJsonParse(rawFrame.payload);
  if (!outer) {
    return null;
  }

  const inner = typeof outer.body === "string" ? safeJsonParse(outer.body) : outer.body;
  if (!inner) {
    return null;
  }

  const body = typeof inner.body === "string" ? inner.body.trim() : "";
  if (!body) {
    return null;
  }

  const username = String(inner.username || outer.sender?.username || "").replace(/^@/, "").trim();
  const displayName = String(inner.displayName || outer.sender?.display_name || username || "X viewer").trim();
  const handle = username || displayName.toLowerCase().replace(/\s+/g, "");
  const timestampMs = resolveTimestampMs(inner);
  const uuid = String(inner.uuid || `${source.sourceId || "x"}:${handle}:${timestampMs}:${body}`);

  return {
    id: `x-${uuid}`,
    platform: "x",
    author: displayName,
    handle,
    body,
    timestamp: new Date(timestampMs).toISOString(),
    sourceUrl: handle ? `https://x.com/${handle}` : source.sourceUrl || "",
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceHandle: source.sourceHandle,
    sourceLabel: source.sourceLabel || source.sourceName,
  };
}

function resolveTimestampMs(inner) {
  if (typeof inner.timestamp === "number" && Number.isFinite(inner.timestamp)) {
    // Periscope timestamps are sometimes microseconds; clamp to milliseconds.
    return inner.timestamp > 1e14 ? Math.round(inner.timestamp / 1000) : inner.timestamp;
  }

  if (typeof inner.programDateTime === "string") {
    const parsed = Date.parse(inner.programDateTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
