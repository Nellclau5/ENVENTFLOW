/**
 * EventFlow Africa — Scanner contrôleur (page dédiée)
 */

const ScanService = {
  html5QrCode: null,

  async init() {
    await AuthService.requireController();
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('start-scanner-btn')?.addEventListener('click', () => this.startScanner());
    document.getElementById('stop-scanner-btn')?.addEventListener('click', () => this.stopScanner());
    document.getElementById('manual-scan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('manual-ticket-code').value.trim();
      if (code) await this.handleScanResult(code);
    });
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
      btn.addEventListener('click', () => AuthService.logout());
    });
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
          await this.handleScanResult(decodedText);
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

  async handleScanResult(ticketCode) {
    const resultEl = document.getElementById('scan-result');
    if (!resultEl) return;

    const result = await TicketService.verifyTicket(ticketCode);
    resultEl.className = 'scan-result-card';

    if (result.valid) {
      resultEl.classList.add('valid');
      resultEl.innerHTML = `
        <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Accès autorisé</h5>
        <p class="mb-1"><strong>${result.ticket.userName}</strong></p>
        <p class="text-white-50 small">${result.event.title}</p>
        <p class="text-white-50 small">N° ${result.ticket.ticketCode}</p>
        <button class="btn btn-ef-primary mt-3" onclick="ScanService.validateTicket('${result.ticket.id}')">
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

  async validateTicket(ticketId) {
    await TicketService.markTicketUsed(ticketId);
    const resultEl = document.getElementById('scan-result');
    if (resultEl) {
      resultEl.className = 'scan-result-card valid';
      resultEl.innerHTML = `
        <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
        <h5 class="mt-3 text-white">Entrée validée !</h5>
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
