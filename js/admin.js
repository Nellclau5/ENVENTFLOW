/**

 * EventFlow Africa — Administration

 */



const AdminService = {

  async init() {

    await AuthService.requireAdmin();

    DashboardService.setupSidebar();

    DashboardService.populateUserInfo();



    await seedDefaultCategories();



    const tab = Utils.getUrlParam('tab') || 'overview';

    await this.loadOverview();

    await this.loadUsers();

    await this.loadEvents();

    await this.loadModerationQueue();

    await this.loadCategories();



    const tabEl = document.querySelector(`[data-bs-target="#tab-${tab}"]`);

    if (tabEl) new bootstrap.Tab(tabEl).show();

  },



  async loadOverview() {

    const [usersSnap, eventsSnap, ticketsSnap, purchasesSnap] = await Promise.all([

      db.collection(COLLECTIONS.USERS).get(),

      db.collection(COLLECTIONS.EVENTS).get(),

      db.collection(COLLECTIONS.TICKETS).get(),

      db.collection(COLLECTIONS.PURCHASES).get()

    ]);



    const users = usersSnap.docs.map(d => d.data());

    const events = eventsSnap.docs.map(d => d.data());

    const purchases = purchasesSnap.docs.map(d => d.data());



    const totalRevenue = events.reduce((s, e) => s + (e.revenue || 0), 0);

    const totalCommissions = events.reduce((s, e) => s + (e.commissionTotal || 0), 0)

      || purchases.reduce((s, p) => s + (p.commissionAmount || 0), 0);

    const publishedEvents = events.filter(e => e.status === EVENT_STATUS.PUBLISHED).length;

    const pendingEvents = events.filter(e => e.status === EVENT_STATUS.PENDING).length;

    const organizers = users.filter(u => u.role === ROLES.ORGANIZER).length;

    const pendingOrganizers = users.filter(u =>

      u.role === ROLES.ORGANIZER && u.accountStatus === ACCOUNT_STATUS.PENDING

    ).length;



    document.getElementById('admin-stats').innerHTML = `

      <div class="dash-stat-card">

        <div class="dash-stat-icon primary"><i class="bi bi-people"></i></div>

        <div class="dash-stat-value">${users.length}</div>

        <div class="dash-stat-label">Utilisateurs</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon success"><i class="bi bi-calendar-event"></i></div>

        <div class="dash-stat-value">${events.length}</div>

        <div class="dash-stat-label">Événements (${publishedEvents} publiés)</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon warning"><i class="bi bi-hourglass-split"></i></div>

        <div class="dash-stat-value">${pendingEvents}</div>

        <div class="dash-stat-label">En attente validation</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon info"><i class="bi bi-ticket-perforated"></i></div>

        <div class="dash-stat-value">${ticketsSnap.size}</div>

        <div class="dash-stat-label">Billets vendus</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon warning"><i class="bi bi-currency-exchange"></i></div>

        <div class="dash-stat-value">${Utils.formatPrice(totalRevenue)}</div>

        <div class="dash-stat-label">Revenus globaux</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon primary"><i class="bi bi-percent"></i></div>

        <div class="dash-stat-value">${Utils.formatPrice(totalCommissions)}</div>

        <div class="dash-stat-label">Commissions (${Math.round(COMMISSION_RATE * 100)}%)</div>

      </div>

      <div class="dash-stat-card">

        <div class="dash-stat-icon primary"><i class="bi bi-person-badge"></i></div>

        <div class="dash-stat-value">${organizers}</div>

        <div class="dash-stat-label">Organisateurs (${pendingOrganizers} en attente)</div>

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

      const netOrganizers = totalRevenue - totalCommissions;

      financeEl.innerHTML = `

        <div class="finance-row"><span>Volume total des ventes</span><strong>${Utils.formatPrice(totalRevenue)}</strong></div>

        <div class="finance-row"><span>Commissions EventFlow (${Math.round(COMMISSION_RATE * 100)}%)</span><strong class="text-primary">${Utils.formatPrice(totalCommissions)}</strong></div>

        <div class="finance-row"><span>Reversé aux organisateurs (estimé)</span><strong>${Utils.formatPrice(netOrganizers)}</strong></div>

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

      const updates = { role: newRole, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

      if (newRole === ROLES.ORGANIZER) {

        const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

        if (!doc.data()?.accountStatus) updates.accountStatus = ACCOUNT_STATUS.PENDING;

      } else {

        updates.accountStatus = ACCOUNT_STATUS.ACTIVE;

      }

      await db.collection(COLLECTIONS.USERS).doc(userId).update(updates);

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

      await this.loadUsers();

      await this.loadOverview();

    } catch (error) {

      Utils.showToast('Erreur.', 'error');

    }

  },



  async suspendUser(userId) {

    if (!confirm('Suspendre ce compte ?')) return;

    try {

      await db.collection(COLLECTIONS.USERS).doc(userId).update({

        accountStatus: ACCOUNT_STATUS.SUSPENDED,

        updatedAt: firebase.firestore.FieldValue.serverTimestamp()

      });

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

                 </button>`

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

  }

};



document.addEventListener('DOMContentLoaded', () => {

  if (document.body.dataset.page === 'admin') {

    AdminService.init();

  }

});


