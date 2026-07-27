import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import 'config.dart';
import 'core/api_client.dart';
import 'core/session_store.dart';
import 'models.dart';

class AppController extends ChangeNotifier {
  AppController({required this.api, required this.store});

  final ApiClient api;
  final SessionStore store;

  StoredSession? _session;
  bool _initializing = true;
  bool _busy = false;
  bool _refreshing = false;
  String? _errorMessage;
  int _selectedTab = 0;
  DateTime _selectedDate = DateTime.now();
  Almanac? _almanac;
  List<ChatMessage> _messages = const <ChatMessage>[];
  List<MemoryItem> _memories = const <MemoryItem>[];
  List<FamilyMember> _members = const <FamilyMember>[];

  bool get initializing => _initializing;
  bool get busy => _busy;
  bool get refreshing => _refreshing;
  String? get errorMessage => _errorMessage;
  int get selectedTab => _selectedTab;
  DateTime get selectedDate => _selectedDate;
  Almanac? get almanac => _almanac;
  List<ChatMessage> get messages => _messages;
  List<MemoryItem> get memories => _memories;
  List<FamilyMember> get members => _members;
  AppUser? get user => _session?.user;
  String get apiBaseUrl => _session?.apiBaseUrl ?? api.baseUrl;
  String? get familyId => _session?.familyId;
  MemberRole? get role => _session?.role;

  bool get isAuthenticated {
    return _session?.token?.isNotEmpty == true && _session?.user != null;
  }

  bool get isFamilyConnected => familyId?.isNotEmpty == true;

  Future<void> initialize() async {
    final saved = await store.read();
    _session = saved ?? const StoredSession(apiBaseUrl: AppConfig.defaultApiBaseUrl);
    if (_session!.apiBaseUrl.isNotEmpty) api.baseUrl = _session!.apiBaseUrl;

    if (isAuthenticated) {
      try {
        final freshUser = await api.currentUser(_session!.token!);
        final restoredFamilyId = isFamilyConnected
            ? familyId
            : freshUser.familyIds.isNotEmpty
                ? freshUser.familyIds.first
                : null;
        _session = _session!.copyWith(user: freshUser, familyId: restoredFamilyId);
        await _persist();
        if (isFamilyConnected) await refreshData(silent: true);
      } on ApiException catch (error) {
        _errorMessage = error.message;
      }
    }

    _initializing = false;
    notifyListeners();
  }

  Future<bool> login({required String email, required String password}) async {
    return _authenticate(() => api.login(email: email.trim(), password: password));
  }

  Future<bool> register({
    required String name,
    required String email,
    required String password,
  }) async {
    return _authenticate(
      () => api.register(name: name.trim(), email: email.trim(), password: password),
    );
  }

  Future<bool> _authenticate(Future<AuthResult> Function() request) async {
    _errorMessage = null;
    _busy = true;
    notifyListeners();
    try {
      final result = await request();
      _session = StoredSession(
        apiBaseUrl: api.baseUrl,
        token: result.token,
        user: result.user,
      );
      await _persist();
      return true;
    } on ApiException catch (error) {
      _errorMessage = error.message;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<bool> connectFamily({
    required String code,
    required bool create,
    required MemberRole memberRole,
  }) async {
    final currentUser = user;
    final token = _session?.token;
    final familyCode = code.trim();
    if (currentUser == null || token == null || familyCode.isEmpty) {
      _errorMessage = '請先登入並輸入家庭代碼';
      notifyListeners();
      return false;
    }

    _errorMessage = null;
    _busy = true;
    notifyListeners();
    try {
      final connection = await api.connectFamily(
        token: token,
        familyId: familyCode,
        shouldCreate: create,
        role: memberRole,
        name: currentUser.name,
        avatar: currentUser.avatar,
      );
      _members = connection.members;
      _session = _session!.copyWith(
        familyId: connection.familyId,
        role: memberRole,
      );
      await _persist();
      await refreshData(silent: true);
      return true;
    } on ApiException catch (error) {
      _errorMessage = error.message;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> refreshData({bool silent = false}) async {
    final token = _session?.token;
    final currentFamilyId = familyId;
    if (token == null || currentFamilyId == null) return;

    if (!silent) {
      _refreshing = true;
      _errorMessage = null;
      notifyListeners();
    }
    try {
      final results = await Future.wait<dynamic>(<Future<dynamic>>[
        api.messages(token: token, familyId: currentFamilyId),
        api.memories(token: token, familyId: currentFamilyId),
        api.almanac(_selectedDate),
      ]);
      _messages = results[0] as List<ChatMessage>;
      _memories = results[1] as List<MemoryItem>;
      _almanac = results[2] as Almanac;
    } on ApiException catch (error) {
      _errorMessage = error.message;
    } finally {
      _refreshing = false;
      notifyListeners();
    }
  }

  Future<void> selectDate(DateTime date) async {
    _selectedDate = DateTime(date.year, date.month, date.day);
    notifyListeners();
    try {
      _almanac = await api.almanac(_selectedDate);
    } on ApiException catch (error) {
      _errorMessage = error.message;
    }
    notifyListeners();
  }

  Future<bool> sendText(String value) async {
    final text = value.trim();
    final currentUser = user;
    final token = _session?.token;
    final currentFamilyId = familyId;
    if (text.isEmpty || currentUser == null || token == null || currentFamilyId == null) return false;

    _busy = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final message = await api.sendMessage(
        token: token,
        familyId: currentFamilyId,
        message: <String, dynamic>{
          'uid': currentUser.id,
          'senderId': currentUser.id,
          'senderName': currentUser.name,
          'type': 'text',
          'content': text,
          'time': DateFormat('HH:mm').format(DateTime.now()),
        },
      );
      _messages = <ChatMessage>[..._messages, message];
      return true;
    } on ApiException catch (error) {
      _errorMessage = error.message;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<bool> createTextMemory(String value) async {
    final content = value.trim();
    final currentUser = user;
    final token = _session?.token;
    final currentFamilyId = familyId;
    if (content.isEmpty || currentUser == null || token == null || currentFamilyId == null) return false;

    _busy = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final now = DateTime.now();
      final memory = await api.createMemory(
        token: token,
        familyId: currentFamilyId,
        memory: <String, dynamic>{
          'uid': currentUser.id,
          'childId': currentUser.id,
          'childName': currentUser.name,
          'type': 'text',
          'content': content,
          'date': now.day,
          'month': now.month,
          'year': now.year,
        },
      );
      _memories = <MemoryItem>[memory, ..._memories];
      return true;
    } on ApiException catch (error) {
      _errorMessage = error.message;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<bool> updateApiBaseUrl(String value) async {
    final parsed = Uri.tryParse(value.trim());
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      _errorMessage = '請輸入完整 API 網址，例如 https://api.example.com';
      notifyListeners();
      return false;
    }
    if (parsed.scheme != 'http' && parsed.scheme != 'https') {
      _errorMessage = 'API 網址只支援 http 或 https';
      notifyListeners();
      return false;
    }
    api.baseUrl = value;
    _session = (_session ?? const StoredSession(apiBaseUrl: AppConfig.defaultApiBaseUrl))
        .copyWith(apiBaseUrl: api.baseUrl);
    await _persist();
    _errorMessage = null;
    notifyListeners();
    return true;
  }

  Future<void> logout() async {
    _session = StoredSession(apiBaseUrl: api.baseUrl);
    _messages = const <ChatMessage>[];
    _memories = const <MemoryItem>[];
    _members = const <FamilyMember>[];
    _almanac = null;
    _selectedTab = 0;
    _errorMessage = null;
    await _persist();
    notifyListeners();
  }

  void selectTab(int index) {
    _selectedTab = index;
    notifyListeners();
  }

  void clearError() {
    if (_errorMessage == null) return;
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> _persist() async {
    final session = _session;
    if (session != null) await store.write(session);
  }
}
