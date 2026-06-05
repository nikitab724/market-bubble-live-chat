import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import { createChatEventHub, formatSseEvent } from "../src/chat-events.mjs";

describe("chat event hub", () => {
  it("formats named server-sent events", () => {
    assert.equal(
      formatSseEvent("chat", { body: "hello\nworld" }),
      'event: chat\ndata: {"body":"hello\\nworld"}\n\n',
    );
  });

  it("broadcasts chat events to connected responses", () => {
    const hub = createChatEventHub();
    const response = new FakeResponse();

    hub.connect(response);
    assert.equal(response.headers["Content-Type"], "text/event-stream; charset=utf-8");
    assert.equal(hub.clientCount, 1);

    hub.broadcast("chat", { body: "Kick message" });
    assert.equal(response.writes.at(-1), 'event: chat\ndata: {"body":"Kick message"}\n\n');

    response.emit("close");
    assert.equal(hub.clientCount, 0);
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
