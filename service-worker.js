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

// Fetch resources
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Skip service worker for Firebase URLs and unsupported schemes
    if (requestUrl.hostname.includes('firestore.googleapis.com') ||
        requestUrl.hostname.includes('firebase.googleapis.com') ||
        requestUrl.hostname.includes('googleapis.com') ||
        !isCacheable(event.request)) {
        return;
    }

    // Handle navigation requests
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('/index.html');
                })
        );
        return;
    }

    // For all other requests
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Only cache if the request is cacheable
                        if (isCacheable(event.request)) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }

                        return response;
                    })
                    .catch(() => {
                        // If fetch fails, try to serve from cache
                        return caches.match(event.request);
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