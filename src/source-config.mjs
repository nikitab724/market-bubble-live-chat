const SUPPORTED_PLATFORMS = ["twitch", "kick", "x", "room"];
const PLATFORM_LABELS = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  room: "MarketBubble.com",
};

export const DEFAULT_SOURCES = normalizeSources([
  {
    platform: "twitch",
    profileId: "marketbubble",
    profileName: "Market Bubble",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    showStream: true,
    viewerCount: 3184,
  },
  {
    platform: "kick",
    profileId: "marketbubble",
    profileName: "Market Bubble",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    viewerCount: 1260,
  },
  {
    platform: "x",
    profileId: "banks",
    profileName: "Banks",
    sourceName: "Banks",
    sourceHandle: "Banks",
    conversationId: "2062574325970973093",
    viewerCount: 8062,
  },
  {
    platform: "x",
    profileId: "z",
    profileName: "Z",
    sourceName: "Z",
    sourceHandle: "z",
    conversationId: "",
    viewerCount: 4720,
  },
  {
    platform: "room",
    profileId: "marketbubble",
    profileName: "Market Bubble",
    sourceName: "MarketBubble.com",
    sourceHandle: "marketbubble",
    viewerCount: 518,
  },
]);

export function normalizeSources(inputSources) {
  if (!Array.isArray(inputSources)) {
    throw new Error("Sources must be an array");
  }

  return keepOneStreamSelection(inputSources.map(normalizeSource));
}

export function toPublicConfig(sources) {
  return {
    sources: normalizeSources(sources)
      .filter((source) => source.enabled)
      .map((source) => ({
        enabled: source.enabled,
        platform: source.platform,
        ...(source.profileId ? { profileId: source.profileId } : {}),
        ...(source.profileName ? { profileName: source.profileName } : {}),
        sourceHandle: source.sourceHandle,
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        conversationId: source.conversationId,
        showStream: source.showStream,
        viewerCount: source.viewerCount,
      })),
  };
}

export function normalizeSource(input) {
  const platform = String(input.platform || "").toLowerCase().trim();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported platform: ${input.platform}`);
  }

  const rawHandle = String(input.sourceHandle || input.handle || "").replace(/^@/, "").trim();
  const sourceHandle = rawHandle.toLowerCase();
  if (!sourceHandle) {
    throw new Error("Source handle is required");
  }

  const sourceName = String(input.sourceName || input.label || rawHandle || PLATFORM_LABELS[platform]).trim();
  const sourceLabel = String(input.sourceLabel || sourceName).trim();
  const conversationId = String(input.conversationId || "").trim();
  const profileId = String(input.profileId || "").trim();
  const profileName = String(input.profileName || "").trim();

  return {
    ...(platform === "kick" && normalizeBroadcasterUserId(input.broadcasterUserId)
      ? { broadcasterUserId: normalizeBroadcasterUserId(input.broadcasterUserId) }
      : {}),
    enabled: input.enabled !== false,
    platform,
    ...(profileId ? { profileId } : {}),
    ...(profileName ? { profileName } : {}),
    showStream: input.showStream === true,
    sourceHandle,
    sourceId: String(input.sourceId || buildSourceId(platform, getSourceIdName(platform, sourceHandle, sourceLabel))).trim(),
    sourceLabel,
    sourceName,
    sourceUrl: input.sourceUrl || buildSourceUrl(platform, sourceHandle),
    viewerCount: normalizeViewerCount(input.viewerCount),
    conversationId,
  };
}

function keepOneStreamSelection(sources) {
  let selected = false;

  return sources.map((source) => {
    const showStream = selected === false && source.enabled && source.showStream === true;
    if (showStream) selected = true;
    return { ...source, showStream };
  });
}

function buildSourceId(platform, sourceName) {
  return [platform, sourceName]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getSourceIdName(platform, sourceHandle, sourceLabel) {
  if (platform === "x") {
    return sourceLabel || sourceHandle;
  }

  return sourceHandle;
}

function buildSourceUrl(platform, handle) {
  if (platform === "twitch") return `https://twitch.tv/${handle}`;
  if (platform === "kick") return `https://kick.com/${handle}`;
  if (platform === "room") return `https://marketbubble.com`;
  return `https://x.com/${handle}`;
}

function normalizeViewerCount(viewerCount) {
  const count = Number(viewerCount || 0);

  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.max(0, Math.round(count));
}

function normalizeBroadcasterUserId(value) {
  const id = Number(value || 0);

  if (!Number.isFinite(id) || id <= 0) {
    return 0;
  }

  return Math.round(id);
}
