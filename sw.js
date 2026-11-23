// Wardrobe Buddy service worker: makes the app open offline.
// Caches ONLY this app's own files (same origin, under the base path). It never touches
// other hosts (the weather service is not cached here; the app keeps its own 1-hour cache),
// and it stores no personal data: profile, clothes and photos live in the app's storage.
const CACHE = 'wb-70644a845bcb';
const BASE = '';
const PRECACHE = [
  "/_expo/static/js/web/[id]-45b1b9f17a433dc190db2794ddae3dcc.js",
  "/_expo/static/js/web/__common-c4a7044f5c71496f6d9b25f1fb2ca6b4.js",
  "/_expo/static/js/web/__expo-metro-runtime-ed4c1cfa6193d76fc294130e42bd1916.js",
  "/_expo/static/js/web/_layout-1097bd4f9e34d7c350bdc325cf0f5c56.js",
  "/_expo/static/js/web/_layout-68aa1a3bedd27c4fc8a5703aaf3e13f1.js",
  "/_expo/static/js/web/entry-93c9f47ccc615d25d154cb2c61bf6f3b.js",
  "/_expo/static/js/web/index-12f35fa33c8b64627212a629cd49ab06.js",
  "/_expo/static/js/web/me-6dee00ddb62407c6e321191797fb4129.js",
  "/_expo/static/js/web/onboarding-368ae3e67200b423a385f11d9440d213.js",
  "/_expo/static/js/web/parent-2803d154feb9cee25b2a214cbbdac8af.js",
  "/_expo/static/js/web/wardrobe-b512cbd0368abf954326586ba5df07ec.js",
  "/apple-touch-icon.png",
  "/assets/node_modules/expo-router/assets/arrow_down.017bc6ba3fc25503e5eb5e53826d48a8.png",
  "/assets/node_modules/expo-router/assets/error.d1ea1496f9057eb392d5bbf3732a61b7.png",
  "/assets/node_modules/expo-router/assets/file.19eeb73b9593a38f8e9f418337fc7d10.png",
  "/assets/node_modules/expo-router/assets/forward.d8b800c443b8972542883e0b9de2bdc6.png",
  "/assets/node_modules/expo-router/assets/pkg.ab19f4cbc543357183a20571f68380a3.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon-mask.0a328cd9c1afd0afe8e3b1ec5165b1b4.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@2x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@3x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@4x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@2x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@3x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@4x.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/search-icon.286d67d3f74808a60a78d3ebf1a5fb57.png",
  "/assets/node_modules/expo-router/assets/sitemap.412dd9275b6b48ad28f5e3d81bb1f626.png",
  "/assets/node_modules/expo-router/assets/unmatched.20e71bdf79e3a97bf55fd9e164041578.png",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/index.html",
  "/manifest.webmanifest",
  "/metadata.json"
];
const POSE_CACHE = 'pose-page';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Keep this version and the one before it: a tab that is still open on the old version keeps
// lazy-loading its old (hashed) route files, which are gone from the server after a deploy.
// Cache Storage lists keys in creation order.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const ours = keys.filter((k) => k.startsWith('wb-'));
        const keep = new Set([CACHE, ...ours.filter((k) => k !== CACHE).slice(-1)]);
        return Promise.all(ours.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

/** Network first with a time limit, so a weak signal doesn't mean a long blank screen. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // The offline pose page (D-064) loads in a hidden frame: hashed name, so cache it on first use.
  if (req.destination === 'iframe' && /\/pose\.[0-9a-f]+\.html$/.test(url.pathname)) {
    event.respondWith(
      // Its own cache, outside the per-deploy "wb-" caches, so a new deploy doesn't mean another
      // 6.8 MB download; only the newest pose page is kept. It holds no personal data.
      caches.open(POSE_CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) {
                const copy = res.clone();
                c.keys()
                  .then((keys) => Promise.all(keys.filter((k) => k.url !== req.url).map((k) => c.delete(k))))
                  .then(() => c.put(req, copy));
              }
              return res;
            }),
        ),
      ),
    );
    return;
  }
  if (req.mode === 'navigate') {
    // App pages: network first (to get updates), the cached app shell when offline.
    event.respondWith(withTimeout(fetch(req), 3000).catch(() => caches.match(BASE + '/index.html')));
    return;
  }
  // Built files have content hashes in their names, so cache-first is safe. `caches.match`
  // searches this version's cache and the previous one.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
