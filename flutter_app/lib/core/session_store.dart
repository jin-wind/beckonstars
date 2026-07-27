import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';

class SessionStore {
  static const String _key = 'beckon_stars_flutter_session_v1';

  Future<StoredSession?> read() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return StoredSession.fromJson(jsonMap(jsonDecode(raw)));
    } on FormatException {
      await preferences.remove(_key);
      return null;
    }
  }

  Future<void> write(StoredSession session) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_key, jsonEncode(session.toJson()));
  }
}
