export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>instagetter</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #14161a;
    --muted: #5c6470;
    --line: #e3e6ea;
    --accent: #c13584;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161a; --fg: #eef1f5; --muted: #9aa3af; --line: #2a2f38; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem 1.25rem;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { width: 100%; max-width: 34rem; }
  h1 { margin: 0 0 .25rem; font-size: 1.75rem; letter-spacing: -.02em; }
  p.lede { margin: 0 0 1.75rem; color: var(--muted); }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem 1.4rem; }
  .row { display: flex; justify-content: space-between; gap: 1rem; padding: .45rem 0; }
  .row + .row { border-top: 1px solid var(--line); }
  .row span:first-child { color: var(--muted); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .dot { display: inline-block; width: .55rem; height: .55rem; border-radius: 50%; background: var(--accent); margin-right: .45rem; }
  footer { margin-top: 1.5rem; color: var(--muted); font-size: .85rem; }
</style>
</head>
<body>
<main>
  <h1><span class="dot"></span>instagetter</h1>
  <p class="lede">Placeholder page — the real interface comes later.</p>
  <div class="card">
    <div class="row"><span>Status</span><span>running</span></div>
    <div class="row"><span>Health check</span><span><code>GET /health</code></span></div>
    <div class="row"><span>API</span><span><code>GET /api/status</code> (bearer token)</span></div>
  </div>
  <footer>insta.skylar.technology</footer>
</main>
</body>
</html>
`;
}
