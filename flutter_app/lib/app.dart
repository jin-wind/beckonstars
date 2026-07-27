import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'app_controller.dart';
import 'models.dart';
import 'ui/auth_screen.dart';
import 'ui/family_setup_screen.dart';
import 'ui/shared.dart';

class BeckonStarsApp extends StatelessWidget {
  const BeckonStarsApp({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '星喚 Beckon Stars',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFB46A55),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFFFF8F1),
        cardTheme: CardTheme(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      home: AnimatedBuilder(
        animation: controller,
        builder: (BuildContext context, _) {
          if (controller.initializing) return const _LoadingScreen();
          if (!controller.isAuthenticated) return AuthScreen(controller: controller);
          if (!controller.isFamilyConnected) return FamilySetupScreen(controller: controller);
          return HomeScreen(controller: controller);
        },
      ),
    );
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('正在載入星喚...'),
          ],
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller});

  final AppController controller;

  static const _tabs = <_HomeTab>[
    _HomeTab('聊天', Icons.chat_bubble_outline),
    _HomeTab('回憶', Icons.photo_album_outlined),
    _HomeTab('通勝', Icons.calendar_month_outlined),
    _HomeTab('設定', Icons.settings_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final selectedIndex = controller.selectedTab.clamp(0, _tabs.length - 1);
    return Scaffold(
      appBar: AppBar(
        title: Text(_tabs[selectedIndex].label),
        actions: <Widget>[
          IconButton(
            tooltip: '重新整理',
            onPressed: controller.refreshing ? null : controller.refreshData,
            icon: controller.refreshing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: controller.refreshData,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: <Widget>[
              ErrorNotice(
                message: controller.errorMessage,
                onDismiss: controller.clearError,
              ),
              switch (selectedIndex) {
                0 => ChatTab(controller: controller),
                1 => MemoriesTab(controller: controller),
                2 => AlmanacTab(controller: controller),
                _ => SettingsTab(controller: controller),
              },
            ],
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: controller.selectTab,
        destinations: _tabs
            .map(
              (_HomeTab tab) => NavigationDestination(
                icon: Icon(tab.icon),
                label: tab.label,
              ),
            )
            .toList(),
      ),
    );
  }
}

class _HomeTab {
  const _HomeTab(this.label, this.icon);

  final String label;
  final IconData icon;
}

class ChatTab extends StatefulWidget {
  const ChatTab({super.key, required this.controller});

  final AppController controller;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final success = await widget.controller.sendText(_messageController.text);
    if (success) _messageController.clear();
  }

  @override
  Widget build(BuildContext context) {
    final messages = widget.controller.messages;
    final userId = widget.controller.user?.id ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _SectionHeader(
          title: '家庭聊天',
          subtitle: messages.isEmpty ? '發送第一則訊息給家人。' : '${messages.length} 則訊息',
        ),
        const SizedBox(height: 12),
        if (messages.isEmpty)
          const _EmptyCard(icon: Icons.chat_bubble_outline, text: '尚未有訊息')
        else
          ...messages.map(
            (ChatMessage message) => _MessageCard(
              message: message,
              mine: message.isMine(userId),
            ),
          ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => widget.controller.busy ? null : _send(),
                    decoration: const InputDecoration(
                      labelText: '輸入訊息',
                      prefixIcon: Icon(Icons.edit_outlined),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: widget.controller.busy ? null : _send,
                  child: widget.controller.busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class MemoriesTab extends StatelessWidget {
  const MemoriesTab({super.key, required this.controller});

  final AppController controller;

  Future<void> _showAddMemoryDialog(BuildContext context) async {
    final textController = TextEditingController();
    final content = await showDialog<String>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const Text('新增文字回憶'),
        content: TextField(
          controller: textController,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            labelText: '今天想記低甚麼？',
            border: OutlineInputBorder(),
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(textController.text),
            child: const Text('儲存'),
          ),
        ],
      ),
    );
    textController.dispose();
    if (content == null || content.trim().isEmpty) return;
    await controller.createTextMemory(content);
  }

  @override
  Widget build(BuildContext context) {
    final memories = controller.memories;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _SectionHeader(
          title: '成長回憶',
          subtitle: memories.isEmpty ? '用文字先保存重要時刻。' : '${memories.length} 個回憶',
          trailing: FilledButton.icon(
            onPressed: controller.busy ? null : () => _showAddMemoryDialog(context),
            icon: const Icon(Icons.add),
            label: const Text('新增'),
          ),
        ),
        const SizedBox(height: 12),
        if (memories.isEmpty)
          const _EmptyCard(icon: Icons.photo_album_outlined, text: '尚未有回憶')
        else
          ...memories.map((MemoryItem memory) => _MemoryCard(memory: memory)),
      ],
    );
  }
}

class AlmanacTab extends StatelessWidget {
  const AlmanacTab({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final almanac = controller.almanac;
    final selectedDate = controller.selectedDate;
    final formattedDate = DateFormat('yyyy 年 M 月 d 日').format(selectedDate);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _SectionHeader(
          title: '家庭通勝',
          subtitle: formattedDate,
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    IconButton.filledTonal(
                      onPressed: () => controller.selectDate(selectedDate.subtract(const Duration(days: 1))),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        almanac?.solarText ?? formattedDate,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filledTonal(
                      onPressed: () => controller.selectDate(selectedDate.add(const Duration(days: 1))),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                TextButton.icon(
                  onPressed: () => controller.selectDate(DateTime.now()),
                  icon: const Icon(Icons.today_outlined),
                  label: const Text('回到今日'),
                ),
                const Divider(height: 28),
                _InfoLine(label: '農曆', value: almanac?.lunarText ?? '載入中'),
                _InfoLine(label: '干支', value: almanac?.ganZhi ?? '—'),
                _InfoLine(label: '星期', value: almanac?.weekday ?? '—'),
                const SizedBox(height: 16),
                _PillSection(title: '宜', items: almanac?.yi ?? const <String>[]),
                const SizedBox(height: 12),
                _PillSection(title: '忌', items: almanac?.ji ?? const <String>[]),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class SettingsTab extends StatelessWidget {
  const SettingsTab({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _SectionHeader(
          title: '設定',
          subtitle: '帳戶與伺服器',
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: <Widget>[
                CircleAvatar(
                  radius: 34,
                  child: Text(user?.name.isNotEmpty == true ? user!.name.substring(0, 1) : '星'),
                ),
                const SizedBox(height: 12),
                Text(user?.name ?? '家庭成員', style: Theme.of(context).textTheme.titleLarge),
                Text(user?.email ?? '', style: Theme.of(context).textTheme.bodyMedium),
                const Divider(height: 28),
                _InfoLine(label: '家庭代碼', value: controller.familyId ?? '未連接'),
                _InfoLine(label: '角色', value: controller.role?.label ?? '未設定'),
                _InfoLine(label: 'API', value: controller.apiBaseUrl),
                const SizedBox(height: 16),
                FilledButton.tonalIcon(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (BuildContext context) => ApiEndpointDialog(controller: controller),
                  ),
                  icon: const Icon(Icons.dns_outlined),
                  label: const Text('設定 API 伺服器'),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: controller.logout,
                  icon: const Icon(Icons.logout),
                  label: const Text('登出'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.subtitle, this.trailing});

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, required this.mine});

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Card(
          color: mine ? colors.primaryContainer : Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  message.senderName,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: mine ? colors.onPrimaryContainer : colors.primary,
                      ),
                ),
                const SizedBox(height: 6),
                Text(message.content.isEmpty ? '（${message.type}）' : message.content),
                if (message.time.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 6),
                  Text(message.time, style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MemoryCard extends StatelessWidget {
  const _MemoryCard({required this.memory});

  final MemoryItem memory;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                const Icon(Icons.auto_stories_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    memory.authorName,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(DateFormat('M月d日').format(memory.date)),
              ],
            ),
            const SizedBox(height: 10),
            Text(memory.content.isEmpty ? '（${memory.type}）' : memory.content),
          ],
        ),
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 86,
            child: Text(label, style: Theme.of(context).textTheme.labelLarge),
          ),
          Expanded(child: Text(value.isEmpty ? '—' : value)),
        ],
      ),
    );
  }
}

class _PillSection extends StatelessWidget {
  const _PillSection({required this.title, required this.items});

  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (items.isEmpty)
          const Text('—')
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: items.map((String item) => Chip(label: Text(item))).toList(),
          ),
      ],
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          children: <Widget>[
            Icon(icon, size: 44, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 12),
            Text(text),
          ],
        ),
      ),
    );
  }
}
