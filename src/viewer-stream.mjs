import { escapeHtml, platformMeta } from "./platforms.mjs";

export function initStreamPlayer({ document, window, sources }) {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

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
