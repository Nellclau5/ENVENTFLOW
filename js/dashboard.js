/**
 * EventFlow Africa — Dashboard Organisateur
 */

const DashboardService = {
  /**
   * Initialise le dashboard
   */
  async init() {
    await AuthService.requireAuth();
    this.setupSidebar();
    this.populateUserInfo();

    const page = document.body.dataset.page;
    switch (page) {
      case 'dashboard':
        await this.loadDashboard();
        await this.loadProfile();
        if (AuthService.hasRole(ROLES.ORGANIZER) || AuthService.hasRole(ROLES.ADMIN)) {
          this.setupScanner();
        }
        break;
      case 'create-event': await this.loadEventForm(); break;
    }
  },

  setupSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('dashboard-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const MOBILE_BREAKPOINT = 992;

    const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

    const openSidebar = () => {
      sidebar?.classList.add('open');
      overlay?.classList.add('show');
      document.body.classList.add('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'true');
    };

    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('show');
      document.body.classList.remove('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'false');
    };

    if (toggle && sidebar) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) closeSidebar();
        else openSidebar();
      });
      overlay?.addEventListener('click', closeSidebar);

      document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          if (isMobile()) closeSidebar();
        });
      });

      window.addEventListener('resize', () => {
        if (!isMobile()) closeSidebar();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
      });
    }

    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      if (item.dataset.page === currentPage) item.classList.add('active');
    });
  },

  populateUserInfo() {
    const user = AuthService.currentUser;
    const data = AuthService.userData;
    if (!user) return;

    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = data?.displayName || user.email;
    });
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = user.email;
    });
    document.querySelectorAll('[data-user-initials]').forEach(el => {
      el.textContent = Utils.getInitials(data?.displayName || user.email);
    });

    // Masquer sections organisateur si user simple
    if (!AuthService.hasRole(ROLES.ORGANIZER) && !AuthService.hasRole(ROLES.ADMIN)) {
      document.querySelectorAll('[data-organizer-only]').forEach(el => el.classList.add('d-none'));
    }
  },

  /**
   * Charge les stats du dashboard
   */
  async loadDashboard() {
    const userId = AuthService.currentUser.uid;
    const isOrganizer = AuthService.hasRole(ROLES.ORGANIZER) || AuthService.hasRole(ROLES.ADMIN);

    const tickets = await TicketService.getUserTickets(userId);
    const purchases = await TicketService.getPurchaseHistory(userId);

    if (isOrganizer) {
      const stats = await EventService.getOrganizerStats(userId);
      this.renderOrganizerStats(stats);
      const events = await EventService.getOrganizerEvents(userId);
      this.renderEventsTable(events, 'events-table-body');
    } else {
      this.renderUserDashboardStats(tickets, purchases);
    }

    TicketService.renderUserTickets(tickets, 'user-tickets-container');
    this.renderPurchaseHistory(purchases);
  },

  renderOrganizerStats(stats) {
    const container = document.getElementById('stats-grid');
    if (!container) return;

    container.innerHTML = `
      <div class="col-md-6 col-xl-3">
        <div class="dash-stat-card">
          <div class="dash-stat-icon primary"><i class="bi bi-calendar-event"></i></div>
          <div class="dash-stat-value">${stats.totalEvents}</div>
          <div class="dash-stat-label">Événements totaux</div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="dash-stat-card">
          <div class="dash-stat-icon success"><i class="bi bi-check-circle"></i></div>
          <div class="dash-stat-value">${stats.publishedEvents}</div>
          <div class="dash-stat-label">Publiés</div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="dash-stat-card">
          <div class="dash-stat-icon info"><i class="bi bi-ticket-perforated"></i></div>
          <div class="dash-stat-value">${stats.totalTickets}</div>
          <div class="dash-stat-label">Billets vendus</div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="dash-stat-card">
          <div class="dash-stat-icon warning"><i class="bi bi-currency-exchange"></i></div>
          <div class="dash-stat-value">${Utils.formatPrice(stats.totalRevenue)}</div>
          <div class="dash-stat-label">Revenus totaux</div>
        </div>
      </div>
    `;
  },

  renderUserDashboardStats(tickets, purchases) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
      <div class="col-md-4">
        <div class="dash-stat-card">
          <div class="dash-stat-icon primary"><i class="bi bi-ticket-perforated"></i></div>
          <div class="dash-stat-value">${tickets.length}</div>
          <div class="dash-stat-label">Mes billets</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="dash-stat-card">
          <div class="dash-stat-icon success"><i class="bi bi-bag-check"></i></div>
          <div class="dash-stat-value">${purchases.length}</div>
          <div class="dash-stat-label">Achats</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="dash-stat-card">
          <div class="dash-stat-icon info"><i class="bi bi-currency-exchange"></i></div>
          <div class="dash-stat-value">${Utils.formatPrice(purchases.reduce((s, p) => s + (p.amount || 0), 0))}</div>
          <div class="dash-stat-label">Total dépensé</div>
        </div>
      </div>
    `;
  },

  renderPurchaseHistory(purchases) {
    const historyContainer = document.getElementById('purchase-history-body');
    if (!historyContainer) return;

    historyContainer.innerHTML = purchases.length === 0
      ? '<tr><td colspan="4" class="text-center text-muted py-4">Aucun achat</td></tr>'
      : purchases.map(p => `
        <tr>
          <td>${p.eventTitle}</td>
          <td>${p.quantity || 1}</td>
          <td>${Utils.formatPrice(p.amount)}</td>
          <td>${Utils.formatDate(p.purchasedAt)}</td>
        </tr>
      `).join('');
  },

  renderEventsTable(events, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Aucun événement</td></tr>';
      return;
    }

    tbody.innerHTML = events.map(event => `
      <tr>
        <td><strong>${event.title}</strong></td>
        <td>${event.category || '-'}</td>
        <td>${Utils.formatDate(event.date)}</td>
        <td>${event.soldTickets || 0} / ${event.capacity}</td>
        <td><span class="${event.status === EVENT_STATUS.PUBLISHED ? 'badge-published' : 'badge-draft'}">
          ${event.status === EVENT_STATUS.PUBLISHED ? 'Publié' : 'Brouillon'}
        </span></td>
        <td>
          <div class="d-flex gap-1">
            <a href="create-event.html?id=${event.id}" class="btn-action edit" title="Modifier">
              <i class="bi bi-pencil"></i>
            </a>
            <button class="btn-action view" title="Participants" onclick="DashboardService.showParticipants('${event.id}')">
              <i class="bi bi-people"></i>
            </button>
            <button class="btn-action delete" title="Supprimer" onclick="DashboardService.deleteEvent('${event.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  async showParticipants(eventId) {
    const participants = await TicketService.getEventParticipants(eventId);
    const modal = document.getElementById('participants-modal');
    const tbody = document.getElementById('participants-table-body');
    if (!modal || !tbody) return;

    tbody.innerHTML = participants.length === 0
      ? '<tr><td colspan="4" class="text-center text-muted">Aucun participant</td></tr>'
      : participants.map(p => `
        <tr>
          <td>${p.userName}</td>
          <td>${p.userEmail}</td>
          <td>${p.ticketCode}</td>
          <td><span class="badge ${p.status === TICKET_STATUS.VALID ? 'badge-valid' : 'badge-used'}">${p.status}</span></td>
        </tr>
      `).join('');

    new bootstrap.Modal(modal).show();
  },

  async deleteEvent(eventId) {
    await EventService.deleteEvent(eventId);
    const events = await EventService.getOrganizerEvents(AuthService.currentUser.uid);
    this.renderEventsTable(events, 'events-table-body');
    const stats = await EventService.getOrganizerStats(AuthService.currentUser.uid);
    this.renderOrganizerStats(stats);
  },

  /**
   * Formulaire création/édition événement
   */
  async loadEventForm() {
    await AuthService.requireOrganizer();
    await seedDefaultCategories();
    await EventService.populateCategorySelect('event-category', '', true);

    const eventId = Utils.getUrlParam('id');
    if (eventId) {
      document.getElementById('form-title').textContent = 'Modifier l\'événement';
      const event = await EventService.getEvent(eventId);
      this.fillEventForm(event);
      await EventService.populateCategorySelect('event-category', event.category || '', true);
    }

    const form = document.getElementById('event-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = this.getEventFormData();

      if (!data.category) {
        Utils.showToast('Veuillez choisir une catégorie.', 'error');
        document.getElementById('event-category')?.focus();
        return;
      }

      try {
        if (eventId) {
          await EventService.updateEvent(eventId, data);
        } else {
          await EventService.createEvent(data);
        }
        window.location.href = 'dashboard.html';
      } catch (_) {
        /* toast déjà affiché */
      }
    });
  },

  fillEventForm(event) {
    document.getElementById('event-title').value = event.title || '';
    document.getElementById('event-description').value = event.description || '';
    document.getElementById('event-category').value = event.category || '';
    document.getElementById('event-date').value = event.date?.toDate
      ? event.date.toDate().toISOString().split('T')[0]
      : event.date || '';
    document.getElementById('event-time').value = event.time || '';
    document.getElementById('event-location').value = event.location || '';
    document.getElementById('event-price').value = event.price || 0;
    document.getElementById('event-capacity').value = event.capacity || '';
    document.getElementById('event-status').value = event.status || EVENT_STATUS.DRAFT;
    document.getElementById('event-image').value = event.imageUrl || '';
  },

  getEventFormData() {
    return {
      title: document.getElementById('event-title').value.trim(),
      description: document.getElementById('event-description').value.trim(),
      category: document.getElementById('event-category').value,
      date: document.getElementById('event-date').value,
      time: document.getElementById('event-time').value,
      location: document.getElementById('event-location').value.trim(),
      price: parseInt(document.getElementById('event-price').value) || 0,
      capacity: parseInt(document.getElementById('event-capacity').value) || 0,
      status: document.getElementById('event-status').value,
      imageUrl: document.getElementById('event-image').value.trim()
    };
  },

  /**
   * Profil utilisateur
   */
  async loadProfile() {
    const data = AuthService.userData;
    if (!data) return;

    document.getElementById('profile-name').value = data.displayName || '';
    document.getElementById('profile-email').value = data.email || AuthService.currentUser.email;
    document.getElementById('profile-phone').value = data.phone || '';
    document.getElementById('profile-bio').value = data.bio || '';

    const form = document.getElementById('profile-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await AuthService.updateProfile({
        displayName: document.getElementById('profile-name').value.trim(),
        phone: document.getElementById('profile-phone').value.trim(),
        bio: document.getElementById('profile-bio').value.trim()
      });
      this.populateUserInfo();
    });

    const tickets = await TicketService.getUserTickets(AuthService.currentUser.uid);
    TicketService.renderUserTickets(tickets, 'profile-tickets');
  },

  html5QrCode: null,

  /**
   * Prépare le scanner QR (sans activer la caméra)
   */
  setupScanner() {
    document.getElementById('start-scanner-btn')?.addEventListener('click', () => {
      this.startScanner();
    });

    document.getElementById('stop-scanner-btn')?.addEventListener('click', () => {
      this.stopScanner();
    });

    document.getElementById('manual-scan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('manual-ticket-code').value.trim();
      if (code) await this.handleScanResult(code);
    });
  },

  /**
   * Démarre la caméra pour scanner un QR Code
   */
  async startScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      Utils.showToast('Scanner non disponible.', 'error');
      return;
    }

    const startBtn = document.getElementById('start-scanner-btn');
    const stopBtn = document.getElementById('stop-scanner-btn');

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode('qr-reader');
      }

      await this.html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await this.handleScanResult(decodedText);
          await this.stopScanner();
        },
        () => {}
      );

      if (startBtn) startBtn.classList.add('d-none');
      if (stopBtn) stopBtn.classList.remove('d-none');
    } catch (err) {
      Utils.showToast('Impossible d\'accéder à la caméra. Utilisez la saisie manuelle.', 'error');
    }
  },

  async stopScanner() {
    const startBtn = document.getElementById('start-scanner-btn');
    const stopBtn = document.getElementById('stop-scanner-btn');

    if (this.html5QrCode) {
      try {
        await this.html5QrCode.stop();
      } catch (_) { /* déjà arrêté */ }
    }

    if (startBtn) startBtn.classList.remove('d-none');
    if (stopBtn) stopBtn.classList.add('d-none');
  },

  /**
   * @deprecated Utiliser setupScanner + startScanner
   */
  async loadScanner() {
    this.setupScanner();
  },

  async handleScanResult(ticketCode) {
    const resultEl = document.getElementById('scan-result');
    if (!resultEl) return;

    const result = await TicketService.verifyTicket(ticketCode);

    resultEl.className = 'scan-result';
    if (result.valid) {
      resultEl.classList.add('valid');
      resultEl.innerHTML = `
        <i class="bi bi-check-circle-fill text-success fs-1"></i>
        <h5 class="mt-2">${result.message}</h5>
        <p><strong>${result.ticket.userName}</strong> — ${result.event.title}</p>
        <p class="text-muted small">N° ${result.ticket.ticketCode}</p>
        <button class="btn btn-ef-primary mt-2" onclick="DashboardService.validateTicket('${result.ticket.id}')">
          Marquer comme utilisé
        </button>
      `;
    } else if (result.used) {
      resultEl.classList.add('used');
      resultEl.innerHTML = `
        <i class="bi bi-exclamation-triangle-fill text-warning fs-1"></i>
        <h5 class="mt-2">${result.message}</h5>
        <p>${result.ticket?.userName || ''}</p>
      `;
    } else {
      resultEl.classList.add('invalid');
      resultEl.innerHTML = `
        <i class="bi bi-x-circle-fill text-danger fs-1"></i>
        <h5 class="mt-2">${result.message}</h5>
      `;
    }
  },

  async validateTicket(ticketId) {
    await TicketService.markTicketUsed(ticketId);
    document.getElementById('scan-result').innerHTML = `
      <i class="bi bi-check-circle-fill text-success fs-1"></i>
      <h5 class="mt-2">Entrée validée !</h5>
    `;
  }
};

window.DashboardService = DashboardService;

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('dashboard-page')) {
    DashboardService.init();
  }
});
