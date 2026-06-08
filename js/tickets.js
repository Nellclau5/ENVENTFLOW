/**
 * EventFlow Africa — Billetterie & Billets
 */

const TicketService = {
  getTicketUnitPrice(event, ticketTypeId = null) {
    if (event.ticketTypes?.length) {
      const type = ticketTypeId
        ? event.ticketTypes.find(t => t.id === ticketTypeId)
        : event.ticketTypes[0];
      return typeof OrganizerService !== 'undefined'
        ? OrganizerService.getEffectivePrice(type)
        : (type?.price || 0);
    }
    return event.price || 0;
  },

  getTicketTypePlacesLeft(type) {
    return Math.max(0, (type.quota || 0) - (type.sold || 0));
  },

  /**
   * Achète un billet
   */
  async purchaseTicket(eventId, quantity = 1, ticketTypeId = null, promoCode = null) {
    if (!AuthService.currentUser) {
      window.location.href = `login.html?redirect=event-details.html?id=${eventId}`;
      return;
    }
    if (!AuthService.isAccountActive()) {
      Utils.showToast('Votre compte est suspendu ou en attente de validation.', 'error');
      return;
    }

    Utils.showLoading(true);
    try {
      const event = await EventService.getEvent(eventId);

      if (event.status !== EVENT_STATUS.PUBLISHED) {
        throw new Error('Cet événement n\'est pas disponible.');
      }

      if (event.ticketTypes?.length) {
        const type = ticketTypeId
          ? event.ticketTypes.find(t => t.id === ticketTypeId)
          : event.ticketTypes.find(t => this.getTicketTypePlacesLeft(t) >= quantity);
        if (!type) throw new Error('Type de billet invalide ou complet.');
        if (this.getTicketTypePlacesLeft(type) < quantity) {
          throw new Error('Places insuffisantes pour ce type de billet.');
        }
        event._selectedTicketType = type;
      } else if ((event.placesLeft || 0) < quantity) {
        if (event.waitlistEnabled) {
          throw new Error('COMPLET_WAITLIST');
        }
        throw new Error('Places insuffisantes.');
      }

      const ticketCode = Utils.generateTicketId();
      const user = AuthService.currentUser;
      const userData = AuthService.userData;
      let unitPrice = this.getTicketUnitPrice(event, ticketTypeId);
      const promoResult = typeof OrganizerService !== 'undefined'
        ? OrganizerService.applyPromo(event, promoCode, unitPrice)
        : { price: unitPrice, promo: null };
      if (promoResult.error) throw new Error(promoResult.error);
      unitPrice = promoResult.price;
      const totalPrice = unitPrice * quantity;
      let rate = COMMISSION_RATE;
      if (typeof AdminPlatformService !== 'undefined') {
        rate = await AdminPlatformService.getCommissionRate();
      } else {
        try {
          const settings = await db.collection(COLLECTIONS.PLATFORM_SETTINGS).doc('main').get();
          if (settings.exists && typeof settings.data().commissionRate === 'number') {
            rate = settings.data().commissionRate;
          }
        } catch (_) { /* défaut */ }
      }
      const commissionAmount = Math.round(totalPrice * rate);

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
        price: unitPrice,
        ticketTypeName: event._selectedTicketType?.name || 'Standard',
        ticketKind: event._selectedTicketType?.kind || TICKET_KINDS.STANDARD,
        promoCode: promoResult.promo?.code || null,
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
        commissionAmount,
        quantity,
        purchasedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Mettre à jour l'événement
      const eventRef = db.collection(COLLECTIONS.EVENTS).doc(eventId);
      const eventUpdate = {
        placesLeft: firebase.firestore.FieldValue.increment(-quantity),
        soldTickets: firebase.firestore.FieldValue.increment(quantity),
        revenue: firebase.firestore.FieldValue.increment(totalPrice),
        commissionTotal: firebase.firestore.FieldValue.increment(commissionAmount)
      };
      if (event.ticketTypes?.length && event._selectedTicketType) {
        const types = event.ticketTypes.map(t =>
          t.id === event._selectedTicketType.id
            ? { ...t, sold: (t.sold || 0) + quantity }
            : t
        );
        eventUpdate.ticketTypes = types;
      }
      if (promoResult.promo && event.promoCodes?.length) {
        const promos = event.promoCodes.map(p =>
          p.code === promoResult.promo.code ? { ...p, used: (p.used || 0) + 1 } : p
        );
        eventUpdate.promoCodes = promos;
      }
      batch.update(eventRef, eventUpdate);

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

      if (typeof PWAStore !== 'undefined') {
        try { await this.getUserTickets(user.uid); } catch (_) { /* cache best-effort */ }
      }

      Utils.showToast('Billet acheté avec succès !');
      return { ticket, event };
    } catch (error) {
      console.error('Erreur achat billet:', error);
      if (error.message === 'COMPLET_WAITLIST') {
        const join = confirm('Événement complet. Rejoindre la liste d\'attente ?');
        if (join && typeof OrganizerService !== 'undefined') {
          await OrganizerService.joinWaitlist(eventId, quantity, ticketTypeId);
        }
        return;
      }
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
    if (!navigator.onLine && typeof PWAStore !== 'undefined') {
      const cached = await PWAStore.getCachedTickets(userId);
      if (cached.length) return cached;
    }
    const snapshot = await db.collection(COLLECTIONS.TICKETS)
      .where('userId', '==', userId)
      .orderBy('purchasedAt', 'desc')
      .get();
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (typeof PWAStore !== 'undefined') {
      await PWAStore.cacheTickets(userId, tickets);
    }
    return tickets;
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

  async findUserByEmail(email) {
    const normalized = email.trim().toLowerCase();
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('email', '==', normalized)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async transferTicket(ticketId, recipientEmail) {
    if (!AuthService.currentUser) return;
    Utils.showLoading(true);
    try {
      const email = recipientEmail.trim().toLowerCase();
      if (email === AuthService.currentUser.email.toLowerCase()) {
        throw new Error('Vous ne pouvez pas transférer à vous-même.');
      }

      const recipient = await this.findUserByEmail(email);
      if (!recipient) {
        throw new Error('Aucun compte trouvé avec cet email. Le destinataire doit s\'inscrire d\'abord.');
      }

      const doc = await db.collection(COLLECTIONS.TICKETS).doc(ticketId).get();
      if (!doc.exists) throw new Error('Billet introuvable.');
      const ticket = { id: doc.id, ...doc.data() };

      if (ticket.userId !== AuthService.currentUser.uid) {
        throw new Error('Ce billet ne vous appartient pas.');
      }
      if (ticket.status !== TICKET_STATUS.VALID) {
        throw new Error('Seuls les billets valides peuvent être transférés.');
      }

      const batch = db.batch();
      const ticketRef = db.collection(COLLECTIONS.TICKETS).doc(ticketId);
      batch.update(ticketRef, {
        userId: recipient.id,
        userName: recipient.displayName || recipient.email,
        userEmail: recipient.email,
        transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
        transferredFrom: AuthService.currentUser.uid
      });

      const transferRef = db.collection(COLLECTIONS.TICKET_TRANSFERS).doc();
      batch.set(transferRef, {
        ticketId,
        ticketCode: ticket.ticketCode,
        eventId: ticket.eventId,
        eventTitle: ticket.eventTitle,
        fromUserId: AuthService.currentUser.uid,
        fromUserEmail: AuthService.currentUser.email,
        toUserId: recipient.id,
        toUserEmail: recipient.email,
        transferredAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();
      Utils.showToast(`Billet transféré à ${recipient.displayName || email} !`);
      return true;
    } catch (error) {
      Utils.showToast(error.message || 'Erreur lors du transfert.', 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  async getTransferHistory(userId) {
    const [sent, received] = await Promise.all([
      db.collection(COLLECTIONS.TICKET_TRANSFERS).where('fromUserId', '==', userId).get(),
      db.collection(COLLECTIONS.TICKET_TRANSFERS).where('toUserId', '==', userId).get()
    ]);
    const all = [
      ...sent.docs.map(d => ({ id: d.id, ...d.data(), direction: 'sent' })),
      ...received.docs.map(d => ({ id: d.id, ...d.data(), direction: 'received' }))
    ];
    return all.sort((a, b) => (b.transferredAt?.seconds || 0) - (a.transferredAt?.seconds || 0));
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
      return {
        valid: false,
        used: true,
        ticket,
        message: 'Ce billet a déjà été utilisé.',
        usedAt: ticket.usedAt
      };
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
  async markTicketUsed(ticketId, options = {}) {
    Utils.showLoading(true);
    try {
      const doc = await db.collection(COLLECTIONS.TICKETS).doc(ticketId).get();
      const ticket = doc.exists ? { id: doc.id, ...doc.data() } : null;

      if (!navigator.onLine && options.allowOffline && ticket) {
        OrganizerService.queueOfflineScan(ticket.ticketCode, ticketId, ticket.eventId);
        Utils.showToast('Scan enregistré hors ligne. Sera synchronisé à la reconnexion.');
        return ticket;
      }

      await db.collection(COLLECTIONS.TICKETS).doc(ticketId).update({
        status: TICKET_STATUS.USED,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (ticket && typeof OrganizerService !== 'undefined') {
        await OrganizerService.logEntry(ticket, options.method || 'qr', false);
      }
      Utils.showToast('Billet marqué comme utilisé.');
      return ticket;
    } catch (error) {
      if (!navigator.onLine && options.allowOffline) {
        Utils.showToast('Mode hors ligne : scan mis en file d\'attente.', 'error');
      } else {
        Utils.showToast('Erreur lors de la validation.', 'error');
      }
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
        <div class="mt-3 d-flex gap-2 justify-content-center flex-wrap">
          <button type="button" class="btn btn-ef-outline btn-sm" data-download-pdf="${ticket.id}">
            <i class="bi bi-download me-1"></i> Télécharger PDF
          </button>
          <button type="button" class="btn btn-ef-outline btn-sm" data-share-ticket="${ticket.id}">
            <i class="bi bi-share me-1"></i> Partager
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-download-pdf]')?.addEventListener('click', () => {
      this.downloadPDF(ticket.id);
    });
    container.querySelector('[data-share-ticket]')?.addEventListener('click', () => {
      this.shareTicket(ticket, event);
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
  async shareTicket(ticket, event) {
    const text = `Mon billet EventFlow — ${event?.title || ticket.eventTitle}\nCode: ${ticket.ticketCode}\nDate: ${Utils.formatDate(event?.date)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EventFlow Africa — Billet',
          text,
          url: window.location.href
        });
        return;
      } catch (_) { /* annulé */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      Utils.showToast('Détails du billet copiés !');
    } catch (_) {
      Utils.showToast(text, 'success');
    }
  },

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
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="badge ${ticket.status === TICKET_STATUS.VALID ? 'badge-valid' : 'badge-used'}">
              ${ticket.status === TICKET_STATUS.VALID ? 'Valide' : 'Utilisé'}
            </span>
            <button class="btn btn-ef-outline btn-sm" onclick="TicketService.showTicketModal('${ticket.id}')">
              Voir billet
            </button>
            ${ticket.status === TICKET_STATUS.VALID ? `
            <button class="btn btn-ef-outline btn-sm" onclick="DashboardService.openTransferModal('${ticket.id}')">
              <i class="bi bi-arrow-left-right me-1"></i> Transférer
            </button>` : ''}
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
