import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createSqliteChatEventStore } from "../src/chat-event-store.mjs";

describe("chat event store", () => {
  it("persists chat events with ordered ids and replays after an id", async () => {
    const store = await createTempStore();

    try {
      const first = store.append("chat", { body: "one" });
      const second = store.append("chat-status", { status: "connected" });

      assert.equal(first.id, 1);
      assert.equal(second.id, 2);
      assert.deepEqual(store.getEventsAfter(1), [
        {
          id: 2,
          eventName: "chat-status",
          payload: { status: "connected" },
        },
      ]);
    } finally {
      store.close();
    }
  });

  it("replays the latest stored window in chronological order", async () => {
    const store = await createTempStore({ replayLimit: 2 });

    try {
      store.append("chat", { body: "one" });
      store.append("chat", { body: "two" });
      store.append("chat", { body: "three" });

      assert.deepEqual(store.getRecentEvents(), [
        { id: 2, eventName: "chat", payload: { body: "two" } },
        { id: 3, eventName: "chat", payload: { body: "three" } },
      ]);
    } finally {
      store.close();
    }
  });

  it("keeps events available after the store is reopened", async () => {
    const dbPath = await createTempDbPath();
    const firstStore = createSqliteChatEventStore({ dbPath });

    firstStore.append("chat", { body: "before restart" });
    firstStore.close();

    const reopenedStore = createSqliteChatEventStore({ dbPath });
    try {
      assert.deepEqual(reopenedStore.getEventsAfter(0), [
        { id: 1, eventName: "chat", payload: { body: "before restart" } },
      ]);
    } finally {
      reopenedStore.close();
    }
  });

  it("removes events older than the retention window", async () => {
    let now = Date.parse("2026-06-08T12:00:00.000Z");
    const store = await createTempStore({
      now: () => now,
      retentionDays: 1,
      replayLimit: 10,
    });

    try {
      store.append("chat", { body: "old" });
      now += 25 * 60 * 60 * 1000;
      store.append("chat", { body: "new" });

      assert.deepEqual(store.getEventsAfter(0), [
        { id: 2, eventName: "chat", payload: { body: "new" } },
      ]);
    } finally {
      store.close();
    }
  });
});

async function createTempStore(options = {}) {
  return createSqliteChatEventStore({
    dbPath: await createTempDbPath(),
    ...options,
  });
}

async function createTempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "mb-chat-store-"));
  return join(dir, "chat-events.sqlite");
}
