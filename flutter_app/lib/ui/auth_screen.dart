import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'shared.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _registerMode = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final success = _registerMode
        ? await widget.controller.register(
            name: _nameController.text,
            email: _emailController.text,
            password: _passwordController.text,
          )
        : await widget.controller.login(
            email: _emailController.text,
            password: _passwordController.text,
          );
    if (!mounted || success) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(widget.controller.errorMessage ?? '登入失敗')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Align(
                      alignment: Alignment.centerRight,
                      child: IconButton(
                        tooltip: '設定 API 伺服器',
                        onPressed: () => showDialog<void>(
                          context: context,
                          builder: (BuildContext context) => ApiEndpointDialog(
                            controller: widget.controller,
                          ),
                        ),
                        icon: const Icon(Icons.dns_outlined),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Icon(Icons.auto_awesome, size: 54, color: theme.colorScheme.primary),
                    const SizedBox(height: 16),
                    Text(
                      '星喚',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.displaySmall?.copyWith(
                        color: theme.colorScheme.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '讓家人的訊息、回憶與日曆留在一起。',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 36),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: ChoiceChip(
                            label: const SizedBox(
                              width: double.infinity,
                              child: Text('登入', textAlign: TextAlign.center),
                            ),
                            selected: !_registerMode,
                            onSelected: (_) => setState(() => _registerMode = false),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ChoiceChip(
                            label: const SizedBox(
                              width: double.infinity,
                              child: Text('建立帳戶', textAlign: TextAlign.center),
                            ),
                            selected: _registerMode,
                            onSelected: (_) => setState(() => _registerMode = true),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    ErrorNotice(
                      message: widget.controller.errorMessage,
                      onDismiss: widget.controller.clearError,
                    ),
                    if (_registerMode) ...<Widget>[
                      TextFormField(
                        controller: _nameController,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: '名稱',
                          prefixIcon: Icon(Icons.person_outline),
                          border: OutlineInputBorder(),
                        ),
                        validator: (String? value) {
                          return value == null || value.trim().isEmpty ? '請輸入名稱' : null;
                        },
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const <String>[AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: '電郵地址',
                        prefixIcon: Icon(Icons.mail_outline),
                        border: OutlineInputBorder(),
                      ),
                      validator: (String? value) {
                        return value == null || !value.contains('@') ? '請輸入有效電郵地址' : null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      autofillHints: <String>[
                        _registerMode ? AutofillHints.newPassword : AutofillHints.password,
                      ],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: '密碼',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _obscurePassword ? '顯示密碼' : '隱藏密碼',
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        ),
                        border: const OutlineInputBorder(),
                      ),
                      validator: (String? value) {
                        return value == null || value.length < 6 ? '密碼至少需要 6 個字元' : null;
                      },
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: widget.controller.busy ? null : _submit,
                      icon: widget.controller.busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(_registerMode ? Icons.person_add_outlined : Icons.login),
                      label: Text(_registerMode ? '建立帳戶' : '登入'),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'API：${widget.controller.apiBaseUrl}',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
