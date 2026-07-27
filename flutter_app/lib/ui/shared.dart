import 'package:flutter/material.dart';

import '../app_controller.dart';

class ApiEndpointDialog extends StatefulWidget {
  const ApiEndpointDialog({super.key, required this.controller});

  final AppController controller;

  @override
  State<ApiEndpointDialog> createState() => _ApiEndpointDialogState();
}

class _ApiEndpointDialogState extends State<ApiEndpointDialog> {
  late final TextEditingController _endpointController;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _endpointController = TextEditingController(text: widget.controller.apiBaseUrl);
  }

  @override
  void dispose() {
    _endpointController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final success = await widget.controller.updateApiBaseUrl(_endpointController.text);
    if (!mounted) return;
    setState(() => _saving = false);
    if (success) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('API 伺服器'),
      content: TextField(
        controller: _endpointController,
        keyboardType: TextInputType.url,
        autocorrect: false,
        enableSuggestions: false,
        decoration: const InputDecoration(
          labelText: '基礎網址',
          hintText: 'https://api.example.com',
          border: OutlineInputBorder(),
        ),
      ),
      actions: <Widget>[
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('儲存'),
        ),
      ],
    );
  }
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice({super.key, required this.message, this.onDismiss});

  final String? message;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    if (message == null || message!.isEmpty) return const SizedBox.shrink();
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        color: colors.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.error_outline, color: colors.onErrorContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message!,
              style: TextStyle(color: colors.onErrorContainer),
            ),
          ),
          if (onDismiss != null)
            IconButton(
              tooltip: '關閉提示',
              onPressed: onDismiss,
              icon: Icon(Icons.close, color: colors.onErrorContainer),
            ),
        ],
      ),
    );
  }
}
