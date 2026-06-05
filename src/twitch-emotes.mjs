const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const BTTV_GLOBAL_URL = "https://api.betterttv.net/3/cached/emotes/global";
const FFZ_GLOBAL_URL = "https://api.frankerfacez.com/v1/set/global";
const SEVENTV_GLOBAL_URL = "https://7tv.io/v3/emote-sets/global";

export function createTwitchEmoteClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 3_500;
  const now = options.now || Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const twitchClient = options.twitchClient;
  const cache = new Map();

  return {
    async getEmotes(channel) {
      const channelName = normalizeChannel(channel);
      if (!channelName) {
        return emptyResult("");
      }

      const cached = cache.get(channelName);
      if (cached && cached.expiresAt > now()) {
        return cached.value;
      }

      const value = await fetchEmotes(channelName);
      cache.set(channelName, { expiresAt: now() + cacheTtlMs, value });
      return value;
    },
  };

  async function fetchEmotes(channelName) {
    const emotes = {};
    const providers = {
      bttv: { status: "connected" },
      ffz: { status: "connected" },
      seventv: { status: "connected" },
    };
    const userId = await getUserId(channelName, providers);

    await addProviderEmotes(emotes, providers, "seventv", () => fetchSevenTvChannelEmotes(userId));
    await addProviderEmotes(emotes, providers, "seventv", fetchSevenTvGlobalEmotes);
    await addProviderEmotes(emotes, providers, "bttv", () => fetchBetterTtvChannelEmotes(userId));
    await addProviderEmotes(emotes, providers, "bttv", fetchBetterTtvGlobalEmotes);
    await addProviderEmotes(emotes, providers, "ffz", () => fetchFrankerFaceZRoomEmotes(channelName));
    await addProviderEmotes(emotes, providers, "ffz", fetchFrankerFaceZGlobalEmotes);

    return { channel: channelName, emotes, providers };
  }

  async function getUserId(channelName, providers) {
    if (!twitchClient?.getUserId) {
      providers.bttv.status = "global_only";
      providers.seventv.status = "global_only";
      return "";
    }

    try {
      const userId = await twitchClient.getUserId(channelName);
      if (!userId) {
        providers.bttv.status = "global_only";
        providers.seventv.status = "global_only";
      }
      return userId;
    } catch (error) {
      providers.bttv = { message: error.message || "Twitch user lookup failed", status: "global_only" };
      providers.seventv = { message: error.message || "Twitch user lookup failed", status: "global_only" };
      return "";
    }
  }

  async function addProviderEmotes(emotes, providers, providerId, fetcher) {
    try {
      for (const emote of await fetcher()) {
        if (!emote.name || !emote.url || emotes[emote.name]) continue;
        emotes[emote.name] = emote;
      }
    } catch (error) {
      providers[providerId] = {
        message: error.message || `${providerId} emotes failed`,
        status: "error",
      };
    }
  }

  async function fetchBetterTtvGlobalEmotes() {
    const payload = await fetchJson(BTTV_GLOBAL_URL);
    return payload.map(toBetterTtvEmote).filter(Boolean);
  }

  async function fetchBetterTtvChannelEmotes(userId) {
    if (!userId) return [];

    const payload = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(userId)}`);
    return [...(payload.channelEmotes || []), ...(payload.sharedEmotes || [])].map(toBetterTtvEmote).filter(Boolean);
  }

  async function fetchFrankerFaceZGlobalEmotes() {
    return getFrankerFaceZEmotes(await fetchJson(FFZ_GLOBAL_URL));
  }

  async function fetchFrankerFaceZRoomEmotes(channelName) {
    return getFrankerFaceZEmotes(await fetchJson(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(channelName)}`));
  }

  async function fetchSevenTvGlobalEmotes() {
    const payload = await fetchJson(SEVENTV_GLOBAL_URL);
    return getSevenTvEmotes(payload.emotes || []);
  }

  async function fetchSevenTvChannelEmotes(userId) {
    if (!userId) return [];

    const payload = await fetchJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(userId)}`);
    return getSevenTvEmotes(payload.emote_set?.emotes || []);
  }

  async function fetchJson(url) {
    const response = await fetchImpl(url, getFetchOptions(fetchTimeoutMs));
    if (!response.ok) {
      throw new Error(`${url} failed with ${response.status}`);
    }

    return response.json();
  }
}

function getFetchOptions(timeoutMs) {
  if (!globalThis.AbortSignal?.timeout) {
    return {};
  }

  return { signal: AbortSignal.timeout(timeoutMs) };
}

function toBetterTtvEmote(emote) {
  if (!emote?.code || !emote?.id) return null;
  return {
    name: emote.code,
    provider: "bttv",
    url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
  };
}

function getFrankerFaceZEmotes(payload) {
  return Object.values(payload.sets || {})
    .flatMap((set) => set.emoticons || [])
    .map((emote) => {
      const url = emote.urls?.[2] || emote.urls?.["2"] || emote.urls?.[1] || emote.urls?.["1"];
      if (!emote.name || !url) return null;
      return {
        name: emote.name,
        provider: "ffz",
        url: normalizeProtocolUrl(url),
      };
    })
    .filter(Boolean);
}

function getSevenTvEmotes(emotes) {
  return emotes
    .map((emote) => {
      const hostUrl = emote.data?.host?.url;
      if (!emote.name || !hostUrl) return null;
      return {
        name: emote.name,
        provider: "7TV",
        url: `${normalizeProtocolUrl(hostUrl)}/2x.webp`,
      };
    })
    .filter(Boolean);
}

function normalizeProtocolUrl(url) {
  const value = String(url || "");
  return value.startsWith("//") ? `https:${value}` : value;
}

function normalizeChannel(channel) {
  return String(channel || "").replace(/^#|@/g, "").toLowerCase().trim();
}

function emptyResult(channel) {
  return {
    channel,
    emotes: {},
    providers: {
      bttv: { status: "no_channel" },
      ffz: { status: "no_channel" },
      seventv: { status: "no_channel" },
    },
  };
}
