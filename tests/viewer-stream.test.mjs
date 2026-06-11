import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachTwitchAutoResume, getSelectedStreamSource, getStreamSelectionKey } from "../src/viewer-stream.mjs";

describe("stream selection", () => {
  const twitch = { platform: "twitch", sourceId: "twitch-xqc", sourceHandle: "xqc", sourceLabel: "Xtwin" };
  const kick = { platform: "kick", sourceId: "kick-xqc", sourceHandle: "xqc", sourceLabel: "Xbob" };

  it("selects the showStream source, falling back twitch-first", () => {
    assert.equal(getSelectedStreamSource([twitch, { ...kick, showStream: true }]).sourceId, "kick-xqc");
    assert.equal(getSelectedStreamSource([kick, twitch]).sourceId, "twitch-xqc");
  });

  it("keys the selected stream by identity, not labels", () => {
    const before = getStreamSelectionKey([{ ...twitch, showStream: true }, kick]);
    const relabeled = getStreamSelectionKey([{ ...twitch, showStream: true, sourceLabel: "Renamed" }, kick]);

    assert.notEqual(before, "");
    assert.equal(before, relabeled);
  });

  it("changes the key when the shown stream moves to another source", () => {
    const twitchShown = getStreamSelectionKey([{ ...twitch, showStream: true }, kick]);
    const kickShown = getStreamSelectionKey([twitch, { ...kick, showStream: true }]);

    assert.notEqual(twitchShown, kickShown);
  });

  it("changes the key when the selected source's handle or X conversation changes", () => {
    const before = getStreamSelectionKey([{ ...twitch, showStream: true }]);
    const rehandled = getStreamSelectionKey([{ ...twitch, showStream: true, sourceHandle: "fazebanks" }]);
    assert.notEqual(before, rehandled);

    const x = { platform: "x", sourceId: "x-banks", sourceHandle: "banks", showStream: true };
    assert.notEqual(
      getStreamSelectionKey([{ ...x, conversationId: "111" }]),
      getStreamSelectionKey([{ ...x, conversationId: "222" }]),
    );
  });

  it("returns an empty key when there are no sources", () => {
    assert.equal(getStreamSelectionKey([]), "");
  });
});

describe("twitch player auto-resume", () => {
  function fakeDocument() {
    const listeners = new Map();
    return {
      visibilityState: "visible",
      addEventListener(type, cb) { listeners.set(cb, type); },
      removeEventListener(type, cb) { listeners.delete(cb); },
      dispatch() { for (const cb of [...listeners.keys()]) cb(); },
      listenerCount: () => listeners.size,
    };
  }

  function fakePlayer() {
    const handlers = new Map();
    return {
      playCalls: 0,
      addEventListener(event, cb) { handlers.set(event, cb); },
      emit(event) { handlers.get(event)?.(); },
      play() { this.playCalls += 1; },
    };
  }

  const fakeWindow = { Twitch: { Player: { PAUSE: "pause", PLAY: "play" } } };

  it("resumes a stream that paused while the tab was hidden", () => {
    const document = fakeDocument();
    const player = fakePlayer();
    attachTwitchAutoResume({ document, window: fakeWindow, player, container: { isConnected: true } });

    document.visibilityState = "hidden";
    player.emit("pause");
    document.visibilityState = "visible";
    document.dispatch();

    assert.equal(player.playCalls, 1);

    // A later unrelated visibility flip does not replay it.
    document.dispatch();
    assert.equal(player.playCalls, 1);
  });

  it("leaves a stream alone when the viewer paused it while visible", () => {
    const document = fakeDocument();
    const player = fakePlayer();
    attachTwitchAutoResume({ document, window: fakeWindow, player, container: { isConnected: true } });

    player.emit("pause");
    document.visibilityState = "hidden";
    document.visibilityState = "visible";
    document.dispatch();

    assert.equal(player.playCalls, 0);
  });

  it("does not resume when the player already resumed itself while hidden", () => {
    const document = fakeDocument();
    const player = fakePlayer();
    attachTwitchAutoResume({ document, window: fakeWindow, player, container: { isConnected: true } });

    document.visibilityState = "hidden";
    player.emit("pause");
    player.emit("play");
    document.visibilityState = "visible";
    document.dispatch();

    assert.equal(player.playCalls, 0);
  });

  it("detaches its visibility listener once the player leaves the DOM", () => {
    const document = fakeDocument();
    const player = fakePlayer();
    const container = { isConnected: true };
    attachTwitchAutoResume({ document, window: fakeWindow, player, container });

    container.isConnected = false;
    document.dispatch();

    assert.equal(document.listenerCount(), 0);
    assert.equal(player.playCalls, 0);
  });
});
