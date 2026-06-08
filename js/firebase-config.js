/**
 * EventFlow Africa — Configuration Firebase
 * Projet : eventflow-africa
 * Console : https://console.firebase.google.com/project/eventflow-africa/overview
 * Site live : https://eventflow-africa.web.app
 *
 * DERNIÈRE ÉTAPE MANUELLE :
 * Activer Auth > Email/Password :
 * https://console.firebase.google.com/project/eventflow-africa/authentication/providers
 *
 * Premier admin : inscrivez-vous, puis dans Firestore modifiez users/{uid}.role = "admin"
 */

const firebaseConfig = {
  apiKey: "AIzaSyBmn7YsizRGD7rXQ2ZJHgBmxiXQi6rC3K4",
  authDomain: "eventflow-africa.firebaseapp.com",
  projectId: "eventflow-africa",
  storageBucket: "eventflow-africa.firebasestorage.app",
  messagingSenderId: "249089579362",
  appId: "1:249089579362:web:81b2ed59d0b8926ddab43b"
};

/**
 * Clé VAPID Web Push (Firebase Console > Paramètres > Cloud Messaging > Certificats Web Push)
 * Générez ou copiez la paire de clés, puis collez la clé publique ici.
 * Sans cette clé, les notifications locales fonctionnent ; le push serveur FCM nécessite la clé.
 */
const FCM_VAPID_KEY = 'BCNJSBGJbOjaHtefVoQDyyICywUWYKBGS1vUuE_GJ67xKK1z6NYC0Qv4WNw_xQQhS69vw-rxNwkOUMRlRovPEbw';

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);

// Instances globales
const auth = firebase.auth();
const db = firebase.firestore();
let messaging = null;
try {
  if (typeof firebase.messaging === 'function') {
    messaging = firebase.messaging();
  }
} catch (_) { /* FCM non supporté (ex. certains navigateurs) */ }

// Collections Firestore
const COLLECTIONS = {
  USERS: 'users',
  EVENTS: 'events',
  TICKETS: 'tickets',
  CATEGORIES: 'categories',
  PURCHASES: 'purchases',
  FAVORITES: 'favorites',
  EVENT_ALERTS: 'eventAlerts',
  SUPPORT_TICKETS: 'supportTickets',
  TICKET_TRANSFERS: 'ticketTransfers',
  WAITLIST: 'waitlist',
  ENTRY_LOGS: 'entryLogs',
  EVENT_NOTIFICATIONS: 'eventNotifications'
};

// Types de billets organisateur
const TICKET_KINDS = {
  STANDARD: 'standard',
  VIP: 'vip',
  EARLY_BIRD: 'early_bird'
};

// Rôles utilisateur
const ROLES = {
  USER: 'user',
  ORGANIZER: 'organizer',
  CONTROLLER: 'controller',
  ADMIN: 'admin'
};

// Statut compte (organisateurs)
const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  SUSPENDED: 'suspended'
};

// Statuts événement
const EVENT_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  REJECTED: 'rejected'
};

// Commission EventFlow (5 %)
const COMMISSION_RATE = 0.05;

// Statuts billet
const TICKET_STATUS = {
  VALID: 'valid',
  USED: 'used',
  CANCELLED: 'cancelled'
};

// Préférences utilisateur par défaut
const DEFAULT_PREFERENCES = {
  notifyNewEvents: true,
  notifyFavorites: true,
  notifyReminders: true,
  pushEnabled: false,
  preferredCity: '',
  preferredLanguage: 'fr'
};

// Catégories par défaut (seed initial)
const DEFAULT_CATEGORIES = [
  { name: 'Musique', slug: 'musique', icon: 'bi-music-note-beamed' },
  { name: 'Business', slug: 'business', icon: 'bi-briefcase' },
  { name: 'Tech', slug: 'tech', icon: 'bi-cpu' },
  { name: 'Art & Culture', slug: 'art-culture', icon: 'bi-palette' },
  { name: 'Sport', slug: 'sport', icon: 'bi-trophy' },
  { name: 'Gastronomie', slug: 'gastronomie', icon: 'bi-cup-hot' },
  { name: 'Éducation', slug: 'education', icon: 'bi-book' },
  { name: 'Networking', slug: 'networking', icon: 'bi-people' }
];

// Seed des catégories : exécuté depuis le panel admin (admin.js)
async function seedDefaultCategories() {
  try {
    const snapshot = await db.collection(COLLECTIONS.CATEGORIES).limit(1).get();
    if (snapshot.empty) {
      const batch = db.batch();
      DEFAULT_CATEGORIES.forEach((cat) => {
        const ref = db.collection(COLLECTIONS.CATEGORIES).doc();
        batch.set(ref, { ...cat, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      console.log('Catégories par défaut créées.');
    }
  } catch (error) {
    console.error('Erreur seed catégories:', error);
  }
}
