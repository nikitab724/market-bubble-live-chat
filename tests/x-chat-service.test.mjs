import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createXChatService } from "../src/x-chat-service.mjs";

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.listeners = new Map();
    FakeSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  send(frame) {
    this.sent.push(frame);
  }

  close() {
    this.closed = true;
    this.emit("close");
  }

  emit(type, event) {
    this.listeners.get(type)?.(event);
  }
}
FakeSocket.instances = [];

function createChatHubSpy() {
  const events = [];
  return {
    events,
    broadcast(eventName, payload) {
      events.push({ eventName, payload });
    },
  };
}

function buildFrame(body, username) {
  return JSON.stringify({
    kind: 1,
    payload: JSON.stringify({
      body: JSON.stringify({ body, username, uuid: `${username}-${body}`, timestamp: 1700000000000 }),
      kind: 1,
    }),
  });
}

const xSource = {
  platform: "x",
  enabled: true,
  broadcastId: "1abc",
  sourceId: "x-banks",
  sourceName: "Banks",
  sourceHandle: "banks",
  sourceLabel: "Banks",
};

afterEach(() => {
  FakeSocket.instances.length = 0;
});

describe("x chat service", () => {
  it("connects X broadcast sources, sends subscribe frames, and fans messages into the hub", async () => {
    const chatHub = createChatHubSpy();
    const bootstrap = {
      accessToken: "tok",
      broadcastId: "1abc",
      endpoint: "https://chatman.pscp.tv",
    };
    const apiClient = { bootstrapBroadcast: async () => bootstrap };

    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });
    service.syncSources([xSource]);

    // bootstrap is async; let the microtask queue drain
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(FakeSocket.instances.length, 1);
    const socket = FakeSocket.instances[0];
    assert.equal(socket.url, "wss://chatman.pscp.tv/chatapi/v1/chatnow");

    socket.emit("open");
    assert.equal(socket.sent.length, 2);
    assert.equal(JSON.parse(socket.sent[0]).kind, 3);
    assert.equal(JSON.parse(socket.sent[1]).kind, 2);

    socket.emit("message", { data: buildFrame("send it", "trader") });

    const chatMessages = chatHub.events.filter((event) => event.eventName === "chat");
    assert.equal(chatMessages.length, 1);
    assert.equal(chatMessages[0].payload.platform, "x");
    assert.equal(chatMessages[0].payload.author, "trader");
    assert.equal(chatMessages[0].payload.body, "send it");
    assert.equal(chatMessages[0].payload.sourceId, "x-banks");

    const statuses = chatHub.events.filter((event) => event.eventName === "chat-status").map((event) => event.payload.status);
    assert.deepEqual(statuses, ["connecting", "connected"]);
    assert.deepEqual(service.connectedSourceIds, ["x-banks"]);
  });

  it("ignores X sources without a resolvable broadcast id", async () => {
    const chatHub = createChatHubSpy();
    const apiClient = { bootstrapBroadcast: async () => ({}) };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });

    service.syncSources([
      { platform: "x", enabled: true, sourceId: "x-z", sourceName: "Z", sourceHandle: "z", conversationId: "2062574325970973093" },
    ]);
    await Promise.resolve();

    assert.equal(FakeSocket.instances.length, 0);
    assert.deepEqual(service.connectedSourceIds, []);
  });

  it("disconnects a source when it is removed from config", async () => {
    const chatHub = createChatHubSpy();
    const apiClient = { bootstrapBroadcast: async () => ({ accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv" }) };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });

    service.syncSources([xSource]);
    await Promise.resolve();
    await Promise.resolve();
    const socket = FakeSocket.instances[0];
    socket.emit("open");

    service.syncSources([]);
    assert.equal(socket.closed, true);
    assert.deepEqual(service.connectedSourceIds, []);
  });

  it("tracks occupancy frames into live state without spamming the hub", async () => {
    const chatHub = createChatHubSpy();
    const apiClient = {
      bootstrapBroadcast: async () => ({ accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv" }),
    };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });

    service.syncSources([xSource]);
    await Promise.resolve();
    await Promise.resolve();
    const socket = FakeSocket.instances[0];
    socket.emit("open");

    socket.emit("message", {
      data: JSON.stringify({
        kind: 2,
        payload: JSON.stringify({
          kind: 4,
          sender: { user_id: "" },
          body: JSON.stringify({ room: "1abc", occupancy: 108, total_participants: 132 }),
        }),
      }),
    });

    assert.deepEqual(service.getLiveState(), {
      providers: { x: { status: "connected" } },
      sources: [
        {
          isLive: true,
          platform: "x",
          sourceHandle: "banks",
          sourceId: "x-banks",
          sourceLabel: "Banks",
          viewerCount: 108,
        },
      ],
    });

    // Occupancy ticks stay in memory; they are not chat messages and must not
    // pollute the persisted chat-status event log.
    assert.equal(chatHub.events.filter((event) => event.eventName === "chat").length, 0);
    assert.deepEqual(
      chatHub.events.filter((event) => event.eventName === "chat-status").map((event) => event.payload.status),
      ["connecting", "connected"],
    );

    service.stop();
  });

  it("reports connecting before the socket opens and no_sources when idle", async () => {
    const chatHub = createChatHubSpy();
    const apiClient = {
      bootstrapBroadcast: async () => ({ accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv" }),
    };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });

    assert.deepEqual(service.getLiveState(), { providers: { x: { status: "no_sources" } }, sources: [] });

    service.syncSources([xSource]);
    assert.deepEqual(service.getLiveState(), { providers: { x: { status: "connecting" } }, sources: [] });

    service.stop();
  });

  it("does not open replay chat for an ended broadcast and reports it offline", async () => {
    const chatHub = createChatHubSpy();
    const apiClient = {
      bootstrapBroadcast: async () => ({ accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv", isLive: false }),
    };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket });

    service.syncSources([xSource]);
    await Promise.resolve();
    await Promise.resolve();

    // Ended broadcasts keep a joinable replay chat room with occupancy, so
    // connecting would report stale replay watchers as a live stream.
    assert.equal(FakeSocket.instances.length, 0);
    assert.deepEqual(service.getLiveState().sources, [
      {
        isLive: false,
        platform: "x",
        sourceHandle: "banks",
        sourceId: "x-banks",
        sourceLabel: "Banks",
        viewerCount: 0,
      },
    ]);

    service.stop();
  });

  it("flips live-state offline when a live broadcast ends and the socket drops", async () => {
    const chatHub = createChatHubSpy();
    let live = true;
    const apiClient = {
      bootstrapBroadcast: async () => ({ accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv", isLive: live }),
    };
    const service = createXChatService({ apiClient, chatHub, reconnectDelayMs: 1, WebSocketImpl: FakeSocket });

    service.syncSources([xSource]);
    await Promise.resolve();
    await Promise.resolve();
    const socket = FakeSocket.instances[0];
    socket.emit("open");
    assert.equal(service.getLiveState().sources[0].isLive, true);

    live = false;
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(FakeSocket.instances.length, 1);
    assert.deepEqual(service.getLiveState().sources, [
      {
        isLive: false,
        platform: "x",
        sourceHandle: "banks",
        sourceId: "x-banks",
        sourceLabel: "Banks",
        viewerCount: 0,
      },
    ]);

    service.stop();
  });

  it("schedules a reconnect with a fresh bootstrap when the socket closes", async () => {
    const chatHub = createChatHubSpy();
    let bootstrapCount = 0;
    const apiClient = {
      bootstrapBroadcast: async () => {
        bootstrapCount += 1;
        return { accessToken: "t", broadcastId: "1abc", endpoint: "https://c.pscp.tv" };
      },
    };
    const service = createXChatService({ chatHub, apiClient, WebSocketImpl: FakeSocket, reconnectDelayMs: 0 });

    service.syncSources([xSource]);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(bootstrapCount, 1);

    FakeSocket.instances[0].emit("open");
    FakeSocket.instances[0].emit("close");

    // reconnect timer (0ms) plus async bootstrap
    await new Promise((resolve) => setTimeout(resolve, 5));
    await Promise.resolve();
    assert.equal(bootstrapCount, 2);

    const statuses = chatHub.events.filter((event) => event.eventName === "chat-status").map((event) => event.payload.status);
    assert.deepEqual(statuses, ["connecting", "connected", "disconnected", "connecting"]);

    service.stop();
  });
});
