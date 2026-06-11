import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

const LAYOUT_STORAGE_KEY = "market-bubble-viewer-layout";
// TODO: swap to the real Spotify show URL once provided; this search link is a
// placeholder so the icon never points at a dead page.
const SPOTIFY_PODCAST_URL = "https://open.spotify.com/search/Market%20Bubble/shows";
const layoutModes = new Set(["full", "mini"]);
const ENTRANCE_ANIMATIONS_MS = 1200;
// Gecko's view-transition morph still drops frames over live video on
// Windows, so Firefox gets a clean instant layout switch instead.
const prefersInstantLayoutSwitch = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

export function ViewerApp({ surface = "viewer" }) {
  const showStream = surface === "viewer";
  const [layoutMode, setLayoutMode] = useState(() => getInitialLayout(surface));
  const [entered, setEntered] = useState(false);
  const effectiveLayout = showStream ? layoutMode : "full";

  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), ENTRANCE_ANIMATIONS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;

    import("../app.mjs").then(({ mountLiveApp }) => {
      if (active) {
        mountLiveApp({ document, window });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (showStream) {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, effectiveLayout);
    }
  }, [effectiveLayout, showStream]);

  useEffect(() => {
    if (!showStream) {
      return undefined;
    }

    function handleLayoutShortcut(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (String(event.key || "").toLowerCase() !== "f") {
        return;
      }

      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      toggleLayoutWithTransition();
    }

    window.addEventListener("keydown", handleLayoutShortcut);
    return () => window.removeEventListener("keydown", handleLayoutShortcut);
  }, [effectiveLayout, showStream]);

  function toggleLayoutWithTransition() {
    const nextLayout = effectiveLayout === "mini" ? "full" : "mini";
    // Entrance animations are load-only; replaying them on a toggle re-fades
    // the panels and blanks the view transition's new-state snapshot.
    setEntered(true);

    if (!prefersInstantLayoutSwitch && typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        flushSync(() => setLayoutMode(nextLayout));
      });
      return;
    }

    setLayoutMode(nextLayout);
  }

  return (
    <div
      className={`live-surface live-layout-${effectiveLayout}`}
      data-layout={effectiveLayout}
      data-surface={surface}
      data-entered={entered ? "true" : "false"}
    >
      <div className="site-shell">
        <header className="broadcast-topbar" aria-label="Market Bubble live status">
          <div className="brand-mark" aria-label="Market Bubble">
            <svg
              className="brand-wordmark"
              viewBox="0 0 360 64"
              role="img"
              aria-hidden="true"
              preserveAspectRatio="xMinYMid meet"
            >
              <text className="brand-wordmark-text" x="2" y="46">
                Market Bubble
              </text>
            </svg>
          </div>
          <div className="broadcast-metrics">
            <div className="viewer-counter" aria-label="Combined viewers">
              <strong id="viewerCount">0</strong>
              <span>Viewers</span>
            </div>
            <div id="sourceBreakdown" className="source-breakdown" aria-label="Viewer sources" />
          </div>
        </header>

        <main className={`app-shell ${showStream ? "viewer-shell" : "chat-shell"}`} data-surface={surface}>
          {showStream && (
            <section className="stream-view" aria-label="Market Bubble stream">
              <button
                aria-label={effectiveLayout === "mini" ? "Use full layout" : "Use mini layout"}
                aria-keyshortcuts="F"
                aria-pressed={effectiveLayout === "mini"}
                className="layout-toggle"
                onClick={toggleLayoutWithTransition}
                title={effectiveLayout === "mini" ? "Use full layout (F)" : "Use mini layout (F)"}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="layout-toggle-icon"
                  data-layout-action={effectiveLayout === "mini" ? "expand" : "minimize"}
                />
                <span className="layout-toggle-label">
                  {effectiveLayout === "mini" ? "Use full layout" : "Use mini layout"}
                </span>
              </button>
              <nav className="stream-socials" aria-label="Market Bubble socials">
                <a href="https://x.com/MarketBubble" target="_blank" rel="noreferrer" aria-label="Market Bubble on X">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 3h5.1l4 5.7L18 3h2.1l-6 7 6.6 11H15.6l-4.4-6.5L5.8 21H3.7l6.5-7.7L4 3z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/marketbubble/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Market Bubble on Instagram"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
                    <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
                    <circle cx="17.4" cy="6.6" r="1.25" />
                  </svg>
                </a>
                <a href="https://www.tiktok.com/@marketbubble" target="_blank" rel="noreferrer" aria-label="Market Bubble on TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                  </svg>
                </a>
                <a href={SPOTIFY_PODCAST_URL} target="_blank" rel="noreferrer" aria-label="Market Bubble podcast on Spotify">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.6 14.42a.62.62 0 01-.86.2c-2.34-1.43-5.3-1.75-8.78-.96a.62.62 0 11-.28-1.2c3.81-.88 7.08-.5 9.71 1.1.3.18.39.57.21.86zm1.23-2.73a.78.78 0 01-1.07.26c-2.68-1.65-6.77-2.13-9.94-1.17a.78.78 0 11-.45-1.49c3.62-1.1 8.13-.56 11.2 1.33.37.22.49.7.26 1.07zm.1-2.85C14.82 8.95 9.5 8.76 6.42 9.7a.94.94 0 11-.54-1.8c3.53-1.07 9.4-.86 13.1 1.34a.94.94 0 11-.96 1.61z" />
                  </svg>
                </a>
              </nav>
              <div className="video-frame">
                <div id="streamPlayer" className="stream-player" />
              </div>
            </section>
          )}

          <section className="chat-view" aria-label="Combined live chat">
            <div id="chatFilters" className="chat-filters" aria-label="Chat source filters" />
            <div id="chatFeed" className="chat-feed" role="log" aria-live="polite" />
            <button id="jumpToLive" className="jump-to-live" type="button" hidden>
              Jump to live
            </button>
          </section>
        </main>

        {showStream && (
          <footer className="surface-corners" aria-hidden="false">
            <p className="corner-quote">
              <span className="corner-quote-mark">&ldquo;</span>
              If no one sees the vision, go alone
              <span className="corner-quote-mark">&rdquo;</span>
            </p>
            <div id="offlineCountdown" className="corner-countdown" hidden />
            <p className="corner-schedule">
              <span>Live</span>
              <span className="corner-dot" />
              <span>Thursdays</span>
              <span className="corner-dot" />
              <span>1PM PST</span>
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

function isEditableShortcutTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function getInitialLayout(surface) {
  if (surface !== "viewer") {
    return "full";
  }

  const searchParams = new URLSearchParams(window.location.search);
  const requestedLayout = searchParams.get("layout");
  if (layoutModes.has(requestedLayout)) {
    return requestedLayout;
  }

  const storedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  return layoutModes.has(storedLayout) ? storedLayout : "full";
}
