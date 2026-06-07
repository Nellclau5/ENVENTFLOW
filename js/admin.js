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
    await this.loadCategories();

    // Activer l'onglet
    const tabEl = document.querySelector(`[data-bs-target="#tab-${tab}"]`);
    if (tabEl) new bootstrap.Tab(tabEl).show();
  },

  async loadOverview() {
    const [usersSnap, eventsSnap, ticketsSnap] = await Promise.all([
      db.collection(COLLECTIONS.USERS).get(),
      db.collection(COLLECTIONS.EVENTS).get(),
      db.collection(COLLECTIONS.TICKETS).get()
    ]);

    const users = usersSnap.docs.map(d => d.data());
    const events = eventsSnap.docs.map(d => d.data());
    const tickets = ticketsSnap.docs.map(d => d.data());

    const totalRevenue = events.reduce((s, e) => s + (e.revenue || 0), 0);
    const publishedEvents = events.filter(e => e.status === EVENT_STATUS.PUBLISHED).length;
    const organizers = users.filter(u => u.role === ROLES.ORGANIZER).length;

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
        <div class="dash-stat-icon info"><i class="bi bi-ticket-perforated"></i></div>
        <div class="dash-stat-value">${tickets.length}</div>
        <div class="dash-stat-label">Billets vendus</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon warning"><i class="bi bi-currency-exchange"></i></div>
        <div class="dash-stat-value">${Utils.formatPrice(totalRevenue)}</div>
        <div class="dash-stat-label">Revenus globaux</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-icon primary"><i class="bi bi-person-badge"></i></div>
        <div class="dash-stat-value">${organizers}</div>
        <div class="dash-stat-label">Organisateurs</div>
      </div>
    `;

    // Stats par catégorie
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
  },

  async loadUsers() {
    const snapshot = await db.collection(COLLECTIONS.USERS).orderBy('createdAt', 'desc').get();
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return;

    tbody.innerHTML = snapshot.docs.map(doc => {
      const user = doc.data();
      return `
        <tr>
          <td>${user.displayName || '-'}</td>
          <td>${user.email}</td>
          <td><span class="user-role-badge ${user.role}">${user.role}</span></td>
          <td>${Utils.formatDate(user.createdAt)}</td>
          <td>
            <select class="form-select form-select-sm" style="width:auto" onchange="AdminService.changeUserRole('${doc.id}', this.value)">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
              <option value="organizer" ${user.role === 'organizer' ? 'selected' : ''}>Organizer</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  },

  async changeUserRole(userId, newRole) {
    try {
      await db.collection(COLLECTIONS.USERS).doc(userId).update({ role: newRole });
      Utils.showToast('Rôle mis à jour.');
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
        <td><strong>${event.title}</strong></td>
        <td>${event.organizerName || '-'}</td>
        <td>${event.category || '-'}</td>
        <td>${Utils.formatDate(event.date)}</td>
        <td><span class="${event.status === EVENT_STATUS.PUBLISHED ? 'badge-published' : 'badge-draft'}">
          ${event.status === EVENT_STATUS.PUBLISHED ? 'Publié' : 'Brouillon'}
        </span></td>
        <td>${Utils.formatPrice(event.revenue || 0)}</td>
        <td>
          <button class="btn-action delete" onclick="AdminService.deleteEvent('${event.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  async deleteEvent(eventId) {
    await EventService.deleteEvent(eventId);
    await this.loadEvents();
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
    form?.addEventListener('submit', async (e) => {
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
