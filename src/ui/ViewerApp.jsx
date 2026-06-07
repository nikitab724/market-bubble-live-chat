import { useEffect, useState } from "react";

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

  function toggleLayout() {
    setLayoutMode((currentLayout) => (currentLayout === "mini" ? "full" : "mini"));
  }

  return (
    <div className={`live-surface live-layout-${effectiveLayout}`} data-layout={effectiveLayout} data-surface={surface}>
      <header className="broadcast-topbar" aria-label="Market Bubble live status">
        <div className="brand-mark" aria-hidden="true">
          <span>Market</span>
          <span>Bubble</span>
        </div>
        {showStream && (
          <button
            aria-label={effectiveLayout === "mini" ? "Use full layout" : "Use mini layout"}
            aria-pressed={effectiveLayout === "mini"}
            className="layout-toggle"
            onClick={toggleLayout}
            type="button"
          >
            {effectiveLayout === "mini" ? "FULL" : "MIN"}
          </button>
        )}
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
    </div>
  );
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
