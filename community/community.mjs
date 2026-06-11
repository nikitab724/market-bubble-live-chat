// Set data-height on timeline anchors before the widget script processes them.
function setEmbedHeights() {
  const topbarH = document.querySelector(".v2-topbar")?.offsetHeight  ?? 90;
  const footerH = document.querySelector(".v2-footer")?.offsetHeight  ?? 80;
  const colHdrH = document.querySelector(".v2-community-col-header")?.offsetHeight ?? 64;
  const height  = Math.max(400, window.innerHeight - topbarH - footerH - colHdrH);

  document.querySelectorAll(".twitter-timeline").forEach((el) => {
    el.dataset.height = String(height);
  });
}

setEmbedHeights();

// Use Twitter's official async snippet so twttr.ready() is available
// even if the script hasn't finished loading yet.
window.twttr = (function (d, s, id) {
  const t  = window.twttr || {};
  if (d.getElementById(id)) return t;
  const js  = d.createElement(s);
  const fjs = d.getElementsByTagName(s)[0];
  js.id  = id;
  js.src = "https://platform.twitter.com/widgets.js";
  fjs.parentNode.insertBefore(js, fjs);
  t._e = [];
  t.ready = function (f) { t._e.push(f); };
  return t;
}(document, "script", "twitter-wjs"));

// Once the widget library is ready, explicitly render all timeline elements.
// This fires whether the script was already cached or still loading.
window.twttr.ready(function (twttr) {
  twttr.widgets.load(document.querySelector(".v2-community-main"));
});
