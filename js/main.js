/**
 * EventFlow Africa — Script principal (pages publiques)
 */

const App = {
  currentCategory: '',
  searchQuery: '',

  async init() {
    await AuthService.init();

    const page = document.body.dataset.page;
    switch (page) {
      case 'home': await this.initHome(); break;
      case 'events': await this.initEvents(); break;
      case 'event-details': await this.initEventDetails(); break;
      case 'contact': this.initContact(); break;
    }
  },

  /**
   * Page d'accueil
   */
  async initHome() {
    await this.loadCategories('category-filters');
    await this.loadFeaturedEvents();

    // Recherche hero
    const heroSearch = document.getElementById('hero-search-form');
    heroSearch?.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = document.getElementById('hero-search-input').value.trim();
      window.location.href = `events.html?search=${encodeURIComponent(query)}`;
    });

    // Stats globales
    try {
      const [eventsSnap, ticketsSnap] = await Promise.all([
        db.collection(COLLECTIONS.EVENTS).where('status', '==', EVENT_STATUS.PUBLISHED).get(),
        db.collection(COLLECTIONS.TICKETS).get()
      ]);
      document.getElementById('stat-events').textContent = eventsSnap.size + '+';
      document.getElementById('stat-tickets').textContent = ticketsSnap.size + '+';
    } catch (_) {
      document.getElementById('stat-events').textContent = '100+';
      document.getElementById('stat-tickets').textContent = '500+';
    }
  },

  async loadFeaturedEvents() {
    try {
      const events = await EventService.getPublishedEvents();
      const featured = events.slice(0, 6);
      EventService.renderEventsGrid(featured, 'featured-events');
    } catch (error) {
      console.error('Erreur chargement événements:', error);
    }
  },

  /**
   * Page liste événements
   */
  async initEvents() {
    this.searchQuery = Utils.getUrlParam('search') || '';
    this.currentCategory = Utils.getUrlParam('category') || '';

    const searchInput = document.getElementById('events-search');
    if (searchInput && this.searchQuery) searchInput.value = this.searchQuery;

    await this.loadCategories('category-filters');
    await this.loadEvents();

    searchInput?.addEventListener('input', Utils.debounce(async (e) => {
      this.searchQuery = e.target.value.trim();
      await this.loadEvents();
    }));

    document.getElementById('events-search-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.searchQuery = searchInput.value.trim();
      await this.loadEvents();
    });
  },

  async loadEvents() {
    Utils.showLoading(true);
    try {
      const events = await EventService.getPublishedEvents({
        category: this.currentCategory,
        search: this.searchQuery
      });
      EventService.renderEventsGrid(events, 'events-grid');
      const countEl = document.getElementById('events-count');
      if (countEl) countEl.textContent = `${events.length} événement${events.length > 1 ? 's' : ''}`;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Page détail événement
   */
  async initEventDetails() {
    const eventId = Utils.getUrlParam('id');
    if (!eventId) {
      window.location.href = 'events.html';
      return;
    }

    Utils.showLoading(true);
    try {
      const event = await EventService.getEvent(eventId);
      this.renderEventDetails(event);

      document.getElementById('buy-ticket-btn')?.addEventListener('click', async () => {
        const result = await TicketService.purchaseTicket(eventId);
        if (result) {
          await TicketService.displayTicket(result.ticket, result.event, 'purchased-ticket');
          document.getElementById('ticket-success').classList.remove('d-none');
          document.getElementById('buy-ticket-btn').disabled = true;
          // Recharger places restantes
          const updated = await EventService.getEvent(eventId);
          document.getElementById('places-left').textContent = updated.placesLeft;
        }
      });
    } catch (error) {
      document.getElementById('event-content').innerHTML = `
        <div class="empty-state">
          <i class="bi bi-exclamation-circle d-block"></i>
          <h4>Événement introuvable</h4>
          <a href="events.html" class="btn btn-ef-primary mt-3">Retour aux événements</a>
        </div>
      `;
    } finally {
      Utils.showLoading(false);
    }
  },

  renderEventDetails(event) {
    document.title = `${event.title} — EventFlow Africa`;
    document.getElementById('event-title').textContent = event.title;
    document.getElementById('event-category').textContent = event.category || 'Événement';
    document.getElementById('event-date').textContent = Utils.formatDateTime(event.date, event.time);
    document.getElementById('event-location').textContent = event.location || 'Lieu à confirmer';
    document.getElementById('event-description').textContent = event.description || '';
    document.getElementById('event-organizer').textContent = event.organizerName || 'Organisateur';
    document.getElementById('event-price').textContent = Utils.formatPrice(event.price);
    document.getElementById('places-left').textContent = event.placesLeft ?? event.capacity;
    document.getElementById('event-capacity').textContent = event.capacity;

    const buyBtn = document.getElementById('buy-ticket-btn');
    if (buyBtn) {
      if (event.status !== EVENT_STATUS.PUBLISHED || (event.placesLeft ?? 0) <= 0) {
        buyBtn.disabled = true;
        buyBtn.textContent = event.placesLeft <= 0 ? 'Complet' : 'Non disponible';
      }
    }
  },

  /**
   * Page contact
   */
  initContact() {
    document.getElementById('contact-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      Utils.showToast('Message envoyé ! Nous vous répondrons bientôt.');
      e.target.reset();
    });
  },

  /**
   * Charge et affiche les filtres catégories
   */
  async loadCategories(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const categories = await EventService.getCategories();
      container.innerHTML = `
        <button class="category-pill ${!this.currentCategory ? 'active' : ''}" data-category="">
          Tous
        </button>
        ${categories.map(cat => `
          <button class="category-pill ${this.currentCategory === cat.name ? 'active' : ''}" data-category="${cat.name}">
            <i class="bi ${cat.icon} me-1"></i>${cat.name}
          </button>
        `).join('')}
      `;

      container.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', async () => {
          container.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentCategory = pill.dataset.category;

          if (document.body.dataset.page === 'home') {
            window.location.href = `events.html?category=${encodeURIComponent(this.currentCategory)}`;
          } else {
            await this.loadEvents();
          }
        });
      });
    } catch (error) {
      console.error('Erreur catégories:', error);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('public-page')) {
    App.init();
  }
});
