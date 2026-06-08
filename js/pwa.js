/**
 * EventFlow Africa — PWA : SW, cache, hors ligne, sync arrière-plan, raccourcis
 */

const PWAService = {
  deferredPrompt: null,

  init() {
    this.registerServiceWorker();
    this.createInstallUI();
    this.createOfflineBar();
    this.createQuickAccessFAB();
    this.setupInstallPrompt();
    this.setupIOSHint();
    this.setupConnectivity();
    this.setupBackgroundSync();
    this.hideInstallUIIfStandalone();
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.showUpdateToast(reg);
              }
            });
          });
          navigator.serviceWorker.ready.then(() => {
            navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_TICKETS_PAGE' });
          });
        })
        .catch((err) => console.warn('SW registration failed:', err));

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'BACKGROUND_SYNC') {
          this.runBackgroundSync();
        }
      });
    });
  },

  createOfflineBar() {
    if (document.getElementById('pwa-offline-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-offline-bar';
    bar.className = 'pwa-offline-bar d-none';
    bar.innerHTML = `
      <i class="bi bi-wifi-off me-2"></i>
      <span>Mode hors ligne</span>
      <a href="tickets-wallet.html" class="pwa-offline-link ms-auto">Mes billets</a>
    `;
    document.body.prepend(bar);
  },

  createQuickAccessFAB() {
    if (document.getElementById('pwa-quick-fab') || document.body.dataset.page === 'tickets-wallet') return;
    const fab = document.createElement('a');
    fab.id = 'pwa-quick-fab';
    fab.href = 'tickets-wallet.html';
    fab.className = 'pwa-quick-fab';
    fab.title = 'Mes billets';
    fab.setAttribute('aria-label', 'Accès rapide à mes billets');
    fab.innerHTML = '<i class="bi bi-ticket-perforated"></i>';
    document.body.appendChild(fab);
  },

  setupConnectivity() {
    const update = () => {
      const bar = document.getElementById('pwa-offline-bar');
      if (bar) bar.classList.toggle('d-none', navigator.onLine);
      document.documentElement.classList.toggle('is-offline', !navigator.onLine);
      if (navigator.onLine) this.runBackgroundSync();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  },

  setupBackgroundSync() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      if ('sync' in reg) {
        window.addEventListener('online', () => this.registerBackgroundSync(reg));
      }
    });
  },

  async registerBackgroundSync(registration) {
    try {
      if ('sync' in registration) {
        await registration.sync.register('eventflow-offline-sync');
      }
    } catch (e) {
      console.warn('Background sync:', e);
    }
  },

  async runBackgroundSync() {
    if (typeof PWAStore !== 'undefined') {
      await PWAStore.processSyncQueue();
    }
    if (typeof OrganizerService !== 'undefined') {
      await OrganizerService.syncOfflineQueue();
    }
    if (AuthService?.currentUser && typeof TicketService !== 'undefined' && navigator.onLine) {
      try {
        const tickets = await TicketService.getUserTickets(AuthService.currentUser.uid);
        await PWAStore?.cacheTickets(AuthService.currentUser.uid, tickets);
      } catch (_) { /* ignore */ }
    }
  },

  createInstallUI() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-install-banner d-none';
    banner.innerHTML = `
      <div class="pwa-install-content">
        <img src="/icons/icon-72.png" alt="" width="40" height="40" class="pwa-install-icon">
        <div class="pwa-install-text">
          <strong>Installer EventFlow Africa</strong>
          <span>Billets hors ligne, notifications et accès rapide</span>
        </div>
        <div class="pwa-install-actions">
          <button type="button" class="btn btn-ef-primary btn-sm" id="pwa-install-btn">
            <i class="bi bi-download me-1"></i> Installer
          </button>
          <button type="button" class="btn btn-ef-outline btn-sm pwa-install-dismiss" id="pwa-install-dismiss" aria-label="Fermer">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn')?.addEventListener('click', () => this.promptInstall());
    document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => this.dismissBanner());
  },

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (this.isStandalone()) return;
      if (sessionStorage.getItem('pwa-install-dismissed')) return;
      this.showBanner();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.hideBanner();
      Utils?.showToast?.('Application installée — accédez à vos billets depuis l\'écran d\'accueil !');
    });
  },

  setupIOSHint() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari && !this.isStandalone() && !sessionStorage.getItem('pwa-ios-hint-shown')) {
      setTimeout(() => {
        if (!this.deferredPrompt) {
          this.showIOSHint();
          sessionStorage.setItem('pwa-ios-hint-shown', '1');
        }
      }, 3000);
    }
  },

  showIOSHint() {
    const hint = document.createElement('div');
    hint.id = 'pwa-ios-hint';
    hint.className = 'pwa-ios-hint';
    hint.innerHTML = `
      <p><i class="bi bi-box-arrow-up me-2"></i> Sur iPhone : <strong>Partager</strong> → <strong>Sur l'écran d'accueil</strong> pour installer et accéder à vos billets hors ligne.</p>
      <button type="button" class="pwa-ios-hint-close" aria-label="Fermer">&times;</button>
    `;
    document.body.appendChild(hint);
    hint.querySelector('.pwa-ios-hint-close')?.addEventListener('click', () => hint.remove());
    setTimeout(() => hint.remove(), 12000);
  },

  async promptInstall() {
    if (!this.deferredPrompt) {
      Utils?.showToast?.('Installation non disponible sur ce navigateur.', 'error');
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    if (outcome === 'accepted') this.hideBanner();
  },

  showBanner() {
    document.getElementById('pwa-install-banner')?.classList.remove('d-none');
  },

  hideBanner() {
    document.getElementById('pwa-install-banner')?.classList.add('d-none');
  },

  dismissBanner() {
    sessionStorage.setItem('pwa-install-dismissed', '1');
    this.hideBanner();
  },

  hideInstallUIIfStandalone() {
    if (this.isStandalone()) {
      document.getElementById('pwa-install-banner')?.classList.add('d-none');
      document.documentElement.classList.add('pwa-standalone');
    }
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  },

  showUpdateToast(reg) {
    Utils?.showToast?.('Nouvelle version disponible. Rechargez pour mettre à jour.');
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },

  async cacheUserTickets(userId, tickets) {
    if (typeof PWAStore === 'undefined' || !userId) return;
    await PWAStore.cacheTickets(userId, tickets);
  }
};

document.addEventListener('DOMContentLoaded', () => PWAService.init());
window.PWAService = PWAService;
