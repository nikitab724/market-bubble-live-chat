import {
  buildChatSocketUrl,
  buildChatSubscribeFrames,
  createXApiClient,
  getSourceBroadcastId,
  normalizeXBroadcastMessage,
} from "./x-api.mjs";

const RECONNECT_DELAY_MS = 8000;

// Server-managed pool of X (Periscope) broadcast chat connections, one per
// enabled X source that resolves to a broadcast id. Mirrors the Twitch chat
// service: it fans normalized messages and status into the shared SSE hub so
// X chat uses the same delivery path as Twitch and Kick. The Chrome extension
// bridge stays available as a fallback for sources without a broadcast id.
export function createXChatService({
  chatHub,
  apiClient = createXApiClient(),
  WebSocketImpl = globalThis.WebSocket,
  reconnectDelayMs = RECONNECT_DELAY_MS,
} = {}) {
  const connections = new Map();

  return {
    get connectedSourceIds() {
      return [...connections.keys()].sort();
    },

    stop() {
      for (const sourceId of [...connections.keys()]) {
        stopSource(sourceId);
      }
    },

    syncSources(sources) {
      const nextSources = getXBroadcastSources(sources);

      for (const [sourceId, entry] of connections) {
        const nextSource = nextSources.get(sourceId);
        if (!nextSource || getSourceConnectionKey(nextSource) !== entry.key) {
          stopSource(sourceId);
        }
      }

      for (const source of nextSources.values()) {
        if (!connections.has(source.sourceId)) {
          startSource(source);
        }
      }
    },
  };

  function startSource(source) {
    const entry = {
      active: true,
      key: getSourceConnectionKey(source),
      reconnectTimer: null,
      socket: null,
    };
    connections.set(source.sourceId, entry);
    broadcastStatus(source, "connecting");
    openConnection(source, entry);
  }

  async function openConnection(source, entry) {
    const broadcastId = getSourceBroadcastId(source);

    try {
      const bootstrap = await apiClient.bootstrapBroadcast(broadcastId);
      if (!entry.active) {
        return;
      }

      const socket = new WebSocketImpl(buildChatSocketUrl(bootstrap.endpoint));
      entry.socket = socket;

      socket.addEventListener("open", () => {
        for (const frame of buildChatSubscribeFrames(bootstrap)) {
          socket.send(frame);
        }
        broadcastStatus(source, "connected");
      });

      socket.addEventListener("message", (event) => {
        handleSocketMessage(source, event);
      });

      socket.addEventListener("error", () => {
        socket.close();
      });

      socket.addEventListener("close", () => {
        entry.socket = null;
        if (entry.active) {
          scheduleReconnect(source, entry);
        }
      });
    } catch {
      if (entry.active) {
        scheduleReconnect(source, entry);
      }
    }
  }

  function handleSocketMessage(source, event) {
    const raw = typeof event.data === "string" ? event.data : String(event.data || "");

    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    const message = normalizeXBroadcastMessage(frame, source);
    if (message) {
      chatHub?.broadcast("chat", message);
    }
  }

  function scheduleReconnect(source, entry) {
    if (entry.reconnectTimer) {
      return;
    }

    broadcastStatus(source, "disconnected");
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      if (entry.active) {
        broadcastStatus(source, "connecting");
        openConnection(source, entry);
      }
    }, reconnectDelayMs);
    entry.reconnectTimer.unref?.();
  }

  function stopSource(sourceId) {
    const entry = connections.get(sourceId);
    if (!entry) {
      return;
    }

    entry.active = false;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }
    entry.socket?.close?.();
    connections.delete(sourceId);
  }

  function broadcastStatus(source, status) {
    chatHub?.broadcast("chat-status", {
      platform: "x",
      sourceHandle: source.sourceHandle,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel || source.sourceName,
      status,
    });
  }
}

function getXBroadcastSources(sources) {
  return new Map(
    (Array.isArray(sources) ? sources : [])
      .filter((source) => source.platform === "x" && source.enabled !== false && getSourceBroadcastId(source))
      .map((source) => [source.sourceId, source]),
  );
}

function getSourceConnectionKey(source) {
  return [
    source.sourceId,
    getSourceBroadcastId(source),
    source.sourceLabel || "",
    source.sourceName || "",
  ].join("|");
}
