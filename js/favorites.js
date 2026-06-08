/**
 * EventFlow Africa — Favoris & alertes
 */

const FavoriteService = {
  async getUserFavorites(userId) {
    const snapshot = await db.collection(COLLECTIONS.FAVORITES)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getFavoriteEvents(userId) {
    const favs = await this.getUserFavorites(userId);
    const events = await Promise.all(
      favs.map(async f => {
        try {
          const event = await EventService.getEvent(f.eventId);
          return event.status === EVENT_STATUS.PUBLISHED ? { ...event, favoriteId: f.id } : null;
        } catch (_) { return null; }
      })
    );
    return events.filter(Boolean);
  },

  async isFavorite(userId, eventId) {
    const snapshot = await db.collection(COLLECTIONS.FAVORITES)
      .where('userId', '==', userId)
      .where('eventId', '==', eventId)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async toggleFavorite(eventId) {
    if (!AuthService.currentUser) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }

    const userId = AuthService.currentUser.uid;
    const existing = await this.isFavorite(userId, eventId);

    if (existing) {
      await db.collection(COLLECTIONS.FAVORITES).doc(existing.id).delete();
      Utils.showToast('Retiré des favoris.');
      return false;
    }

    await db.collection(COLLECTIONS.FAVORITES).add({
      userId,
      eventId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Utils.showToast('Ajouté aux favoris !');
    return true;
  },

  renderFavoritesList(events, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!events.length) {
      container.innerHTML = `
        <div class="empty-state py-4">
          <i class="bi bi-heart d-block"></i>
          <h5>Aucun favori</h5>
          <p class="text-muted">Ajoutez des événements à vos favoris depuis la liste.</p>
          <a href="events.html" class="btn btn-ef-primary btn-sm">Parcourir</a>
        </div>`;
      return;
    }

    container.innerHTML = events.map(event => `
      <div class="favorite-item d-flex align-items-center justify-content-between gap-3 p-3 border-bottom">
        <div>
          <h6 class="mb-1"><a href="event-details.html?id=${event.id}" class="text-decoration-none">${event.title}</a></h6>
          <small class="text-muted"><i class="bi bi-calendar3 me-1"></i>${Utils.formatDate(event.date)} — ${event.city || event.location || ''}</small>
        </div>
        <div class="d-flex gap-2">
          <span class="event-card-price small">${EventService.getEventDisplayPrice(event)}</span>
          <button type="button" class="btn btn-sm btn-ef-outline favorite-remove" data-event-id="${event.id}" aria-label="Retirer">
            <i class="bi bi-heart-fill text-warning"></i>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.favorite-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await FavoriteService.toggleFavorite(btn.dataset.eventId);
        const updated = await FavoriteService.getFavoriteEvents(AuthService.currentUser.uid);
        FavoriteService.renderFavoritesList(updated, containerId);
      });
    });
  }
};

const AlertService = {
  async getUserAlerts(userId) {
    const snapshot = await db.collection(COLLECTIONS.EVENT_ALERTS)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addAlert(type, value) {
    if (!AuthService.currentUser) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const existing = await this.getUserAlerts(AuthService.currentUser.uid);
    if (existing.some(a => a.type === type && a.value.toLowerCase() === trimmed.toLowerCase())) {
      Utils.showToast('Cette alerte existe déjà.', 'error');
      return;
    }

    await db.collection(COLLECTIONS.EVENT_ALERTS).add({
      userId: AuthService.currentUser.uid,
      type,
      value: trimmed,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Utils.showToast('Alerte créée !');
  },

  async removeAlert(alertId) {
    await db.collection(COLLECTIONS.EVENT_ALERTS).doc(alertId).delete();
    Utils.showToast('Alerte supprimée.');
  },

  renderAlerts(alerts, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!alerts.length) {
      container.innerHTML = '<p class="text-muted small mb-0">Aucune alerte active. Ajoutez une ville ou catégorie ci-dessous.</p>';
      return;
    }

    container.innerHTML = alerts.map(a => `
      <div class="alert-pill">
        <i class="bi bi-${a.type === 'city' ? 'geo-alt' : 'tag'} me-1"></i>
        ${a.type === 'city' ? 'Ville' : 'Catégorie'} : <strong>${a.value}</strong>
        <button type="button" class="alert-pill-remove" data-id="${a.id}" aria-label="Supprimer">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.alert-pill-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await AlertService.removeAlert(btn.dataset.id);
        const updated = await AlertService.getUserAlerts(AuthService.currentUser.uid);
        AlertService.renderAlerts(updated, containerId);
      });
    });
  }
};
