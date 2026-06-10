const DEFAULT_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const DEFAULT_STREAMS_URL = "https://api.twitch.tv/helix/streams";
const DEFAULT_USERS_URL = "https://api.twitch.tv/helix/users";
const DEFAULT_GLOBAL_BADGES_URL = "https://api.twitch.tv/helix/chat/badges/global";
const DEFAULT_CHANNEL_BADGES_URL = "https://api.twitch.tv/helix/chat/badges";
const DEFAULT_VIDEOS_URL = "https://api.twitch.tv/helix/videos";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export function createTwitchApiClient(options = {}) {
  const clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID ?? "";
  const clientSecret = options.clientSecret ?? process.env.TWITCH_CLIENT_SECRET ?? "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const tokenUrl = options.tokenUrl || DEFAULT_TOKEN_URL;
  const streamsUrl = options.streamsUrl || DEFAULT_STREAMS_URL;
  const usersUrl = options.usersUrl || DEFAULT_USERS_URL;
  const globalBadgesUrl = options.globalBadgesUrl || DEFAULT_GLOBAL_BADGES_URL;
  const channelBadgesUrl = options.channelBadgesUrl || DEFAULT_CHANNEL_BADGES_URL;
  const videosUrl = options.videosUrl || DEFAULT_VIDEOS_URL;

  let cachedToken = "";
  let tokenExpiresAt = 0;

  return {
    async getLiveState(sources) {
      const twitchSources = getTwitchSources(sources);

      if (twitchSources.length === 0) {
        return { providers: { twitch: { status: "no_sources" } }, sources: [] };
      }

      if (!clientId || !clientSecret) {
        return { providers: { twitch: { status: "not_configured" } }, sources: [] };
      }

      try {
        const token = await getAppAccessToken();
        const liveSources = await getStreams(twitchSources, token);
        return { providers: { twitch: { status: "connected" } }, sources: liveSources };
      } catch (error) {
        return {
          providers: {
            twitch: {
              message: error.message || "Twitch request failed",
              status: "error",
            },
          },
          sources: [],
        };
      }
    },

    async getUserId(login) {
      if (!clientId || !clientSecret) {
        return "";
      }

      return getUserIdByLogin(login);
    },

    async getLatestVod(channel) {
      const channelName = String(channel || "").trim().toLowerCase();
      if (!clientId || !clientSecret || !channelName) return null;

      try {
        const token = await getAppAccessToken();
        const userId = await getUserIdByLogin(channelName);
        if (!userId) return null;

        const url = new URL(videosUrl);
        url.searchParams.set("user_id", userId);
        url.searchParams.set("type", "archive");
        url.searchParams.set("first", "1");

        const response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Client-Id": clientId,
          },
        });

        if (!response.ok) return null;
        const payload = await response.json();
        const vod = payload.data?.[0];
        if (!vod) return null;

        return { id: vod.id, title: vod.title || "", duration: vod.duration || "" };
      } catch {
        return null;
      }
    },

    async getChatBadges(channel) {
      const channelName = String(channel || "").trim();

      if (!clientId || !clientSecret) {
        return { badges: {}, channel: channelName, providers: { twitch: { status: "not_configured" } } };
      }

      try {
        const token = await getAppAccessToken();
        const broadcasterId = await getUserIdByLogin(channelName);
        if (!broadcasterId) {
          return { badges: {}, channel: channelName, providers: { twitch: { status: "no_channel" } } };
        }

        const [globalBadges, channelBadges] = await Promise.all([
          getBadges(globalBadgesUrl, token),
          getBadges(withBroadcasterId(channelBadgesUrl, broadcasterId), token),
        ]);

        return {
          badges: buildBadgeMap([...globalBadges, ...channelBadges]),
          channel: channelName,
          providers: { twitch: { status: "connected" } },
        };
      } catch (error) {
        return {
          badges: {},
          channel: channelName,
          providers: {
            twitch: {
              message: error.message || "Twitch badges request failed",
              status: "error",
            },
          },
        };
      }
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
      throw new Error(`Twitch token request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.access_token) {
      throw new Error("Twitch token response did not include an access token");
    }

    cachedToken = payload.access_token;
    tokenExpiresAt = now() + Number(payload.expires_in || 0) * 1000 - TOKEN_EXPIRY_MARGIN_MS;
    return cachedToken;
  }

  async function getUserIdByLogin(login) {
    const token = await getAppAccessToken();
    const url = new URL(usersUrl);
    url.searchParams.set("login", String(login || "").toLowerCase().trim());
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch users request failed with ${response.status}`);
    }

    const payload = await response.json();
    return payload.data?.[0]?.id || "";
  }

  async function getStreams(twitchSources, token) {
    const url = new URL(streamsUrl);
    for (const login of getUniqueLogins(twitchSources)) {
      url.searchParams.append("user_login", login);
    }

    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch streams request failed with ${response.status}`);
    }

    const payload = await response.json();
    const streamByLogin = new Map(
      (payload.data || []).map((stream) => [String(stream.user_login || "").toLowerCase(), stream]),
    );

    return twitchSources.map((source) => {
      const stream = streamByLogin.get(source.sourceHandle);

      if (!stream) {
        return {
          isLive: false,
          platform: "twitch",
          sourceHandle: source.sourceHandle,
          sourceId: source.sourceId,
          sourceLabel: source.sourceLabel,
          viewerCount: 0,
        };
      }

      return {
        gameName: stream.game_name || "",
        isLive: stream.type === "live",
        platform: "twitch",
        sourceHandle: source.sourceHandle,
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        startedAt: stream.started_at || "",
        streamId: stream.id || "",
        thumbnailUrl: stream.thumbnail_url || "",
        title: stream.title || "",
        viewerCount: normalizeViewerCount(stream.viewer_count),
      };
    });
  }

  async function getBadges(url, token) {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch badges request failed with ${response.status}`);
    }

    const payload = await response.json();
    return payload.data || [];
  }
}

function withBroadcasterId(baseUrl, broadcasterId) {
  const url = new URL(baseUrl);
  url.searchParams.set("broadcaster_id", broadcasterId);
  return url;
}

function buildBadgeMap(badgeSets) {
  const badges = {};

  for (const badgeSet of badgeSets) {
    const id = String(badgeSet.set_id || "").trim();
    if (!id) continue;

    for (const version of badgeSet.versions || []) {
      const versionId = String(version.id || "").trim();
      if (!versionId) continue;

      badges[`${id}/${versionId}`] = {
        id,
        imageUrl: version.image_url_2x || version.image_url_1x || "",
        label: toBadgeLabel(id),
        title: version.title || toBadgeLabel(id),
        version: versionId,
      };
    }
  }

  return badges;
}

function toBadgeLabel(id) {
  return String(id || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTwitchSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source.platform === "twitch")
    .map((source) => ({
      sourceHandle: String(source.sourceHandle || "").toLowerCase(),
      sourceId: source.sourceId || `twitch-${source.sourceHandle}`,
      sourceLabel: source.sourceLabel || source.sourceName || source.sourceHandle,
    }))
    .filter((source) => source.sourceHandle);
}

function getUniqueLogins(sources) {
  return [...new Set(sources.map((source) => source.sourceHandle))];
}

function normalizeViewerCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.round(count));
}
