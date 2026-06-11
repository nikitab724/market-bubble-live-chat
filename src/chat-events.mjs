import { createMemoryChatEventStore } from "./chat-event-store.mjs";

const DEFAULT_REPLAY_LIMIT = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;

export function createChatEventHub({
  eventStore,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  replayLimit = DEFAULT_REPLAY_LIMIT,
} = {}) {
  const clients = new Set();
  const store = eventStore || createMemoryChatEventStore({ replayLimit });

  return {
    get clientCount() {
      return clients.size;
    },

    connect(response, request = {}) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      response.write(": connected\n\n");

      const client = {
        heartbeatTimer: startHeartbeat(response),
        response,
      };

      clients.add(client);
      response.on("close", () => disconnectClient(client));
      replayMissedEvents(response, getLastEventId(request));

      return response;
    },

    broadcast(eventName, payload) {
      const event = store.append(eventName, payload);
      const eventText = formatStoredEvent(event);

      for (const client of clients) {
        writeEvent(client, eventText);
      }
    },

    clearEvents() {
      store.clear?.();
    },
  };

  function replayMissedEvents(response, lastEventId) {
    const events = lastEventId >= 0
      ? store.getEventsAfter(lastEventId, { limit: replayLimit })
      : store.getRecentEvents({ limit: replayLimit });

    for (const event of events) {
      response.write(formatStoredEvent(event));
    }
  }

  function writeEvent(client, event) {
    try {
      client.response.write(event);
    } catch {
      disconnectClient(client);
    }
  }

  function startHeartbeat(response) {
    if (!heartbeatIntervalMs) {
      return null;
    }

    const timer = setInterval(() => {
      try {
        response.write(": keep-alive\n\n");
      } catch {
        clearInterval(timer);
      }
    }, heartbeatIntervalMs);

    timer.unref?.();
    return timer;
  }

  function disconnectClient(client) {
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
    }

    clients.delete(client);
  }
}

export function formatSseEvent(eventName, payload, id = "") {
  const idLine = id ? `id: ${id}\n` : "";
  return `${idLine}event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function formatStoredEvent(event) {
  return formatSseEvent(event.eventName, event.payload, event.id);
}

function getLastEventId(request) {
  const headerValue = getHeader(request.headers || {}, "last-event-id");
  const id = Number.parseInt(headerValue, 10);
  return Number.isFinite(id) && id >= 0 ? id : -1;
}

function getHeader(headers, name) {
  if (typeof headers.get === "function") {
    return headers.get(name) || "";
  }

  return headers[name] || headers[name.toLowerCase()] || "";
}
