// Self-contained SSR fallback page. Must not import any app code:
// if the rest of the app fails to boot, this page still has to render.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Oraya — Page indisponible</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --navy: #0F2D52;
        --highlight: #2A7FE8;
        --highlight-hover: #1A6FD8;
        --bg: #F5F6F8;
        --text: #1A1F2E;
        --muted: #5B6577;
        --border: #E2E5EB;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
        font-weight: 400;
        color: var(--text);
        background: var(--bg);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        max-width: 480px;
        width: 100%;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 40px 32px;
        text-align: center;
        box-shadow: 0 12px 32px rgba(15, 45, 82, 0.06);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--highlight);
        background: rgba(42, 127, 232, 0.08);
        padding: 6px 12px;
        border-radius: 999px;
        margin-bottom: 20px;
      }
      .badge::before {
        content: "";
        width: 6px;
        height: 6px;
        background: var(--highlight);
        border-radius: 50%;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
        font-weight: 600;
        color: var(--navy);
        line-height: 1.3;
      }
      p {
        margin: 0 0 8px;
        color: var(--muted);
        line-height: 1.55;
      }
      .hint {
        margin-top: 16px;
        padding: 12px 14px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 13px;
        color: var(--muted);
        text-align: left;
      }
      .actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 24px;
      }
      a, button {
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        padding: 10px 18px;
        border-radius: 8px;
        text-decoration: none;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 120ms ease, border-color 120ms ease;
      }
      .primary { background: var(--highlight); color: #fff; }
      .primary:hover { background: var(--highlight-hover); }
      .secondary { background: transparent; color: var(--navy); border-color: var(--navy); }
      .secondary:hover { background: rgba(15, 45, 82, 0.04); }
      .foot {
        margin-top: 28px;
        font-size: 12px;
        color: var(--muted);
      }
      .foot strong { color: var(--navy); font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="assertive">
      <div class="badge">Erreur temporaire</div>
      <h1>La page n'a pas pu se charger</h1>
      <p>Un incident est survenu côté serveur. Vos données ne sont pas perdues.</p>
      <div class="hint">
        Essayez de recharger la page. Si le problème persiste après quelques minutes,
        revenez à l'accueil ou réessayez plus tard.
      </div>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Recharger la page</button>
        <a class="secondary" href="/">Retour à l'accueil</a>
      </div>
      <p class="foot"><strong>Oraya</strong> — Recouvrement amiable B2B</p>
    </main>
  </body>
</html>`;
}
