import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

const DEFAULT_REPLAY_LIMIT = 1000;
const DEFAULT_RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function createMemoryChatEventStore({
  now = Date.now,
  replayLimit = DEFAULT_REPLAY_LIMIT,
  retentionDays = DEFAULT_RETENTION_DAYS,
} = {}) {
  const events = [];
  let nextId = 1;

  return {
    append(eventName, payload) {
      const event = {
        id: nextId++,
        eventName,
        payload,
        createdAt: now(),
      };

      events.push(event);
      prune();
      return toPublicEvent(event);
    },

    close() {},

    getEventsAfter(lastEventId, options = {}) {
      const limit = normalizeLimit(options.limit, replayLimit);
      return events
        .filter((event) => event.id > Number(lastEventId || 0))
        .slice(-limit)
        .map(toPublicEvent);
    },

    getRecentEvents(options = {}) {
      const limit = normalizeLimit(options.limit, replayLimit);
      return events.slice(-limit).map(toPublicEvent);
    },
  };

  function prune() {
    const cutoff = getRetentionCutoff(now(), retentionDays);
    if (!cutoff) return;

    while (events.length > 0 && events[0].createdAt < cutoff) {
      events.shift();
    }
  }
}

export function createSqliteChatEventStore({
  dbPath,
  now = Date.now,
  replayLimit = DEFAULT_REPLAY_LIMIT,
  retentionDays = DEFAULT_RETENTION_DAYS,
} = {}) {
  if (!dbPath) {
    throw new Error("Chat event DB path is required");
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_events_created_at ON chat_events (created_at);
  `);

  const insertEvent = db.prepare(`
    INSERT INTO chat_events (event_name, payload_json, created_at)
    VALUES (?, ?, ?)
  `);
  const selectRecent = db.prepare(`
    SELECT id, event_name, payload_json
    FROM (
      SELECT id, event_name, payload_json
      FROM chat_events
      ORDER BY id DESC
      LIMIT ?
    )
    ORDER BY id ASC
  `);
  const selectAfter = db.prepare(`
    SELECT id, event_name, payload_json
    FROM (
      SELECT id, event_name, payload_json
      FROM chat_events
      WHERE id > ?
      ORDER BY id DESC
      LIMIT ?
    )
    ORDER BY id ASC
  `);
  const deleteOld = db.prepare("DELETE FROM chat_events WHERE created_at < ?");

  return {
    append(eventName, payload) {
      const createdAt = now();
      const result = insertEvent.run(eventName, JSON.stringify(payload), createdAt);
      prune(createdAt);

      return {
        id: Number(result.lastInsertRowid),
        eventName,
        payload,
      };
    },

    close() {
      db.close();
    },

    getEventsAfter(lastEventId, options = {}) {
      const limit = normalizeLimit(options.limit, replayLimit);
      return selectAfter.all(Number(lastEventId || 0), limit).map(rowToEvent);
    },

    getRecentEvents(options = {}) {
      const limit = normalizeLimit(options.limit, replayLimit);
      return selectRecent.all(limit).map(rowToEvent);
    },
  };

  function prune(timestamp) {
    const cutoff = getRetentionCutoff(timestamp, retentionDays);
    if (cutoff) {
      deleteOld.run(cutoff);
    }
  }
}

function rowToEvent(row) {
  return {
    id: row.id,
    eventName: row.event_name,
    payload: JSON.parse(row.payload_json),
  };
}

function toPublicEvent(event) {
  return {
    id: event.id,
    eventName: event.eventName,
    payload: event.payload,
  };
}

function normalizeLimit(value, fallback) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_REPLAY_LIMIT;
  }

  return Math.max(1, Math.round(limit));
}

function getRetentionCutoff(timestamp, retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) {
    return 0;
  }

  return timestamp - days * MS_PER_DAY;
}
