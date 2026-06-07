const PLATFORM_ORDER = ["twitch", "kick", "x", "room"];
const PLATFORM_LABELS = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  room: "MarketBubble.com",
};
const DEFAULT_AUTHOR_COLORS = [
  "#FF7F50",
  "#1E90FF",
  "#32CD32",
  "#DAA520",
  "#FF69B4",
  "#BA55D3",
  "#00CED1",
  "#FF4500",
  "#2E8B57",
  "#D2691E",
  "#5F9EA0",
  "#9ACD32",
  "#C9B978",
  "#F08080",
  "#87CEEB",
];

export function normalizeMessage(input) {
  const platform = normalizePlatform(input.platform);
  const author = String(input.author || "Unknown").trim();
  const body = String(input.body || "").trim();
  const timestamp = toIsoTimestamp(input.timestamp);
  const handle = String(input.handle || author).replace(/^@/, "").trim();
  const sourceName = normalizeSourceName(platform, input.sourceName);
  const sourceHandle = String(input.sourceHandle || "").replace(/^@/, "").trim();
  const sourceLabel = String(input.sourceLabel || sourceName).trim() || sourceName;
  const sourceId = String(input.sourceId || buildSourceId(platform, sourceHandle || sourceLabel)).trim();
  const message = {
    id: input.id || buildMessageId(platform, sourceId, handle || author, timestamp, body),
    platform,
    author,
    handle,
    body,
    timestamp,
    sourceUrl: input.sourceUrl || "",
    sourceId,
    sourceName,
    sourceHandle,
    sourceLabel,
    avatar: input.avatar || getInitial(author),
    authorColor: normalizeAuthorColor(input.authorColor) || getFallbackAuthorColor(platform, handle || author),
    sentiment: input.sentiment || inferSentiment(body),
  };

  if (Array.isArray(input.emotes) && input.emotes.length > 0) {
    message.emotes = input.emotes.map(normalizeEmote).filter(Boolean);
  }

  if (Array.isArray(input.badges) && input.badges.length > 0) {
    const badges = input.badges.map(normalizeBadge).filter(Boolean);
    if (badges.length > 0) {
      message.badges = badges;
    }
  }

  return message;
}

export function mergeMessages(messages) {
  const seenIds = new Set();

  return messages
    .map(normalizeMessage)
    .filter((message) => {
      if (seenIds.has(message.id)) return false;
      seenIds.add(message.id);
      return true;
    })
    .sort((left, right) => {
      const timeDifference = Date.parse(left.timestamp) - Date.parse(right.timestamp);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform);
    });
}

export function buildPlatformStats(messages) {
  const stats = {
    twitch: createEmptyStats(),
    kick: createEmptyStats(),
    x: createEmptyStats(),
    room: createEmptyStats(),
  };
  const authorsByPlatform = new Map(PLATFORM_ORDER.map((platform) => [platform, new Set()]));

  for (const message of messages.map(normalizeMessage)) {
    stats[message.platform].messages += 1;
    authorsByPlatform.get(message.platform).add(message.handle.toLowerCase());
  }

  for (const platform of PLATFORM_ORDER) {
    stats[platform].activeChatters = authorsByPlatform.get(platform).size;
  }

  return stats;
}

export function buildViewerSummary(sources) {
  const normalizedSources = sources.map(normalizeViewerSource);

  return {
    total: normalizedSources.reduce((sum, source) => sum + source.viewerCount, 0),
    sources: normalizedSources,
  };
}

export function buildAuthorProfile(messages, targetMessage) {
  const target = normalizeMessage(targetMessage);
  const authorMessages = messages
    .map(normalizeMessage)
    .filter(
      (message) =>
        message.platform === target.platform &&
        message.handle.toLowerCase() === target.handle.toLowerCase(),
    );
  const lastSeen = authorMessages
    .map((message) => message.timestamp)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  return {
    platform: target.platform,
    author: target.author,
    handle: target.handle,
    displayHandle: `@${target.handle}`,
    sourceUrl: target.sourceUrl,
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceHandle: target.sourceHandle,
    sourceLabel: target.sourceLabel,
    messageCount: authorMessages.length,
    lastSeen,
  };
}

function createEmptyStats() {
  return {
    activeChatters: 0,
    messages: 0,
  };
}

function normalizeViewerSource(source) {
  const platform = normalizePlatform(source.platform);
  const sourceName = normalizeSourceName(platform, source.sourceName);
  const sourceHandle = String(source.sourceHandle || "").replace(/^@/, "").trim();
  const sourceLabel = String(source.sourceLabel || sourceName).trim() || sourceName;
  const sourceId = String(source.sourceId || buildSourceId(platform, sourceHandle || sourceLabel)).trim();

  return {
    sourceId,
    platform,
    profileId: String(source.profileId || "").trim(),
    profileName: String(source.profileName || "").trim(),
    sourceName,
    sourceHandle,
    sourceLabel,
    viewerCount: normalizeViewerCount(source.viewerCount),
    sourceUrl: source.sourceUrl || "",
  };
}

function normalizePlatform(platform) {
  const normalized = String(platform || "").toLowerCase();

  if (!PLATFORM_ORDER.includes(normalized)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return normalized;
}

function normalizeSourceName(platform, sourceName) {
  return String(sourceName || PLATFORM_LABELS[platform]).trim() || PLATFORM_LABELS[platform];
}

function normalizeViewerCount(viewerCount) {
  const count = Number(viewerCount);

  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.max(0, Math.round(count));
}

function normalizeAuthorColor(color) {
  const normalized = String(color || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return "";
}

function getFallbackAuthorColor(platform, seed) {
  const text = `${platform}:${String(seed || "").toLowerCase()}`;
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return DEFAULT_AUTHOR_COLORS[hash % DEFAULT_AUTHOR_COLORS.length];
}

function normalizeEmote(emote) {
  const start = Number(emote.start);
  const end = Number(emote.end);
  const name = String(emote.name || "").trim();
  const url = String(emote.url || "").trim();

  if (!name || !url || !Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }

  return {
    end,
    name,
    provider: String(emote.provider || "twitch").trim() || "twitch",
    start,
    url,
  };
}

function normalizeBadge(badge) {
  const id = String(badge.id || badge.type || "").trim();
  const version = String(badge.version || badge.idVersion || "").trim();
  const label = String(badge.label || badge.text || toTitleCase(id)).trim();
  const imageUrl = String(badge.imageUrl || badge.url || "").trim();
  const count = Number(badge.count || 0);
  const title = String(
    badge.title || [label, Number.isFinite(count) && count > 0 ? Math.round(count) : ""].filter(Boolean).join(" · "),
  ).trim();

  if (!id || !label) {
    return null;
  }

  const normalized = {
    id,
    label,
    title: title || label,
    version,
  };

  if (imageUrl) {
    normalized.imageUrl = imageUrl;
  }

  if (Number.isFinite(count) && count > 0) {
    normalized.count = Math.round(count);
  }

  return normalized;
}

function toIsoTimestamp(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  return date.toISOString();
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSourceId(platform, sourceName) {
  const slug = [platform, sourceName]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || `${platform}-source`;
}

function buildMessageId(platform, sourceId, handle, timestamp, body) {
  const slug = [platform, sourceId, handle, timestamp, body]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || `${platform}-${timestamp}`;
}

function getInitial(author) {
  return author.trim().charAt(0).toUpperCase() || "?";
}

function inferSentiment(body) {
  const text = body.toLowerCase();

  if (/(fire|cooking|send|hype|great|love|win|based)/.test(text)) {
    return "positive";
  }

  if (/(rug|bad|hate|dead|scam|broken|rekt)/.test(text)) {
    return "negative";
  }

  return "neutral";
}
