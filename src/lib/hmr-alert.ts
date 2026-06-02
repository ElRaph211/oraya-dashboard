// Dev-only HMR connection alert.
// Shows a fixed banner when Vite's HMR websocket disconnects so the preview
// never silently stays on a stale intermediate state.

export function installHmrAlert() {
  if (typeof window === "undefined") return;
  if (!import.meta.hot) return;

  const BANNER_ID = "oraya-hmr-alert";

  const ensureBanner = (): HTMLDivElement => {
    let el = document.getElementById(BANNER_ID) as HTMLDivElement | null;
    if (el) return el;
    el = document.createElement("div");
    el.id = BANNER_ID;
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:16px",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "background:#0F2D52",
      "color:#fff",
      "font:500 13px/1.4 Montserrat,system-ui,sans-serif",
      "padding:10px 14px",
      "border-radius:8px",
      "box-shadow:0 8px 24px rgba(0,0,0,0.2)",
      "display:flex",
      "align-items:center",
      "gap:10px",
    ].join(";");
    el.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>
      <span>Connexion preview perdue — </span>
      <button id="${BANNER_ID}-reload" style="background:#2A7FE8;color:#fff;border:0;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer;">Recharger</button>
    `;
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>(`#${BANNER_ID}-reload`)?.addEventListener("click", () => {
      window.location.reload();
    });
    return el;
  };

  const removeBanner = () => {
    document.getElementById(BANNER_ID)?.remove();
  };

  import.meta.hot.on("vite:ws:disconnect", ensureBanner);
  import.meta.hot.on("vite:ws:connect", removeBanner);
  import.meta.hot.on("vite:beforeFullReload", removeBanner);
}
