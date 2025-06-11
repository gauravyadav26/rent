const CACHE_NAME = 'rent-manager-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Install service worker and cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate and clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Take control of all clients
            clients.claim(),
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

// Check if URL scheme is supported for caching
function isCacheable(request) {
    const url = new URL(request.url);
    // Skip caching for unsupported schemes
    if (url.protocol === 'chrome-extension:' || 
        url.protocol === 'chrome:' || 
        url.protocol === 'data:' || 
        url.protocol === 'blob:') {
        return false;
    }
    return true;
}

// Check if request should bypass service worker
function shouldBypassServiceWorker(request) {
    const url = new URL(request.url);
    
    // Bypass Firestore listen channel
    if (url.pathname.includes('/Listen/channel')) {
        return true;
    }
    
    // Existing checks...
    if (request.headers.has('x-firestore-client') || 
        request.headers.has('x-firebase-client') || 
        request.headers.has('x-goog-api-client') ||
        request.headers.get('upgrade') === 'websocket' ||
        request.headers.get('accept')?.includes('text/event-stream')) {
        return true;
    }

    return false;
}

// Fetch resources
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Network-first approach for Firestore requests
    if (url.hostname === 'firestore.googleapis.com') {
        event.respondWith(fetch(request));
        return;
    }
    
    // Bypass service worker for specific requests
    if (shouldBypassServiceWorker(request)) {
        event.respondWith(fetch(request));
        return;
    }

    // Skip caching for unsupported schemes
    if (!isCacheable(request)) {
        event.respondWith(fetch(request));
        return;
    }

    // Handle navigation requests
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return caches.match('/index.html');
                })
        );
        return;
    }

    // For all other requests
    event.respondWith(
        caches.match(request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(request, {
                    mode: 'cors',
                    credentials: 'omit'
                })
                    .then(response => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Only cache if the request is cacheable
                        if (isCacheable(request)) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(request, responseToCache);
                                })
                                .catch(error => {
                                    console.error('Cache put failed:', error);
                                });
                        }

                        return response;
                    })
                    .catch(error => {
                        console.error('Fetch failed:', error);
                        // If fetch fails, try to serve from cache
                        return caches.match(request);
                    });
            })
    );
});

// Listen for skipWaiting
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
}); 