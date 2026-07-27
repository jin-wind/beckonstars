enum MemberRole { senior, child }

extension MemberRoleLabel on MemberRole {
  String get apiValue => this == MemberRole.senior ? 'senior' : 'child';

  String get label => this == MemberRole.senior ? '長者' : '子女';
}

MemberRole memberRoleFromApi(String? value) {
  return value == 'senior' ? MemberRole.senior : MemberRole.child;
}

Map<String, dynamic> jsonMap(dynamic value) {
  return value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
}

String jsonString(dynamic value, [String fallback = '']) {
  return value == null ? fallback : value.toString();
}

class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    required this.avatar,
    required this.familyIds,
  });

  final String id;
  final String email;
  final String name;
  final String avatar;
  final List<String> familyIds;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final rawFamilies = json['families'];
    return AppUser(
      id: jsonString(json['userId'] ?? json['uid']),
      email: jsonString(json['email']),
      name: jsonString(json['name'], '家庭成員'),
      avatar: jsonString(json['picture'] ?? json['avatar']),
      familyIds: rawFamilies is List
          ? rawFamilies.map((dynamic value) => jsonString(value)).toList()
          : const <String>[],
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'userId': id,
        'email': email,
        'name': name,
        'picture': avatar,
        'families': familyIds,
      };
}

class FamilyMember {
  const FamilyMember({
    required this.id,
    required this.name,
    required this.role,
    required this.avatar,
  });

  final String id;
  final String name;
  final MemberRole role;
  final String avatar;

  factory FamilyMember.fromJson(Map<String, dynamic> json) {
    return FamilyMember(
      id: jsonString(json['uid'] ?? json['userId']),
      name: jsonString(json['name'], '家庭成員'),
      role: memberRoleFromApi(jsonString(json['role'])),
      avatar: jsonString(json['avatar'] ?? json['picture']),
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.type,
    required this.content,
    required this.time,
    required this.createdAt,
    required this.imageUrl,
    required this.audioUrl,
    required this.transcript,
    required this.summary,
  });

  final String id;
  final String senderId;
  final String senderName;
  final String type;
  final String content;
  final String time;
  final DateTime? createdAt;
  final String imageUrl;
  final String audioUrl;
  final String transcript;
  final String summary;

  bool isMine(String userId) => senderId == userId;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: jsonString(json['id']),
      senderId: jsonString(json['senderId'] ?? json['uid']),
      senderName: jsonString(json['senderName'], '家庭成員'),
      type: jsonString(json['type'], 'text'),
      content: jsonString(json['content']),
      time: jsonString(json['time']),
      createdAt: DateTime.tryParse(jsonString(json['createdAt'])),
      imageUrl: jsonString(json['imgUrl'] ?? json['imageUrl'] ?? json['img']),
      audioUrl: jsonString(json['audioUrl'] ?? json['audio']),
      transcript: jsonString(json['transcript']),
      summary: jsonString(json['aiSummary']),
    );
  }
}

class MemoryItem {
  const MemoryItem({
    required this.id,
    required this.authorName,
    required this.type,
    required this.content,
    required this.date,
    required this.imageUrl,
    required this.audioUrl,
  });

  final String id;
  final String authorName;
  final String type;
  final String content;
  final DateTime date;
  final String imageUrl;
  final String audioUrl;

  factory MemoryItem.fromJson(Map<String, dynamic> json) {
    final parsed = DateTime.tryParse(jsonString(json['createdAt']));
    final now = DateTime.now();
    final fallback = DateTime(
      int.tryParse(jsonString(json['year'])) ?? now.year,
      int.tryParse(jsonString(json['month'])) ?? now.month,
      int.tryParse(jsonString(json['date'])) ?? now.day,
    );
    return MemoryItem(
      id: jsonString(json['id']),
      authorName: jsonString(json['childName'], '家庭成員'),
      type: jsonString(json['type'], 'text'),
      content: jsonString(json['content']),
      date: parsed?.toLocal() ?? fallback,
      imageUrl: jsonString(json['imgUrl'] ?? json['imageUrl'] ?? json['img']),
      audioUrl: jsonString(json['audioUrl']),
    );
  }
}

class Almanac {
  const Almanac({
    required this.date,
    required this.solarText,
    required this.lunarText,
    required this.ganZhi,
    required this.weekday,
    required this.yi,
    required this.ji,
  });

  final DateTime date;
  final String solarText;
  final String lunarText;
  final String ganZhi;
  final String weekday;
  final List<String> yi;
  final List<String> ji;

  factory Almanac.fromJson(Map<String, dynamic> json) {
    final solar = jsonMap(json['solar']);
    final lunar = jsonMap(json['lunar']);
    final year = int.tryParse(jsonString(solar['year'])) ?? DateTime.now().year;
    final month = int.tryParse(jsonString(solar['month'])) ?? DateTime.now().month;
    final day = int.tryParse(jsonString(solar['day'])) ?? DateTime.now().day;
    final yi = json['yi'];
    final ji = json['ji'];
    return Almanac(
      date: DateTime(year, month, day),
      solarText: '$year 年 $month 月 $day 日',
      lunarText: '${jsonString(lunar['month'])}${jsonString(lunar['day'])}',
      ganZhi: jsonString(lunar['dayGanZhi']),
      weekday: jsonString(solar['weekDay']),
      yi: yi is List ? yi.map((dynamic item) => jsonString(item)).toList() : const <String>[],
      ji: ji is List ? ji.map((dynamic item) => jsonString(item)).toList() : const <String>[],
    );
  }
}

class AuthResult {
  const AuthResult({required this.token, required this.user});

  final String token;
  final AppUser user;
}

class FamilyConnection {
  const FamilyConnection({required this.familyId, required this.members});

  final String familyId;
  final List<FamilyMember> members;
}

class StoredSession {
  const StoredSession({
    required this.apiBaseUrl,
    this.token,
    this.user,
    this.familyId,
    this.role,
  });

  final String apiBaseUrl;
  final String? token;
  final AppUser? user;
  final String? familyId;
  final MemberRole? role;

  StoredSession copyWith({
    String? apiBaseUrl,
    String? token,
    AppUser? user,
    String? familyId,
    MemberRole? role,
    bool clearToken = false,
    bool clearUser = false,
    bool clearFamily = false,
  }) {
    return StoredSession(
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      token: clearToken ? null : token ?? this.token,
      user: clearUser ? null : user ?? this.user,
      familyId: clearFamily ? null : familyId ?? this.familyId,
      role: clearFamily ? null : role ?? this.role,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'apiBaseUrl': apiBaseUrl,
        'token': token,
        'user': user?.toJson(),
        'familyId': familyId,
        'role': role?.apiValue,
      };

  factory StoredSession.fromJson(Map<String, dynamic> json) {
    final rawUser = json['user'];
    return StoredSession(
      apiBaseUrl: jsonString(json['apiBaseUrl']),
      token: json['token'] == null ? null : jsonString(json['token']),
      user: rawUser is Map ? AppUser.fromJson(jsonMap(rawUser)) : null,
      familyId: json['familyId'] == null ? null : jsonString(json['familyId']),
      role: json['role'] == null ? null : memberRoleFromApi(jsonString(json['role'])),
    );
  }
}
