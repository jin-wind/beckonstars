import 'dart:math';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models.dart';
import 'shared.dart';

class FamilySetupScreen extends StatefulWidget {
  const FamilySetupScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<FamilySetupScreen> createState() => _FamilySetupScreenState();
}

class _FamilySetupScreenState extends State<FamilySetupScreen> {
  late final TextEditingController _codeController;
  bool _createMode = true;
  MemberRole _role = MemberRole.child;

  @override
  void initState() {
    super.initState();
    _codeController = TextEditingController(text: _newFamilyCode());
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  String _newFamilyCode() {
    return (100000 + Random.secure().nextInt(900000)).toString();
  }

  Future<void> _continue() async {
    final success = await widget.controller.connectFamily(
      code: _codeController.text,
      create: _createMode,
      memberRole: _role,
    );
    if (!mounted || success) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(widget.controller.errorMessage ?? '未能連接家庭')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('連接家庭'),
        actions: <Widget>[
          IconButton(
            tooltip: '設定 API 伺服器',
            onPressed: () => showDialog<void>(
              context: context,
              builder: (BuildContext context) => ApiEndpointDialog(controller: widget.controller),
            ),
            icon: const Icon(Icons.dns_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text('你好，${widget.controller.user?.name ?? ''}', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text('建立一個新家庭，或輸入家人提供的代碼加入。', style: theme.textTheme.bodyLarge),
                  const SizedBox(height: 28),
                  ErrorNotice(
                    message: widget.controller.errorMessage,
                    onDismiss: widget.controller.clearError,
                  ),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: ChoiceChip(
                          label: const SizedBox(
                            width: double.infinity,
                            child: Text('建立家庭', textAlign: TextAlign.center),
                          ),
                          selected: _createMode,
                          onSelected: (_) {
                            setState(() {
                              _createMode = true;
                              _codeController.text = _newFamilyCode();
                            });
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ChoiceChip(
                          label: const SizedBox(
                            width: double.infinity,
                            child: Text('加入家庭', textAlign: TextAlign.center),
                          ),
                          selected: !_createMode,
                          onSelected: (_) {
                            setState(() {
                              _createMode = false;
                              _codeController.clear();
                            });
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    maxLength: 24,
                    decoration: InputDecoration(
                      labelText: _createMode ? '家庭代碼（可分享給家人）' : '家庭代碼',
                      prefixIcon: const Icon(Icons.group_outlined),
                      border: const OutlineInputBorder(),
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<MemberRole>(
                    value: _role,
                    decoration: const InputDecoration(
                      labelText: '你的角色',
                      prefixIcon: Icon(Icons.badge_outlined),
                      border: OutlineInputBorder(),
                    ),
                    items: MemberRole.values
                        .map(
                          (MemberRole value) => DropdownMenuItem<MemberRole>(
                            value: value,
                            child: Text(value.label),
                          ),
                        )
                        .toList(),
                    onChanged: (MemberRole? value) {
                      if (value != null) setState(() => _role = value);
                    },
                  ),
                  const SizedBox(height: 28),
                  FilledButton.icon(
                    onPressed: widget.controller.busy ? null : _continue,
                    icon: widget.controller.busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(_createMode ? Icons.add_home_outlined : Icons.login),
                    label: Text(_createMode ? '建立並進入家庭' : '加入家庭'),
                  ),
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: widget.controller.logout,
                    icon: const Icon(Icons.logout),
                    label: const Text('登出'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
