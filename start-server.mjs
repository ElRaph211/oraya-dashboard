/**
 * Lanceur Node.js pour Railway.
 *
 * Le build TanStack Start / Cloudflare Workers produit `dist/server/server.js`
 * qui exporte `default { fetch }`. Ce script wrap ce handler dans un serveur
 * Node `http` pour qu'il tourne sur Railway (container Node persistant).
 *
 * Variables d'environnement Railway :
 *   - PORT     : injectée par Railway (défaut 3000)
 *   - HOSTNAME : doit être 0.0.0.0 (Railway route le trafic via l'IP container)
 */

import { createServer } from "node:http";
import { Readable } from "node:stream";
import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const serverEntry = join(__dirname, "dist", "server", "server.js");
const clientDir = join(__dirname, "dist", "client");

if (!existsSync(serverEntry)) {
  console.error(`❌ Build introuvable : ${serverEntry}\n   Lancez d'abord: npm run build`);
  process.exit(1);
}

const mod = await import(pathToFileURL(serverEntry).href);
const handler = mod.default ?? mod;

if (!handler?.fetch || typeof handler.fetch !== "function") {
  console.error("❌ Le module serveur n'expose pas de handler.fetch()");
  process.exit(1);
}

// Cache MIME (gardé en mémoire — RAM ≪ disque sur Railway)
const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function getMime(p) {
  const dot = p.lastIndexOf(".");
  return dot >= 0 ? MIME[p.slice(dot).toLowerCase()] ?? "application/octet-stream" : "application/octet-stream";
}

function tryServeStatic(reqPath, res) {
  // Sécurité : pas de path traversal
  if (reqPath.includes("..") || reqPath.includes("\0")) return false;
  const candidate = join(clientDir, reqPath.startsWith("/") ? reqPath.slice(1) : reqPath);
  if (!candidate.startsWith(clientDir)) return false;
  if (!existsSync(candidate)) return false;

  try {
    const body = readFileSync(candidate);
    res.statusCode = 200;
    res.setHeader("content-type", getMime(candidate));
    res.setHeader("cache-control", reqPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

function nodeReqToWebRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (typeof v === "string") headers.set(k, v);
  }

  const method = req.method ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? Readable.toWeb(req) : null;

  return new Request(url, {
    method,
    headers,
    body,
    duplex: "half",
  });
}

async function pipeWebResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    // Servir d'abord les assets statiques (rapide)
    const url = req.url ?? "/";
    const pathOnly = url.split("?")[0];
    if (
      pathOnly !== "/" &&
      (pathOnly.startsWith("/assets/") ||
        pathOnly.startsWith("/_build/") ||
        /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ico|map|gif)$/i.test(pathOnly))
    ) {
      if (tryServeStatic(pathOnly, res)) return;
    }

    // Sinon → handler TanStack Start (SSR + API routes)
    const webReq = nodeReqToWebRequest(req);
    const webRes = await handler.fetch(webReq, {}, {});
    await pipeWebResponse(webRes, res);
  } catch (err) {
    console.error("[start-server] Erreur fatale :", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOSTNAME, () => {
  console.log(`▲ Oraya Dashboard en écoute sur http://${HOSTNAME}:${PORT}`);
});

// Arrêt propre (Railway envoie SIGTERM)
function shutdown(signal) {
  console.log(`[start-server] ${signal} reçu — fermeture du serveur…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
