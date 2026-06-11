// Pure status line computation for the admin source rows. The DOM layer feeds
// it the latest SSE/live-state knowledge; this module only ranks what matters
// most so every row shows one plain-English line.

const CHAT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const PROVIDER_NAMES = { twitch: "Twitch", kick: "Kick" };
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

export function describeSourceStatus({
  platform,
  enabled,
  handle,
  dirty,
  broadcastId = "",
  provider = null,
  live = null,
  connectorStatus = "",
  lastChatAt = 0,
  now = Date.now(),
} = {}) {
  if (dirty) return { tone: "pending", text: "Save to connect" };
  if (!String(handle || "").trim()) return { tone: "muted", text: "Not connected" };
  if (!enabled) return { tone: "muted", text: "Off" };

  if (provider?.status === "not_configured") {
    return { tone: "warn", text: `Needs ${PROVIDER_NAMES[platform] || platform} credentials on the server` };
  }

  if (live?.isLive) {
    return { tone: "live", text: `Live · ${NUMBER_FORMAT.format(live.viewerCount || 0)} watching` };
  }

  if (lastChatAt && now - lastChatAt <= CHAT_ACTIVE_WINDOW_MS) {
    return { tone: "live", text: "Chat active" };
  }

  if (connectorStatus === "connected") return { tone: "ok", text: "Connected, waiting for chat…" };
  if (connectorStatus === "connecting") return { tone: "pending", text: "Connecting…" };
  if (connectorStatus === "disconnected") return { tone: "warn", text: "Reconnecting…" };

  if (platform === "x" && !broadcastId) {
    return { tone: "muted", text: "Go live, then open your X live page in Chrome with the extension" };
  }

  if (provider?.status === "error") return { tone: "warn", text: "Can’t check live status" };
  if (platform === "room") return { tone: "ok", text: "Ready" };

  return { tone: "muted", text: "Offline" };
}
