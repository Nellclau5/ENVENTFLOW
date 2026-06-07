/**
 * EventFlow Africa — Utilitaires
 */

const Utils = {
  /**
   * Affiche un toast de notification
   */
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = `alert ef-alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    toast.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  },

  createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  },

  /**
   * Affiche/masque l'overlay de chargement
   */
  showLoading(show = true) {
    let overlay = document.getElementById('loading-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner-ef"></div>';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'flex';
    } else if (overlay) {
      overlay.style.display = 'none';
    }
  },

  /**
   * Formate un prix en FCFA
   */
  formatPrice(price) {
    if (price === 0 || price === '0') return 'Gratuit';
    return new Intl.NumberFormat('fr-FR').format(price) + ' FCFA';
  },

  /**
   * Formate une date
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = dateStr.toDate ? dateStr.toDate() : new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  },

  /**
   * Formate date + heure
   */
  formatDateTime(dateStr, timeStr) {
    const formatted = this.formatDate(dateStr);
    return timeStr ? `${formatted} à ${timeStr}` : formatted;
  },

  /**
   * Génère un ID unique pour les billets
   */
  generateTicketId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'EFA-';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  },

  /**
   * Récupère un paramètre URL
   */
  getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  },

  /**
   * Tronque un texte
   */
  truncate(text, length = 100) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  },

  /**
   * Initiales à partir d'un nom
   */
  getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  },

  /**
   * Débounce une fonction
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  /**
   * Génère une image QR Code dans un conteneur (div)
   */
  async generateQRCode(elementId, data) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error('Élément QR introuvable');

    if (typeof QRCode !== 'function') {
      throw new Error('Bibliothèque QR Code non chargée. Rechargez la page.');
    }

    element.innerHTML = '';
    element.classList.add('ticket-qr-host');

    new QRCode(element, {
      text: String(data),
      width: 200,
      height: 200,
      colorDark: '#0a0a0a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    return element;
  },

  /**
   * Retourne le QR code en Data URL (pour PDF)
   */
  async getQRCodeDataUrl(data) {
    if (typeof QRCode === 'function') {
      const temp = document.createElement('div');
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      temp.style.top = '-9999px';
      document.body.appendChild(temp);

      try {
        new QRCode(temp, {
          text: String(data),
          width: 200,
          height: 200,
          correctLevel: QRCode.CorrectLevel.M
        });

        const canvas = temp.querySelector('canvas');
        if (canvas) return canvas.toDataURL('image/png');

        const img = temp.querySelector('img');
        if (img?.src) return img.src;
      } finally {
        temp.remove();
      }
    }

    throw new Error('Impossible de générer le QR code.');
  },

  /**
   * Génère et télécharge un PDF de billet
   */
  async generateTicketPDF(ticket, event) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('Bibliothèque PDF non chargée. Rechargez la page.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFillColor(57, 54, 79);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('EventFlow Africa', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Billet d\'entrée', 105, 32, { align: 'center' });

    doc.setTextColor(57, 54, 79);
    doc.setFontSize(16);
    doc.text(event?.title || ticket.eventTitle || 'Événement', 20, 55);
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${this.formatDate(event?.date)}`, 20, 65);
    doc.text(`Heure: ${event?.time || 'N/A'}`, 20, 72);
    doc.text(`Lieu: ${event?.location || 'N/A'}`, 20, 79);

    doc.setTextColor(57, 54, 79);
    doc.setFontSize(12);
    doc.text(`N° Billet: ${ticket.ticketCode}`, 20, 95);
    doc.text(`Participant: ${ticket.userName}`, 20, 102);
    doc.text(`Email: ${ticket.userEmail}`, 20, 109);
    doc.text(`Prix: ${this.formatPrice(ticket.price)}`, 20, 116);

    const qrDataUrl = await this.getQRCodeDataUrl(ticket.ticketCode);

    doc.addImage(qrDataUrl, 'PNG', 145, 85, 45, 45);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('Scannez ce code à l\'entrée', 145, 135);
    doc.save(`billet-${ticket.ticketCode}.pdf`);
  },

  /**
   * Met à jour la navbar selon l'état auth
   */
  updateNavbar(user, userData) {
    const authLinks = document.getElementById('auth-links');
    const userMenu = document.getElementById('user-menu');
    if (!authLinks) return;

    if (user) {
      authLinks.innerHTML = '';
      if (userMenu) {
        userMenu.classList.remove('d-none');
        const userName = document.getElementById('nav-user-name');
        if (userName) userName.textContent = userData?.displayName || user.email;

        const dashboardLink = document.getElementById('nav-dashboard-link');
        if (dashboardLink) {
          if (userData?.role === ROLES.ADMIN) {
            dashboardLink.href = 'admin.html';
            dashboardLink.textContent = 'Administration';
          } else if (userData?.role === ROLES.ORGANIZER) {
            dashboardLink.href = 'dashboard.html';
            dashboardLink.textContent = 'Dashboard';
          } else {
            dashboardLink.href = 'dashboard.html';
            dashboardLink.textContent = 'Mon espace';
          }
        }
      }
    } else {
      authLinks.innerHTML = `
        <a href="login.html" class="nav-link">Connexion</a>
        <a href="register.html" class="btn btn-ef-primary ms-2">S'inscrire</a>
      `;
      if (userMenu) userMenu.classList.add('d-none');
    }
  }
};
