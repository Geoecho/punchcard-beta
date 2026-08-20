// 86° Punchcard — Service Worker
// Network-first for API, Stale-While-Revalidate for app shell

const CACHE_NAME = '86-punchcard-v75';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './lib/qrcode.min.js',
  './lib/html5-qrcode.min.js'
];

// Pre-cache app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy: Network-first for API and app-shell code, Stale-While-
// Revalidate for static assets that rarely change.
//
// The app shell (HTML/JS/CSS) used to be Stale-While-Revalidate too, which
// meant every deploy landed invisibly: the very next launch after a fix
// shipped, users still got the OLD cached app.js/index.html immediately
// (the fresh copy only replaced it in the background, for the launch
// *after* that one). On a loyalty-card PWA that's often opened once, left
// running, and reopened from the home screen days later, that lag reads
// as "the fix didn't work." Network-first means a fix is live the moment
// someone opens the app with any connectivity at all; the cache is now
// purely an offline fallback, not the default answer.
const APP_SHELL_PATHS = ['/', '/index.html', '/app.js', '/styles.css', '/menu.html', '/leaderboard.html', '/poster.html'];

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // The Cache API only supports http(s) requests — a browser extension's
  // own chrome-extension:// (or moz-extension://, etc.) requests can end
  // up passing through here on some setups, and cache.put() throws for
  // any other scheme. Let the browser handle those directly.
  if (!url.startsWith('http:') && !url.startsWith('https:')) return;

  // NEVER cache Supabase API or any external API calls — always go to network
  if (url.includes('supabase.co') || url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      fetch(event.request).catch(() => null)
    );
    return;
  }

  const path = new URL(url).pathname;
  const isAppShell = event.request.mode === 'navigate' || APP_SHELL_PATHS.includes(path);

  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (icons, third-party libs): Stale-While-Revalidate —
  // these change rarely, so serving the cached copy instantly and
  // refreshing it in the background is the right tradeoff.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseClone))
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================
self.addEventListener('push', (event) => {
  let data = { title: 'Eightysix°', body: '' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Eightysix°', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: data.url || './' }
    })
  );
});

// Focus an already-open tab on this origin if there is one, instead of
// always opening a new one, then navigate it to the notification's target.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data && event.notification.data.url || './', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
