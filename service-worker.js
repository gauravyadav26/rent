const CACHE_NAME = 'rent-manager-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// --- Install: Cache static assets ---
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .catch(err => console.log('Cache installation failed:', err))
    );
});

// --- Activate: Clean up old caches ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- Check if request should bypass caching ---
function shouldBypass(request) {
    const url = new URL(request.url);

    // Skip non-HTTP(S) requests
    if (!['http:', 'https:'].includes(url.protocol)) {
        return true;
    }

    // Skip Firestore/Firebase real-time connections
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.pathname.includes('/Listen/channel') ||
        request.headers.get('upgrade') === 'websocket' ||
        request.headers.get('accept')?.includes('text/event-stream')
    ) {
        return true;
    }

    // Skip dynamic API requests (adjust if needed)
    if (url.pathname.startsWith('/api/')) {
        return true;
    }

    return false;
}

// --- Fetch: Serve from cache or network ---
self.addEventListener('fetch', event => {
    const request = event.request;

    // Bypass for non-cacheable requests
    if (shouldBypass(request)) {
        event.respondWith(fetch(request));
        return;
    }

    // Handle navigation requests (fallback to index.html)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // For all other requests: Cache-first strategy
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            // Return cached response if found
            if (cachedResponse) {
                return cachedResponse;
            }

            // Fetch from network and cache if successful
            return fetch(request).then(networkResponse => {
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }

                // Clone and cache the response
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache).catch(err => {
                        console.log('Failed to cache:', request.url, err);
                    });
                });

                return networkResponse;
            }).catch(() => {
                // Optional: Return a fallback response here if needed
                return new Response('Offline fallback content', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            });
        })
    );
});

// --- Skip waiting on update ---
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});