import { useEffect } from "react";

export function ViewerApp({ surface = "viewer" }) {
  const showStream = surface === "viewer";

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

  return (
    <>
      <header className="broadcast-topbar" aria-label="Market Bubble live status">
        <div className="brand-mark" aria-hidden="true">
          <span>Market</span>
          <span>Bubble</span>
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
    </>
  );
}
