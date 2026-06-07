/**
 * EventFlow Africa — Billetterie & Billets
 */

const TicketService = {
  /**
   * Achète un billet
   */
  async purchaseTicket(eventId, quantity = 1) {
    if (!AuthService.currentUser) {
      window.location.href = `login.html?redirect=event-details.html?id=${eventId}`;
      return;
    }

    Utils.showLoading(true);
    try {
      const event = await EventService.getEvent(eventId);

      if (event.status !== EVENT_STATUS.PUBLISHED) {
        throw new Error('Cet événement n\'est pas disponible.');
      }

      if ((event.placesLeft || 0) < quantity) {
        throw new Error('Places insuffisantes.');
      }

      const ticketCode = Utils.generateTicketId();
      const user = AuthService.currentUser;
      const userData = AuthService.userData;
      const totalPrice = (event.price || 0) * quantity;

      const batch = db.batch();

      // Créer le billet
      const ticketRef = db.collection(COLLECTIONS.TICKETS).doc();
      batch.set(ticketRef, {
        ticketCode,
        eventId,
        eventTitle: event.title,
        userId: user.uid,
        userName: userData?.displayName || user.email,
        userEmail: user.email,
        price: event.price || 0,
        quantity,
        totalPrice,
        status: TICKET_STATUS.VALID,
        purchasedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Historique achat
      const purchaseRef = db.collection(COLLECTIONS.PURCHASES).doc();
      batch.set(purchaseRef, {
        ticketId: ticketRef.id,
        ticketCode,
        eventId,
        eventTitle: event.title,
        userId: user.uid,
        amount: totalPrice,
        quantity,
        purchasedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Mettre à jour l'événement
      const eventRef = db.collection(COLLECTIONS.EVENTS).doc(eventId);
      batch.update(eventRef, {
        placesLeft: firebase.firestore.FieldValue.increment(-quantity),
        soldTickets: firebase.firestore.FieldValue.increment(quantity),
        revenue: firebase.firestore.FieldValue.increment(totalPrice)
      });

      await batch.commit();

      const ticket = {
        id: ticketRef.id,
        ticketCode,
        eventId,
        eventTitle: event.title,
        userId: user.uid,
        userName: userData?.displayName || user.email,
        userEmail: user.email,
        price: event.price || 0,
        quantity,
        totalPrice,
        status: TICKET_STATUS.VALID
      };

      Utils.showToast('Billet acheté avec succès !');
      return { ticket, event };
    } catch (error) {
      console.error('Erreur achat billet:', error);
      const msg = error.code === 'permission-denied'
        ? 'Permission refusée. Reconnectez-vous ou contactez le support.'
        : (error.message || 'Erreur lors de l\'achat.');
      Utils.showToast(msg, 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Billets d'un utilisateur
   */
  async getUserTickets(userId) {
    const snapshot = await db.collection(COLLECTIONS.TICKETS)
      .where('userId', '==', userId)
      .orderBy('purchasedAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * Historique achats
   */
  async getPurchaseHistory(userId) {
    const snapshot = await db.collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .orderBy('purchasedAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * Participants d'un événement
   */
  async getEventParticipants(eventId) {
    const snapshot = await db.collection(COLLECTIONS.TICKETS)
      .where('eventId', '==', eventId)
      .orderBy('purchasedAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * Vérifie un billet par code QR
   */
  async verifyTicket(ticketCode) {
    const snapshot = await db.collection(COLLECTIONS.TICKETS)
      .where('ticketCode', '==', ticketCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { valid: false, message: 'Billet introuvable.' };
    }

    const ticket = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    if (ticket.status === TICKET_STATUS.USED) {
      return { valid: false, used: true, ticket, message: 'Ce billet a déjà été utilisé.' };
    }

    if (ticket.status === TICKET_STATUS.CANCELLED) {
      return { valid: false, ticket, message: 'Ce billet a été annulé.' };
    }

    const event = await EventService.getEvent(ticket.eventId);
    return { valid: true, ticket, event, message: 'Billet valide !' };
  },

  /**
   * Marque un billet comme utilisé
   */
  async markTicketUsed(ticketId) {
    Utils.showLoading(true);
    try {
      await db.collection(COLLECTIONS.TICKETS).doc(ticketId).update({
        status: TICKET_STATUS.USED,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Utils.showToast('Billet marqué comme utilisé.');
    } catch (error) {
      Utils.showToast('Erreur lors de la validation.', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Affiche un billet avec QR Code
   */
  async displayTicket(ticket, event, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const qrElementId = `qr-${ticket.id}`;

    container.innerHTML = `
      <div class="ticket-display">
        <h4>${event?.title || ticket.eventTitle}</h4>
        <p class="text-muted mb-1">${Utils.formatDate(event?.date)} — ${event?.time || ''}</p>
        <p class="text-muted mb-3"><i class="bi bi-geo-alt"></i> ${event?.location || ''}</p>
        <hr>
        <p><strong>${ticket.userName}</strong></p>
        <p class="text-muted small">${ticket.userEmail}</p>
        <p class="fw-bold">${Utils.formatPrice(ticket.price)}</p>
        <div class="ticket-qr-wrap">
          <div id="${qrElementId}" class="ticket-qr-host" aria-label="QR Code du billet"></div>
        </div>
        <p class="mt-2 small text-muted">N° ${ticket.ticketCode}</p>
        <span class="badge ${ticket.status === TICKET_STATUS.VALID ? 'badge-valid' : 'badge-used'}">
          ${ticket.status === TICKET_STATUS.VALID ? 'Valide' : 'Utilisé'}
        </span>
        <div class="mt-3 d-flex gap-2 justify-content-center">
          <button type="button" class="btn btn-ef-outline btn-sm" data-download-pdf="${ticket.id}">
            <i class="bi bi-download me-1"></i> Télécharger PDF
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-download-pdf]')?.addEventListener('click', () => {
      this.downloadPDF(ticket.id);
    });

    try {
      await Utils.generateQRCode(qrElementId, ticket.ticketCode);
    } catch (error) {
      console.error('Erreur génération QR:', error);
      const qrEl = document.getElementById(qrElementId);
      if (qrEl?.parentElement) {
        qrEl.parentElement.innerHTML = `<p class="text-muted small">Code billet : <strong>${ticket.ticketCode}</strong></p>`;
      }
      Utils.showToast('QR code indisponible — le code billet reste valide.', 'error');
    }
  },

  /**
   * Télécharge le PDF d'un billet
   */
  async downloadPDF(ticketId) {
    try {
      Utils.showLoading(true);
      const docSnap = await db.collection(COLLECTIONS.TICKETS).doc(ticketId).get();
      if (!docSnap.exists) {
        Utils.showToast('Billet introuvable.', 'error');
        return;
      }
      const ticket = { id: docSnap.id, ...docSnap.data() };
      const event = await EventService.getEvent(ticket.eventId);
      await Utils.generateTicketPDF(ticket, event);
      Utils.showToast('PDF téléchargé !');
    } catch (error) {
      console.error('Erreur PDF:', error);
      const msg = error.code === 'permission-denied'
        ? 'Permission refusée pour télécharger ce billet.'
        : (error.message || 'Erreur lors du téléchargement PDF.');
      Utils.showToast(msg, 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Rendu liste billets utilisateur
   */
  renderUserTickets(tickets, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-ticket-perforated d-block"></i>
          <h5>Aucun billet</h5>
          <p>Vous n'avez pas encore acheté de billets.</p>
          <a href="events.html" class="btn btn-ef-primary">Découvrir les événements</a>
        </div>
      `;
      return;
    }

    container.innerHTML = tickets.map(ticket => `
      <div class="dash-table-card mb-3">
        <div class="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h6 class="mb-1">${ticket.eventTitle}</h6>
            <small class="text-muted">N° ${ticket.ticketCode} — ${Utils.formatPrice(ticket.price)}</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${ticket.status === TICKET_STATUS.VALID ? 'badge-valid' : 'badge-used'}">
              ${ticket.status === TICKET_STATUS.VALID ? 'Valide' : 'Utilisé'}
            </span>
            <button class="btn btn-ef-outline btn-sm" onclick="TicketService.showTicketModal('${ticket.id}')">
              Voir billet
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  /**
   * Modal billet
   */
  async showTicketModal(ticketId) {
    try {
      Utils.showLoading(true);
      const doc = await db.collection(COLLECTIONS.TICKETS).doc(ticketId).get();
      if (!doc.exists) {
        Utils.showToast('Billet introuvable.', 'error');
        return;
      }
      const ticket = { id: doc.id, ...doc.data() };
      const event = await EventService.getEvent(ticket.eventId);

      const modal = document.getElementById('ticket-modal');
      if (!modal) {
        Utils.showToast('Impossible d\'afficher le billet.', 'error');
        return;
      }

      await this.displayTicket(ticket, event, 'ticket-modal-body');
      bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
      console.error('Erreur affichage billet:', error);
      const msg = error.code === 'permission-denied'
        ? 'Permission refusée pour lire ce billet.'
        : (error.message || 'Impossible d\'afficher le billet.');
      Utils.showToast(msg, 'error');
    } finally {
      Utils.showLoading(false);
    }
  }
};

window.TicketService = TicketService;
