const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'beckon-stars';
const publicAppUrl = process.env.PUBLIC_APP_URL || `https://${projectId}.web.app/index.html`;
const explicitServiceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_PATH;
const defaultServiceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
const serviceAccountPath = explicitServiceAccountPath || (fs.existsSync(defaultServiceAccountPath) ? defaultServiceAccountPath : null);
const watchFamilyId = process.env.WATCH_FAMILY_ID || '';

function initializeFirebaseAdmin() {
  if (serviceAccountPath) {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId
    });
    console.log(`Using service account: ${serviceAccountPath}`);
    return;
  }

  admin.initializeApp({ projectId });
  console.log('Using default Google application credentials.');
}

function getFamilyIdFromMessageRef(messageRef) {
  return messageRef.parent.parent?.id || '';
}

function compactMessageBody(content) {
  if (!content) return '你有新的家庭訊息';
  return content.length > 80 ? `${content.slice(0, 77)}...` : content;
}

async function collectRecipientTokens(familyId, senderUid) {
  const membersSnapshot = await admin.firestore()
    .collection('families')
    .doc(familyId)
    .collection('members')
    .get();

  const tokenOwners = new Map();
  membersSnapshot.forEach(doc => {
    if (doc.id === senderUid) return;
    const member = doc.data();
    if (!Array.isArray(member.fcmTokens)) return;
    member.fcmTokens.filter(Boolean).forEach(token => {
      if (!tokenOwners.has(token)) tokenOwners.set(token, []);
      tokenOwners.get(token).push(doc.ref);
    });
  });

  return tokenOwners;
}

async function logFamilyPushStatus(familyId) {
  if (!familyId) return;

  const membersSnapshot = await admin.firestore()
    .collection('families')
    .doc(familyId)
    .collection('members')
    .get();

  if (membersSnapshot.empty) {
    console.log(`[tokens] ${familyId}: no members found`);
    return;
  }

  console.log(`[tokens] ${familyId}: ${membersSnapshot.size} member(s)`);
  membersSnapshot.forEach(doc => {
    const member = doc.data();
    const tokenCount = Array.isArray(member.fcmTokens) ? member.fcmTokens.filter(Boolean).length : 0;
    console.log(`[tokens] ${familyId}/${doc.id}: ${member.name || 'unnamed'} (${member.role || 'unknown'}) has ${tokenCount} token(s)`);
  });
}

async function removeInvalidTokens(tokenOwners, invalidTokens) {
  if (!invalidTokens.length) return;

  const updates = [];
  invalidTokens.forEach(token => {
    const ownerRefs = tokenOwners.get(token) || [];
    ownerRefs.forEach(memberRef => {
      updates.push(memberRef.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(token)
      }).catch(() => null));
    });
  });

  await Promise.all(updates);
}

async function sendMessageNotification(messageDoc) {
  const familyId = getFamilyIdFromMessageRef(messageDoc.ref);
  const message = messageDoc.data();
  if (!familyId || !message?.content || !message.uid) return;

  const tokenOwners = await collectRecipientTokens(familyId, message.uid);
  const tokens = [...tokenOwners.keys()];
  if (!tokens.length) {
    console.log(`[skip] ${familyId}/${messageDoc.id}: no recipient tokens for sender ${message.uid}. Ask the other phone to open the Hosting URL, join this family, and tap the notification bell until it says the token was written.`);
    await logFamilyPushStatus(familyId);
    return;
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: `星喚：${message.senderName || '家庭成員'}`,
      body: compactMessageBody(message.content)
    },
    data: {
      familyId,
      messageId: messageDoc.id,
      senderId: message.uid || message.senderId || '',
      url: publicAppUrl
    },
    webpush: {
      fcmOptions: {
        link: publicAppUrl
      },
      notification: {
        icon: `${new URL(publicAppUrl).origin}/icons/icon.svg`,
        badge: `${new URL(publicAppUrl).origin}/icons/icon.svg`,
        tag: `beckon-stars-${familyId}`
      }
    }
  });

  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    const code = result.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      invalidTokens.push(tokens[index]);
    }
  });

  await removeInvalidTokens(tokenOwners, invalidTokens);
  console.log(`[push] ${familyId}/${messageDoc.id}: ${response.successCount} sent, ${response.failureCount} failed`);
}

function startMessageListener() {
  let initialSnapshotLoaded = false;
  console.log(`Listening for new messages in project: ${projectId}`);
  console.log(`Opening notifications to: ${publicAppUrl}`);
  if (watchFamilyId) {
    logFamilyPushStatus(watchFamilyId).catch(error => console.error(`[tokens] failed to inspect ${watchFamilyId}`, error));
  }

  return admin.firestore()
    .collectionGroup('messages')
    .onSnapshot(snapshot => {
      if (!initialSnapshotLoaded) {
        initialSnapshotLoaded = true;
        console.log('Initial Firestore snapshot loaded. New messages from now on will trigger push notifications.');
        return;
      }

      snapshot.docChanges()
        .filter(change => change.type === 'added')
        .forEach(change => {
          sendMessageNotification(change.doc).catch(error => {
            console.error(`[error] failed to push ${change.doc.ref.path}`, error);
          });
        });
    }, error => {
      console.error('Firestore listener failed:', error);
      process.exitCode = 1;
    });
}

initializeFirebaseAdmin();
const unsubscribe = startMessageListener();

process.on('SIGINT', () => {
  console.log('\nStopping local push worker...');
  unsubscribe();
  process.exit(0);
});
