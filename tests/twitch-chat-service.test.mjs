import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTwitchChatService } from "../src/twitch-chat-service.mjs";

describe("twitch chat service", () => {
  it("fans Twitch messages into the backend chat hub", () => {
    const broadcasts = [];
    const connectors = [];
    const service = createTwitchChatService({
      chatHub: {
        broadcast(eventName, payload) {
          broadcasts.push({ eventName, payload });
        },
      },
      connectTwitchChatImpl(channel, handlers) {
        const connector = {
          channel,
          disconnects: 0,
          handlers,
          disconnect() {
            this.disconnects += 1;
          },
        };
        connectors.push(connector);
        handlers.onStatus("connected");
        return connector;
      },
    });

    service.syncSources([
      {
        enabled: true,
        platform: "twitch",
        sourceHandle: "xqc",
        sourceId: "twitch-xqc",
        sourceLabel: "Xtwin",
        sourceName: "Xtwin",
      },
      {
        enabled: true,
        platform: "kick",
        sourceHandle: "xqc",
        sourceId: "kick-xqc",
      },
    ]);
    connectors[0].handlers.onMessage({
      author: "Chatter",
      body: "hello",
      handle: "chatter",
      id: "twitch-message-1",
      platform: "twitch",
      sourceId: "twitch-xqc",
      timestamp: "2026-06-08T10:00:00.000Z",
    });

    assert.deepEqual(service.connectedSourceIds, ["twitch-xqc"]);
    assert.equal(connectors.length, 1);
    assert.equal(connectors[0].channel, "xqc");
    assert.deepEqual(broadcasts, [
      {
        eventName: "chat-status",
        payload: {
          platform: "twitch",
          sourceHandle: "xqc",
          sourceId: "twitch-xqc",
          sourceLabel: "Xtwin",
          status: "connected",
        },
      },
      {
        eventName: "chat",
        payload: {
          author: "Chatter",
          body: "hello",
          handle: "chatter",
          id: "twitch-message-1",
          platform: "twitch",
          sourceId: "twitch-xqc",
          timestamp: "2026-06-08T10:00:00.000Z",
        },
      },
    ]);
  });

  it("stops removed Twitch connectors and leaves unchanged sources alone", () => {
    const connectors = [];
    const service = createTwitchChatService({
      chatHub: {
        broadcast() {},
      },
      connectTwitchChatImpl(channel, handlers) {
        const connector = {
          channel,
          handlers,
          disconnects: 0,
          disconnect() {
            this.disconnects += 1;
          },
        };
        connectors.push(connector);
        return connector;
      },
    });
    const source = {
      enabled: true,
      platform: "twitch",
      sourceHandle: "xqc",
      sourceId: "twitch-xqc",
      sourceLabel: "Xtwin",
      sourceName: "Xtwin",
    };

    service.syncSources([source]);
    service.syncSources([{ ...source }]);
    service.syncSources([]);

    assert.equal(connectors.length, 1);
    assert.equal(connectors[0].disconnects, 1);
    assert.deepEqual(service.connectedSourceIds, []);
  });
});
