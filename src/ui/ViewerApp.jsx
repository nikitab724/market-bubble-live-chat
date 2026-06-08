import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

const LAYOUT_STORAGE_KEY = "market-bubble-viewer-layout";
const layoutModes = new Set(["full", "mini"]);

export function ViewerApp({ surface = "viewer" }) {
  const showStream = surface === "viewer";
  const [layoutMode, setLayoutMode] = useState(() => getInitialLayout(surface));
  const effectiveLayout = showStream ? layoutMode : "full";

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

    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        flushSync(() => setLayoutMode(nextLayout));
      });
      return;
    }

    setLayoutMode(nextLayout);
  }

  return (
    <div className={`live-surface live-layout-${effectiveLayout}`} data-layout={effectiveLayout} data-surface={surface}>
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
            <div className="video-frame">
              <div id="streamPlayer" className="stream-player" />
            </div>
          </section>
        )}

        <section className="chat-view" aria-label="Combined live chat">
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
