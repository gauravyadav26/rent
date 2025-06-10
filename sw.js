const CACHE_NAME = 'rent-ms-v1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/webfonts/fa-solid-900.woff2'
];

// Debug function
function debug(message) {
    console.log(`[Service Worker] ${message}`);
}

// Install service worker
self.addEventListener('install', event => {
    debug('Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                debug('Opened cache');
                return cache.addAll(urlsToCache)
                    .then(() => {
                        debug('All resources cached successfully');
                    })
                    .catch(error => {
                        debug('Error caching resources: ' + error.message);
                    });
            })
            .then(() => {
                debug('Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                debug('Service Worker installation failed: ' + error.message);
            })
    );
});

// Activate service worker
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
                        if (cacheName !== CACHE_NAME) {
                            debug('Deleting old cache: ' + cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ]).then(() => {
            debug('Service Worker activated successfully');
        })
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    debug('Fetching: ' + event.request.url);
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    debug('Found in cache: ' + event.request.url);
                    return response;
                }
                debug('Not found in cache, fetching: ' + event.request.url);
                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            debug('Invalid response, not caching: ' + event.request.url);
                            return response;
                        }
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                debug('Caching new resource: ' + event.request.url);
                                cache.put(event.request, responseToCache);
                            })
                            .catch(error => {
                                debug('Error caching resource: ' + error.message);
                            });
                        return response;
                    })
                    .catch(error => {
                        debug('Fetch failed: ' + error.message);
                        // You could return a custom offline page here
                        return new Response('Network error occurred', {
                            status: 408,
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
}); 