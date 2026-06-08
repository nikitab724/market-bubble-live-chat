const DEFAULT_TOKEN_URL = "https://id.kick.com/oauth/token";
const DEFAULT_CHANNELS_URL = "https://api.kick.com/public/v1/channels";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export function createKickApiClient(options = {}) {
  const clientId = options.clientId ?? process.env.KICK_CLIENT_ID ?? "";
  const clientSecret = options.clientSecret ?? process.env.KICK_CLIENT_SECRET ?? "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const tokenUrl = options.tokenUrl || DEFAULT_TOKEN_URL;
  const channelsUrl = options.channelsUrl || DEFAULT_CHANNELS_URL;

  let cachedToken = "";
  let tokenExpiresAt = 0;

  return {
    async getLiveState(sources) {
      const kickSources = getKickSources(sources);

      if (kickSources.length === 0) {
        return { providers: { kick: { status: "no_sources" } }, sources: [] };
      }

      if (!clientId || !clientSecret) {
        return { providers: { kick: { status: "not_configured" } }, sources: [] };
      }

      try {
        const token = await getAppAccessToken();
        const liveSources = await getChannels(kickSources, token);
        return { providers: { kick: { status: "connected" } }, sources: liveSources };
      } catch (error) {
        return {
          providers: {
            kick: {
              message: error.message || "Kick request failed",
              status: "error",
            },
          },
          sources: [],
        };
      }
    },

    async resolveBroadcasterUserId(handle) {
      const channel = await getChannelBySlug(normalizeSlug(handle));
      const broadcasterUserId = normalizeBroadcasterUserId(channel?.broadcaster_user_id);

      if (!broadcasterUserId) {
        throw new Error(`Kick broadcaster not found for @${normalizeSlug(handle)}`);
      }

      return broadcasterUserId;
    },
  };

  async function getAppAccessToken() {
    if (cachedToken && tokenExpiresAt > now()) {
      return cachedToken;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetchImpl(tokenUrl, {
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Kick token request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.access_token) {
      throw new Error("Kick token response did not include an access token");
    }

    cachedToken = payload.access_token;
    tokenExpiresAt = now() + Number(payload.expires_in || 0) * 1000 - TOKEN_EXPIRY_MARGIN_MS;
    return cachedToken;
  }

  async function getChannels(kickSources, token) {
    const channelsBySlug = new Map();

    for (const slug of getUniqueSlugs(kickSources)) {
      const channel = await getChannelBySlug(slug, token);
      if (channel) {
        channelsBySlug.set(slug, channel);
      }
    }

    return kickSources.map((source) => {
      const channel = channelsBySlug.get(source.sourceHandle);
      const stream = channel?.stream;

      if (!stream) {
        return {
          isLive: false,
          platform: "kick",
          sourceHandle: source.sourceHandle,
          sourceId: source.sourceId,
          sourceLabel: source.sourceLabel,
          viewerCount: 0,
        };
      }

      return {
        broadcasterUserId: normalizeBroadcasterUserId(channel.broadcaster_user_id),
        gameName: channel.category?.name || "",
        isLive: stream.is_live === true,
        platform: "kick",
        sourceHandle: source.sourceHandle,
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        startedAt: stream.start_time || "",
        thumbnailUrl: stream.thumbnail || "",
        title: channel.stream_title || "",
        viewerCount: normalizeViewerCount(stream.viewer_count),
      };
    });
  }

  async function getChannelBySlug(slug, token = "") {
    if (!clientId || !clientSecret) {
      throw new Error("Kick credentials are not configured");
    }

    const accessToken = token || await getAppAccessToken();
    const url = new URL(channelsUrl);
    url.searchParams.set("slug", slug);

    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Kick channels request failed with ${response.status}`);
    }

    const payload = await response.json();
    return (payload.data || []).find((item) => String(item.slug || "").toLowerCase() === slug) || null;
  }
}

function getKickSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source.platform === "kick")
    .map((source) => ({
      sourceHandle: normalizeSlug(source.sourceHandle),
      sourceId: source.sourceId || `kick-${source.sourceHandle}`,
      sourceLabel: source.sourceLabel || source.sourceName || source.sourceHandle,
    }))
    .filter((source) => source.sourceHandle);
}

function normalizeSlug(value) {
  return String(value || "").replace(/^@/, "").toLowerCase().trim();
}

function normalizeBroadcasterUserId(value) {
  const id = Number(value || 0);
  if (!Number.isFinite(id) || id <= 0) return 0;
  return Math.round(id);
}

function getUniqueSlugs(sources) {
  return [...new Set(sources.map((source) => source.sourceHandle))];
}

function normalizeViewerCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.round(count));
}
