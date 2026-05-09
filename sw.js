const CACHE_NAME = 'zenith-v0.007'; // Versione aggiornata

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './Zenith_css.css',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './lib/d3.v7.min.js',
  './lib/chart.umd.min.js',
  './lib/confetti.browser.min.js',
  './lib/html2pdf.bundle.min.js',
  './lib/crypto-js.min.js',
  './js/AuthManager.js',
  './js/CalendarManager.js',
  './js/ExportManager.js',
  './js/FileSystemManager.js',
  './js/GamificationManager.js',
  './js/GraphManager.js',
  './js/NotesManager.js',
  './js/PlanManager.js',
  './js/SettingsManager.js',
  './js/TagManager.js',
  './js/Utils.js',
  './js/ZenithEngine.js'
];

self.addEventListener('install', (event) => {
    // 🛑 RIMOSSO: self.skipWaiting(); 
    // Ora il Service Worker aspetterà pazientemente che l'utente clicchi il Toast.

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (let asset of ASSETS_TO_CACHE) {
                try {
                    await cache.add(asset);
                } catch (e) {
                    console.warn(`[PWA] Impossibile mettere in cache: ${asset}`, e);
                }
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        })
    );
});

// 🟢 ASCOLTTORE DEL TOAST: Se l'utente clicca "Aggiorna", forziamo l'attivazione
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            new Promise((resolve, reject) => {
                // ⏱️ IL CRONOMETRO (3 secondi)
                const timeoutId = setTimeout(() => {
                    reject(new Error('Timeout: Rete lenta o server spento'));
                }, 3000);

                // Gara: Scarica il file
                fetch(event.request).then(response => {
                    clearTimeout(timeoutId); // Ha vinto internet! Spegni il cronometro
                    resolve(response);
                }).catch(err => {
                    clearTimeout(timeoutId); // Non c'è proprio internet! Spegni cronometro
                    reject(err);
                });
            }).catch(() => {
                // Se il cronometro scade o manca internet, restituiamo il salvataggio locale!
                return caches.match('./index.html');
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});