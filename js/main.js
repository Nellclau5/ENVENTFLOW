/**

 * EventFlow Africa — Script principal (pages publiques)

 */



const App = {

  currentCategory: '',

  searchQuery: '',

  filterCity: '',

  filterDateFrom: '',

  filterDateTo: '',

  filterPriceType: '',
  filterPriceMin: '',
  filterPriceMax: '',
  sortBy: 'date-asc',



  async init() {

    await AuthService.init();



    const page = document.body.dataset.page;

    switch (page) {

      case 'home': await this.initHome(); break;

      case 'events': await this.initEvents(); break;

      case 'event-details': await this.initEventDetails(); break;

      case 'contact': this.initContact(); break;
      case 'help': this.initHelp(); break;
    }
  },



  async initHome() {

    await this.loadCategories('category-filters');

    await this.loadFeaturedEvents();



    document.getElementById('hero-search-form')?.addEventListener('submit', (e) => {

      e.preventDefault();

      const query = document.getElementById('hero-search-input').value.trim();

      window.location.href = `events.html?search=${encodeURIComponent(query)}`;

    });



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

      const featured = await EventService.getFeaturedEvents(6);

      EventService.renderEventsGrid(featured, 'featured-events');

      await this.setupGridFavorites('featured-events');

    } catch (error) {

      console.error('Erreur chargement événements:', error);

    }

  },



  async initEvents() {

    this.searchQuery = Utils.getUrlParam('search') || '';

    this.currentCategory = Utils.getUrlParam('category') || '';

    this.filterCity = Utils.getUrlParam('city') || '';

    this.filterPriceType = Utils.getUrlParam('price') || '';



    const searchInput = document.getElementById('events-search');

    if (searchInput && this.searchQuery) searchInput.value = this.searchQuery;



    const cityInput = document.getElementById('filter-city');

    if (cityInput && this.filterCity) cityInput.value = this.filterCity;



    const priceFilter = document.getElementById('filter-price');

    if (priceFilter && this.filterPriceType) priceFilter.value = this.filterPriceType;



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



    document.getElementById('events-filters-form')?.addEventListener('change', async () => {
      this.syncFiltersFromForm();
      await this.loadEvents();
    });

    document.getElementById('filter-sort')?.addEventListener('change', async () => {
      this.sortBy = document.getElementById('filter-sort')?.value || 'date-asc';
      await this.loadEvents();
    });

    document.getElementById('reset-filters-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      this.resetFilters();
      await this.loadEvents();
    });
  },

  syncFiltersFromForm() {
    this.filterCity = document.getElementById('filter-city')?.value.trim() || '';
    this.filterDateFrom = document.getElementById('filter-date-from')?.value || '';
    this.filterDateTo = document.getElementById('filter-date-to')?.value || '';
    this.filterPriceType = document.getElementById('filter-price')?.value || '';
    this.filterPriceMin = document.getElementById('filter-price-min')?.value || '';
    this.filterPriceMax = document.getElementById('filter-price-max')?.value || '';
    this.sortBy = document.getElementById('filter-sort')?.value || 'date-asc';
  },

  resetFilters() {
    this.searchQuery = '';
    this.currentCategory = '';
    this.filterCity = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterPriceType = '';
    this.filterPriceMin = '';
    this.filterPriceMax = '';
    this.sortBy = 'date-asc';
    const form = document.getElementById('events-filters-form');
    form?.reset();
    const search = document.getElementById('events-search');
    if (search) search.value = '';
    const sort = document.getElementById('filter-sort');
    if (sort) sort.value = 'date-asc';
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    document.querySelector('.category-pill[data-category=""]')?.classList.add('active');
  },



  async loadEvents() {

    Utils.showLoading(true);

    try {

      const events = await EventService.getPublishedEvents({
        category: this.currentCategory,
        search: this.searchQuery,
        city: this.filterCity,
        dateFrom: this.filterDateFrom,
        dateTo: this.filterDateTo,
        priceType: this.filterPriceType,
        priceMin: this.filterPriceMin,
        priceMax: this.filterPriceMax,
        sortBy: this.sortBy
      });

      EventService.renderEventsGrid(events, 'events-grid');
      await this.setupGridFavorites('events-grid');
      if (typeof NotificationService !== 'undefined') {
        NotificationService.checkEventAlerts(events);
      }

      const countEl = document.getElementById('events-count');

      if (countEl) countEl.textContent = `${events.length} événement${events.length > 1 ? 's' : ''}`;

    } finally {

      Utils.showLoading(false);

    }

  },



  async initEventDetails() {

    const eventId = Utils.getUrlParam('id');

    if (!eventId) {

      window.location.href = 'events.html';

      return;

    }



    Utils.showLoading(true);

    try {

      const event = await EventService.getEvent(eventId);

      const user = AuthService.currentUser;

      const isOwner = user && event.organizerId === user.uid;

      const isAdmin = AuthService.hasRole(ROLES.ADMIN);



      if (event.status !== EVENT_STATUS.PUBLISHED && !isOwner && !isAdmin) {

        throw new Error('Événement non disponible');

      }



      this.renderEventDetails(event);

      await this.setupFavoriteButton(eventId);



      document.getElementById('buy-ticket-btn')?.addEventListener('click', async () => {

        const qty = parseInt(document.getElementById('ticket-quantity')?.value) || 1;

        const typeId = document.getElementById('ticket-type-select')?.value || null;

        const result = await TicketService.purchaseTicket(eventId, qty, typeId || null);

        if (result) {

          await TicketService.displayTicket(result.ticket, result.event, 'purchased-ticket');

          document.getElementById('ticket-success').classList.remove('d-none');

          document.getElementById('buy-ticket-btn').disabled = true;

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

    const locationText = [event.city, event.location].filter(Boolean).join(' — ');

    document.getElementById('event-location').textContent = locationText || 'Lieu à confirmer';

    document.getElementById('event-description').textContent = event.description || '';

    document.getElementById('event-organizer').textContent = event.organizerName || 'Organisateur';

    document.getElementById('event-price').textContent = EventService.getEventDisplayPrice(event);

    document.getElementById('places-left').textContent = event.placesLeft ?? event.capacity;

    document.getElementById('event-capacity').textContent = event.capacity;



    const typeSelect = document.getElementById('ticket-type-select');

    const typeWrap = document.getElementById('ticket-type-wrap');

    if (event.ticketTypes?.length && typeSelect && typeWrap) {

      typeWrap.classList.remove('d-none');

      typeSelect.innerHTML = event.ticketTypes.map(t => {

        const left = TicketService.getTicketTypePlacesLeft(t);

        return `<option value="${t.id}" ${left <= 0 ? 'disabled' : ''}>${t.name} — ${Utils.formatPrice(t.price)} (${left} places)</option>`;

      }).join('');

    }



    const buyBtn = document.getElementById('buy-ticket-btn');

    if (buyBtn) {

      if (event.status !== EVENT_STATUS.PUBLISHED || (event.placesLeft ?? 0) <= 0) {

        buyBtn.disabled = true;

        buyBtn.textContent = (event.placesLeft ?? 0) <= 0 ? 'Complet' : 'Non disponible';

      }

    }

  },



  async setupFavoriteButton(eventId) {

    const btn = document.getElementById('favorite-btn');

    if (!btn) return;



    if (AuthService.currentUser) {

      const fav = await FavoriteService.isFavorite(AuthService.currentUser.uid, eventId);

      if (fav) {

        btn.classList.add('active');

        btn.querySelector('i')?.classList.replace('bi-heart', 'bi-heart-fill');

      }

    }



    btn.addEventListener('click', async () => {

      const added = await FavoriteService.toggleFavorite(eventId);

      btn.classList.toggle('active', added);

      const icon = btn.querySelector('i');

      if (icon) icon.className = added ? 'bi bi-heart-fill' : 'bi bi-heart';

    });

  },



  async setupGridFavorites(containerId) {

    const container = document.getElementById(containerId);

    if (!container) return;



    const userId = AuthService.currentUser?.uid;

    let favoriteIds = new Set();



    if (userId) {

      const favs = await FavoriteService.getUserFavorites(userId);

      favoriteIds = new Set(favs.map(f => f.eventId));

    }



    container.querySelectorAll('.event-card-fav').forEach(btn => {

      const eventId = btn.dataset.eventId;

      if (favoriteIds.has(eventId)) {

        btn.classList.add('active');

        btn.querySelector('i')?.classList.replace('bi-heart', 'bi-heart-fill');

      }



      btn.addEventListener('click', async (e) => {

        e.preventDefault();

        e.stopPropagation();

        const added = await FavoriteService.toggleFavorite(eventId);

        btn.classList.toggle('active', added);

        const icon = btn.querySelector('i');

        if (icon) icon.className = added ? 'bi bi-heart-fill' : 'bi bi-heart';

      });

    });

  },



  initContact() {
    document.getElementById('contact-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById('contact-name').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
        subject: document.getElementById('contact-subject').value,
        message: document.getElementById('contact-message').value.trim()
      };
      try {
        await SupportService.submitTicket(data);
        Utils.showToast('Message envoyé ! Nous vous répondrons sous 24-48h.');
        e.target.reset();
      } catch (_) {
        Utils.showToast('Erreur lors de l\'envoi. Réessayez.', 'error');
      }
    });
  },

  initHelp() {
    SupportService.renderFAQ('faq-accordion');
    if (AuthService.currentUser) {
      const email = document.getElementById('help-email');
      const name = document.getElementById('help-name');
      if (email) email.value = AuthService.currentUser.email;
      if (name) name.value = AuthService.userData?.displayName || '';
    }
    document.getElementById('help-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await SupportService.submitTicket({
        name: document.getElementById('help-name').value.trim(),
        email: document.getElementById('help-email').value.trim(),
        subject: document.getElementById('help-subject').value,
        message: document.getElementById('help-message').value.trim()
      });
      Utils.showToast('Ticket support créé !');
      e.target.reset();
    });
  },



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


