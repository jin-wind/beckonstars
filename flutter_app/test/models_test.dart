import 'package:flutter_test/flutter_test.dart';

import 'package:beckon_stars/models.dart';

void main() {
  group('AppUser', () {
    test('parses backend user id variants and family ids', () {
      final user = AppUser.fromJson(<String, dynamic>{
        'uid': 'u-1',
        'email': 'parent@example.com',
        'name': '家長',
        'avatar': 'avatar.png',
        'families': <String>['123456'],
      });

      expect(user.id, 'u-1');
      expect(user.email, 'parent@example.com');
      expect(user.familyIds, <String>['123456']);
    });
  });

  group('ChatMessage', () {
    test('parses media aliases', () {
      final message = ChatMessage.fromJson(<String, dynamic>{
        'id': 'm-1',
        'uid': 'u-1',
        'senderName': '家人',
        'type': 'text',
        'content': '你好',
        'time': '09:30',
        'createdAt': '2026-07-27T09:30:00.000Z',
        'img': 'image.jpg',
        'audio': 'audio.m4a',
        'transcript': 'hello',
        'aiSummary': 'summary',
      });

      expect(message.senderId, 'u-1');
      expect(message.imageUrl, 'image.jpg');
      expect(message.audioUrl, 'audio.m4a');
      expect(message.transcript, 'hello');
      expect(message.summary, 'summary');
    });
  });

  group('StoredSession', () {
    test('round trips through json', () {
      const session = StoredSession(
        apiBaseUrl: 'http://127.0.0.1:8787',
        token: 'token',
        user: AppUser(
          id: 'u-1',
          email: 'child@example.com',
          name: '孩子',
          avatar: '',
          familyIds: <String>['family-1'],
        ),
        familyId: 'family-1',
        role: MemberRole.child,
      );

      final restored = StoredSession.fromJson(session.toJson());

      expect(restored.apiBaseUrl, session.apiBaseUrl);
      expect(restored.token, session.token);
      expect(restored.user?.id, session.user?.id);
      expect(restored.familyId, session.familyId);
      expect(restored.role, session.role);
    });
  });

  group('Almanac', () {
    test('parses server response shape', () {
      final almanac = Almanac.fromJson(<String, dynamic>{
        'solar': <String, dynamic>{
          'year': 2026,
          'month': 7,
          'day': 27,
          'weekDay': '星期一',
        },
        'lunar': <String, dynamic>{
          'month': '六月',
          'day': '十四',
          'dayGanZhi': '壬辰',
        },
        'yi': <String>['團聚'],
        'ji': <String>['爭吵'],
      });

      expect(almanac.solarText, '2026 年 7 月 27 日');
      expect(almanac.lunarText, '六月十四');
      expect(almanac.yi, <String>['團聚']);
      expect(almanac.ji, <String>['爭吵']);
    });
  });
}
