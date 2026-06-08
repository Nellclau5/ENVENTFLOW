/**
 * EventFlow Africa — Gestion des événements
 */

const EventService = {
  /**
   * Crée un événement
   */
  normalizeEventStatus(status) {
    const isAdmin = AuthService.hasRole(ROLES.ADMIN);
    if (isAdmin) return status;
    if (status === EVENT_STATUS.PUBLISHED) return EVENT_STATUS.PENDING;
    return [EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING].includes(status)
      ? status
      : EVENT_STATUS.DRAFT;
  },

  getStatusLabel(status, event = null) {
    if (event?.scheduledPublishAt && status === EVENT_STATUS.PENDING) {
      return 'Publication programmée';
    }
    const labels = {
      [EVENT_STATUS.DRAFT]: 'Brouillon',
      [EVENT_STATUS.PENDING]: 'En attente',
      [EVENT_STATUS.PUBLISHED]: 'Publié',
      [EVENT_STATUS.REJECTED]: 'Rejeté'
    };
    return labels[status] || status;
  },

  getStatusBadgeClass(status) {
    const classes = {
      [EVENT_STATUS.DRAFT]: 'badge-draft',
      [EVENT_STATUS.PENDING]: 'badge-pending',
      [EVENT_STATUS.PUBLISHED]: 'badge-published',
      [EVENT_STATUS.REJECTED]: 'badge-rejected'
    };
    return classes[status] || 'badge-draft';
  },

  async createEvent(eventData) {
    Utils.showLoading(true);
    try {
      const user = AuthService.currentUser;
      const status = this.normalizeEventStatus(eventData.status);
      const docRef = await db.collection(COLLECTIONS.EVENTS).add({
        ...eventData,
        status,
        featured: false,
        organizerId: user.uid,
        organizerName: AuthService.userData?.displayName || user.email,
        placesLeft: parseInt(eventData.capacity),
        soldTickets: 0,
        revenue: 0,
        commissionTotal: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (status === EVENT_STATUS.PENDING) {
        Utils.showToast('Événement soumis pour validation admin.');
      }
      Utils.showToast('Événement créé avec succès !');
      return docRef.id;
    } catch (error) {
      console.error('Erreur création événement:', error);
      const msg = error.code === 'permission-denied'
        ? 'Permission refusée. Votre compte doit être « Organisateur ».'
        : (error.message || 'Erreur lors de la création.');
      Utils.showToast(msg, 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Met à jour un événement
   */
  async updateEvent(eventId, eventData) {
    Utils.showLoading(true);
    try {
      const updateData = {
        ...eventData,
        status: this.normalizeEventStatus(eventData.status),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (eventData.capacity) {
        const event = await this.getEvent(eventId);
        const sold = event.soldTickets || 0;
        updateData.placesLeft = parseInt(eventData.capacity) - sold;
      }
      await db.collection(COLLECTIONS.EVENTS).doc(eventId).update(updateData);
      Utils.showToast('Événement mis à jour !');
    } catch (error) {
      Utils.showToast('Erreur lors de la mise à jour.', 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Supprime un événement
   */
  async deleteEvent(eventId) {
    if (!confirm('Supprimer cet événement ? Cette action est irréversible.')) return;
    Utils.showLoading(true);
    try {
      await db.collection(COLLECTIONS.EVENTS).doc(eventId).delete();
      Utils.showToast('Événement supprimé.');
    } catch (error) {
      Utils.showToast('Erreur lors de la suppression.', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Récupère un événement par ID
   */
  async getEvent(eventId) {
    const doc = await db.collection(COLLECTIONS.EVENTS).doc(eventId).get();
    if (!doc.exists) throw new Error('Événement introuvable');
    return { id: doc.id, ...doc.data() };
  },

  /**
   * Liste les événements publiés
   */
  async getPublishedEvents(filters = {}) {
    let query = db.collection(COLLECTIONS.EVENTS)
      .where('status', '==', EVENT_STATUS.PUBLISHED)
      .orderBy('date', 'asc');

    if (filters.category) {
      query = db.collection(COLLECTIONS.EVENTS)
        .where('status', '==', EVENT_STATUS.PUBLISHED)
        .where('category', '==', filters.category)
        .orderBy('date', 'asc');
    }

    const snapshot = await query.get();
    let events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    events = this.applyClientFilters(events, filters);
    return events;
  },

  applyClientFilters(events, filters = {}) {
    let result = [...events];

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(e =>
        e.title?.toLowerCase().includes(search) ||
        e.location?.toLowerCase().includes(search) ||
        e.description?.toLowerCase().includes(search) ||
        e.city?.toLowerCase().includes(search) ||
        e.organizerName?.toLowerCase().includes(search)
      );
    }

    if (filters.city) {
      const city = filters.city.toLowerCase();
      result = result.filter(e =>
        (e.city || e.location || '').toLowerCase().includes(city)
      );
    }

    if (filters.dateFrom) {
      result = result.filter(e => (e.date || '') >= filters.dateFrom);
    }

    if (filters.dateTo) {
      result = result.filter(e => (e.date || '') <= filters.dateTo);
    }

    if (filters.priceType === 'free') {
      result = result.filter(e => this.getEventMinPrice(e) === 0);
    } else if (filters.priceType === 'paid') {
      result = result.filter(e => this.getEventMinPrice(e) > 0);
    }

    if (filters.priceMin != null && filters.priceMin !== '') {
      const min = parseInt(filters.priceMin);
      result = result.filter(e => this.getEventMinPrice(e) >= min);
    }

    if (filters.priceMax != null && filters.priceMax !== '') {
      const max = parseInt(filters.priceMax);
      result = result.filter(e => this.getEventMinPrice(e) <= max);
    }

    if (filters.organizer) {
      const org = filters.organizer.toLowerCase();
      result = result.filter(e =>
        (e.organizerName || '').toLowerCase().includes(org)
      );
    }

    result = this.sortEvents(result, filters.sortBy);
    return result;
  },

  sortEvents(events, sortBy = 'date-asc') {
    const sorted = [...events];
    switch (sortBy) {
      case 'date-desc':
        return sorted.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      case 'price-asc':
        return sorted.sort((a, b) => this.getEventMinPrice(a) - this.getEventMinPrice(b));
      case 'price-desc':
        return sorted.sort((a, b) => this.getEventMinPrice(b) - this.getEventMinPrice(a));
      case 'popular':
        return sorted.sort((a, b) => (b.soldTickets || 0) - (a.soldTickets || 0));
      default:
        return sorted.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }
  },

  getEventMinPrice(event) {
    if (event.ticketTypes?.length) {
      return Math.min(...event.ticketTypes.map(t => t.price || 0));
    }
    return event.price || 0;
  },

  getEventDisplayPrice(event) {
    if (event.ticketTypes?.length) {
      const prices = event.ticketTypes.map(t => t.price || 0);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min === max) return Utils.formatPrice(min);
      return `À partir de ${Utils.formatPrice(min)}`;
    }
    return Utils.formatPrice(event.price);
  },

  async getFeaturedEvents(limit = 6) {
    try {
      const snapshot = await db.collection(COLLECTIONS.EVENTS)
        .where('status', '==', EVENT_STATUS.PUBLISHED)
        .where('featured', '==', true)
        .orderBy('date', 'asc')
        .limit(limit)
        .get();
      if (!snapshot.empty) {
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (error) {
      console.warn('Featured query fallback:', error);
    }
    const events = await this.getPublishedEvents();
    return events.slice(0, limit);
  },

  async getPendingEvents() {
    const snapshot = await db.collection(COLLECTIONS.EVENTS)
      .where('status', '==', EVENT_STATUS.PENDING)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async moderateEvent(eventId, action, reason = '') {
    const updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (action === 'approve') {
      updates.status = EVENT_STATUS.PUBLISHED;
      updates.rejectionReason = firebase.firestore.FieldValue.delete();
    } else if (action === 'reject') {
      updates.status = EVENT_STATUS.REJECTED;
      updates.rejectionReason = reason || 'Non conforme aux règles de la plateforme.';
    } else {
      throw new Error('Action invalide');
    }
    await db.collection(COLLECTIONS.EVENTS).doc(eventId).update(updates);
  },

  async toggleFeatured(eventId, featured) {
    await db.collection(COLLECTIONS.EVENTS).doc(eventId).update({
      featured,
      featuredAt: featured
        ? firebase.firestore.FieldValue.serverTimestamp()
        : firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  /**
   * Événements d'un organisateur
   */
  async getOrganizerEvents(organizerId) {
    const snapshot = await db.collection(COLLECTIONS.EVENTS)
      .where('organizerId', '==', organizerId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * Tous les événements (admin)
   */
  async getAllEvents() {
    const snapshot = await db.collection(COLLECTIONS.EVENTS)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * Statistiques organisateur
   */
  async getOrganizerStats(organizerId) {
    const events = await this.getOrganizerEvents(organizerId);
    const totalEvents = events.length;
    const publishedEvents = events.filter(e => e.status === EVENT_STATUS.PUBLISHED).length;
    const totalRevenue = events.reduce((sum, e) => sum + (e.revenue || 0), 0);
    const totalTickets = events.reduce((sum, e) => sum + (e.soldTickets || 0), 0);
    const totalCapacity = events.reduce((sum, e) => sum + (parseInt(e.capacity) || 0), 0);

    return { totalEvents, publishedEvents, totalRevenue, totalTickets, totalCapacity };
  },

  /**
   * Récupère les catégories (avec repli sur les catégories par défaut)
   */
  async getCategories() {
    try {
      const snapshot = await db.collection(COLLECTIONS.CATEGORIES).orderBy('name').get();
      const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (categories.length > 0) return categories;
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
    return DEFAULT_CATEGORIES.map((cat, index) => ({ id: `default-${index}`, ...cat }));
  },

  /**
   * Génère le HTML d'une carte événement
   */
  renderEventCard(event) {
    const minPrice = this.getEventMinPrice(event);
    const priceClass = minPrice === 0 ? 'free' : '';
    const priceText = this.getEventDisplayPrice(event);
    const featuredBadge = event.featured
      ? '<span class="featured-badge"><i class="bi bi-star-fill me-1"></i>En vedette</span>'
      : '';
    const dateText = Utils.formatDate(event.date);
    const placesLeft = event.placesLeft ?? event.capacity;

    return `
      <div class="col-md-6 col-lg-4 mb-4">
        <div class="event-card-wrapper position-relative">
          <button type="button" class="favorite-btn event-card-fav" data-event-id="${event.id}" aria-label="Favori">
            <i class="bi bi-heart"></i>
          </button>
          <a href="event-details.html?id=${event.id}" class="text-decoration-none">
          <div class="event-card">
            <div class="event-card-image">
              ${event.imageUrl ? `<img src="${event.imageUrl}" alt="${event.title}">` :
                `<i class="bi bi-calendar-event text-white" style="font-size:3rem;opacity:0.5"></i>`}
              <span class="category-badge">${event.category || 'Événement'}</span>
              ${featuredBadge}
            </div>
            <div class="event-card-body">
              <div class="event-card-date">
                <i class="bi bi-calendar3 me-1"></i>${dateText}
              </div>
              <h3 class="event-card-title">${event.title}</h3>
              <div class="event-card-location">
                <i class="bi bi-geo-alt"></i>${event.location || 'Lieu à confirmer'}
              </div>
              <div class="event-card-footer">
                <span class="event-card-price ${priceClass}">${priceText}</span>
                <small class="text-muted">${placesLeft} places restantes</small>
              </div>
            </div>
          </div>
          </a>
        </div>
      </div>
    `;
  },

  /**
   * Affiche une grille d'événements
   */
  renderEventsGrid(events, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (events.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="empty-state">
            <i class="bi bi-calendar-x d-block"></i>
            <h4>Aucun événement trouvé</h4>
            <p>Revenez bientôt pour découvrir de nouveaux événements !</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = events.map(e => this.renderEventCard(e)).join('');
  },

  /**
   * Remplit un select de catégories
   * @param {boolean} forForm - true pour le formulaire création (placeholder obligatoire)
   */
  async populateCategorySelect(selectId, selectedValue = '', forForm = false) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const categories = await this.getCategories();
    const placeholder = forForm
      ? '<option value="" disabled>Choisir une catégorie</option>'
      : '<option value="">Toutes les catégories</option>';

    select.innerHTML = placeholder +
      categories.map(c => `<option value="${c.name}" ${c.name === selectedValue ? 'selected' : ''}>${c.name}</option>`).join('');

    if (forForm && !selectedValue) {
      select.value = '';
    }
  },
};
