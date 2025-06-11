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

// URLs that should not be handled by service worker
const NO_SW_URLS = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'googleapis.com'
];

// Install service worker and cache assets
self.addEventListener('install', event => {
    // Skip waiting to activate the new service worker immediately
    self.skipWaiting();
    
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
    // Claim clients to ensure the new service worker takes control immediately
    event.waitUntil(
        Promise.all([
            // Claim all clients
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

// Fetch resources
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Skip service worker completely for Firebase URLs
    if (NO_SW_URLS.some(url => requestUrl.hostname.includes(url))) {
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

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest, {
                    mode: 'cors',
                    credentials: 'same-origin'
                }).then(
                    response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                ).catch(error => {
                    console.error('Fetch failed:', error);
                    return new Response('Network error happened', {
                        status: 408,
                        headers: new Headers({
                            'Content-Type': 'text/plain'
                        })
                    });
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