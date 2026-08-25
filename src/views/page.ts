const PROFILE_URL = 'https://www.instagram.com/klaushofrichter';
const REPO_URL = 'https://github.com/klaushofrichter/instagetter';
const SKYLAR_URL = 'https://www.skylar.technology';

export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>instagetter</title>
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  :root {
    --bg: #ffffff; --fg: #14161a; --muted: #6b7280; --line: #e5e7eb;
    --card: #fafafa; --accent: #c13584; --overlay: rgba(255,255,255,.96);
    --btn: #f3f4f6; --btn-fg: #14161a;
    --fsmeta-bg: rgba(240,240,243,.68); --fsmeta-fg: #14161a; --fsmeta-muted: #4b5563;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1115; --fg: #eef1f5; --muted: #9aa3af; --line: #262b33;
      --card: #171a20; --overlay: rgba(10,12,15,.97);
      --btn: #232830; --btn-fg: #eef1f5;
      --fsmeta-bg: rgba(12,14,18,.62); --fsmeta-fg: #f3f5f8; --fsmeta-muted: #b6bec9;
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0f1115; --fg: #eef1f5; --muted: #9aa3af; --line: #262b33;
    --card: #171a20; --overlay: rgba(10,12,15,.97);
    --btn: #232830; --btn-fg: #eef1f5;
    --fsmeta-bg: rgba(12,14,18,.62); --fsmeta-fg: #f3f5f8; --fsmeta-muted: #b6bec9;
    color-scheme: dark;
  }
  :root[data-theme="light"] { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 62rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  header { display: flex; flex-wrap: wrap; gap: .75rem 1rem; align-items: center; margin-bottom: 1.25rem; }
  h1 { font-size: 1.4rem; margin: 0; letter-spacing: -.02em; }
  h1 .mark { width: 1em; height: 1em; border-radius: 4px; margin-right: .5rem; vertical-align: -.12em; }
  .spacer { flex: 1 1 auto; }
  .tools { display: flex; align-items: center; gap: .5rem; }
  /* Two tidy rows on a phone instead of an unpredictable wrap: name pinned
     right on the first, count left and controls right on the second. */
  @media (max-width: 640px) {
    header {
      display: grid; grid-template-columns: auto 1fr;
      grid-template-areas: "title profile" "status tools";
      align-items: center; gap: .35rem .6rem;
    }
    header h1 { grid-area: title; }
    header > a { grid-area: profile; justify-self: end; }
    header .spacer { display: none; }
    header .status { grid-area: status; justify-self: start; }
    header .tools { grid-area: tools; justify-self: end; }
  }
  a { color: var(--accent); }
  button {
    font: inherit; color: var(--btn-fg); background: var(--btn);
    border: 1px solid var(--line); border-radius: 8px; padding: .4rem .8rem; cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .icon-btn {
    display: inline-grid; place-items: center; width: 2.2rem; height: 2.2rem;
    padding: 0; border-radius: 8px; line-height: 0;
    flex: none; /* as a flex child it would otherwise shrink sub-pixel */
  }
  .icon-btn svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .icon-btn.spin svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  a.title-link { color: inherit; text-decoration: none; }
  a.title-link:hover { color: var(--accent); }
  .status { color: var(--muted); font-size: .85rem; min-height: 1.2em; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: .75rem; } }
  .tile {
    position: relative; aspect-ratio: 1/1; overflow: hidden; border-radius: 10px;
    background: var(--card); border: 1px solid var(--line); cursor: pointer; padding: 0;
  }
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile .badge {
    position: absolute; top: .4rem; right: .4rem; background: rgba(0,0,0,.6); color: #fff;
    font-size: .7rem; padding: .1rem .35rem; border-radius: 5px;
  }
  .pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; color: var(--muted); }
  .empty { border: 1px dashed var(--line); border-radius: 12px; padding: 2.5rem 1rem; text-align: center; color: var(--muted); }
  .loading { border: 1px solid var(--line); border-radius: 12px; padding: 2.5rem 1rem; text-align: center; }
  .loading .count { font-size: 1.4rem; font-weight: 600; color: var(--fg); margin: .5rem 0 .9rem; }
  .bar { height: 6px; border-radius: 999px; background: var(--card); overflow: hidden;
    max-width: 22rem; margin: 0 auto; border: 1px solid var(--line); }
  .bar > span { display: block; height: 100%; background: var(--accent); transition: width .3s ease; }

  dialog#about {
    border: 1px solid var(--line); border-radius: 14px; padding: 0;
    background: var(--bg); color: var(--fg);
    max-width: min(37.5rem, calc(100vw - 2rem));
  }
  dialog#about::backdrop { background: rgba(0,0,0,.45); }
  .about-inner { padding: 1.1rem 1.3rem 1.3rem; }
  .about-head { display: flex; align-items: center; gap: .6rem; margin-bottom: .6rem; }
  .about-head h2 { font-size: 1.15rem; margin: 0; letter-spacing: -.01em; }
  .about-logo { width: 1.9rem; height: 1.9rem; border-radius: 6px; display: block; }
  #about p { margin: 0 0 .7rem; }
  .about-links { color: var(--muted); font-size: .87rem; margin-bottom: 0 !important; }
  .about-updated { color: var(--muted); font-size: .87rem; }

  dialog#modal {
    border: none; padding: 0; background: transparent; max-width: 100vw; max-height: 100vh;
    width: 100%; height: 100%; margin: 0; color: var(--fg);
  }
  dialog#modal::backdrop { background: var(--overlay); }
  .modal-inner { display: flex; flex-direction: column; height: 100vh; background: var(--bg); }
  .modal-bar { display: flex; gap: .5rem; align-items: center; padding: .6rem .8rem; border-bottom: 1px solid var(--line); }
  /* min-height:0 is required: a flex child defaults to min-height:auto and so
     refuses to shrink below the intrinsic image height, pushing the metadata
     panel off-screen and cropping tall images. */
  .stage { flex: 1 1 auto; min-height: 0; position: relative; display: grid; place-items: center; overflow: hidden; background: var(--card); }
  /* Absolutely positioned so the percentage caps resolve against the stage's
     padding box. As a grid/flex child the row is auto-sized, so max-height:100%
     has no definite basis and is ignored — the image then overflows. */
  /* Fill the stage in both directions: max-width/max-height only cap a size and
     never enlarge, so a small original used to sit at its natural size in the
     middle of the stage while large ones scaled down. Definite dimensions plus
     object-fit:contain scale either way and keep the aspect ratio. Absolute
     positioning is what gives the percentages a box to resolve against. */
  .stage img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: contain; display: block;
  }
  .nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center;
    background: rgba(0,0,0,.55); color: #fff; border: none; font-size: 1.2rem;
    /* Both arrows sit above the image. Without this they share z-index:auto
       with it and paint in DOM order — prev is before the <img> and so was
       hidden beneath it, while next, being after, stayed visible. Only showed
       on narrow screens, where the image fills the width. */
    z-index: 1;
  }
  .nav.prev { left: .75rem; } .nav.next { right: .75rem; }
  .meta { padding: .8rem 1rem; border-top: 1px solid var(--line); max-height: 34vh; overflow: auto; text-align: center; }
  .meta .caption { margin: 0 0 .4rem; }
  .meta .facts { margin: 0 0 .35rem; font-size: .85rem; color: var(--muted); }
  .meta .links { margin: 0; font-size: .85rem; }
  /* Fullscreen targets the stage, so only the image subtree renders — no bar,
     no metadata, no counter. Hide the nav arrows too: the request is the
     picture and nothing else. Cursor keys still navigate. */
  #stage:fullscreen { background: #000; }
  #stage.faux-fs {
    position: fixed; inset: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; background: #000;
  }
  #stage:fullscreen .nav { display: none; }
  #stage.faux-fs .nav { display: none; }
  /* Fill the screen in fullscreen, scaling small images UP as well as large
     ones down. max-width/max-height only cap, they never enlarge — so set
     explicit dimensions and let object-fit:contain preserve the aspect ratio
     and letterbox whatever is left over. */
  #stage:fullscreen img {
    width: 100vw; height: 100vh;
    max-width: none; max-height: none;
    object-fit: contain; cursor: pointer;
  }
  #stage.faux-fs img {
    width: 100vw; height: 100vh;
    max-width: none; max-height: none;
    object-fit: contain; cursor: pointer;
  }
  /* The close control must live inside the stage: nothing outside the
     fullscreen element renders. Same .icon-btn dimensions as the bar's X, and
     positioned to match it — top right. */
  .fs-close { display: none; position: absolute; top: .7rem; right: .7rem; z-index: 2;
    background: rgba(0,0,0,.55); color: #fff; border-color: transparent; }
  .fs-close:hover { background: rgba(0,0,0,.75); border-color: transparent; }
  #stage:fullscreen .fs-close { display: inline-grid; }
  #stage.faux-fs .fs-close { display: inline-grid; }
  /* Fingers are coarser than mice: give the fullscreen X a larger hit area. */
  @media (pointer: coarse) {
    .fs-close { width: 2.9rem; height: 2.9rem; top: .5rem; right: .5rem; }
    .fs-close svg { width: 1.4rem; height: 1.4rem; }
  }
  .stage img { cursor: zoom-in; }
  /* The gesture is ours: without this the browser claims the drag for panning
     and the swipe never reaches the handlers. */
  .stage { touch-action: none; }
  /* Fullscreen metadata overlay, toggled with the space bar. Only ever shown
     inside :fullscreen, so it cannot intrude on the normal detail view. */
  .fs-meta { display: none; }
  #stage.faux-fs .fs-meta.on {
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    position: absolute; left: 0; right: 0; bottom: 0;
    min-height: 16vh; padding: .85rem 2rem;
    background: var(--fsmeta-bg); color: var(--fsmeta-fg);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    text-align: center; z-index: 3;
  }
  #stage:fullscreen .fs-meta.on {
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    position: absolute; left: 0; right: 0; bottom: 0;
    min-height: 16vh; padding: .85rem 2rem;
    background: var(--fsmeta-bg); color: var(--fsmeta-fg);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    text-align: center; z-index: 3;
  }
  .fs-meta .fs-caption { font-size: 1.05rem; line-height: 1.5; margin: 0 0 .5rem;
    max-width: 60rem; }
  .fs-meta .fs-facts { font-size: .85rem; color: var(--fsmeta-muted); margin: 0; }
  .fs-meta .fs-hint { font-size: .72rem; color: var(--fsmeta-muted); margin: .55rem 0 0;
    opacity: .75; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><a href="${SKYLAR_URL}" target="_blank" rel="noopener noreferrer" title="www.skylar.technology"><img class="mark" src="/favicon.png" alt="www.skylar.technology"></a><a class="title-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" title="Source on GitHub">instagetter</a></h1>
    <a href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">@klaushofrichter</a>
    <span class="spacer"></span>
    <span class="status" id="status"></span>
    <div class="tools">
    <button id="theme" class="icon-btn" title="Toggle light / dark" aria-label="Toggle light or dark theme">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
    <button id="refresh" class="icon-btn" title="Check S3 for new images" aria-label="Refresh">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
    </button>
    <button id="about-open" class="icon-btn" title="About" aria-label="About this site">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/></svg>
    </button>
    <button id="home" class="icon-btn" title="Back to the first page" aria-label="Back to the first page">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
    </button>
    </div>
  </header>
  <div id="content"></div>
</div>

<dialog id="about">
  <div class="about-inner">
    <div class="about-head">
      <a href="${SKYLAR_URL}" target="_blank" rel="noopener noreferrer" title="www.skylar.technology">
        <img class="about-logo" src="/favicon.png" alt="www.skylar.technology">
      </a>
      <h2><a class="title-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" title="Source on GitHub">instagetter</a></h2>
      <span class="spacer"></span>
      <button id="about-close" class="icon-btn" title="Close (Esc)" aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <p>A small self-hosted gallery for my own Instagram photos.</p>
    <p>It extracts the newest posts from a single Instagram account, stores them
      in S3 at full resolution with their metadata, and serves them as a
      responsive grid with a lightbox. The site itself never talks to Instagram.</p>
    <p class="about-updated" id="about-updated"></p>
    <p class="about-links">
      <a href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">@klaushofrichter</a>
      &middot; <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">source on GitHub</a>
      &middot; <a href="${SKYLAR_URL}" target="_blank" rel="noopener noreferrer">www.skylar.technology</a>
      &middot; MIT licensed
    </p>
  </div>
</dialog>

<dialog id="modal">
  <div class="modal-inner">
    <div class="modal-bar">
      <span id="counter" class="status"></span>
      <span class="spacer"></span>
      <button id="fs" class="icon-btn" title="Fullscreen (f)" aria-label="Enter fullscreen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      </button>
      <a id="dl" download><button class="icon-btn" title="Download" aria-label="Download">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>
      </button></a>
      <button id="close" class="icon-btn" title="Close (Esc)" aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="stage" id="stage">
      <button class="nav prev" id="prev" aria-label="Previous image">&#8249;</button>
      <img id="full" alt="" title="Click for fullscreen">
      <button class="nav next" id="next" aria-label="Next image">&#8250;</button>
      <div id="fsmeta" class="fs-meta"></div>
      <button id="fsclose" class="icon-btn fs-close" title="Exit fullscreen (Esc)" aria-label="Exit fullscreen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="meta" id="meta"></div>
  </div>
</dialog>

<script>
(function () {
  var PER_PAGE = 9;
  var images = [];
  var progress = { loading: false, done: 0, total: 0 };
  var lastRefreshAt = null;
  var deepLinkDone = false;
  // Read once, up front: syncUrl() rewrites location.search as soon as the
  // first render happens, which would otherwise erase the very parameter the
  // deep link needs.
  var initialSearch = window.location.search;
  var page = 0;
  var current = -1;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // Theme: remember the viewer's explicit choice, fall back to the OS setting.
  try {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* private mode */ }
  $('theme').onclick = function () {
    // Read the chosen theme, falling back to the OS preference. Do not sniff
    // the computed background colour — that silently breaks if the palette
    // changes.
    var explicit = document.documentElement.getAttribute('data-theme');
    var isDark = explicit
      ? explicit === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  };

  function fmtDate(iso) {
    if (!iso) return 'unknown';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  function render() {
    var el = $('content');
    // The service pulls everything from S3 at startup; say so rather than
    // showing an empty-looking gallery while that runs.
    if (progress.loading && !images.length) {
      var pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
      el.innerHTML =
        '<div class="loading">Please wait, loading content…' +
        '<div class="count">' + progress.done + ' / ' + (progress.total || '?') + ' loaded</div>' +
        '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
      return;
    }
    if (!images.length) {
      el.innerHTML = '<div class="empty">No images cached yet.<br>Press <strong>Refresh</strong> to pull the latest from S3.</div>';
      return;
    }
    var pages = Math.ceil(images.length / PER_PAGE);
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    setStatus((page + 1) + '/' + pages + ' \u00b7 ' + images.length + ' images');
    var slice = images.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    var html = '<div class="grid">';
    for (var i = 0; i < slice.length; i++) {
      var m = slice[i];
      var idx = page * PER_PAGE + i;
      var badge = m.imgCount > 1 ? '<span class="badge">' + m.imgIndex + '/' + m.imgCount + '</span>' : '';
      html += '<button class="tile" data-idx="' + idx + '">' +
              '<img loading="lazy" src="/thumb/' + encodeURIComponent(m.id) + '.jpg" alt="' + esc(m.caption).slice(0, 120) + '">' +
              badge + '</button>';
    }
    html += '</div>';
    html += '<div class="pager">' +
            '<button id="pprev" class="icon-btn" aria-label="Previous page" title="Previous page"' + (page === 0 ? ' disabled' : '') + '>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>' +
            '<span>Page ' + (page + 1) + ' of ' + pages + ' &middot; ' + images.length + ' images</span>' +
            '<button id="pnext" class="icon-btn" aria-label="Next page" title="Next page"' + (page >= pages - 1 ? ' disabled' : '') + '>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>' +
            '</div>';
    el.innerHTML = html;

    var tiles = el.querySelectorAll('.tile');
    for (var t = 0; t < tiles.length; t++) {
      tiles[t].onclick = function () { open(Number(this.getAttribute('data-idx'))); };
    }
    if ($('pprev')) $('pprev').onclick = function () { page--; render(); window.scrollTo(0, 0); };
    if ($('pnext')) $('pnext').onclick = function () { page++; render(); window.scrollTo(0, 0); };
    syncUrl();
  }

  function open(i) {
    if (i < 0 || i >= images.length) return;
    current = i;
    var m = images[i];
    $('full').src = '/image/' + encodeURIComponent(m.id) + '.jpg';
    $('full').alt = m.caption || 'Instagram image';
    $('dl').href = '/download/' + encodeURIComponent(m.id) + '.jpg';
    $('counter').textContent = (i + 1) + ' of ' + images.length;
    // Three centred lines: the caption, the facts, the links. The field labels
    // are dropped — the values and the anchor text say what they are.
    var facts = [esc(fmtDate(m.takenAt))];
    if (m.location) facts.push(esc(m.location));
    if (m.imgCount > 1) facts.push('image ' + m.imgIndex + ' of ' + m.imgCount);
    facts.push(m.width + ' &times; ' + m.height);

    // Keyed on the Instagram shortcode, so it survives newer uploads shifting
    // every position — unlike ?image=<number>.
    var permalink = window.location.origin + '/?image=' + encodeURIComponent(m.shortcode);
    var links =
      '<a href="' + esc(m.postUrl) + '" target="_blank" rel="noopener noreferrer">open on Instagram</a>' +
      ' &mdash; <a href="' + esc(permalink) + '">instagetter permalink</a>';

    $('meta').innerHTML =
      '<p class="caption">' + (m.caption ? esc(m.caption) : '<em>no caption</em>') + '</p>' +
      '<p class="facts">' + facts.join(' &mdash; ') + '</p>' +
      '<p class="links">' + links + '</p>';
    renderFsMeta(m);
    if (!$('modal').open) $('modal').showModal();
    syncUrl();
  }

  function renderFsMeta(m) {
    var facts = [];
    facts.push(fmtDate(m.takenAt));
    if (m.location) facts.push(esc(m.location));
    if (m.imgCount > 1) facts.push('image ' + m.imgIndex + ' of ' + m.imgCount);
    facts.push(m.width + ' \u00d7 ' + m.height);
    $('fsmeta').innerHTML =
      '<p class="fs-caption">' + (m.caption ? esc(m.caption) : '<em>no caption</em>') + '</p>' +
      '<p class="fs-facts">' + facts.join(' &middot; ') + '</p>' +
      '<p class="fs-hint">space to hide</p>';
  }

  function toggleFsMeta() {
    $('fsmeta').classList.toggle('on');
  }

  // At most three steps per second. Guards the arrows, the cursor keys and the
  // tap zones alike, since they all route through here — and keeps a held key
  // from queueing a burst of full-resolution decodes.
  var STEP_MIN_MS = 334;
  var lastStepAt = 0;

  function step(delta) {
    var now = Date.now();
    if (now - lastStepAt < STEP_MIN_MS) return;
    lastStepAt = now;
    var next = current + delta;
    if (next < 0) next = images.length - 1;
    if (next >= images.length) next = 0;
    open(next);
  }

  // A real click carries the user activation requestFullscreen() needs, so
  // this works where a programmatic call would be rejected.
  // Tap zones. In fullscreen the <img> spans the whole viewport (100vw/100vh
  // with object-fit:contain), so a tap anywhere that is not the X or the
  // metadata panel lands here and can be routed by position — no extra
  // chrome needed on a phone.
  var ZONE_SIDE = 0.25;   // left / right quarter navigates
  var ZONE_BOTTOM = 0.78; // below this toggles the metadata panel
  var ZONE_TOP = 0.12;    // top strip always returns to the detail view

  // Swipes: left or up advance, right or down go back, in the detail view and
  // fullscreen alike. Bound to the stage so it covers the whole picture area.
  var SWIPE_MIN = 40;      // px of travel before a drag counts as a swipe
  var touchStart = null;
  var swiped = false;

  $('stage').addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touchStart = null; return; }
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swiped = false;
  }, { passive: true });

  $('stage').addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;
    // Below the threshold this was a tap: leave it to the click handler.
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    swiped = true;
    if (Math.abs(dx) >= Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else step(dy < 0 ? 1 : -1);
  }, { passive: true });

  $('full').onclick = function (e) {
    // A swipe also emits a click; do not let it trigger a tap zone as well.
    if (swiped) { swiped = false; return; }
    if (!inFullscreen()) { enterFullscreen(); return; }
    var w = window.innerWidth, h = window.innerHeight;
    // The top strip wins over the side zones. The X lives in the top right,
    // which would otherwise be inside "next image" — a near miss on a phone
    // would advance instead of closing.
    if (e.clientY < h * ZONE_TOP) { leaveFullscreen(); return; }
    if (e.clientY > h * ZONE_BOTTOM) { toggleFsMeta(); return; }
    if (e.clientX < w * ZONE_SIDE) { step(-1); return; }
    if (e.clientX > w * (1 - ZONE_SIDE)) { step(1); return; }
    // Anywhere else — the top and the middle — returns to the detail view.
    leaveFullscreen();
  };
  $('fsclose').onclick = function () { leaveFullscreen(); };

  $('prev').onclick = function () { step(-1); };
  $('next').onclick = function () { step(1); };
  $('close').onclick = closeDetail;
  $('about-open').onclick = function () {
    $('about-updated').textContent = lastRefreshAt
      ? 'Content last updated ' + fmtDate(lastRefreshAt) + ' \u00b7 ' + images.length + ' images'
      : '';
    $('about').showModal();
  };

  $('home').onclick = function () {
    page = 0;
    render();
    window.scrollTo(0, 0);
  };
  $('about-close').onclick = function () { $('about').close(); };
  // Click the backdrop to dismiss.
  $('about').addEventListener('click', function (e) {
    if (e.target === $('about')) $('about').close();
  });

  // iPhone Safari implements no element Fullscreen API at all, so the button
  // and tap-to-enter did nothing there and failed silently. Fall back to a
  // fixed, viewport-filling stage, which behaves the same from the user's side.
  function inFullscreen() {
    return !!document.fullscreenElement || $('stage').classList.contains('faux-fs');
  }

  function enterFullscreen() {
    var el = $('stage');
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { el.classList.add('faux-fs'); updateFsUi(); return; }
    var r = req.call(el);
    if (r && r.catch) {
      r.catch(function (e) {
        console.error('requestFullscreen failed, using fallback', e);
        el.classList.add('faux-fs');
        updateFsUi();
      });
    }
  }

  function leaveFullscreen() {
    var el = $('stage');
    if (el.classList.contains('faux-fs')) {
      el.classList.remove('faux-fs');
      updateFsUi();
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function (e) { console.error('exitFullscreen', e); });
    }
  }

  $('fs').onclick = function () {
    // Fullscreen the STAGE, not the <dialog> and not documentElement.
    //  - the dialog itself: showModal() already put it in the top layer and
    //    Chrome rejects requestFullscreen() on it.
    //  - documentElement: the whole page enters the top layer *after* the
    //    dialog, so the grid paints on top of the modal.
    // A descendant of the open dialog enters the top layer above it and
    // renders only its own subtree, which is exactly the image.
    if (inFullscreen()) leaveFullscreen();
    else enterFullscreen();
  };

  var ICON_EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var ICON_COMPRESS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h3a2 2 0 0 0 2-2V3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>';

  // Swap the icon rather than textContent, which would wipe out the SVG.
  function updateFsUi() {
    var on = inFullscreen();
    $('fs').innerHTML = on ? ICON_COMPRESS : ICON_EXPAND;
    $('fs').setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fs').setAttribute('title', on ? 'Exit fullscreen (Esc)' : 'Fullscreen (f)');
    if (!on) $('fsmeta').classList.remove('on');
  }

  document.addEventListener('fullscreenchange', updateFsUi);
  // Land on the page holding whatever was last on screen — the viewer may have
  // paged well past where they started, including while fullscreen.
  function syncGridToCurrent() {
    if (current >= 0) page = Math.floor(current / PER_PAGE);
    render();
    var tile = document.querySelector('.tile[data-idx="' + current + '"]');
    if (tile && tile.scrollIntoView) tile.scrollIntoView({ block: 'center' });
  }

  // Do the work explicitly rather than relying on the dialog's close event:
  // this browser closes a <dialog> without dispatching close or cancel, so a
  // listener never runs and the grid was left on its old page.
  function closeDetail() {
    if ($('modal').open) $('modal').close();
    syncGridToCurrent();
  }

  // Kept for browsers that do dispatch it; a second render is harmless.
  $('modal').addEventListener('close', syncGridToCurrent);

  document.addEventListener('keydown', function (e) {
    if (!$('modal').open) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'f' || e.key === 'F') { $('fs').click(); }
    else if (e.key === ' ' || e.code === 'Space') {
      // Only in fullscreen, and preventDefault so the page does not scroll.
      if (inFullscreen()) { e.preventDefault(); toggleFsMeta(); }
    }
    else if (e.key === 'Escape') {
      // In fullscreen let the browser consume Escape to exit it first. Outside
      // fullscreen, close explicitly — the native dismissal fires no event here.
      if (inFullscreen()) {
        // No native fullscreen to dismiss in fallback mode, so handle it here.
        if (!document.fullscreenElement) { e.preventDefault(); leaveFullscreen(); }
      } else { e.preventDefault(); closeDetail(); }
    }
  });

  var busy = false;
  function setStatus(msg) { $('status').textContent = msg; }

  // ?image=N opens that image, ?page=N shows that page, both 1-based to match
  // what the UI displays. Anything out of range or unparseable is ignored and
  // we simply stay on the first page — best effort, never an error message.
  // image wins over page when both are present.
  // Accepts a 1-based position, an exact slot id (CODE_02), or a bare
  // shortcode (CODE, matching its first slot). Returns -1 if nothing matches.
  function resolveIndex(raw) {
    var value = String(raw).trim();
    if (!value) return -1;
    if (/^\d+$/.test(value)) {
      var n = parseInt(value, 10);
      return (n >= 1 && n <= images.length) ? n - 1 : -1;
    }
    for (var i = 0; i < images.length; i++) {
      if (images[i].id === value) return i;
    }
    for (var j = 0; j < images.length; j++) {
      if (images[j].shortcode === value) return j;
    }
    return -1;
  }

  // Keep the address bar describing what is on screen, so copying it shares
  // the current view. replaceState rather than pushState: stepping through
  // images should not fill the Back button with history entries.
  function syncUrl() {
    if (!images.length || !deepLinkDone) return;
    var query;
    if ($('modal').open && current >= 0 && images[current]) {
      var m = images[current];
      // A bare shortcode resolves to the first slide, so identify a carousel
      // slide by its exact slot id instead.
      query = '?image=' + encodeURIComponent(m.imgCount > 1 ? m.id : m.shortcode);
    } else if (page === 0) {
      // The first page is the baseline: a bare URL always means "page 1",
      // whereas ?page=<shortcode> would drift to another page as newer images
      // push that post down. Home therefore lands on a clean address.
      query = '';
    } else {
      var first = images[page * PER_PAGE];
      if (!first) return;
      query = '?page=' + encodeURIComponent(first.shortcode);
    }
    try {
      if (window.location.search !== query) {
        window.history.replaceState(null, '', query || window.location.pathname);
      }
    } catch (e) { /* history unavailable — the view still works */ }
  }

  function applyDeepLink() {
    if (deepLinkDone || !images.length) return;
    deepLinkDone = true;
    var params;
    try { params = new URLSearchParams(initialSearch); } catch (e) { return; }

    var rawImage = params.get('image');
    if (rawImage !== null) {
      var idx = resolveIndex(rawImage);
      if (idx >= 0) open(idx);
      return; // image wins: ignore ?page whether or not this resolved
    }

    var rawPage = params.get('page');
    if (rawPage !== null) {
      var pages = Math.ceil(images.length / PER_PAGE);
      if (/^\d+$/.test(rawPage.trim())) {
        var p = parseInt(rawPage, 10);
        if (p >= 1 && p <= pages) { page = p - 1; render(); }
        return;
      }
      // A shortcode: show whichever page currently holds that image.
      var byCode = resolveIndex(rawPage);
      if (byCode >= 0) { page = Math.floor(byCode / PER_PAGE); render(); }
    }
  }

  function load(initial) {
    return fetch('/api/images').then(function (r) { return r.json(); }).then(function (d) {
      images = d.images || [];
      progress = d.progress || { loading: false, done: 0, total: 0 };
      render();
      lastRefreshAt = d.lastRefresh || lastRefreshAt;
      applyDeepLink();
      // Keep polling until the startup load finishes, then show the grid.
      if (progress.loading) {
        setStatus('loading ' + progress.done + '/' + (progress.total || '?'));
        setTimeout(function () { load(false); }, 900);
      } else if (!initial) {
        setStatus(images.length + ' images');
      }
    });
  }

  $('refresh').onclick = function () {
    if (busy) return;
    busy = true;
    $('refresh').disabled = true;
    setStatus('refreshing…');
    fetch('/api/refresh', { method: 'POST' })
      .then(function (r) {
        if (r.status === 429) {
          return r.json().then(function (d) {
            setStatus('slow down — retry in ' + Math.ceil((d.retryInMs || 5000) / 1000) + 's');
            return null;
          });
        }
        return r.json();
      })
      .then(function (d) {
        if (d) {
          images = d.images || [];
          progress = d.progress || progress;
          render();
          lastRefreshAt = d.lastRefresh || lastRefreshAt;
          setStatus(d.added + ' new, ' + images.length + ' cached');
        }
      })
      .catch(function () { setStatus('refresh failed'); })
      .finally(function () {
        // Match the server's 5s gate so the button cannot outrun it.
        setTimeout(function () { busy = false; $('refresh').disabled = false; }, 5000);
      });
  };

  load(true);
})();
</script>
</body>
</html>
`;
}
