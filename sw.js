const CACHE_NAME = 'beckon-stars-pwa-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg'
];

importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBe8IOiotq6hEe_4tLyi6ADZtwg5PIXGWU',
  authDomain: 'beckon-stars.firebaseapp.com',
  projectId: 'beckon-stars',
  storageBucket: 'beckon-stars.firebasestorage.app',
  messagingSenderId: '838652591035',
  appId: '1:838652591035:web:1eee865a9316b4ed7ae29e',
  measurementId: 'G-7PWKE7H34J'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(notification.title || '星喚新訊息', {
    body: notification.body || '你有新的家庭訊息',
    icon: './icons/icon.svg',
    badge: './icons/icon.svg',
    tag: data.familyId ? `beckon-stars-${data.familyId}` : 'beckon-stars-message',
    data: {
      url: './index.html',
      ...data
    }
  });
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
