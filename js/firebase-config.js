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

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);

// Instances globales
const auth = firebase.auth();
const db = firebase.firestore();

// Collections Firestore
const COLLECTIONS = {
  USERS: 'users',
  EVENTS: 'events',
  TICKETS: 'tickets',
  CATEGORIES: 'categories',
  PURCHASES: 'purchases'
};

// Rôles utilisateur
const ROLES = {
  USER: 'user',
  ORGANIZER: 'organizer',
  ADMIN: 'admin'
};

// Statuts événement
const EVENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published'
};

// Statuts billet
const TICKET_STATUS = {
  VALID: 'valid',
  USED: 'used',
  CANCELLED: 'cancelled'
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
