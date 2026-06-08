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

    const isOrganizer = AuthService.hasRole(ROLES.ORGANIZER) || AuthService.hasRole(ROLES.ADMIN);
    const isStaff = isOrganizer || AuthService.hasRole(ROLES.CONTROLLER);

    if (!isOrganizer) {
      document.querySelectorAll('[data-organizer-only]').forEach(el => el.classList.add('d-none'));
    }
    if (!isStaff) {
      document.querySelectorAll('[data-staff-only]').forEach(el => el.classList.add('d-none'));
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
      this.subscribeOrganizerRealtime(userId);
      OrganizerService.renderSalesLive(events, 'sales-live-list');
      if (this._salesUnsub) this._salesUnsub();
      this._salesUnsub = OrganizerService.subscribeOrganizerSales(userId, (evts) => {
        OrganizerService.renderSalesLive(evts, 'sales-live-list');
      });
      OrganizerService.syncOfflineQueue();
    } else {
      this.renderUserDashboardStats(tickets, purchases);
    }

    TicketService.renderUserTickets(tickets, 'user-tickets-container');
    this.renderPurchaseHistory(purchases);
    await this.loadClientSections();
  },

  async loadClientSections() {
    const userId = AuthService.currentUser.uid;
    const [favEvents, alerts, transfers] = await Promise.all([
      FavoriteService.getFavoriteEvents(userId),
      AlertService.getUserAlerts(userId),
      TicketService.getTransferHistory(userId)
    ]);
    FavoriteService.renderFavoritesList(favEvents, 'favorites-list');
    AlertService.renderAlerts(alerts, 'user-alerts-list');
    this.renderTransferHistory(transfers);
  },

  renderOrganizerStats(stats) {
    const container = document.getElementById('stats-grid');
    if (!container) return;

    const fillRate = stats.totalCapacity > 0
      ? Math.round((stats.totalTickets / stats.totalCapacity) * 100)
      : 0;

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
      <div class="col-md-6 col-xl-3">
        <div class="dash-stat-card">
          <div class="dash-stat-icon primary"><i class="bi bi-pie-chart"></i></div>
          <div class="dash-stat-value">${fillRate}%</div>
          <div class="dash-stat-label">Taux de remplissage</div>
        </div>
      </div>
    `;
  },

  subscribeOrganizerRealtime(organizerId) {
    if (this._organizerUnsub) this._organizerUnsub();
    this._organizerUnsub = db.collection(COLLECTIONS.EVENTS)
      .where('organizerId', '==', organizerId)
      .onSnapshot(async () => {
        const stats = await EventService.getOrganizerStats(organizerId);
        this.renderOrganizerStats(stats);
        const events = await EventService.getOrganizerEvents(organizerId);
        this.renderEventsTable(events, 'events-table-body');
      }, (err) => console.warn('Realtime:', err));
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
      ? '<tr><td colspan="6" class="text-center text-muted py-4">Aucune commande</td></tr>'
      : purchases.map(p => `
        <tr>
          <td><code class="small">${p.ticketCode || p.id.slice(0, 8)}</code></td>
          <td>${p.eventTitle}</td>
          <td>${p.quantity || 1}</td>
          <td>${Utils.formatPrice(p.amount)}</td>
          <td>${Utils.formatDate(p.purchasedAt)}</td>
          <td>${p.ticketId ? `<button type="button" class="btn btn-sm btn-ef-outline" onclick="TicketService.showTicketModal('${p.ticketId}')">Billet</button>` : '—'}</td>
        </tr>
      `).join('');
  },

  renderTransferHistory(transfers) {
    const tbody = document.getElementById('transfer-history-body');
    if (!tbody) return;
    tbody.innerHTML = transfers.length === 0
      ? '<tr><td colspan="5" class="text-center text-muted py-4">Aucun transfert</td></tr>'
      : transfers.map(t => `
        <tr>
          <td>${t.eventTitle}</td>
          <td><code class="small">${t.ticketCode}</code></td>
          <td><span class="badge ${t.direction === 'sent' ? 'badge-used' : 'badge-valid'}">${t.direction === 'sent' ? 'Envoyé' : 'Reçu'}</span></td>
          <td>${t.direction === 'sent' ? t.toUserEmail : t.fromUserEmail}</td>
          <td>${Utils.formatDate(t.transferredAt)}</td>
        </tr>
      `).join('');
  },

  openTransferModal(ticketId) {
    document.getElementById('transfer-ticket-id').value = ticketId;
    document.getElementById('transfer-email').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('transfer-modal')).show();
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
        <td><span class="${EventService.getStatusBadgeClass(event.status)}">${EventService.getStatusLabel(event.status, event)}</span></td>
        <td>
          <div class="d-flex gap-1">
            <a href="create-event.html?id=${event.id}" class="btn-action edit" title="Modifier">
              <i class="bi bi-pencil"></i>
            </a>
            <button class="btn-action view" title="Participants" onclick="DashboardService.showParticipants('${event.id}')">
              <i class="bi bi-people"></i>
            </button>
            <button class="btn-action edit" title="Dupliquer" onclick="DashboardService.duplicateEvent('${event.id}')">
              <i class="bi bi-copy"></i>
            </button>
            <button class="btn-action delete" title="Supprimer" onclick="DashboardService.deleteEvent('${event.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  _currentParticipantsEventId: null,

  async showParticipants(eventId) {
    this._currentParticipantsEventId = eventId;
    const event = await EventService.getEvent(eventId);
    const [participants, waitlist, logs] = await Promise.all([
      TicketService.getEventParticipants(eventId),
      OrganizerService.getWaitlist(eventId),
      OrganizerService.getEntryLogs(eventId, 20)
    ]);
    const modal = document.getElementById('participants-modal');
    const tbody = document.getElementById('participants-table-body');
    const titleEl = document.getElementById('participants-modal-title');
    if (!modal || !tbody) return;

    if (titleEl) titleEl.textContent = `Participants — ${event.title}`;

    tbody.innerHTML = participants.length === 0
      ? '<tr><td colspan="6" class="text-center text-muted">Aucun participant</td></tr>'
      : participants.map(p => `
        <tr>
          <td>${p.userName}</td>
          <td>${p.userEmail}</td>
          <td>${p.ticketTypeName || 'Standard'}</td>
          <td><code class="small">${p.ticketCode}</code></td>
          <td>${Utils.formatPrice(p.totalPrice || p.price)}</td>
          <td><span class="badge ${p.status === TICKET_STATUS.VALID ? 'badge-valid' : 'badge-used'}">${p.status}</span></td>
        </tr>
      `).join('');

    OrganizerService.renderWaitlist(waitlist, 'waitlist-table-body');
    OrganizerService.renderEntryLogs(logs, 'entry-logs-table-body');

    new bootstrap.Modal(modal).show();
  },

  async duplicateEvent(eventId) {
    await OrganizerService.duplicateEvent(eventId);
    const events = await EventService.getOrganizerEvents(AuthService.currentUser.uid);
    this.renderEventsTable(events, 'events-table-body');
  },

  exportParticipantsCSV() {
    if (this._currentParticipantsEventId) {
      OrganizerService.exportParticipantsCSV(this._currentParticipantsEventId);
    }
  },

  exportParticipantsPDF() {
    if (this._currentParticipantsEventId) {
      OrganizerService.exportParticipantsPDF(this._currentParticipantsEventId);
    }
  },

  async sendParticipantNotification(channel) {
    if (!this._currentParticipantsEventId) return;
    const message = document.getElementById('notify-message')?.value.trim();
    if (!message) {
      Utils.showToast('Saisissez un message.', 'error');
      return;
    }
    await OrganizerService.sendNotification(this._currentParticipantsEventId, {
      channel,
      subject: 'EventFlow Africa',
      message,
      target: 'all'
    });
  },

  exportSalesCSV() {
    OrganizerService.exportSalesCSV(AuthService.currentUser.uid);
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
  ticketTypeCounter: 0,

  async loadEventForm() {
    await AuthService.requireOrganizer();
    await seedDefaultCategories();
    await EventService.populateCategorySelect('event-category', '', true);
    this.setupTicketTypesUI();

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

  setupTicketTypesUI() {
    const toggle = document.getElementById('use-ticket-types');
    const simple = document.getElementById('simple-ticket-fields');
    const section = document.getElementById('ticket-types-section');

    toggle?.addEventListener('change', () => {
      const on = toggle.checked;
      simple?.classList.toggle('d-none', on);
      section?.classList.toggle('d-none', !on);
      if (on && !document.querySelector('.ticket-type-row')) {
        this.addTicketTypeRow({ name: 'Standard', price: 5000, quota: 100 });
      }
    });

    document.getElementById('add-ticket-type-btn')?.addEventListener('click', () => {
      this.addTicketTypeRow();
    });

    document.getElementById('add-promo-btn')?.addEventListener('click', () => {
      OrganizerService.addPromoCodeRow();
    });
  },

  addTicketTypeRow(data = {}) {
    const list = document.getElementById('ticket-types-list');
    if (!list) return;
    const id = `tt-${++this.ticketTypeCounter}`;
    const row = document.createElement('div');
    row.className = 'ticket-type-row';
    row.dataset.typeId = data.id || id;
    row.dataset.sold = data.sold || 0;
    row.innerHTML = `
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small">Nom</label>
          <input type="text" class="form-control form-control-sm tt-name" value="${data.name || ''}" placeholder="VIP" required>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Type</label>
          <select class="form-select form-select-sm tt-kind">
            <option value="${TICKET_KINDS.STANDARD}" ${data.kind === TICKET_KINDS.STANDARD || !data.kind ? 'selected' : ''}>Standard</option>
            <option value="${TICKET_KINDS.VIP}" ${data.kind === TICKET_KINDS.VIP ? 'selected' : ''}>VIP</option>
            <option value="${TICKET_KINDS.EARLY_BIRD}" ${data.kind === TICKET_KINDS.EARLY_BIRD ? 'selected' : ''}>Early bird</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Prix (FCFA)</label>
          <input type="number" class="form-control form-control-sm tt-price" min="0" value="${data.price ?? 0}">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Quota</label>
          <input type="number" class="form-control form-control-sm tt-quota" min="1" value="${data.quota || 50}" required>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Early bird jusqu'au</label>
          <input type="date" class="form-control form-control-sm tt-early-until" value="${data.earlyBirdUntil || ''}">
        </div>
        <div class="col-md-1">
          <button type="button" class="btn btn-sm btn-outline-danger w-100 remove-tt-btn"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
    row.querySelector('.remove-tt-btn')?.addEventListener('click', () => row.remove());
    list.appendChild(row);
  },

  fillEventForm(event) {
    document.getElementById('event-title').value = event.title || '';
    document.getElementById('event-description').value = event.description || '';
    document.getElementById('event-category').value = event.category || '';
    document.getElementById('event-date').value = event.date?.toDate
      ? event.date.toDate().toISOString().split('T')[0]
      : event.date || '';
    document.getElementById('event-time').value = event.time || '';
    document.getElementById('event-city').value = event.city || '';
    document.getElementById('event-location').value = event.location || '';
    document.getElementById('event-price').value = event.price || 0;
    document.getElementById('event-capacity').value = event.capacity || '';
    document.getElementById('event-status').value =
      event.status === EVENT_STATUS.PUBLISHED ? EVENT_STATUS.PENDING : (event.status || EVENT_STATUS.DRAFT);
    document.getElementById('event-image').value = event.imageUrl || '';

    if (event.ticketTypes?.length) {
      document.getElementById('use-ticket-types').checked = true;
      document.getElementById('simple-ticket-fields')?.classList.add('d-none');
      document.getElementById('ticket-types-section')?.classList.remove('d-none');
      document.getElementById('ticket-types-list').innerHTML = '';
      event.ticketTypes.forEach(t => this.addTicketTypeRow(t));
    }
    const waitlistEl = document.getElementById('event-waitlist');
    if (waitlistEl) waitlistEl.checked = !!event.waitlistEnabled;
    const pubAt = event.scheduledPublishAt;
    if (pubAt && document.getElementById('event-scheduled-publish')) {
      const d = pubAt.toDate ? pubAt.toDate() : new Date(pubAt);
      document.getElementById('event-scheduled-publish').value = d.toISOString().slice(0, 16);
    }
    OrganizerService.fillPromoCodes(event.promoCodes || []);
  },

  collectTicketTypes() {
    return Array.from(document.querySelectorAll('.ticket-type-row')).map(row => ({
      id: row.dataset.typeId,
      name: row.querySelector('.tt-name')?.value.trim(),
      kind: row.querySelector('.tt-kind')?.value || TICKET_KINDS.STANDARD,
      price: parseInt(row.querySelector('.tt-price')?.value) || 0,
      regularPrice: parseInt(row.querySelector('.tt-price')?.value) || 0,
      earlyBirdUntil: row.querySelector('.tt-early-until')?.value || null,
      quota: parseInt(row.querySelector('.tt-quota')?.value) || 0,
      sold: parseInt(row.dataset.sold) || 0
    })).filter(t => t.name);
  },

  getEventFormData() {
    const useTypes = document.getElementById('use-ticket-types')?.checked;
    const ticketTypes = useTypes ? this.collectTicketTypes() : [];
    const capacity = useTypes
      ? ticketTypes.reduce((s, t) => s + t.quota, 0)
      : parseInt(document.getElementById('event-capacity').value) || 0;
    const price = useTypes
      ? (ticketTypes[0]?.price || 0)
      : parseInt(document.getElementById('event-price').value) || 0;

    return {
      title: document.getElementById('event-title').value.trim(),
      description: document.getElementById('event-description').value.trim(),
      category: document.getElementById('event-category').value,
      date: document.getElementById('event-date').value,
      time: document.getElementById('event-time').value,
      city: document.getElementById('event-city')?.value.trim() || '',
      location: document.getElementById('event-location').value.trim(),
      price,
      capacity,
      ticketTypes: useTypes ? ticketTypes : [],
      status: document.getElementById('event-status').value,
      imageUrl: document.getElementById('event-image').value.trim(),
      waitlistEnabled: document.getElementById('event-waitlist')?.checked || false,
      scheduledPublishAt: document.getElementById('event-scheduled-publish')?.value || null,
      promoCodes: OrganizerService.collectPromoCodes()
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

    const prefs = { ...DEFAULT_PREFERENCES, ...data.preferences };
    document.getElementById('pref-city').value = prefs.preferredCity || '';
    document.getElementById('pref-notify-events').checked = prefs.notifyNewEvents !== false;
    document.getElementById('pref-notify-favorites').checked = prefs.notifyFavorites !== false;
    document.getElementById('pref-notify-reminders').checked = prefs.notifyReminders !== false;

    const form = document.getElementById('profile-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await AuthService.updateProfile({
          displayName: document.getElementById('profile-name').value.trim(),
          phone: document.getElementById('profile-phone').value.trim(),
          bio: document.getElementById('profile-bio').value.trim()
        });
        this.populateUserInfo();
      });
    }

    const pwdForm = document.getElementById('password-form');
    if (pwdForm && !pwdForm.dataset.bound) {
      pwdForm.dataset.bound = '1';
      pwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-password').value;
        if (newPwd !== confirm) {
          Utils.showToast('Les mots de passe ne correspondent pas.', 'error');
          return;
        }
        await AuthService.changePassword(document.getElementById('current-password').value, newPwd);
        pwdForm.reset();
      });
    }

    const prefForm = document.getElementById('preferences-form');
    if (prefForm && !prefForm.dataset.bound) {
      prefForm.dataset.bound = '1';
      prefForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await AuthService.updatePreferences({
          preferredCity: document.getElementById('pref-city').value.trim(),
          notifyNewEvents: document.getElementById('pref-notify-events').checked,
          notifyFavorites: document.getElementById('pref-notify-favorites').checked,
          notifyReminders: document.getElementById('pref-notify-reminders').checked
        });
        Utils.showToast('Préférences enregistrées !');
      });
    }

    document.getElementById('enable-push-btn')?.addEventListener('click', () => {
      NotificationService.requestPushPermission();
    });

    const alertForm = document.getElementById('add-alert-form');
    if (alertForm && !alertForm.dataset.bound) {
      alertForm.dataset.bound = '1';
      alertForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await AlertService.addAlert(
          document.getElementById('alert-type').value,
          document.getElementById('alert-value').value
        );
        document.getElementById('alert-value').value = '';
        const alerts = await AlertService.getUserAlerts(AuthService.currentUser.uid);
        AlertService.renderAlerts(alerts, 'user-alerts-list');
      });
    }

    const transferForm = document.getElementById('transfer-form');
    if (transferForm && !transferForm.dataset.bound) {
      transferForm.dataset.bound = '1';
      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticketId = document.getElementById('transfer-ticket-id').value;
        const email = document.getElementById('transfer-email').value;
        const ok = await TicketService.transferTicket(ticketId, email);
        if (ok) {
          bootstrap.Modal.getInstance(document.getElementById('transfer-modal'))?.hide();
          const userId = AuthService.currentUser.uid;
          const [tickets, transfers] = await Promise.all([
            TicketService.getUserTickets(userId),
            TicketService.getTransferHistory(userId)
          ]);
          TicketService.renderUserTickets(tickets, 'user-tickets-container');
          this.renderTransferHistory(transfers);
        }
      });
    }
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
        <p class="text-muted small">Premier scan : ${Utils.formatDate(result.usedAt)}</p>
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
    await TicketService.markTicketUsed(ticketId, { method: 'qr', allowOffline: true });
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
