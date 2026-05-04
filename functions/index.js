const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendMessageNotification = onDocumentCreated(
  'families/{familyId}/messages/{messageId}',
  async event => {
    const familyId = event.params.familyId;
    const message = event.data?.data();
    if (!message || !message.content || !message.uid) return;

    const membersSnapshot = await admin.firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .get();

    const tokens = [];
    membersSnapshot.forEach(doc => {
      if (doc.id === message.uid) return;
      const member = doc.data();
      if (Array.isArray(member.fcmTokens)) tokens.push(...member.fcmTokens);
    });

    const uniqueTokens = [...new Set(tokens)].filter(Boolean);
    if (!uniqueTokens.length) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      notification: {
        title: `星喚：${message.senderName || '家庭成員'}`,
        body: message.content.length > 80 ? `${message.content.slice(0, 77)}...` : message.content
      },
      data: {
        familyId,
        messageId: event.params.messageId,
        senderId: message.uid || message.senderId || '',
        url: '/index.html'
      },
      webpush: {
        fcmOptions: {
          link: '/index.html'
        },
        notification: {
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          tag: `beckon-stars-${familyId}`
        }
      }
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidTokens.push(uniqueTokens[index]);
      }
    });

    if (!invalidTokens.length) return;

    await Promise.all(membersSnapshot.docs.map(doc => {
      if (doc.id === message.uid) return Promise.resolve();
      return doc.ref.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens)
      }).catch(() => null);
    }));
  }
);
