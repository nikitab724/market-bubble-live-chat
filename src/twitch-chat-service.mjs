import { connectTwitchChat } from "./twitch-connector.mjs";

export function createTwitchChatService({
  chatHub,
  connectTwitchChatImpl = connectTwitchChat,
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
      const nextSources = getTwitchSources(sources);

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
    try {
      const connection = connectTwitchChatImpl(source.sourceHandle, {
        source,
        onMessage(message) {
          chatHub?.broadcast("chat", message);
        },
        onStatus(status) {
          broadcastStatus(source, status);
        },
      });

      connections.set(source.sourceId, {
        connection,
        key: getSourceConnectionKey(source),
      });
    } catch {
      broadcastStatus(source, "disconnected");
    }
  }

  function stopSource(sourceId) {
    const entry = connections.get(sourceId);
    if (!entry) return;

    entry.connection?.disconnect?.();
    connections.delete(sourceId);
  }

  function broadcastStatus(source, status) {
    chatHub?.broadcast("chat-status", {
      platform: "twitch",
      sourceHandle: source.sourceHandle,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel || source.sourceName,
      status,
    });
  }
}

function getTwitchSources(sources) {
  return new Map(
    (Array.isArray(sources) ? sources : [])
      .filter((source) => source.platform === "twitch" && source.enabled !== false && source.sourceHandle)
      .map((source) => [source.sourceId, source]),
  );
}

function getSourceConnectionKey(source) {
  return [
    source.sourceId,
    source.sourceHandle,
    source.sourceLabel || "",
    source.sourceName || "",
  ].join("|");
}
