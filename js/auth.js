/**
 * EventFlow Africa — Authentification
 */

const AuthService = {
  currentUser: null,
  userData: null,
  initPromise: null,

  /**
   * Initialise l'écouteur d'état auth
   */
  init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      auth.onAuthStateChanged(async (user) => {
        this.currentUser = user;
        if (user) {
          this.userData = await this.getUserData(user.uid);
        } else {
          this.userData = null;
        }
        Utils.updateNavbar(user, this.userData);
        if (user && typeof NotificationService !== 'undefined') {
          NotificationService.initFCM().catch(() => {});
        }
        resolve(user);
      });
    });

    return this.initPromise;
  },

  /**
   * Inscription utilisateur
   */
  async register(email, password, displayName, role = ROLES.USER) {
    Utils.showLoading(true);
    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({ displayName });

      const accountStatus = role === ROLES.ORGANIZER
        ? ACCOUNT_STATUS.PENDING
        : ACCOUNT_STATUS.ACTIVE;

      await db.collection(COLLECTIONS.USERS).doc(credential.user.uid).set({
        email: email.trim().toLowerCase(),
        displayName,
        role,
        accountStatus,
        phone: '',
        bio: '',
        preferences: { ...DEFAULT_PREFERENCES },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      if (role === ROLES.ORGANIZER) {
        Utils.showToast('Compte organisateur créé — en attente de validation admin.');
      }

      Utils.showToast('Compte créé avec succès !');
      return credential.user;
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Connexion
   */
  async login(email, password) {
    Utils.showLoading(true);
    try {
      const credential = await auth.signInWithEmailAndPassword(email, password);
      this.userData = await this.getUserData(credential.user.uid);
      if (!this.hasRole(ROLES.ADMIN) && this.userData?.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
        await auth.signOut();
        this.currentUser = null;
        this.userData = null;
        Utils.showToast('Votre compte est suspendu. Contactez le support.', 'error');
        throw new Error('account-suspended');
      }
      Utils.showToast('Connexion réussie !');
      return credential.user;
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Déconnexion
   */
  async logout() {
    try {
      await auth.signOut();
      Utils.showToast('Déconnexion réussie.');
      window.location.href = 'index.html';
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
    }
  },

  /**
   * Réinitialisation mot de passe
   */
  async resetPassword(email) {
    Utils.showLoading(true);
    try {
      await auth.sendPasswordResetEmail(email);
      Utils.showToast('Email de réinitialisation envoyé !');
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  /**
   * Récupère les données utilisateur Firestore
   */
  async getUserData(uid) {
    const doc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  /**
   * Met à jour le profil
   */
  async updateProfile(data) {
    if (!this.currentUser) throw new Error('Non connecté');
    Utils.showLoading(true);
    try {
      if (data.displayName) {
        await this.currentUser.updateProfile({ displayName: data.displayName });
      }
      await db.collection(COLLECTIONS.USERS).doc(this.currentUser.uid).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      this.userData = await this.getUserData(this.currentUser.uid);
      Utils.showToast('Profil mis à jour !');
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  async changePassword(currentPassword, newPassword) {
    if (!this.currentUser) throw new Error('Non connecté');
    Utils.showLoading(true);
    try {
      const credential = firebase.auth.EmailAuthProvider.credential(
        this.currentUser.email,
        currentPassword
      );
      await this.currentUser.reauthenticateWithCredential(credential);
      await this.currentUser.updatePassword(newPassword);
      Utils.showToast('Mot de passe mis à jour !');
    } catch (error) {
      Utils.showToast(this.getErrorMessage(error), 'error');
      throw error;
    } finally {
      Utils.showLoading(false);
    }
  },

  async updatePreferences(preferences) {
    if (!this.currentUser) return;
    await db.collection(COLLECTIONS.USERS).doc(this.currentUser.uid).update({
      preferences: { ...(this.userData?.preferences || DEFAULT_PREFERENCES), ...preferences },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    this.userData = await this.getUserData(this.currentUser.uid);
  },

  /**
   * Vérifie si l'utilisateur a un rôle spécifique
   */
  hasRole(role) {
    return this.userData?.role === role;
  },

  isAccountActive() {
    if (!this.userData) return false;
    if (this.hasRole(ROLES.ADMIN)) return true;
    return !this.userData.accountStatus || this.userData.accountStatus === ACCOUNT_STATUS.ACTIVE;
  },

  isStaff() {
    return this.hasRole(ROLES.ORGANIZER) ||
      this.hasRole(ROLES.ADMIN) ||
      this.hasRole(ROLES.CONTROLLER);
  },

  /**
   * Protège une page (redirige si non connecté)
   */
  requireAuth(redirectUrl = 'login.html') {
    return new Promise((resolve, reject) => {
      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(window.location.pathname.split('/').pop())}`;
          reject('Non authentifié');
        } else {
          this.currentUser = user;
          this.userData = await this.getUserData(user.uid);
          if (!this.hasRole(ROLES.ADMIN) && this.userData?.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
            Utils.showToast('Votre compte est suspendu.', 'error');
            await auth.signOut();
            window.location.href = 'login.html';
            reject('Compte suspendu');
            return;
          }
          resolve(user);
        }
      });
    });
  },

  /**
   * Protège une page admin
   */
  async requireAdmin() {
    await this.requireAuth();
    if (!this.hasRole(ROLES.ADMIN)) {
      Utils.showToast('Accès non autorisé.', 'error');
      window.location.href = 'index.html';
    }
  },

  /**
   * Protège une page organisateur
   */
  async requireOrganizer() {
    await this.requireAuth();
    if (!this.hasRole(ROLES.ORGANIZER) && !this.hasRole(ROLES.ADMIN)) {
      Utils.showToast('Accès réservé aux organisateurs.', 'error');
      window.location.href = 'index.html';
      return;
    }
    if (this.hasRole(ROLES.ORGANIZER) && !this.isAccountActive()) {
      const msg = this.userData?.accountStatus === ACCOUNT_STATUS.SUSPENDED
        ? 'Votre compte organisateur est suspendu.'
        : 'Votre compte organisateur est en attente de validation admin.';
      Utils.showToast(msg, 'error');
      window.location.href = 'dashboard.html';
    }
  },

  async requireController() {
    await this.requireAuth();
    if (!this.hasRole(ROLES.CONTROLLER) && !this.hasRole(ROLES.ADMIN) && !this.hasRole(ROLES.ORGANIZER)) {
      Utils.showToast('Accès réservé au staff (organisateur / contrôleur).', 'error');
      window.location.href = 'index.html';
    }
  },

  /**
   * Messages d'erreur Firebase traduits
   */
  getErrorMessage(error) {
    const messages = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé.',
      'auth/invalid-email': 'Email invalide.',
      'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
      'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
      'auth/invalid-credential': 'Identifiants invalides.'
    };
    return messages[error.code] || error.message || 'Une erreur est survenue.';
  },

  /**
   * Redirige après connexion selon le rôle
   */
  redirectAfterLogin() {
    const redirect = Utils.getUrlParam('redirect');
    if (redirect) {
      window.location.href = redirect;
      return;
    }
    if (this.hasRole(ROLES.ADMIN)) {
      window.location.href = 'admin.html';
    } else if (this.hasRole(ROLES.CONTROLLER)) {
      window.location.href = 'scan.html';
    } else if (this.hasRole(ROLES.ORGANIZER)) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'index.html';
    }
  }
};

// Handlers pages auth
document.addEventListener('DOMContentLoaded', () => {
  AuthService.init();

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      try {
        await AuthService.login(email, password);
        AuthService.redirectAfterLogin();
      } catch (_) { /* toast déjà affiché */ }
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    let selectedRole = ROLES.USER;

    document.querySelectorAll('.role-option').forEach(option => {
      const selectRole = () => {
        document.querySelectorAll('.role-option').forEach(o => {
          o.classList.remove('selected');
          o.setAttribute('aria-pressed', 'false');
        });
        option.classList.add('selected');
        option.setAttribute('aria-pressed', 'true');
        selectedRole = option.dataset.role;
      };

      option.addEventListener('click', selectRole);
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectRole();
        }
      });
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('displayName').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        Utils.showToast('Les mots de passe ne correspondent pas.', 'error');
        return;
      }

      try {
        await AuthService.register(email, password, displayName, selectedRole);
        AuthService.redirectAfterLogin();
      } catch (_) { /* toast déjà affiché */ }
    });
  }

  // Reset password form
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      await AuthService.resetPassword(email);
    });
  }

  // Logout buttons
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      AuthService.logout();
    });
  });

  // Password toggle
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const icon = btn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('bi-eye', 'bi-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.replace('bi-eye-slash', 'bi-eye');
      }
    });
  });
});
