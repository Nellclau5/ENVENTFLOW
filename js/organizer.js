/**
 * EventFlow Africa — Outils organisateur avancés
 */

const OrganizerService = {
  OFFLINE_QUEUE_KEY: 'eventflow_offline_scans',

  getTicketKindLabel(kind) {
    const labels = {
      [TICKET_KINDS.VIP]: 'VIP',
      [TICKET_KINDS.EARLY_BIRD]: 'Early bird',
      [TICKET_KINDS.STANDARD]: 'Standard'
    };
    return labels[kind] || 'Standard';
  },

  getEffectivePrice(type) {
    if (!type) return 0;
    if (type.kind === TICKET_KINDS.EARLY_BIRD && type.earlyBirdUntil) {
      const until = new Date(type.earlyBirdUntil);
      until.setHours(23, 59, 59, 999);
      if (new Date() > until) return type.regularPrice ?? type.price ?? 0;
    }
    return type.price ?? 0;
  },

  applyPromo(event, code, unitPrice) {
    if (!code || !event.promoCodes?.length) return { price: unitPrice, promo: null };
    const normalized = code.trim().toUpperCase();
    const promo = event.promoCodes.find(p =>
      p.code?.toUpperCase() === normalized &&
      (p.used || 0) < (p.maxUses || 9999) &&
      (!p.validUntil || new Date(p.validUntil) >= new Date())
    );
    if (!promo) return { price: unitPrice, promo: null, error: 'Code promo invalide ou expiré.' };
    let price = unitPrice;
    if (promo.discountPercent) price = Math.round(price * (1 - promo.discountPercent / 100));
    if (promo.discountFixed) price = Math.max(0, price - promo.discountFixed);
    return { price, promo };
  },

  async duplicateEvent(eventId) {
    const event = await EventService.getEvent(eventId);
    const copy = {
      title: `${event.title} (copie)`,
      description: event.description,
      category: event.category,
      date: event.date?.toDate
        ? event.date.toDate().toISOString().split('T')[0]
        : event.date,
      time: event.time,
      city: event.city,
      location: event.location,
      price: event.price,
      capacity: event.capacity,
      ticketTypes: (event.ticketTypes || []).map(t => ({
        ...t,
        id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sold: 0
      })),
      status: EVENT_STATUS.DRAFT,
      imageUrl: event.imageUrl || '',
      waitlistEnabled: event.waitlistEnabled || false,
      scheduledPublishAt: event.scheduledPublishAt || null,
      promoCodes: (event.promoCodes || []).map(p => ({ ...p, used: 0 }))
    };
    const id = await EventService.createEvent(copy);
    Utils.showToast('Événement dupliqué en brouillon.');
    return id;
  },

  async joinWaitlist(eventId, quantity = 1, ticketTypeId = null) {
    if (!AuthService.currentUser) {
      window.location.href = `login.html?redirect=event-details.html?id=${eventId}`;
      return;
    }
    const user = AuthService.currentUser;
    const data = AuthService.userData;
    const existing = await db.collection(COLLECTIONS.WAITLIST)
      .where('eventId', '==', eventId)
      .where('userId', '==', user.uid)
      .limit(1)
      .get();
    if (!existing.empty) {
      Utils.showToast('Vous êtes déjà sur la liste d\'attente.', 'error');
      return;
    }
    const event = await EventService.getEvent(eventId);
    await db.collection(COLLECTIONS.WAITLIST).add({
      eventId,
      eventTitle: event.title,
      userId: user.uid,
      userName: data?.displayName || user.email,
      userEmail: user.email,
      quantity,
      ticketTypeId,
      status: 'waiting',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Utils.showToast('Inscrit sur la liste d\'attente ! Nous vous notifierons.');
    return true;
  },

  async getWaitlist(eventId) {
    const snap = await db.collection(COLLECTIONS.WAITLIST)
      .where('eventId', '==', eventId)
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getEventPurchases(eventId) {
    const snap = await db.collection(COLLECTIONS.PURCHASES)
      .where('eventId', '==', eventId)
      .orderBy('purchasedAt', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getEntryLogs(eventId, limit = 100) {
    const snap = await db.collection(COLLECTIONS.ENTRY_LOGS)
      .where('eventId', '==', eventId)
      .orderBy('scannedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async logEntry(ticket, method = 'qr', offline = false) {
    const user = AuthService.currentUser;
    const data = AuthService.userData;
    await db.collection(COLLECTIONS.ENTRY_LOGS).add({
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      eventId: ticket.eventId,
      eventTitle: ticket.eventTitle,
      userName: ticket.userName,
      userEmail: ticket.userEmail,
      ticketTypeName: ticket.ticketTypeName || 'Standard',
      scannedBy: user?.uid || 'offline',
      scannedByName: data?.displayName || user?.email || 'Staff',
      method,
      offline,
      scannedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.OFFLINE_QUEUE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  },

  queueOfflineScan(ticketCode, ticketId, eventId) {
    const queue = this.getOfflineQueue();
    queue.push({ ticketCode, ticketId, eventId, queuedAt: Date.now() });
    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  getOfflineQueueCount() {
    return this.getOfflineQueue().length;
  },

  async syncOfflineQueue() {
    if (!navigator.onLine) return 0;
    const queue = this.getOfflineQueue();
    if (!queue.length) return 0;
    let synced = 0;
    const remaining = [];
    for (const item of queue) {
      try {
        await db.collection(COLLECTIONS.TICKETS).doc(item.ticketId).update({
          status: TICKET_STATUS.USED,
          usedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection(COLLECTIONS.ENTRY_LOGS).add({
          ticketId: item.ticketId,
          ticketCode: item.ticketCode,
          eventId: item.eventId,
          scannedBy: AuthService.currentUser?.uid || 'sync',
          scannedByName: AuthService.userData?.displayName || 'Sync offline',
          method: 'offline',
          offline: true,
          scannedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        synced++;
      } catch (_) {
        remaining.push(item);
      }
    }
    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    if (synced) Utils.showToast(`${synced} scan(s) offline synchronisé(s).`);
    return synced;
  },

  downloadCSV(filename, rows) {
    const csv = rows.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  async exportParticipantsCSV(eventId) {
    const [participants, event] = await Promise.all([
      TicketService.getEventParticipants(eventId),
      EventService.getEvent(eventId)
    ]);
    const rows = [
      ['Nom', 'Email', 'Code', 'Type', 'Prix', 'Statut', 'Date achat']
    ];
    participants.forEach(p => {
      rows.push([
        p.userName,
        p.userEmail,
        p.ticketCode,
        p.ticketTypeName || 'Standard',
        p.totalPrice || p.price,
        p.status,
        p.purchasedAt ? Utils.formatDate(p.purchasedAt) : ''
      ]);
    });
    this.downloadCSV(`participants-${event.title.slice(0, 30)}.csv`, rows);
    Utils.showToast('Export CSV téléchargé.');
  },

  async exportSalesCSV(organizerId) {
    const events = await EventService.getOrganizerEvents(organizerId);
    const rows = [['Événement', 'Date', 'Billets vendus', 'Capacité', 'Revenus', 'Statut']];
    events.forEach(e => {
      rows.push([
        e.title,
        Utils.formatDate(e.date),
        e.soldTickets || 0,
        e.capacity,
        e.revenue || 0,
        EventService.getStatusLabel(e.status)
      ]);
    });
    this.downloadCSV('ventes-eventflow.csv', rows);
    Utils.showToast('Export ventes CSV téléchargé.');
  },

  async exportParticipantsPDF(eventId) {
    const [participants, event] = await Promise.all([
      TicketService.getEventParticipants(eventId),
      EventService.getEvent(eventId)
    ]);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Participants — ${event.title}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`${Utils.formatDate(event.date)} — ${participants.length} participant(s)`, 14, 28);
    let y = 38;
    participants.slice(0, 40).forEach((p, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${i + 1}. ${p.userName} — ${p.ticketCode} — ${p.ticketTypeName || 'Standard'} — ${p.status}`, 14, y);
      y += 7;
    });
    if (participants.length > 40) {
      doc.text(`... et ${participants.length - 40} autres (voir export CSV)`, 14, y + 4);
    }
    doc.save(`participants-${event.title.slice(0, 25)}.pdf`);
    Utils.showToast('Export PDF téléchargé.');
  },

  async sendNotification(eventId, { channel, subject, message, target = 'all' }) {
    const event = await EventService.getEvent(eventId);
    let recipients = [];
    if (target === 'waitlist') {
      const wl = await this.getWaitlist(eventId);
      recipients = wl.map(w => w.userEmail);
    } else {
      const parts = await TicketService.getEventParticipants(eventId);
      recipients = [...new Set(parts.map(p => p.userEmail))];
    }
    await db.collection(COLLECTIONS.EVENT_NOTIFICATIONS).add({
      eventId,
      eventTitle: event.title,
      channel,
      subject,
      message,
      target,
      recipientCount: recipients.length,
      recipients: recipients.slice(0, 50),
      sentBy: AuthService.currentUser.uid,
      sentAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'queued'
    });
    const label = { email: 'Email', sms: 'SMS', push: 'Push' }[channel] || channel;
    Utils.showToast(`${label} programmé pour ${recipients.length} destinataire(s).`);
  },

  renderSalesLive(events, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!events.length) {
      el.innerHTML = '<p class="text-muted small p-3">Aucun événement.</p>';
      return;
    }
    el.innerHTML = events.map(e => {
      const pct = e.capacity > 0 ? Math.round(((e.soldTickets || 0) / e.capacity) * 100) : 0;
      const types = (e.ticketTypes || []).map(t =>
        `<span class="badge bg-dark me-1">${t.name}: ${t.sold || 0}/${t.quota}</span>`
      ).join('');
      return `
        <div class="sales-live-item p-3 border-bottom border-secondary">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <strong>${e.title}</strong>
              <div class="text-muted small">${Utils.formatDate(e.date)}</div>
            </div>
            <div class="text-end">
              <div class="fw-bold text-warning">${Utils.formatPrice(e.revenue || 0)}</div>
              <div class="small">${e.soldTickets || 0} / ${e.capacity} billets</div>
            </div>
          </div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-warning" style="width:${pct}%"></div>
          </div>
          ${types ? `<div class="mt-2">${types}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  renderEntryLogs(logs, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = logs.length === 0
      ? '<tr><td colspan="5" class="text-center text-muted py-3">Aucun scan enregistré</td></tr>'
      : logs.map(l => `
        <tr>
          <td>${l.userName || '—'}</td>
          <td><code class="small">${l.ticketCode}</code></td>
          <td>${l.scannedByName || '—'}</td>
          <td><span class="badge ${l.offline ? 'badge-pending' : 'badge-valid'}">${l.method || 'qr'}</span></td>
          <td>${Utils.formatDate(l.scannedAt)}</td>
        </tr>
      `).join('');
  },

  renderWaitlist(entries, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = entries.length === 0
      ? '<tr><td colspan="4" class="text-center text-muted py-3">Liste d\'attente vide</td></tr>'
      : entries.map(w => `
        <tr>
          <td>${w.userName}</td>
          <td>${w.userEmail}</td>
          <td>${w.quantity || 1}</td>
          <td>${Utils.formatDate(w.createdAt)}</td>
        </tr>
      `).join('');
  },

  subscribeOrganizerSales(organizerId, onUpdate) {
    return db.collection(COLLECTIONS.EVENTS)
      .where('organizerId', '==', organizerId)
      .onSnapshot(async () => {
        const events = await EventService.getOrganizerEvents(organizerId);
        onUpdate(events);
      });
  },

  collectPromoCodes() {
    return Array.from(document.querySelectorAll('.promo-code-row')).map(row => ({
      code: row.querySelector('.promo-code')?.value.trim().toUpperCase(),
      discountPercent: parseInt(row.querySelector('.promo-percent')?.value) || 0,
      discountFixed: parseInt(row.querySelector('.promo-fixed')?.value) || 0,
      maxUses: parseInt(row.querySelector('.promo-max')?.value) || 100,
      validUntil: row.querySelector('.promo-until')?.value || null,
      used: parseInt(row.dataset.used) || 0
    })).filter(p => p.code);
  },

  addPromoCodeRow(data = {}) {
    const list = document.getElementById('promo-codes-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'promo-code-row row g-2 align-items-end mb-2';
    row.dataset.used = data.used || 0;
    row.innerHTML = `
      <div class="col-md-3">
        <input type="text" class="form-control form-control-sm promo-code" placeholder="CODE20" value="${data.code || ''}" required>
      </div>
      <div class="col-md-2">
        <input type="number" class="form-control form-control-sm promo-percent" min="0" max="100" placeholder="%" value="${data.discountPercent || ''}">
      </div>
      <div class="col-md-2">
        <input type="number" class="form-control form-control-sm promo-fixed" min="0" placeholder="FCFA" value="${data.discountFixed || ''}">
      </div>
      <div class="col-md-2">
        <input type="number" class="form-control form-control-sm promo-max" min="1" value="${data.maxUses || 100}">
      </div>
      <div class="col-md-2">
        <input type="date" class="form-control form-control-sm promo-until" value="${data.validUntil || ''}">
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-sm btn-outline-danger w-100 remove-promo-btn"><i class="bi bi-trash"></i></button>
      </div>
    `;
    row.querySelector('.remove-promo-btn')?.addEventListener('click', () => row.remove());
    list.appendChild(row);
  },

  fillPromoCodes(promos = []) {
    const list = document.getElementById('promo-codes-list');
    if (!list) return;
    list.innerHTML = '';
    promos.forEach(p => this.addPromoCodeRow(p));
  }
};

window.OrganizerService = OrganizerService;
