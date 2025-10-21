const CACHE_NAME = 'rent-manager-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Static assets to cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Debug helper
function debug(message) {
    console.log(`[Service Worker] ${message}`);
}

// Install: Cache static assets
self.addEventListener('install', event => {
    debug('Installing Service Worker...');
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE)
                .then(cache => {
                    debug('Caching static assets...');
                    return cache.addAll(STATIC_ASSETS);
                })
                .then(() => debug('Static assets cached successfully'))
                .catch(err => debug('Static cache failed: ' + err)),
            // Skip waiting to activate immediately
            self.skipWaiting()
        ])
    );
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
    debug('Activating Service Worker...');
    event.waitUntil(
        Promise.all([
            // Take control of all clients
            self.clients.claim(),
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)) {
                            debug('Deleting old cache: ' + cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ]).then(() => debug('Service Worker activated'))
    );
});

// Check if request should bypass caching
function shouldBypass(request) {
    const url = new URL(request.url);

    // Skip non-HTTP(S) requests
    if (!['http:', 'https:'].includes(url.protocol)) {
        debug(`Bypassing non-HTTP(S) request: ${url}`);
        return true;
    }

    // Skip all Firebase/Firestore requests
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('googleapis.com') ||
        url.pathname.includes('/Listen/channel') ||
        request.headers.get('x-firestore-client') ||
        request.headers.get('x-firebase-client') ||
        request.headers.get('x-goog-api-client') ||
        request.headers.get('x-firebase-gmpid') ||
        request.headers.get('x-firebase-appcheck') ||
        request.headers.get('x-firebase-auth')
    ) {
        debug(`Bypassing Firebase request: ${url}`);
        return true;
    }

    // Skip WebSockets and Server-Sent Events
    if (
        request.headers.get('upgrade') === 'websocket' ||
        request.headers.get('accept')?.includes('text/event-stream')
    ) {
        debug(`Bypassing real-time request: ${url}`);
        return true;
    }

    // Skip POST, PUT, DELETE requests
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
        debug(`Bypassing ${request.method} request: ${url}`);
        return true;
    }

    return false;
}

// Fetch: Cache-first with network fallback
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Bypass non-cacheable requests
    if (shouldBypass(request)) {
        event.respondWith(fetch(request));
        return;
    }

    // Navigation requests (fallback to index.html)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Cache-first strategy for all other requests
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    debug(`Serving from cache: ${url}`);
                    return cachedResponse;
                }

                return fetch(request)
                    .then(networkResponse => {
                        // Only cache successful, non-opaque responses
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            const responseToCache = networkResponse.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => {
                                    debug(`Caching new resource: ${url}`);
                                    cache.put(request, responseToCache);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        debug(`Fetch failed, serving fallback for: ${url}`);
                        return new Response('Offline', {
                            status: 503,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});

// Skip waiting on update
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        debug('Skipping waiting phase');
        self.skipWaiting();
    }
});