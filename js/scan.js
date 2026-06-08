/**
 * EventFlow Africa — Scanner staff (mode jour J)
 */

const ScanService = {
  html5QrCode: null,
  scanCount: 0,

  async init() {
    await AuthService.requireController();
    await this.loadOrganizerEvents();
    this.bindEvents();
    OrganizerService.syncOfflineQueue();
    this.updateOfflineBadge();
    window.addEventListener('online', () => {
      OrganizerService.syncOfflineQueue().then(() => this.updateOfflineBadge());
    });
  },

  async loadOrganizerEvents() {
    const wrap = document.getElementById('scan-event-filter-wrap');
    const select = document.getElementById('scan-event-filter');
    if (!select) return;
    if (!AuthService.hasRole(ROLES.ORGANIZER) && !AuthService.hasRole(ROLES.ADMIN)) {
      wrap?.classList.add('d-none');
      return;
    }
    const events = await EventService.getOrganizerEvents(AuthService.currentUser.uid);
    const published = events.filter(e => e.status === EVENT_STATUS.PUBLISHED);
    select.innerHTML = '<option value="">Tous les événements</option>' +
      published.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
  },

  bindEvents() {
    document.getElementById('start-scanner-btn')?.addEventListener('click', () => this.startScanner());
    document.getElementById('stop-scanner-btn')?.addEventListener('click', () => this.stopScanner());
    document.getElementById('manual-scan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('manual-ticket-code').value.trim();
      if (code) await this.handleScanResult(code, 'manual');
    });
    document.getElementById('sync-offline-btn')?.addEventListener('click', async () => {
      await OrganizerService.syncOfflineQueue();
      this.updateOfflineBadge();
    });
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
      btn.addEventListener('click', () => AuthService.logout());
    });
  },

  updateOfflineBadge() {
    const n = OrganizerService.getOfflineQueueCount();
    const badge = document.getElementById('offline-queue-badge');
    if (badge) {
      badge.textContent = n;
      badge.classList.toggle('d-none', n === 0);
    }
  },

  async startScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      Utils.showToast('Scanner non disponible.', 'error');
      return;
    }

    const startBtn = document.getElementById('start-scanner-btn');
    const stopBtn = document.getElementById('stop-scanner-btn');

    try {
      if (!this.html5QrCode) this.html5QrCode = new Html5Qrcode('qr-reader');
      await this.html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await this.handleScanResult(decodedText, 'qr');
          await this.stopScanner();
        },
        () => {}
      );
      startBtn?.classList.add('d-none');
      stopBtn?.classList.remove('d-none');
    } catch (_) {
      Utils.showToast('Caméra indisponible. Utilisez la saisie manuelle.', 'error');
    }
  },

  async stopScanner() {
    const startBtn = document.getElementById('start-scanner-btn');
    const stopBtn = document.getElementById('stop-scanner-btn');
    if (this.html5QrCode) {
      try { await this.html5QrCode.stop(); } catch (_) { /* noop */ }
    }
    startBtn?.classList.remove('d-none');
    stopBtn?.classList.add('d-none');
  },

  async handleScanResult(ticketCode, method = 'qr') {
    const resultEl = document.getElementById('scan-result');
    if (!resultEl) return;

    const eventFilter = document.getElementById('scan-event-filter')?.value;

    if (!navigator.onLine) {
      resultEl.className = 'scan-result-card used';
      resultEl.innerHTML = `
        <i class="bi bi-wifi-off text-warning" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Mode hors ligne</h5>
        <p class="text-white-50">Code : ${ticketCode}</p>
        <button class="btn btn-ef-primary mt-2" onclick="ScanService.validateOffline('${ticketCode}')">
          Valider localement
        </button>
      `;
      return;
    }

    const result = await TicketService.verifyTicket(ticketCode);
    resultEl.className = 'scan-result-card';

    if (eventFilter && result.ticket && result.ticket.eventId !== eventFilter) {
      resultEl.classList.add('invalid');
      resultEl.innerHTML = `
        <i class="bi bi-x-circle-fill text-danger" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Mauvais événement</h5>
        <p class="text-white-50">Ce billet n'appartient pas à l'événement sélectionné.</p>
      `;
      return;
    }

    if (result.valid) {
      resultEl.classList.add('valid');
      resultEl.innerHTML = `
        <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Accès autorisé</h5>
        <p class="mb-1"><strong>${result.ticket.userName}</strong></p>
        <p class="text-white-50 small">${result.event.title}</p>
        <p class="text-white-50 small">${result.ticket.ticketTypeName || 'Standard'} — N° ${result.ticket.ticketCode}</p>
        <button class="btn btn-ef-primary mt-3" onclick="ScanService.validateTicket('${result.ticket.id}', '${method}')">
          Valider l'entrée
        </button>
      `;
    } else if (result.used) {
      resultEl.classList.add('used');
      resultEl.innerHTML = `
        <i class="bi bi-exclamation-triangle-fill text-warning" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Billet déjà utilisé</h5>
        <p class="text-white-50">${result.ticket?.userName || ''}</p>
        <p class="text-white-50 small">Premier scan : ${Utils.formatDate(result.usedAt)}</p>
        <p class="text-warning small mt-2">Alerte fraude possible</p>
      `;
    } else {
      resultEl.classList.add('invalid');
      resultEl.innerHTML = `
        <i class="bi bi-x-circle-fill text-danger" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Accès refusé</h5>
        <p class="text-white-50">${result.message}</p>
      `;
    }
  },

  async validateTicket(ticketId, method = 'qr') {
    await TicketService.markTicketUsed(ticketId, { method, allowOffline: true });
    this.scanCount++;
    const counter = document.getElementById('scan-counter');
    if (counter) counter.textContent = this.scanCount;
    const resultEl = document.getElementById('scan-result');
    if (resultEl) {
      resultEl.className = 'scan-result-card valid';
      resultEl.innerHTML = `
        <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Entrée validée !</h5>
        <p class="text-white-50 small">Total aujourd'hui : ${this.scanCount}</p>
      `;
    }
  },

  validateOffline(ticketCode) {
    OrganizerService.queueOfflineScan(ticketCode, `offline-${Date.now()}`, '');
    this.scanCount++;
    this.updateOfflineBadge();
    const resultEl = document.getElementById('scan-result');
    if (resultEl) {
      resultEl.className = 'scan-result-card valid';
      resultEl.innerHTML = `
        <i class="bi bi-cloud-upload text-warning" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Enregistré hors ligne</h5>
        <p class="text-white-50 small">Code ${ticketCode} — sync à la reconnexion</p>
      `;
    }
  }
};

window.ScanService = ScanService;

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'scan') {
    ScanService.init();
  }
});
