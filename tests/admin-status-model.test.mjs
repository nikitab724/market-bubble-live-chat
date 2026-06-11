import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeSourceStatus } from "../admin/status-model.mjs";

const NOW = Date.parse("2026-06-10T20:00:00Z");

function statusFor(overrides = {}) {
  return describeSourceStatus({
    platform: "twitch",
    enabled: true,
    handle: "marketbubble",
    sourceId: "twitch-marketbubble",
    dirty: false,
    broadcastId: "",
    provider: { status: "connected" },
    live: null,
    connectorStatus: "",
    lastChatAt: 0,
    now: NOW,
    ...overrides,
  });
}

describe("admin source status model", () => {
  it("asks for a save before anything else when the row has unsaved edits", () => {
    assert.deepEqual(
      statusFor({ dirty: true, live: { isLive: true, viewerCount: 9 } }),
      { tone: "pending", text: "Save to connect" },
    );
  });

  it("treats a handle that was never saved as unsaved edits", () => {
    assert.deepEqual(
      statusFor({ sourceId: "", dirty: true }),
      { tone: "pending", text: "Save to connect" },
    );
  });

  it("shows an empty row as not connected", () => {
    assert.deepEqual(statusFor({ handle: "" }), { tone: "muted", text: "Not connected" });
  });

  it("shows a disabled row as off", () => {
    assert.deepEqual(statusFor({ enabled: false }), { tone: "muted", text: "Off" });
  });

  it("says which provider credentials the server is missing", () => {
    assert.deepEqual(
      statusFor({ provider: { status: "not_configured" } }),
      { tone: "warn", text: "Needs Twitch credentials on the server" },
    );
    assert.deepEqual(
      statusFor({ platform: "kick", provider: { status: "not_configured" } }),
      { tone: "warn", text: "Needs Kick credentials on the server" },
    );
  });

  it("shows live with a formatted watcher count", () => {
    assert.deepEqual(
      statusFor({ live: { isLive: true, viewerCount: 4321 } }),
      { tone: "live", text: "Live · 4,321 watching" },
    );
  });

  it("shows chat activity from the last two minutes", () => {
    assert.deepEqual(
      statusFor({ lastChatAt: NOW - 30_000 }),
      { tone: "live", text: "Chat active" },
    );
    assert.deepEqual(
      statusFor({ lastChatAt: NOW - 10 * 60_000 }),
      { tone: "muted", text: "Offline" },
    );
  });

  it("shows a definitively offline stream as offline even while its chat is busy", () => {
    assert.deepEqual(
      statusFor({ connectorStatus: "connected", lastChatAt: NOW - 30_000, live: { isLive: false, viewerCount: 0 } }),
      { tone: "muted", text: "Offline" },
    );
  });

  it("maps connector states to plain language", () => {
    assert.deepEqual(
      statusFor({ connectorStatus: "connected" }),
      { tone: "ok", text: "Connected, waiting for chat…" },
    );
    assert.deepEqual(
      statusFor({ connectorStatus: "connecting" }),
      { tone: "pending", text: "Connecting…" },
    );
    assert.deepEqual(
      statusFor({ connectorStatus: "disconnected" }),
      { tone: "warn", text: "Reconnecting…" },
    );
  });

  it("prefers the live watcher count over connector chatter", () => {
    assert.deepEqual(
      statusFor({ connectorStatus: "connected", live: { isLive: true, viewerCount: 12 } }),
      { tone: "live", text: "Live · 12 watching" },
    );
  });

  it("tells an X row without a broadcast how to connect through the extension", () => {
    assert.deepEqual(
      statusFor({ platform: "x", provider: null, broadcastId: "" }),
      { tone: "muted", text: "Go live, then open your X live page in Chrome with the extension" },
    );
    // With a captured broadcast id the connector states speak instead.
    assert.deepEqual(
      statusFor({ platform: "x", provider: null, broadcastId: "1yKAPPboWlDxb" }),
      { tone: "muted", text: "Offline" },
    );
  });

  it("warns when the live-state check itself fails", () => {
    assert.deepEqual(
      statusFor({ provider: { status: "error" } }),
      { tone: "warn", text: "Can’t check live status" },
    );
  });

  it("shows the site chat room as ready", () => {
    assert.deepEqual(
      statusFor({ platform: "room", provider: null }),
      { tone: "ok", text: "Ready" },
    );
  });
});
