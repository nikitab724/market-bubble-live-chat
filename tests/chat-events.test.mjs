import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import { createMemoryChatEventStore } from "../src/chat-event-store.mjs";
import { createChatEventHub, formatSseEvent } from "../src/chat-events.mjs";

describe("chat event hub", () => {
  it("formats named server-sent events", () => {
    assert.equal(
      formatSseEvent("chat", { body: "hello\nworld" }),
      'event: chat\ndata: {"body":"hello\\nworld"}\n\n',
    );
  });

  it("broadcasts chat events to connected responses", () => {
    const hub = createChatEventHub({ heartbeatIntervalMs: 0 });
    const response = new FakeResponse();

    hub.connect(response);
    assert.equal(response.headers["Content-Type"], "text/event-stream; charset=utf-8");
    assert.equal(hub.clientCount, 1);

    hub.broadcast("chat", { body: "Kick message" });
    assert.equal(response.writes.at(-1), 'id: 1\nevent: chat\ndata: {"body":"Kick message"}\n\n');

    response.emit("close");
    assert.equal(hub.clientCount, 0);
  });

  it("replays missed chat events after the browser reconnects", () => {
    const hub = createChatEventHub({ heartbeatIntervalMs: 0, replayLimit: 5 });
    const firstResponse = new FakeResponse();

    hub.connect(firstResponse);
    hub.broadcast("chat", { body: "one" });
    hub.broadcast("chat", { body: "two" });
    firstResponse.emit("close");

    hub.broadcast("chat", { body: "three" });
    hub.broadcast("chat", { body: "four" });

    const reconnectedResponse = new FakeResponse();
    hub.connect(reconnectedResponse, {
      headers: {
        "last-event-id": "2",
      },
    });

    assert.deepEqual(reconnectedResponse.writes.slice(1), [
      'id: 3\nevent: chat\ndata: {"body":"three"}\n\n',
      'id: 4\nevent: chat\ndata: {"body":"four"}\n\n',
    ]);
  });

  it("replays buffered chat events to a new browser connection", () => {
    const hub = createChatEventHub({ heartbeatIntervalMs: 0, replayLimit: 5 });

    hub.broadcast("chat", { body: "before connect" });

    const response = new FakeResponse();
    hub.connect(response);

    assert.deepEqual(response.writes.slice(1), [
      'id: 1\nevent: chat\ndata: {"body":"before connect"}\n\n',
    ]);
  });

  it("replays stored events after a hub restart", () => {
    const eventStore = createMemoryChatEventStore({ replayLimit: 5 });
    const firstHub = createChatEventHub({ eventStore, heartbeatIntervalMs: 0, replayLimit: 5 });

    firstHub.broadcast("chat", { body: "before restart" });

    const restartedHub = createChatEventHub({ eventStore, heartbeatIntervalMs: 0, replayLimit: 5 });
    const response = new FakeResponse();
    restartedHub.connect(response);

    assert.deepEqual(response.writes.slice(1), [
      'id: 1\nevent: chat\ndata: {"body":"before restart"}\n\n',
    ]);
  });
});

class FakeResponse extends EventEmitter {
  headers = {};
  writes = [];

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  write(chunk) {
    this.writes.push(chunk);
  }
}
