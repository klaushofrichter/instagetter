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
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1115; --fg: #eef1f5; --muted: #9aa3af; --line: #262b33;
      --card: #171a20; --overlay: rgba(10,12,15,.97);
      --btn: #232830; --btn-fg: #eef1f5;
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0f1115; --fg: #eef1f5; --muted: #9aa3af; --line: #262b33;
    --card: #171a20; --overlay: rgba(10,12,15,.97);
    --btn: #232830; --btn-fg: #eef1f5;
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
  .stage img { position: absolute; inset: 0; margin: auto; max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center;
    background: rgba(0,0,0,.55); color: #fff; border: none; font-size: 1.2rem;
  }
  .nav.prev { left: .75rem; } .nav.next { right: .75rem; }
  .meta { padding: .8rem 1rem; border-top: 1px solid var(--line); max-height: 34vh; overflow: auto; }
  .meta .caption { margin: 0 0 .5rem; }
  .meta dl { display: grid; grid-template-columns: auto 1fr; gap: .15rem .75rem; margin: 0; font-size: .85rem; }
  .meta dt { color: var(--muted); }
  .meta dd { margin: 0; }
  /* Fullscreen targets the stage, so only the image subtree renders — no bar,
     no metadata, no counter. Hide the nav arrows too: the request is the
     picture and nothing else. Cursor keys still navigate. */
  #stage:fullscreen { background: #000; }
  #stage:fullscreen .nav { display: none; }
  #stage:fullscreen img { max-width: 100vw; max-height: 100vh; cursor: default; }
  /* The close control must live inside the stage: nothing outside the
     fullscreen element renders. Same .icon-btn dimensions as the bar's X, and
     positioned to match it — top right. */
  .fs-close { display: none; position: absolute; top: .7rem; right: .7rem; z-index: 2;
    background: rgba(0,0,0,.55); color: #fff; border-color: transparent; }
  .fs-close:hover { background: rgba(0,0,0,.75); border-color: transparent; }
  #stage:fullscreen .fs-close { display: inline-grid; }
  .stage img { cursor: zoom-in; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><a href="${SKYLAR_URL}" target="_blank" rel="noopener noreferrer" title="www.skylar.technology"><img class="mark" src="/favicon.png" alt="www.skylar.technology"></a><a class="title-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" title="Source on GitHub">instagetter</a></h1>
    <a href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">@klaushofrichter</a>
    <span class="spacer"></span>
    <span class="status" id="status"></span>
    <button id="theme" class="icon-btn" title="Toggle light / dark" aria-label="Toggle light or dark theme">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
    <button id="refresh" class="icon-btn" title="Check S3 for new images" aria-label="Refresh">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
    </button>
    <button id="about-open" class="icon-btn" title="About" aria-label="About this site">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/></svg>
    </button>
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
    if (!images.length) {
      el.innerHTML = '<div class="empty">No images cached yet.<br>Press <strong>Refresh</strong> to pull the latest from S3.</div>';
      return;
    }
    var pages = Math.ceil(images.length / PER_PAGE);
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
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
            '<button id="pprev"' + (page === 0 ? ' disabled' : '') + '>Previous</button>' +
            '<span>Page ' + (page + 1) + ' of ' + pages + ' &middot; ' + images.length + ' images</span>' +
            '<button id="pnext"' + (page >= pages - 1 ? ' disabled' : '') + '>Next</button>' +
            '</div>';
    el.innerHTML = html;

    var tiles = el.querySelectorAll('.tile');
    for (var t = 0; t < tiles.length; t++) {
      tiles[t].onclick = function () { open(Number(this.getAttribute('data-idx'))); };
    }
    if ($('pprev')) $('pprev').onclick = function () { page--; render(); window.scrollTo(0, 0); };
    if ($('pnext')) $('pnext').onclick = function () { page++; render(); window.scrollTo(0, 0); };
  }

  function open(i) {
    if (i < 0 || i >= images.length) return;
    current = i;
    var m = images[i];
    $('full').src = '/image/' + encodeURIComponent(m.id) + '.jpg';
    $('full').alt = m.caption || 'Instagram image';
    $('dl').href = '/download/' + encodeURIComponent(m.id) + '.jpg';
    $('counter').textContent = (i + 1) + ' of ' + images.length;
    var rows = '';
    rows += '<dt>Taken</dt><dd>' + esc(fmtDate(m.takenAt)) + '</dd>';
    if (m.location) rows += '<dt>Location</dt><dd>' + esc(m.location) + '</dd>';
    if (m.imgCount > 1) rows += '<dt>Carousel</dt><dd>image ' + m.imgIndex + ' of ' + m.imgCount + '</dd>';
    rows += '<dt>Size</dt><dd>' + m.width + ' &times; ' + m.height + '</dd>';
    if (m.likes != null) rows += '<dt>Likes</dt><dd>' + m.likes + '</dd>';
    rows += '<dt>Post</dt><dd><a href="' + esc(m.postUrl) + '" target="_blank" rel="noopener noreferrer">open on Instagram</a></dd>';
    $('meta').innerHTML = '<p class="caption">' + (m.caption ? esc(m.caption) : '<em>no caption</em>') + '</p><dl>' + rows + '</dl>';
    if (!$('modal').open) $('modal').showModal();
    // Keep the grid on the page the image belongs to.
    page = Math.floor(i / PER_PAGE);
  }

  function step(delta) {
    var next = current + delta;
    if (next < 0) next = images.length - 1;
    if (next >= images.length) next = 0;
    open(next);
  }

  // A real click carries the user activation requestFullscreen() needs, so
  // this works where a programmatic call would be rejected.
  $('full').onclick = function () {
    if (!document.fullscreenElement) enterFullscreen();
  };
  $('fsclose').onclick = function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function (e) { console.error('exitFullscreen', e); });
    }
  };

  $('prev').onclick = function () { step(-1); };
  $('next').onclick = function () { step(1); };
  $('close').onclick = function () { $('modal').close(); };
  $('about-open').onclick = function () { $('about').showModal(); };
  $('about-close').onclick = function () { $('about').close(); };
  // Click the backdrop to dismiss.
  $('about').addEventListener('click', function (e) {
    if (e.target === $('about')) $('about').close();
  });

  function enterFullscreen() {
    var el = $('stage');
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    var r = req.call(el);
    if (r && r.catch) r.catch(function (e) { console.error('requestFullscreen failed', e); });
  }

  $('fs').onclick = function () {
    // Fullscreen the STAGE, not the <dialog> and not documentElement.
    //  - the dialog itself: showModal() already put it in the top layer and
    //    Chrome rejects requestFullscreen() on it.
    //  - documentElement: the whole page enters the top layer *after* the
    //    dialog, so the grid paints on top of the modal.
    // A descendant of the open dialog enters the top layer above it and
    // renders only its own subtree, which is exactly the image.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function (e) { console.error('exitFullscreen', e); });
    } else {
      enterFullscreen();
    }
  };

  var ICON_EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var ICON_COMPRESS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h3a2 2 0 0 0 2-2V3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>';

  // Swap the icon rather than textContent, which would wipe out the SVG.
  document.addEventListener('fullscreenchange', function () {
    var on = !!document.fullscreenElement;
    $('fs').innerHTML = on ? ICON_COMPRESS : ICON_EXPAND;
    $('fs').setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fs').setAttribute('title', on ? 'Exit fullscreen (Esc)' : 'Fullscreen (f)');
  });
  $('modal').addEventListener('close', function () { render(); });

  document.addEventListener('keydown', function (e) {
    if (!$('modal').open) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'f' || e.key === 'F') { $('fs').click(); }
    // Escape closes the dialog natively; if we are fullscreen the browser
    // consumes the first Escape to exit fullscreen, which is what we want.
  });

  var busy = false;
  function setStatus(msg) { $('status').textContent = msg; }

  function load(initial) {
    return fetch('/api/images').then(function (r) { return r.json(); }).then(function (d) {
      images = d.images || [];
      render();
      if (initial && d.lastRefresh) setStatus('updated ' + fmtDate(d.lastRefresh));
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
          render();
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
