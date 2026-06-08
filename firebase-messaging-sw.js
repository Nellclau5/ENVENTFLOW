/* EventFlow Africa — Service Worker FCM (messages en arrière-plan) */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBmn7YsizRGD7rXQ2ZJHgBmxiXQi6rC3K4',
  authDomain: 'eventflow-africa.firebaseapp.com',
  projectId: 'eventflow-africa',
  storageBucket: 'eventflow-africa.firebasestorage.app',
  messagingSenderId: '249089579362',
  appId: '1:249089579362:web:81b2ed59d0b8926ddab43b'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'EventFlow Africa';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url: payload.data?.url || payload.fcmOptions?.link || '/events.html' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
