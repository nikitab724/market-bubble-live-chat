export async function loadPublicConfig({ fetchImpl = fetch, fallbackSources }) {
  try {
    const response = await fetchImpl("/api/public-config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Config request failed");
    }

    const config = await response.json();
    if (Array.isArray(config.sources) && config.sources.length > 0) {
      return config.sources;
    }
  } catch {
    return fallbackSources.map((source) => ({ ...source }));
  }

  return fallbackSources.map((source) => ({ ...source }));
}

export async function loadTwitchEmotes({ fetchImpl = fetch, sources, state, queueRender }) {
  const twitchSources = sources.filter((source) => source.platform === "twitch");

  await Promise.all(
    twitchSources.map(async (source) => {
      try {
        const response = await fetchImpl(`/api/twitch-emotes?channel=${encodeURIComponent(source.sourceHandle)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json();
        state.twitchEmotes[source.sourceId] = payload.emotes || {};
        queueRender();
      } catch {
        // Text chat still works if a third-party emote provider is unavailable.
      }
    }),
  );
}

export async function loadTwitchBadges({ fetchImpl = fetch, sources, state, queueRender }) {
  const twitchSources = sources.filter((source) => source.platform === "twitch");

  await Promise.all(
    twitchSources.map(async (source) => {
      try {
        const response = await fetchImpl(`/api/twitch-badges?channel=${encodeURIComponent(source.sourceHandle)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json();
        state.twitchBadges[source.sourceId] = payload.badges || {};
        queueRender();
      } catch {
        // Text badges still render if Twitch badge art cannot be loaded.
      }
    }),
  );
}

export function startBackendChatEvents({ window, addBackendMessage, updateBackendChatStatus }) {
  if (!("EventSource" in window)) return null;

  const events = new window.EventSource("/api/chat-events");
  events.addEventListener("chat", (event) => {
    addBackendMessage(JSON.parse(event.data));
  });
  events.addEventListener("chat-status", (event) => {
    updateBackendChatStatus(JSON.parse(event.data));
  });

  return events;
}

export async function refreshLiveState({ fetchImpl = fetch, state, queueRender }) {
  try {
    const response = await fetchImpl("/api/live-state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Live state request failed");
    }

    const liveState = await response.json();
    if (!Array.isArray(liveState.sources) || liveState.sources.length === 0) {
      return;
    }

    const liveSourceById = new Map(liveState.sources.map((source) => [source.sourceId, source]));
    state.sources = state.sources.map((source) => {
      const liveSource = liveSourceById.get(source.sourceId);
      if (!liveSource) {
        return source;
      }

      return {
        ...source,
        gameName: liveSource.gameName || "",
        isLive: liveSource.isLive === true,
        startedAt: liveSource.startedAt || "",
        streamTitle: liveSource.title || "",
        thumbnailUrl: liveSource.thumbnailUrl || "",
        viewerCount: Number(liveSource.viewerCount || 0),
        viewerCountLocked: true,
      };
    });
    queueRender();
  } catch {
    // Keep configured or fallback values when live providers are unavailable.
  }
}
