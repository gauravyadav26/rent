const CACHE_NAME = 'rent-management-v1';
const STATIC_CACHE_NAME = 'static-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-v1';

// Static assets to cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// Debug helper
function debug(message) {
    console.log(`[Service Worker] ${message}`);
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
    debug('Installing Service Worker...');
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE_NAME)
                .then((cache) => {
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

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    debug('Activating Service Worker...');
    event.waitUntil(
        Promise.all([
            // Take control of all clients
            self.clients.claim(),
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Handle Firebase requests differently
    if (event.request.url.includes('firestore.googleapis.com')) {
        event.respondWith(handleFirebaseRequest(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached response if found
                if (response) {
                    return response;
                }

                // Clone the request because it can only be used once
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then(
                    (response) => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response because it can only be used once
                        const responseToCache = response.clone();

                        // Cache the response for future use
                        caches.open(DYNAMIC_CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                );
            })
    );
});

// Handle Firebase requests with custom caching strategy
async function handleFirebaseRequest(request) {
    try {
        // Try network first for Firebase requests
        const networkResponse = await fetch(request);
        
        // Cache the response
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
        
        return networkResponse;
    } catch (error) {
        // If network fails, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // If both network and cache fail, return error
        throw error;
    }
}

// Background sync for offline data
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-tenant-data') {
        event.waitUntil(syncTenantData());
    }
});

// Function to sync tenant data
async function syncTenantData() {
    try {
        const db = await openDB();
        const offlineData = await db.getAll('offlineTenants');
        
        for (const data of offlineData) {
            try {
                // Attempt to sync with Firebase
                await fetch('/api/sync-tenant', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                
                // Remove from offline storage if successful
                await db.delete('offlineTenants', data.id);
            } catch (error) {
                console.error('Failed to sync tenant data:', error);
            }
        }
    } catch (error) {
        console.error('Error in background sync:', error);
    }
}

// Helper function to open IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RentManagementDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('offlineTenants')) {
                db.createObjectStore('offlineTenants', { keyPath: 'id' });
            }
        };
    });
}

// Skip waiting on update
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        debug('Skipping waiting phase');
        self.skipWaiting();
    }
});