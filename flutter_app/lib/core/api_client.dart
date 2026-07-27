import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models.dart';

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message, [this.code = '']);

  final int statusCode;
  final String message;
  final String code;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

class ApiClient {
  ApiClient({required String baseUrl}) : _baseUrl = _normalizeBaseUrl(baseUrl);

  static const Duration _requestTimeout = Duration(seconds: 20);

  String _baseUrl;

  String get baseUrl => _baseUrl;

  set baseUrl(String value) {
    _baseUrl = _normalizeBaseUrl(value);
  }

  static String _normalizeBaseUrl(String value) {
    return value.trim().replaceFirst(RegExp(r'/+$'), '');
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    return Uri.parse('$_baseUrl$path').replace(queryParameters: query);
  }

  String _familyPath(String familyId, String suffix) {
    return '/api/families/${Uri.encodeComponent(familyId)}$suffix';
  }

  Future<dynamic> _request(
    String method,
    String path, {
    String? token,
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';

    late http.Response response;
    try {
      final uri = _uri(path, query);
      switch (method) {
        case 'GET':
          response = await http.get(uri, headers: headers).timeout(_requestTimeout);
        case 'POST':
          response = await http
              .post(uri, headers: headers, body: jsonEncode(body))
              .timeout(_requestTimeout);
        case 'PUT':
          response = await http
              .put(uri, headers: headers, body: jsonEncode(body))
              .timeout(_requestTimeout);
        case 'DELETE':
          response = await http.delete(uri, headers: headers).timeout(_requestTimeout);
        default:
          throw StateError('Unsupported HTTP method: $method');
      }
    } on TimeoutException {
      throw const ApiException(0, '連線逾時，請檢查網絡或 API 伺服器');
    } on SocketException {
      throw const ApiException(0, '無法連線到伺服器，請檢查網絡');
    } on http.ClientException catch (error) {
      throw ApiException(0, '無法連線到伺服器：${error.message}');
    } on FormatException {
      throw const ApiException(0, '伺服器網址格式無效');
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } on FormatException {
        payload = <String, dynamic>{};
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final data = jsonMap(payload);
      throw ApiException(
        response.statusCode,
        jsonString(data['message'], '伺服器請求失敗 (${response.statusCode})'),
        jsonString(data['error']),
      );
    }
    return payload;
  }

  Future<AuthResult> login({required String email, required String password}) async {
    final data = jsonMap(await _request('POST', '/api/auth/login', body: <String, dynamic>{
      'email': email,
      'password': password,
    }));
    return AuthResult(
      token: jsonString(data['token']),
      user: AppUser.fromJson(jsonMap(data['user'])),
    );
  }

  Future<AuthResult> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final data = jsonMap(await _request('POST', '/api/auth/register', body: <String, dynamic>{
      'name': name,
      'email': email,
      'password': password,
    }));
    return AuthResult(
      token: jsonString(data['token']),
      user: AppUser.fromJson(jsonMap(data['user'])),
    );
  }

  Future<AppUser> currentUser(String token) async {
    final data = jsonMap(await _request('GET', '/api/auth/me', token: token));
    return AppUser.fromJson(data);
  }

  Future<FamilyConnection> connectFamily({
    required String token,
    required String familyId,
    required bool shouldCreate,
    required MemberRole role,
    required String name,
    required String avatar,
  }) async {
    final data = jsonMap(await _request(
      'POST',
      _familyPath(familyId, '/connect'),
      token: token,
      body: <String, dynamic>{
        'shouldCreate': shouldCreate,
        'role': role.apiValue,
        'name': name,
        'avatar': avatar,
      },
    ));
    final family = jsonMap(data['family']);
    final rawMembers = family['members'];
    return FamilyConnection(
      familyId: jsonString(data['familyId'], familyId),
      members: rawMembers is List
          ? rawMembers.map((dynamic value) => FamilyMember.fromJson(jsonMap(value))).toList()
          : const <FamilyMember>[],
    );
  }

  Future<List<ChatMessage>> messages({
    required String token,
    required String familyId,
  }) async {
    final data = jsonMap(await _request('GET', _familyPath(familyId, '/messages'), token: token));
    final rawMessages = data['messages'];
    return rawMessages is List
        ? rawMessages.map((dynamic value) => ChatMessage.fromJson(jsonMap(value))).toList()
        : const <ChatMessage>[];
  }

  Future<ChatMessage> sendMessage({
    required String token,
    required String familyId,
    required Map<String, dynamic> message,
  }) async {
    final data = jsonMap(await _request(
      'POST',
      _familyPath(familyId, '/messages'),
      token: token,
      body: message,
    ));
    return ChatMessage.fromJson(jsonMap(data['message']));
  }

  Future<List<MemoryItem>> memories({
    required String token,
    required String familyId,
  }) async {
    final data = jsonMap(await _request('GET', _familyPath(familyId, '/memories'), token: token));
    final rawMemories = data['memories'];
    return rawMemories is List
        ? rawMemories.map((dynamic value) => MemoryItem.fromJson(jsonMap(value))).toList()
        : const <MemoryItem>[];
  }

  Future<MemoryItem> createMemory({
    required String token,
    required String familyId,
    required Map<String, dynamic> memory,
  }) async {
    final data = jsonMap(await _request(
      'POST',
      _familyPath(familyId, '/memories'),
      token: token,
      body: memory,
    ));
    return MemoryItem.fromJson(jsonMap(data['memory']));
  }

  Future<Almanac> almanac(DateTime date) async {
    final data = jsonMap(await _request(
      'GET',
      '/api/almanac',
      query: <String, String>{'date': date.toIso8601String().split('T').first},
    ));
    return Almanac.fromJson(data);
  }
}
