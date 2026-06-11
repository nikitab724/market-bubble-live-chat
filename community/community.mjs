// Set the embed height to fill the available viewport space before the
// Twitter widget script runs, so the rendered iframes fill each column.
function setEmbedHeights() {
  const topbarH  = document.querySelector(".v2-topbar")?.offsetHeight  ?? 90;
  const footerH  = document.querySelector(".v2-footer")?.offsetHeight  ?? 80;
  const colHdrH  = document.querySelector(".v2-community-col-header")?.offsetHeight ?? 64;
  const mainPad  = 0;
  const height   = Math.max(400, window.innerHeight - topbarH - footerH - colHdrH - mainPad);

  document.querySelectorAll(".twitter-timeline").forEach((el) => {
    el.dataset.height = String(height);
  });
}

setEmbedHeights();

// Inject the Twitter widget script — it converts the <a> placeholders into
// iframes once it runs.
const script = document.createElement("script");
script.async = true;
script.charset = "utf-8";
script.src = "https://platform.twitter.com/widgets.js";
document.head.appendChild(script);
