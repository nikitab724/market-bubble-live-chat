import { verify } from "node:crypto";

import { normalizeMessage } from "./chat-model.mjs";

const DEFAULT_KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

export function normalizeKickChatWebhook({ payload, sources }) {
  const source = findKickSource(payload, sources);
  const sender = payload.sender || {};
  const author = String(sender.username || "Unknown").trim();
  const handle = String(sender.channel_slug || sender.username || author).replace(/^@/, "").trim();
  const content = normalizeKickContent(payload.content);

  return normalizeMessage({
    id: payload.message_id ? `kick-${payload.message_id}` : undefined,
    platform: "kick",
    author,
    authorColor: sender.identity?.username_color || "",
    badges: normalizeKickBadges(sender.identity?.badges),
    handle,
    body: content.body,
    emotes: content.emotes,
    timestamp: payload.created_at,
    sourceUrl: handle ? `https://kick.com/${handle}` : "",
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceHandle: source.sourceHandle,
    sourceLabel: source.sourceLabel,
  });
}

export function verifyKickWebhookSignature({
  headers,
  publicKey = DEFAULT_KICK_PUBLIC_KEY,
  rawBody,
}) {
  const messageId = getHeader(headers, "kick-event-message-id");
  const timestamp = getHeader(headers, "kick-event-message-timestamp");
  const signature = getHeader(headers, "kick-event-signature");

  if (!messageId || !timestamp || !signature || !rawBody) {
    return false;
  }

  try {
    const signedBody = `${messageId}.${timestamp}.${rawBody}`;
    return verify("RSA-SHA256", Buffer.from(signedBody), publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function isKickChatEvent(headers) {
  return getHeader(headers, "kick-event-type") === "chat.message.sent";
}

function normalizeKickBadges(badges) {
  return (Array.isArray(badges) ? badges : [])
    .map((badge) => {
      const id = String(badge.type || "").trim();
      const label = String(badge.text || toBadgeLabel(id)).trim();
      const count = Number(badge.count || 0);

      if (!id || !label) {
        return null;
      }

      return {
        count: Number.isFinite(count) && count > 0 ? Math.round(count) : 0,
        id,
        label,
        title: [label, Number.isFinite(count) && count > 0 ? Math.round(count) : ""].filter(Boolean).join(" · "),
      };
    })
    .filter(Boolean);
}

function findKickSource(payload, sources) {
  const broadcasterSlug = String(payload.broadcaster?.channel_slug || "")
    .replace(/^@/, "")
    .toLowerCase()
    .trim();
  const kickSources = (Array.isArray(sources) ? sources : []).filter((source) => source.platform === "kick");
  const source = kickSources.find((item) => item.sourceHandle === broadcasterSlug) || kickSources[0];

  if (source) {
    return source;
  }

  return {
    sourceHandle: broadcasterSlug || "marketbubble",
    sourceId: `kick-${broadcasterSlug || "marketbubble"}`,
    sourceLabel: payload.broadcaster?.username || "Market Bubble",
    sourceName: payload.broadcaster?.username || "Market Bubble",
  };
}

function toBadgeLabel(id) {
  return String(id || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const KICK_EMOTE_PATTERN = /\[emote:([^:\]]+):([^\]]+)\]/g;

function normalizeKickContent(content) {
  // Whitespace is collapsed and trimmed before positions are computed so the
  // emote ranges stay aligned with the body normalizeMessage stores.
  const raw = String(content || "").replace(/\s+/g, " ").trim();
  const emotes = [];
  let body = "";
  let cursor = 0;

  for (const match of raw.matchAll(KICK_EMOTE_PATTERN)) {
    body += raw.slice(cursor, match.index);
    const name = match[2];
    emotes.push({
      end: body.length + name.length - 1,
      name,
      provider: "kick",
      start: body.length,
      url: `https://files.kick.com/emotes/${match[1]}/fullsize`,
    });
    body += name;
    cursor = match.index + match[0].length;
  }

  body += raw.slice(cursor);
  return { body, emotes };
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name) || "";
  }

  return headers?.[name.toLowerCase()] || headers?.[name] || "";
}
