/**
 * EventFlow Africa — PWA : enregistrement SW + bouton d'installation
 */

const PWAService = {
  deferredPrompt: null,

  init() {
    this.registerServiceWorker();
    this.createInstallUI();
    this.setupInstallPrompt();
    this.setupIOSHint();
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
                this.showUpdateToast();
              }
            });
          });
        })
        .catch((err) => console.warn('SW registration failed:', err));
    });
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
          <span>Accédez à vos événements comme une app mobile</span>
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
      Utils?.showToast?.('Application installée avec succès !');
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
      <p><i class="bi bi-box-arrow-up me-2"></i> Sur iPhone : touchez <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'app.</p>
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

    if (outcome === 'accepted') {
      this.hideBanner();
    }
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

  showUpdateToast() {
    Utils?.showToast?.('Une nouvelle version est disponible. Rechargez la page.');
  }
};

document.addEventListener('DOMContentLoaded', () => PWAService.init());

window.PWAService = PWAService;
