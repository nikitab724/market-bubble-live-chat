export const platformMeta = {
  twitch: {
    label: "Twitch",
    source: "https://twitch.tv/marketbubble",
  },
  kick: {
    label: "Kick",
    source: "https://kick.com/marketbubble",
  },
  x: {
    label: "X",
    source: "https://x.com/MarketBubble",
  },
  room: {
    label: "MB.com",
    source: "https://marketbubble.com",
  },
};

export const PLATFORM_ORDER = Object.keys(platformMeta);

export function getProfileUrl(platform, handle) {
  const cleanHandle = String(handle).replace(/^@/, "");

  if (platform === "twitch") {
    return `https://twitch.tv/${cleanHandle}`;
  }

  if (platform === "kick") {
    return `https://kick.com/${cleanHandle}`;
  }

  if (platform === "room") {
    return `https://marketbubble.com/u/${cleanHandle}`;
  }

  return `https://x.com/${cleanHandle}`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
