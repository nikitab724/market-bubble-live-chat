const PROVIDER_LABELS = {
  "7TV": "7TV",
  bttv: "BTTV",
  ffz: "FFZ",
  twitch: "Twitch",
};

const PROVIDER_CLASSES = {
  "7TV": "seventv",
  bttv: "bttv",
  ffz: "ffz",
  twitch: "twitch",
};

export function renderMessageBody(message, thirdPartyEmotes = {}) {
  if (message.platform !== "twitch") {
    return escapeHtml(message.body || "");
  }

  const body = String(message.body || "");
  const nativeEmotes = normalizeNativeEmotes(message.emotes, body);
  if (nativeEmotes.length === 0) {
    return renderTextWithThirdPartyEmotes(body, thirdPartyEmotes);
  }

  let cursor = 0;
  let html = "";

  for (const emote of nativeEmotes) {
    if (emote.start < cursor) continue;

    html += renderTextWithThirdPartyEmotes(body.slice(cursor, emote.start), thirdPartyEmotes);
    html += renderEmoteImage(emote);
    cursor = emote.end + 1;
  }

  html += renderTextWithThirdPartyEmotes(body.slice(cursor), thirdPartyEmotes);
  return html;
}

function normalizeNativeEmotes(emotes, body) {
  return (Array.isArray(emotes) ? emotes : [])
    .filter((emote) => Number.isInteger(emote.start) && Number.isInteger(emote.end))
    .filter((emote) => emote.start >= 0 && emote.end >= emote.start && emote.end < body.length)
    .sort((left, right) => left.start - right.start);
}

function renderTextWithThirdPartyEmotes(text, thirdPartyEmotes) {
  return String(text)
    .split(/(\s+)/)
    .map((token) => {
      const emote = thirdPartyEmotes[token];
      if (!emote) {
        return escapeHtml(token);
      }

      return renderEmoteImage(emote);
    })
    .join("");
}

function renderEmoteImage(emote) {
  const label = PROVIDER_LABELS[emote.provider] || emote.provider || "Emote";
  const providerClass = PROVIDER_CLASSES[emote.provider] || "third-party";
  const name = emote.name || "";

  return `<img class="chat-emote ${providerClass}-emote" src="${escapeHtml(emote.url)}" alt="${escapeHtml(name)}" title="${escapeHtml(`${name} · ${label}`)}" loading="lazy" decoding="async" />`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
