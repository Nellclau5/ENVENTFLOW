/**

 * EventFlow Africa — Administration

 */



const AdminService = {

  async init() {

    await AuthService.requireAdmin();

    DashboardService.setupSidebar();

    DashboardService.populateUserInfo();



    await seedDefaultCategories();
    await AdminPlatformService.init();

    const tab = Utils.getUrlParam('tab') || 'overview';

    await this.loadOverview();
    await this.loadUsers();
    await this.loadEvents();
    await this.loadModerationQueue();
    await this.loadOrganizerQueue();
    await this.loadTrustTab();
    await this.loadFinancesTab();
    await this.loadSupportTab();
    await this.loadCategories();
    this.bindCommissionForm();



    const tabEl = document.querySelector(`[data-bs-target="#tab-${tab}"]`);

    if (tabEl) new bootstrap.Tab(tabEl).show();

  },



  async loadOverview() {
    const stats = await AdminPlatformService.getGlobalStats();
    const eventsSnap = await db.collection(COLLECTIONS.EVENTS).get();
    const events = eventsSnap.docs.map(d => d.data());
    const ratePct = Math.round(stats.commissionRate * 100);

    document.getElementById('admin-stats').innerHTML = `
      <div class="dash-stat-card">
        <div class="dash-stat-icon primary"><i class="bi bi-people"></i></div>
        <div class="dash-stat-value">${stats.users}</div>
        <div class="dash-stat-label">Utilisateurs (${stats.suspendedUsers} suspendus)</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon success"><i class="bi bi-calendar-event"></i></div>
        <div class="dash-stat-value">${stats.events}</div>
        <div class="dash-stat-label">Événements (${stats.publishedEvents} publiés)</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon warning"><i class="bi bi-hourglass-split"></i></div>
        <div class="dash-stat-value">${stats.pendingEvents}</div>
        <div class="dash-stat-label">Événements en attente</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon info"><i class="bi bi-ticket-perforated"></i></div>
        <div class="dash-stat-value">${stats.ticketsSold}</div>
        <div class="dash-stat-label">Billets vendus</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon warning"><i class="bi bi-currency-exchange"></i></div>
        <div class="dash-stat-value">${Utils.formatPrice(stats.totalRevenue)}</div>
        <div class="dash-stat-label">Revenus globaux</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon primary"><i class="bi bi-percent"></i></div>
        <div class="dash-stat-value">${Utils.formatPrice(stats.totalCommissions)}</div>
        <div class="dash-stat-label">Commissions (${ratePct}%)</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon primary"><i class="bi bi-person-badge"></i></div>
        <div class="dash-stat-value">${stats.organizers}</div>
        <div class="dash-stat-label">Organisateurs (${stats.pendingOrganizers} en attente)</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon danger"><i class="bi bi-exclamation-triangle"></i></div>
        <div class="dash-stat-value">${stats.openDisputes + stats.openReports}</div>
        <div class="dash-stat-label">Litiges & signalements ouverts</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon info"><i class="bi bi-qr-code-scan"></i></div>
        <div class="dash-stat-value">${stats.scansToday}</div>
        <div class="dash-stat-label">Scans aujourd'hui</div>
      </div>
    `;



    const categoryStats = {};

    events.forEach(e => {

      const cat = e.category || 'Autre';

      categoryStats[cat] = (categoryStats[cat] || 0) + 1;

    });



    const chartContainer = document.getElementById('category-chart');

    if (chartContainer) {

      const max = Math.max(...Object.values(categoryStats), 1);

      chartContainer.innerHTML = Object.entries(categoryStats).map(([cat, count]) => `

        <div class="mb-2">

          <div class="d-flex justify-content-between small mb-1">

            <span>${cat}</span><span>${count}</span>

          </div>

          <div class="progress" style="height:8px">

            <div class="progress-bar" style="width:${(count / max) * 100}%;background:var(--ef-primary)"></div>

          </div>

        </div>

      `).join('') || '<p class="text-muted">Aucune donnée</p>';

    }



    const financeEl = document.getElementById('finance-summary');

    if (financeEl) {

      const netOrganizers = stats.totalRevenue - stats.totalCommissions;

      financeEl.innerHTML = `
        <div class="finance-row"><span>Volume total des ventes</span><strong>${Utils.formatPrice(stats.totalRevenue)}</strong></div>
        <div class="finance-row"><span>Commissions EventFlow (${ratePct}%)</span><strong class="text-primary">${Utils.formatPrice(stats.totalCommissions)}</strong></div>
        <div class="finance-row"><span>Reversé aux organisateurs (estimé)</span><strong>${Utils.formatPrice(netOrganizers)}</strong></div>
        <div class="finance-row"><span>Remboursements en attente</span><strong class="text-warning">${stats.pendingRefunds}</strong></div>
        <p class="text-muted small mt-3 mb-0">Les commissions sont calculées automatiquement à chaque achat de billet.</p>
      `;

    }

  },



  getAccountStatusLabel(status) {

    const labels = {

      [ACCOUNT_STATUS.ACTIVE]: 'Actif',

      [ACCOUNT_STATUS.PENDING]: 'En attente',

      [ACCOUNT_STATUS.SUSPENDED]: 'Suspendu'

    };

    return labels[status] || 'Actif';

  },



  async loadUsers() {

    const snapshot = await db.collection(COLLECTIONS.USERS).orderBy('createdAt', 'desc').get();

    const tbody = document.getElementById('admin-users-body');

    if (!tbody) return;



    tbody.innerHTML = snapshot.docs.map(doc => {

      const user = doc.data();

      const status = user.accountStatus || ACCOUNT_STATUS.ACTIVE;

      return `

        <tr>

          <td>${user.displayName || '-'}</td>

          <td>${user.email}</td>

          <td><span class="user-role-badge ${user.role}">${user.role}</span></td>

          <td><span class="account-status-badge ${status}">${this.getAccountStatusLabel(status)}</span></td>

          <td>${Utils.formatDate(user.createdAt)}</td>

          <td>

            <div class="d-flex flex-wrap gap-1">

              <select class="form-select form-select-sm" style="width:auto" onchange="AdminService.changeUserRole('${doc.id}', this.value)">

                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>

                <option value="organizer" ${user.role === 'organizer' ? 'selected' : ''}>Organizer</option>

                <option value="controller" ${user.role === 'controller' ? 'selected' : ''}>Controller</option>

                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>

              </select>

              ${user.role === ROLES.ORGANIZER && status === ACCOUNT_STATUS.PENDING

                ? `<button class="btn btn-sm btn-ef-primary" onclick="AdminService.approveOrganizer('${doc.id}')">Approuver</button>`

                : ''}

              ${status !== ACCOUNT_STATUS.SUSPENDED

                ? `<button class="btn btn-sm btn-outline-danger" onclick="AdminService.suspendUser('${doc.id}')">Suspendre</button>`

                : `<button class="btn btn-sm btn-ef-outline" onclick="AdminService.activateUser('${doc.id}')">Réactiver</button>`

              }

            </div>

          </td>

        </tr>

      `;

    }).join('');

  },



  async changeUserRole(userId, newRole) {
    try {
      if (userId === AuthService.currentUser?.uid && newRole !== ROLES.ADMIN) {
        Utils.showToast('Vous ne pouvez pas retirer votre propre rôle admin.', 'error');
        await this.loadUsers();
        return;
      }
      if (newRole !== ROLES.ADMIN) {
        const admins = await db.collection(COLLECTIONS.USERS).where('role', '==', ROLES.ADMIN).get();
        const target = await db.collection(COLLECTIONS.USERS).doc(userId).get();
        if (target.data()?.role === ROLES.ADMIN && admins.size <= 1) {
          Utils.showToast('Impossible : dernier administrateur.', 'error');
          await this.loadUsers();
          return;
        }
      }

      const updates = { role: newRole, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

      if (newRole === ROLES.ORGANIZER) {

        const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

        if (!doc.data()?.accountStatus) updates.accountStatus = ACCOUNT_STATUS.PENDING;

      } else {

        updates.accountStatus = ACCOUNT_STATUS.ACTIVE;

      }

      await db.collection(COLLECTIONS.USERS).doc(userId).update(updates);
      await AdminPlatformService.logAction('role_change', userId, { newRole });

      Utils.showToast('Rôle mis à jour.');

      await this.loadUsers();

      await this.loadOverview();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async approveOrganizer(userId) {

    try {

      await db.collection(COLLECTIONS.USERS).doc(userId).update({

        accountStatus: ACCOUNT_STATUS.ACTIVE,

        updatedAt: firebase.firestore.FieldValue.serverTimestamp()

      });

      Utils.showToast('Organisateur approuvé.');
      await AdminPlatformService.logAction('organizer_approve', userId, {});

      await this.loadUsers();
      await this.loadOrganizerQueue();
      await this.loadOverview();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async suspendUser(userId) {
    const reason = prompt('Motif de suspension (fraude, abus, etc.) :') || 'Compte suspendu par admin';
    if (!reason) return;

    try {
      await db.collection(COLLECTIONS.USERS).doc(userId).update({
        accountStatus: ACCOUNT_STATUS.SUSPENDED,
        suspendedReason: reason,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await AdminPlatformService.logAction('account_suspend', userId, { reason });

      Utils.showToast('Compte suspendu.');

      await this.loadUsers();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async activateUser(userId) {

    try {

      await db.collection(COLLECTIONS.USERS).doc(userId).update({

        accountStatus: ACCOUNT_STATUS.ACTIVE,

        updatedAt: firebase.firestore.FieldValue.serverTimestamp()

      });

      Utils.showToast('Compte réactivé.');

      await this.loadUsers();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async loadEvents() {

    const events = await EventService.getAllEvents();

    const tbody = document.getElementById('admin-events-body');

    if (!tbody) return;



    tbody.innerHTML = events.map(event => `

      <tr>

        <td>

          <strong>${event.title}</strong>

          ${event.featured ? '<span class="featured-pill ms-1"><i class="bi bi-star-fill"></i></span>' : ''}

        </td>

        <td>${event.organizerName || '-'}</td>

        <td>${event.category || '-'}</td>

        <td>${Utils.formatDate(event.date)}</td>

        <td><span class="${EventService.getStatusBadgeClass(event.status)}">${EventService.getStatusLabel(event.status)}</span></td>

        <td>${Utils.formatPrice(event.revenue || 0)}</td>

        <td>

          <div class="d-flex flex-wrap gap-1">

            ${event.status === EVENT_STATUS.PENDING

              ? `<button class="btn btn-sm btn-ef-primary" onclick="AdminService.approveEvent('${event.id}')" title="Approuver"><i class="bi bi-check-lg"></i></button>

                 <button class="btn btn-sm btn-outline-danger" onclick="AdminService.rejectEvent('${event.id}')" title="Rejeter"><i class="bi bi-x-lg"></i></button>`

              : ''}

            ${event.status === EVENT_STATUS.PUBLISHED
              ? `<button class="btn btn-sm ${event.featured ? 'btn-warning' : 'btn-ef-outline'}" onclick="AdminService.toggleFeatured('${event.id}', ${!event.featured})" title="En vedette">
                   <i class="bi bi-star${event.featured ? '-fill' : ''}"></i>
                 </button>
                 <button class="btn btn-sm btn-outline-warning" onclick="AdminService.unpublishEvent('${event.id}')" title="Dépublier"><i class="bi bi-eye-slash"></i></button>`
              : ''}

            <button class="btn-action delete" onclick="AdminService.deleteEvent('${event.id}')"><i class="bi bi-trash"></i></button>

          </div>

        </td>

      </tr>

    `).join('');

  },



  async loadModerationQueue() {

    const container = document.getElementById('moderation-queue');

    if (!container) return;



    const pending = await EventService.getPendingEvents();

    if (pending.length === 0) {

      container.innerHTML = '<p class="text-muted mb-0">Aucun événement en attente de validation.</p>';

      return;

    }



    container.innerHTML = pending.map(event => `

      <div class="moderation-item">

        <div>

          <strong>${event.title}</strong>

          <p class="text-muted small mb-0">${event.organizerName} — ${Utils.formatDate(event.date)} — ${event.category || ''}</p>

        </div>

        <div class="d-flex gap-2">

          <button class="btn btn-sm btn-ef-primary" onclick="AdminService.approveEvent('${event.id}')">Approuver</button>

          <button class="btn btn-sm btn-outline-danger" onclick="AdminService.rejectEvent('${event.id}')">Rejeter</button>

        </div>

      </div>

    `).join('');

  },



  async approveEvent(eventId) {

    try {

      await EventService.moderateEvent(eventId, 'approve');

      Utils.showToast('Événement publié.');

      await this.loadEvents();

      await this.loadModerationQueue();

      await this.loadOverview();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async rejectEvent(eventId) {

    const reason = prompt('Motif du rejet (optionnel) :') || '';

    try {

      await EventService.moderateEvent(eventId, 'reject', reason);

      Utils.showToast('Événement rejeté.');

      await this.loadEvents();

      await this.loadModerationQueue();

      await this.loadOverview();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async toggleFeatured(eventId, featured) {

    try {

      await EventService.toggleFeatured(eventId, featured);

      Utils.showToast(featured ? 'Événement mis en vedette.' : 'Retiré de la vedette.');

      await this.loadEvents();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async deleteEvent(eventId) {

    await EventService.deleteEvent(eventId);

    await this.loadEvents();

    await this.loadModerationQueue();

    await this.loadOverview();

  },



  async loadCategories() {

    const categories = await EventService.getCategories();

    const container = document.getElementById('categories-list');

    if (!container) return;



    container.innerHTML = categories.map(cat => `

      <div class="category-manager-item">

        <span><i class="bi ${cat.icon || 'bi-tag'} me-2"></i>${cat.name}</span>

        <button class="btn-action delete" onclick="AdminService.deleteCategory('${cat.id}')">

          <i class="bi bi-trash"></i>

        </button>

      </div>

    `).join('');



    const form = document.getElementById('add-category-form');

    if (form && !form.dataset.bound) {

      form.dataset.bound = '1';

      form.addEventListener('submit', async (e) => {

        e.preventDefault();

        const name = document.getElementById('category-name').value.trim();

        const slug = name.toLowerCase().replace(/\s+/g, '-');

        await db.collection(COLLECTIONS.CATEGORIES).add({

          name, slug, icon: 'bi-tag',

          createdAt: firebase.firestore.FieldValue.serverTimestamp()

        });

        document.getElementById('category-name').value = '';

        Utils.showToast('Catégorie ajoutée.');

        await this.loadCategories();

      });

    }

  },



  async deleteCategory(categoryId) {

    if (!confirm('Supprimer cette catégorie ?')) return;

    await db.collection(COLLECTIONS.CATEGORIES).doc(categoryId).delete();

    Utils.showToast('Catégorie supprimée.');

    await this.loadCategories();

  },

  async loadOrganizerQueue() {
    const organizers = await AdminPlatformService.getPendingOrganizers();
    AdminPlatformService.renderOrganizerQueue(organizers, 'organizer-queue');
  },

  async loadTrustTab() {
    const [disputes, refunds, reports] = await Promise.all([
      AdminPlatformService.getDisputes(),
      AdminPlatformService.getRefunds(),
      AdminPlatformService.getReports()
    ]);
    AdminPlatformService.renderDisputes(disputes, 'admin-disputes-body');
    AdminPlatformService.renderRefunds(refunds, 'admin-refunds-body');
    AdminPlatformService.renderReports(reports, 'admin-reports-body');
  },

  async loadFinancesTab() {
    const rate = AdminPlatformService.getCommissionRateSync();
    const input = document.getElementById('commission-rate');
    if (input) input.value = (rate * 100).toFixed(1);
    const rows = await AdminPlatformService.getOrganizerCommissionReport();
    AdminPlatformService.renderCommissionReport(rows, 'admin-commission-body');
  },

  async loadSupportTab() {
    const tickets = await AdminPlatformService.getSupportTickets();
    AdminPlatformService.renderSupportTickets(tickets, 'admin-support-body');
  },

  bindCommissionForm() {
    const form = document.getElementById('commission-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await AdminPlatformService.setCommissionRate(document.getElementById('commission-rate').value);
        await this.loadOverview();
        await this.loadFinancesTab();
      } catch (err) {
        Utils.showToast(err.message || 'Erreur.', 'error');
      }
    });
  },

  async unpublishEvent(eventId) {
    const reason = prompt('Motif de dépublication :') || 'Retiré par modération admin';
    if (!confirm('Dépublier cet événement ?')) return;
    try {
      await db.collection(COLLECTIONS.EVENTS).doc(eventId).update({
        status: EVENT_STATUS.REJECTED,
        rejectionReason: reason,
        featured: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await AdminPlatformService.logAction('event_unpublish', eventId, { reason });
      Utils.showToast('Événement dépublié.');
      await this.loadEvents();
      await this.loadOverview();
    } catch (error) {
      Utils.showToast('Erreur.', 'error');
    }
  }

};



document.addEventListener('DOMContentLoaded', () => {

  if (document.body.dataset.page === 'admin') {

    AdminService.init();

  }

});


