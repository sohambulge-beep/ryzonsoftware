// Prime Terminal offline helper: keeps the app's own pages and files so it can open without internet.
// It never touches the database or any other website.
const VERSION = "pt-v1";
const PAGES = VERSION + "-pages";
const FILES = VERSION + "-files";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function offlinePage() {
  const html =
    "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>Offline</title><body style='font-family:sans-serif;background:#0b1020;color:#e2e8f0;padding:24px'>" +
    "<h2>You are offline</h2><p>Open the app once with internet. After that it can open here without internet.</p></body>";
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Pages: the internet first (always fresh), the saved copy when there is no internet.
async function pageRequest(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected && res.type === "basic") cache.put(request.url, res.clone());
    return res;
  } catch (e) {
    const hit =
      (await cache.match(request.url, { ignoreVary: true })) || (await cache.match("/", { ignoreVary: true }));
    return hit || offlinePage();
  }
}

// Files: the saved copy at once, and refreshed quietly in the background.
async function fileRequest(request, hashed) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit && hashed) return hit;
  const network = fetch(request)
    .then((res) => {
      if (res.ok && res.type === "basic") cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await network;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_")) return;

  if (request.mode === "navigate") {
    event.respondWith(pageRequest(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(fileRequest(request, true));
    return;
  }
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(fileRequest(request, false));
  }
});
