import { getCountdownParts, getNextBroadcastTime } from "./broadcast-schedule.mjs";
import { escapeHtml, platformMeta } from "./platforms.mjs";

let offlineCountdownTimer = 0;
let offlinePresenceToken = 0;

export function initStreamPlayer({ document, window, sources }) {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

  renderStreamEmbed(playerEl, { document, window, sources });
}

// Live-state refreshes call this. The player only re-renders when the
// selected source flips between live and offline presence, so polling never
// reloads a healthy iframe.
export function updateStreamPresence({ document, window, sources }) {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

  const streamSource = getSelectedStreamSource(sources);
  // Only a definitive provider answer (twitch/kick live-state) counts as
  // offline; X and room sources have no liveness feed and keep the embed.
  const offline = Boolean(
    streamSource
    && ["twitch", "kick"].includes(streamSource.platform)
    && streamSource.isLive === false,
  );
  const mode = offline ? "offline" : "embed";
  if (playerEl.dataset.streamMode === mode) return;

  if (mode === "offline") {
    renderOfflinePresence(playerEl, { document, window, sources, source: streamSource });
    return;
  }

  renderStreamEmbed(playerEl, { document, window, sources });
}

function renderStreamEmbed(playerEl, { document, window, sources }) {
  clearOfflineCountdown(document, window);
  playerEl.dataset.streamMode = "embed";
  renderEmbedContent(playerEl, { document, window, sources });
}

// Offline keeps real content in the player — the latest VOD when Twitch has
// one, otherwise the normal channel embed — and ticks a compact countdown in
// the bottom-center footer slot instead of covering the stream area.
function renderOfflinePresence(playerEl, { document, window, sources, source }) {
  playerEl.dataset.streamMode = "offline";
  offlinePresenceToken += 1;

  renderEmbedContent(playerEl, { document, window, sources });
  renderCornerCountdown(document, window);

  if (source.platform === "twitch") {
    swapToLatestVod(playerEl, { document, window, source, token: offlinePresenceToken });
  }
}

function renderEmbedContent(playerEl, { document, window, sources }) {
  const streamSource = getSelectedStreamSource(sources);
  playerEl.replaceChildren();
  if (!streamSource) {
    renderStreamPlaceholder(playerEl);
    return;
  }

  if (streamSource.platform === "twitch") {
    playerEl.append(createTwitchStreamFrame({ source: streamSource, window }));
    return;
  }

  if (streamSource.platform === "kick") {
    playerEl.append(createKickStreamFrame({ source: streamSource, document }));
    return;
  }

  if (streamSource.platform === "x" && streamSource.conversationId) {
    renderXStreamEmbed({ playerEl, source: streamSource, document, window });
    return;
  }

  renderStreamPlaceholder(playerEl, streamSource);
}

async function swapToLatestVod(playerEl, { document, window, source, token }) {
  try {
    const response = await fetch(`/api/twitch-vod?channel=${encodeURIComponent(source.sourceHandle)}`, { cache: "no-store" });
    if (!response.ok) return;

    const body = await response.json();
    const vodId = body.vod?.id;
    // Only swap if the player is still showing this offline presence.
    if (!vodId || token !== offlinePresenceToken || playerEl.dataset.streamMode !== "offline") return;

    const parent = window.location.hostname || "localhost";
    const iframe = document.createElement("iframe");
    iframe.src = `https://player.twitch.tv/?video=${encodeURIComponent(vodId)}&parent=${encodeURIComponent(parent)}&autoplay=false`;
    iframe.allowFullscreen = true;
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.title = body.vod.title || `${source.sourceName} on Twitch`;
    playerEl.replaceChildren(iframe);
  } catch {
    // The channel embed already shows the offline slate; VOD lookup is best-effort.
  }
}

export function getSelectedStreamSource(sources) {
  return sources.find((source) => source.showStream === true)
    || sources.find((source) => source.platform === "twitch")
    || sources.find((source) => source.platform === "kick")
    || sources[0];
}

function createTwitchStreamFrame({ source, window }) {
  const parent = window.location.hostname || "localhost";
  const iframe = window.document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(source.sourceHandle)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Twitch`;
  return iframe;
}

function createKickStreamFrame({ source, document }) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.kick.com/${encodeURIComponent(source.sourceHandle)}?autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Kick`;
  return iframe;
}

function renderXStreamEmbed({ playerEl, source, document, window }) {
  const post = document.createElement("blockquote");
  post.className = "twitter-tweet";
  post.dataset.theme = "dark";

  const link = document.createElement("a");
  link.href = `https://x.com/${encodeURIComponent(source.sourceHandle)}/status/${encodeURIComponent(source.conversationId)}`;
  link.textContent = `${source.sourceName} on X`;
  post.append(link);
  playerEl.append(post);
  loadXWidgets({ container: playerEl, document, window });
}

function loadXWidgets({ container, document, window }) {
  if (window.twttr?.widgets?.load) {
    window.twttr.widgets.load(container);
    return;
  }

  const existingScript = document.querySelector("[data-x-widgets]");
  if (existingScript) return;

  const script = document.createElement("script");
  script.async = true;
  script.charset = "utf-8";
  script.dataset.xWidgets = "true";
  script.src = "https://platform.x.com/widgets.js";
  script.addEventListener("load", () => window.twttr?.widgets?.load(container));
  document.head.append(script);
}

function renderCornerCountdown(document, window) {
  const slot = document.querySelector("#offlineCountdown");
  if (!slot) return;

  stopOfflineCountdown(window);
  slot.hidden = false;
  slot.innerHTML = `
    <span class="corner-countdown-label"><em class="corner-countdown-dot"></em>Offline · Back Thursday 1PM PST</span>
    <strong class="corner-countdown-clock">--:--:--</strong>
  `;
  const clockEl = slot.querySelector(".corner-countdown-clock");

  let target = getNextBroadcastTime();

  function tick() {
    const now = new Date();
    if (target.getTime() <= now.getTime()) {
      target = getNextBroadcastTime(now);
    }

    const parts = getCountdownParts(target, now);
    const clock = `${parts.days > 0 ? `${parts.days}d ` : ""}${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
    if (clockEl.textContent !== clock) {
      clockEl.textContent = clock;
    }
  }

  tick();
  offlineCountdownTimer = window.setInterval(tick, 1000);
}

function clearOfflineCountdown(document, window) {
  stopOfflineCountdown(window);
  const slot = document.querySelector("#offlineCountdown");
  if (slot) {
    slot.hidden = true;
    slot.replaceChildren();
  }
}

function stopOfflineCountdown(window) {
  if (offlineCountdownTimer) {
    window.clearInterval(offlineCountdownTimer);
    offlineCountdownTimer = 0;
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function renderStreamPlaceholder(playerEl, source = null) {
  const platform = source?.platform || "room";
  const meta = platformMeta[platform] || platformMeta.room;
  playerEl.innerHTML = `
    <div class="stream-placeholder ${escapeHtml(platform)}">
      <span>${escapeHtml(meta.label)} stream selected</span>
      <strong>${escapeHtml(source?.sourceLabel || source?.sourceName || "No stream selected")}</strong>
      <p>${source ? "Open the selected livestream source in a new tab." : "Choose a livestream source in the admin panel."}</p>
      ${source?.sourceUrl ? `<a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">Open Stream</a>` : ""}
    </div>
  `;
}
