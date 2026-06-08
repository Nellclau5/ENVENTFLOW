/**
 * EventFlow Africa — Support & centre d'aide
 */

const SupportService = {
  FAQ: [
    {
      q: 'Comment acheter un billet ?',
      a: 'Créez un compte, parcourez les événements, choisissez votre type de billet et cliquez sur « Acheter ». Vous recevrez un QR code et pourrez télécharger le PDF.'
    },
    {
      q: 'Comment devenir organisateur ?',
      a: 'Inscrivez-vous en choisissant « Organisateur ». Votre compte sera validé par un administrateur avant de pouvoir publier des événements.'
    },
    {
      q: 'Puis-je transférer mon billet ?',
      a: 'Oui, depuis « Mon espace » → « Mes billets », cliquez sur « Transférer » et entrez l\'email du destinataire (il doit avoir un compte EventFlow).'
    },
    {
      q: 'Comment activer les alertes ?',
      a: 'Dans votre profil, section « Préférences », activez les notifications et créez des alertes par ville ou catégorie dans « Mes alertes ».'
    },
    {
      q: 'Mon billet a déjà été scanné, que faire ?',
      a: 'Un billet scanné ne peut plus être réutilisé. Contactez le support avec votre numéro de billet si vous pensez qu\'il s\'agit d\'une erreur.'
    },
    {
      q: 'Comment accéder à l\'administration ?',
      a: 'L\'accès admin est réservé. Un administrateur doit attribuer le rôle « admin » à votre compte dans Firebase.'
    }
  ],

  renderFAQ(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = this.FAQ.map((item, i) => `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button ${i ? 'collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#faq-${i}">
            ${item.q}
          </button>
        </h2>
        <div id="faq-${i}" class="accordion-collapse collapse ${i ? '' : 'show'}" data-bs-parent="#faq-accordion">
          <div class="accordion-body text-muted">${item.a}</div>
        </div>
      </div>
    `).join('');
  },

  async submitTicket(data) {
    const user = AuthService.currentUser;
    await db.collection(COLLECTIONS.SUPPORT_TICKETS).add({
      userId: user?.uid || null,
      userName: data.name,
      userEmail: data.email,
      subject: data.subject,
      message: data.message,
      status: 'open',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async getUserTickets(userId) {
    const snapshot = await db.collection(COLLECTIONS.SUPPORT_TICKETS)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
};
