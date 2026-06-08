/**
 * EventFlow Africa — Administration plateforme (litiges, remboursements, signalements, commissions)
 */

const AdminPlatformService = {
  _commissionRate: COMMISSION_RATE,

  async init() {
    this._commissionRate = await this.getCommissionRate();
  },

  async getCommissionRate() {
    try {
      const doc = await db.collection(COLLECTIONS.PLATFORM_SETTINGS).doc('main').get();
      if (doc.exists && typeof doc.data().commissionRate === 'number') {
        this._commissionRate = doc.data().commissionRate;
        return this._commissionRate;
      }
    } catch (_) { /* fallback */ }
    this._commissionRate = COMMISSION_RATE;
    return this._commissionRate;
  },

  getCommissionRateSync() {
    return this._commissionRate ?? COMMISSION_RATE;
  },

  async setCommissionRate(rate) {
    const pct = parseFloat(rate);
    if (isNaN(pct) || pct < 0 || pct > 50) throw new Error('Taux invalide (0–50 %).');
    const commissionRate = pct / 100;
    await db.collection(COLLECTIONS.PLATFORM_SETTINGS).doc('main').set({
      commissionRate,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: AuthService.currentUser?.uid || null
    }, { merge: true });
    this._commissionRate = commissionRate;
    await this.logAction('commission_update', 'platformSettings', { rate: pct });
    Utils.showToast(`Commission mise à jour : ${pct} %.`);
  },

  async logAction(action, target, details = {}) {
    try {
      await db.collection(COLLECTIONS.ADMIN_LOGS).add({
        action,
        target,
        details,
        adminId: AuthService.currentUser?.uid,
        adminEmail: AuthService.currentUser?.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (_) { /* non bloquant */ }
  },

  /* ——— Validation organisateurs ——— */

  async getPendingOrganizers() {
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('role', '==', ROLES.ORGANIZER)
      .where('accountStatus', '==', ACCOUNT_STATUS.PENDING)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  },

  renderOrganizerQueue(organizers, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!organizers.length) {
      el.innerHTML = '<p class="text-muted mb-0">Aucun organisateur en attente de validation.</p>';
      return;
    }
    el.innerHTML = organizers.map(o => `
      <div class="moderation-item">
        <div>
          <strong>${o.displayName || 'Sans nom'}</strong>
          <p class="text-muted small mb-0">${o.email} — Inscrit le ${Utils.formatDate(o.createdAt)}</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-ef-primary" onclick="AdminService.approveOrganizer('${o.id}')">Approuver</button>
          <button class="btn btn-sm btn-outline-danger" onclick="AdminService.suspendUser('${o.id}')">Rejeter / Suspendre</button>
        </div>
      </div>
    `).join('');
  },

  /* ——— Litiges ——— */

  async getDisputes(status = null) {
    let q = db.collection(COLLECTIONS.DISPUTES).orderBy('createdAt', 'desc');
    if (status) q = db.collection(COLLECTIONS.DISPUTES).where('status', '==', status).orderBy('createdAt', 'desc');
    const snap = await q.limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async createDispute(data) {
    await db.collection(COLLECTIONS.DISPUTES).add({
      userId: AuthService.currentUser.uid,
      userName: AuthService.userData?.displayName || AuthService.currentUser.email,
      userEmail: AuthService.currentUser.email,
      eventId: data.eventId || null,
      eventTitle: data.eventTitle || '',
      ticketId: data.ticketId || null,
      purchaseId: data.purchaseId || null,
      subject: data.subject,
      description: data.description,
      amount: data.amount || 0,
      status: DISPUTE_STATUS.OPEN,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async updateDisputeStatus(disputeId, status, resolution = '') {
    await db.collection(COLLECTIONS.DISPUTES).doc(disputeId).update({
      status,
      resolution: resolution || null,
      resolvedAt: status === DISPUTE_STATUS.RESOLVED || status === DISPUTE_STATUS.CLOSED
        ? firebase.firestore.FieldValue.serverTimestamp()
        : null,
      resolvedBy: AuthService.currentUser?.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this.logAction('dispute_update', disputeId, { status, resolution });
  },

  renderDisputes(disputes, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!disputes.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Aucun litige.</td></tr>';
      return;
    }
    tbody.innerHTML = disputes.map(d => `
      <tr>
        <td>${d.subject}</td>
        <td>${d.userName || d.userEmail}</td>
        <td>${d.eventTitle || '-'}</td>
        <td>${Utils.formatPrice(d.amount || 0)}</td>
        <td><span class="trust-badge ${d.status}">${this.getDisputeLabel(d.status)}</span></td>
        <td>
          <div class="d-flex flex-wrap gap-1">
            ${d.status === DISPUTE_STATUS.OPEN || d.status === DISPUTE_STATUS.IN_PROGRESS ? `
              <button class="btn btn-sm btn-ef-primary" onclick="AdminPlatformService.resolveDispute('${d.id}')">Résoudre</button>
              <button class="btn btn-sm btn-ef-outline" onclick="AdminPlatformService.createRefundFromDispute('${d.id}')">Rembourser</button>
            ` : ''}
            <button class="btn btn-sm btn-outline-secondary" onclick="AdminPlatformService.viewDispute('${d.id}')">Détail</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  getDisputeLabel(s) {
    return { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' }[s] || s;
  },

  async resolveDispute(disputeId) {
    const resolution = prompt('Résolution du litige :') || '';
    await this.updateDisputeStatus(disputeId, DISPUTE_STATUS.RESOLVED, resolution);
    Utils.showToast('Litige résolu.');
    await AdminService.loadTrustTab?.();
  },

  async viewDispute(disputeId) {
    const doc = await db.collection(COLLECTIONS.DISPUTES).doc(disputeId).get();
    if (!doc.exists) return;
    const d = doc.data();
    alert(`Litige : ${d.subject}\n\n${d.description}\n\nStatut : ${this.getDisputeLabel(d.status)}${d.resolution ? '\nRésolution : ' + d.resolution : ''}`);
  },

  /* ——— Remboursements ——— */

  async getRefunds(status = null) {
    let q = db.collection(COLLECTIONS.REFUNDS).orderBy('createdAt', 'desc');
    if (status) q = db.collection(COLLECTIONS.REFUNDS).where('status', '==', status).orderBy('createdAt', 'desc');
    const snap = await q.limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async createRefundFromDispute(disputeId) {
    const doc = await db.collection(COLLECTIONS.DISPUTES).doc(disputeId).get();
    if (!doc.exists) return;
    const d = doc.data();
    if (!confirm(`Créer un remboursement de ${Utils.formatPrice(d.amount || 0)} pour ce litige ?`)) return;
    await db.collection(COLLECTIONS.REFUNDS).add({
      disputeId,
      userId: d.userId,
      userName: d.userName,
      userEmail: d.userEmail,
      eventId: d.eventId,
      eventTitle: d.eventTitle,
      ticketId: d.ticketId,
      purchaseId: d.purchaseId,
      amount: d.amount || 0,
      reason: d.subject,
      status: REFUND_STATUS.PENDING,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this.updateDisputeStatus(disputeId, DISPUTE_STATUS.IN_PROGRESS, 'Remboursement en cours');
    Utils.showToast('Demande de remboursement créée.');
    await AdminService.loadTrustTab?.();
  },

  async processRefund(refundId, action) {
    const ref = db.collection(COLLECTIONS.REFUNDS).doc(refundId);
    const doc = await ref.get();
    if (!doc.exists) return;
    const refund = doc.data();

    if (action === 'approve') {
      const batch = db.batch();
      batch.update(ref, {
        status: REFUND_STATUS.COMPLETED,
        processedAt: firebase.firestore.FieldValue.serverTimestamp(),
        processedBy: AuthService.currentUser?.uid
      });

      if (refund.ticketId) {
        const ticketRef = db.collection(COLLECTIONS.TICKETS).doc(refund.ticketId);
        const ticketDoc = await ticketRef.get();
        if (ticketDoc.exists && ticketDoc.data().status === TICKET_STATUS.VALID) {
          batch.update(ticketRef, {
            status: TICKET_STATUS.CANCELLED,
            refundedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          const t = ticketDoc.data();
          const eventRef = db.collection(COLLECTIONS.EVENTS).doc(t.eventId);
          const commission = Math.round((t.totalPrice || t.price || 0) * this.getCommissionRateSync());
          batch.update(eventRef, {
            revenue: firebase.firestore.FieldValue.increment(-(t.totalPrice || t.price || 0)),
            commissionTotal: firebase.firestore.FieldValue.increment(-commission),
            placesLeft: firebase.firestore.FieldValue.increment(t.quantity || 1),
            soldTickets: firebase.firestore.FieldValue.increment(-(t.quantity || 1))
          });
        }
      }
      await batch.commit();
      await this.logAction('refund_approved', refundId, { amount: refund.amount });
      Utils.showToast('Remboursement approuvé et billet annulé.');
    } else {
      await ref.update({
        status: REFUND_STATUS.REJECTED,
        processedAt: firebase.firestore.FieldValue.serverTimestamp(),
        processedBy: AuthService.currentUser?.uid
      });
      Utils.showToast('Remboursement rejeté.');
    }
    await AdminService.loadTrustTab?.();
    await AdminService.loadOverview?.();
  },

  renderRefunds(refunds, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!refunds.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Aucun remboursement.</td></tr>';
      return;
    }
    tbody.innerHTML = refunds.map(r => `
      <tr>
        <td>${r.userName || r.userEmail}</td>
        <td>${r.eventTitle || '-'}</td>
        <td>${Utils.formatPrice(r.amount || 0)}</td>
        <td class="small text-muted">${r.reason || '-'}</td>
        <td><span class="trust-badge ${r.status}">${this.getRefundLabel(r.status)}</span></td>
        <td>
          ${r.status === REFUND_STATUS.PENDING ? `
            <button class="btn btn-sm btn-ef-primary" onclick="AdminPlatformService.processRefund('${r.id}', 'approve')">Approuver</button>
            <button class="btn btn-sm btn-outline-danger" onclick="AdminPlatformService.processRefund('${r.id}', 'reject')">Rejeter</button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  getRefundLabel(s) {
    return { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', completed: 'Effectué' }[s] || s;
  },

  /* ——— Signalements ——— */

  async submitReport(data) {
    if (!AuthService.currentUser) {
      window.location.href = 'login.html';
      return;
    }
    await db.collection(COLLECTIONS.REPORTS).add({
      reporterId: AuthService.currentUser.uid,
      reporterName: AuthService.userData?.displayName || AuthService.currentUser.email,
      type: data.type || REPORT_TYPES.EVENT,
      targetId: data.targetId,
      targetLabel: data.targetLabel || '',
      reason: data.reason,
      description: data.description || '',
      status: REPORT_STATUS.OPEN,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Utils.showToast('Signalement envoyé. Notre équipe va l\'examiner.');
  },

  async getReports(status = null) {
    let q = db.collection(COLLECTIONS.REPORTS).orderBy('createdAt', 'desc');
    if (status) q = db.collection(COLLECTIONS.REPORTS).where('status', '==', status).orderBy('createdAt', 'desc');
    const snap = await q.limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async reviewReport(reportId, action) {
    const statusMap = {
      dismiss: REPORT_STATUS.DISMISSED,
      review: REPORT_STATUS.REVIEWED,
      action: REPORT_STATUS.ACTION_TAKEN
    };
    const notes = prompt('Notes admin (optionnel) :') || '';
    await db.collection(COLLECTIONS.REPORTS).doc(reportId).update({
      status: statusMap[action] || REPORT_STATUS.REVIEWED,
      adminNotes: notes,
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
      reviewedBy: AuthService.currentUser?.uid
    });
    if (action === 'action') {
      const doc = await db.collection(COLLECTIONS.REPORTS).doc(reportId).get();
      const r = doc.data();
      if (r?.type === REPORT_TYPES.FRAUD && r.targetId) {
        await db.collection(COLLECTIONS.USERS).doc(r.targetId).update({
          accountStatus: ACCOUNT_STATUS.SUSPENDED,
          suspendedReason: r.reason,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    await this.logAction('report_review', reportId, { action, notes });
    Utils.showToast('Signalement traité.');
    await AdminService.loadTrustTab?.();
  },

  renderReports(reports, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!reports.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Aucun signalement.</td></tr>';
      return;
    }
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td><span class="trust-badge type-${r.type}">${r.type}</span></td>
        <td>${r.targetLabel || r.targetId}</td>
        <td>${r.reason}</td>
        <td>${r.reporterName || '-'}</td>
        <td><span class="trust-badge ${r.status}">${this.getReportLabel(r.status)}</span></td>
        <td>
          ${r.status === REPORT_STATUS.OPEN ? `
            <button class="btn btn-sm btn-outline-secondary" onclick="AdminPlatformService.reviewReport('${r.id}', 'dismiss')">Ignorer</button>
            <button class="btn btn-sm btn-ef-primary" onclick="AdminPlatformService.reviewReport('${r.id}', 'action')">Agir</button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  getReportLabel(s) {
    return { open: 'Ouvert', reviewed: 'Examiné', dismissed: 'Ignoré', action_taken: 'Action prise' }[s] || s;
  },

  /* ——— Support tickets admin ——— */

  async getSupportTickets() {
    const snap = await db.collection(COLLECTIONS.SUPPORT_TICKETS)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async updateSupportTicket(ticketId, status, reply = '') {
    await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId).update({
      status,
      adminReply: reply || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      handledBy: AuthService.currentUser?.uid
    });
    Utils.showToast('Ticket mis à jour.');
    await AdminService.loadSupportTab?.();
  },

  renderSupportTickets(tickets, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!tickets.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Aucun ticket.</td></tr>';
      return;
    }
    tbody.innerHTML = tickets.map(t => `
      <tr>
        <td>${t.subject}</td>
        <td>${t.userName || t.userEmail}</td>
        <td class="small text-muted">${(t.message || '').slice(0, 80)}…</td>
        <td><span class="trust-badge ${t.status}">${t.status}</span></td>
        <td>
          ${t.status === 'open' ? `
            <button class="btn btn-sm btn-ef-primary" onclick="AdminPlatformService.closeSupportTicket('${t.id}')">Clôturer</button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  async closeSupportTicket(ticketId) {
    const reply = prompt('Réponse admin (optionnel) :') || '';
    await this.updateSupportTicket(ticketId, 'closed', reply);
  },

  /* ——— Commissions par organisateur ——— */

  async getOrganizerCommissionReport() {
    const [eventsSnap, usersSnap] = await Promise.all([
      db.collection(COLLECTIONS.EVENTS).get(),
      db.collection(COLLECTIONS.USERS).where('role', '==', ROLES.ORGANIZER).get()
    ]);
    const users = {};
    usersSnap.docs.forEach(d => { users[d.id] = d.data(); });
    const byOrganizer = {};
    eventsSnap.docs.forEach(d => {
      const e = d.data();
      const oid = e.organizerId;
      if (!oid) return;
      if (!byOrganizer[oid]) {
        byOrganizer[oid] = {
          name: users[oid]?.displayName || e.organizerName || oid,
          email: users[oid]?.email || '',
          events: 0,
          revenue: 0,
          commission: 0
        };
      }
      byOrganizer[oid].events += 1;
      byOrganizer[oid].revenue += e.revenue || 0;
      byOrganizer[oid].commission += e.commissionTotal || 0;
    });
    return Object.entries(byOrganizer)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.commission - a.commission);
  },

  renderCommissionReport(rows, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Aucune donnée.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${r.email}</td>
        <td>${r.events}</td>
        <td>${Utils.formatPrice(r.revenue)}</td>
        <td><strong class="text-primary">${Utils.formatPrice(r.commission)}</strong></td>
      </tr>
    `).join('');
  },

  /* ——— Stats globales enrichies ——— */

  async getGlobalStats() {
    const [usersSnap, eventsSnap, ticketsSnap, disputesSnap, refundsSnap, reportsSnap, logsSnap] = await Promise.all([
      db.collection(COLLECTIONS.USERS).get(),
      db.collection(COLLECTIONS.EVENTS).get(),
      db.collection(COLLECTIONS.TICKETS).get(),
      db.collection(COLLECTIONS.DISPUTES).where('status', '==', DISPUTE_STATUS.OPEN).get(),
      db.collection(COLLECTIONS.REFUNDS).where('status', '==', REFUND_STATUS.PENDING).get(),
      db.collection(COLLECTIONS.REPORTS).where('status', '==', REPORT_STATUS.OPEN).get(),
      db.collection(COLLECTIONS.ENTRY_LOGS).limit(500).get()
    ]);

    const users = usersSnap.docs.map(d => d.data());
    const events = eventsSnap.docs.map(d => d.data());
    const rate = this.getCommissionRateSync();
    const totalRevenue = events.reduce((s, e) => s + (e.revenue || 0), 0);
    const totalCommissions = events.reduce((s, e) => s + (e.commissionTotal || 0), 0);
    const scansToday = logsSnap.docs.filter(d => {
      const ts = d.data().scannedAt?.toDate?.();
      if (!ts) return false;
      const now = new Date();
      return ts.toDateString() === now.toDateString();
    }).length;

    return {
      users: users.length,
      organizers: users.filter(u => u.role === ROLES.ORGANIZER).length,
      pendingOrganizers: users.filter(u => u.role === ROLES.ORGANIZER && u.accountStatus === ACCOUNT_STATUS.PENDING).length,
      suspendedUsers: users.filter(u => u.accountStatus === ACCOUNT_STATUS.SUSPENDED).length,
      events: events.length,
      publishedEvents: events.filter(e => e.status === EVENT_STATUS.PUBLISHED).length,
      pendingEvents: events.filter(e => e.status === EVENT_STATUS.PENDING).length,
      ticketsSold: ticketsSnap.size,
      totalRevenue,
      totalCommissions,
      commissionRate: rate,
      openDisputes: disputesSnap.size,
      pendingRefunds: refundsSnap.size,
      openReports: reportsSnap.size,
      scansToday
    };
  }
};

window.AdminPlatformService = AdminPlatformService;
