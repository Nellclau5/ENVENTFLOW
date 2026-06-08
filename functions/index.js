/**
 * EventFlow Africa — Cloud Functions
 * Envoie des notifications FCM quand un événement est publié
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

function eventMatchesAlert(event, alert) {
  if (alert.type === 'category') {
    return event.category === alert.value;
  }
  if (alert.type === 'city') {
    const hay = `${event.city || ''} ${event.location || ''}`.toLowerCase();
    return hay.includes(String(alert.value).toLowerCase());
  }
  return false;
}

async function collectTokensForUsers(userIds) {
  const tokens = new Set();
  const chunks = [];
  const ids = [...userIds];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    const snaps = await Promise.all(chunk.map(id => db.collection('users').doc(id).get()));
    snaps.forEach(snap => {
      const data = snap.data() || {};
      (data.fcmTokens || []).forEach(t => tokens.add(t));
    });
  }
  return [...tokens];
}

exports.notifyOnEventPublished = functions.firestore
  .document('events/{eventId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after || after.status !== 'published') return null;

    const before = change.before.exists ? change.before.data() : null;
    if (before && before.status === 'published') return null;

    const eventId = context.params.eventId;
    const alertsSnap = await db.collection('eventAlerts').get();
    const userIds = new Set();

    alertsSnap.docs.forEach(doc => {
      const alert = doc.data();
      if (eventMatchesAlert(after, alert)) {
        userIds.add(alert.userId);
      }
    });

    if (!userIds.size) return null;

    const tokens = await collectTokensForUsers(userIds);
    if (!tokens.length) return null;

    const title = 'Nouvel événement EventFlow';
    const body = `${after.title} — ${after.city || after.location || 'Afrique'}`;
    const url = `https://eventflow-africa.web.app/event-details.html?id=${eventId}`;

    const message = {
      notification: { title, body },
      data: { url, eventId, title: after.title || '' },
      webpush: { fcmOptions: { link: url } }
    };

    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      try {
        await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
      } catch (err) {
        console.error('FCM multicast error:', err);
      }
    }

    return null;
  });
