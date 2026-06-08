/**
 * EventFlow Africa — Notifications push FCM & préférences
 */

const NotificationService = {
  messaging: null,
  fcmReady: false,

  async initFCM() {
    if (!AuthService.currentUser || this.fcmReady) return;
    if (typeof firebase.messaging !== 'function') return;

    try {
      this.messaging = firebase.messaging();
      this.messaging.onMessage((payload) => {
        const title = payload.notification?.title || 'EventFlow Africa';
        const body = payload.notification?.body || '';
        const url = payload.data?.url || '/events.html';
        this.showLocal(title, body, url);
      });
      this.fcmReady = true;

      const prefs = await this.getPreferences();
      if (prefs.pushEnabled && Notification.permission === 'granted') {
        await this.registerFCMToken();
      }
    } catch (err) {
      console.warn('FCM init:', err);
    }
  },

  async getPreferences() {
    const prefs = AuthService.userData?.preferences;
    return { ...DEFAULT_PREFERENCES, ...prefs };
  },

  async savePreferences(updates) {
    if (!AuthService.currentUser) return;
    const prefs = { ...await this.getPreferences(), ...updates };
    await db.collection(COLLECTIONS.USERS).doc(AuthService.currentUser.uid).update({
      preferences: prefs,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    AuthService.userData = await AuthService.getUserData(AuthService.currentUser.uid);
    return prefs;
  },

  async registerFCMToken() {
    if (!this.messaging || !AuthService.currentUser) return null;

    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      }

      const tokenOptions = { serviceWorkerRegistration: await navigator.serviceWorker.ready };
      if (FCM_VAPID_KEY) tokenOptions.vapidKey = FCM_VAPID_KEY;

      const token = await this.messaging.getToken(tokenOptions);
      if (!token) return null;

      await db.collection(COLLECTIONS.USERS).doc(AuthService.currentUser.uid).update({
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      this.messaging.onTokenRefresh?.(async () => {
        const newToken = await this.messaging.getToken(tokenOptions);
        if (newToken) {
          await db.collection(COLLECTIONS.USERS).doc(AuthService.currentUser.uid).update({
            fcmTokens: firebase.firestore.FieldValue.arrayUnion(newToken)
          });
        }
      });

      return token;
    } catch (err) {
      console.warn('FCM token:', err);
      return null;
    }
  },

  async requestPushPermission() {
    if (!('Notification' in window)) {
      Utils.showToast('Notifications non supportées sur ce navigateur.', 'error');
      return false;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    await this.savePreferences({ pushEnabled: enabled });

    if (!enabled) {
      Utils.showToast('Notifications refusées.', 'error');
      return false;
    }

    await this.initFCM();
    const token = await this.registerFCMToken();

    if (token) {
      Utils.showToast('Notifications push activées !');
      this.showLocal('EventFlow Africa', 'Vous serez alerté des nouveaux événements correspondant à vos critères.');
    } else if (!FCM_VAPID_KEY) {
      Utils.showToast('Notifications locales activées. Ajoutez la clé VAPID FCM pour le push serveur.', 'error');
      this.showLocal('EventFlow Africa', 'Alertes locales activées.');
    } else {
      Utils.showToast('Notifications activées (mode local).');
      this.showLocal('EventFlow Africa', 'Alertes activées.');
    }

    return enabled;
  },

  showLocal(title, body, url = '/') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png'
    });
    n.onclick = () => { window.focus(); if (url) window.location.href = url; n.close(); };
  },

  async checkEventAlerts(events) {
    if (!AuthService.currentUser) return;
    const prefs = await this.getPreferences();
    if (!prefs.notifyNewEvents) return;

    const alerts = await AlertService.getUserAlerts(AuthService.currentUser.uid);
    if (!alerts.length) return;

    const notified = JSON.parse(sessionStorage.getItem('ef-alerts-notified') || '[]');
    for (const event of events) {
      const match = alerts.some(a =>
        (a.type === 'city' && (event.city || event.location || '').toLowerCase().includes(a.value.toLowerCase())) ||
        (a.type === 'category' && event.category === a.value)
      );
      if (match && !notified.includes(event.id)) {
        notified.push(event.id);
        if (prefs.pushEnabled && Notification.permission === 'granted') {
          this.showLocal('Nouvel événement', `${event.title} — ${event.city || event.location || ''}`, `event-details.html?id=${event.id}`);
        }
      }
    }
    sessionStorage.setItem('ef-alerts-notified', JSON.stringify(notified.slice(-50)));
  }
};
