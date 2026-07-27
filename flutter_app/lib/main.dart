import 'package:flutter/widgets.dart';

import 'app.dart';
import 'app_controller.dart';
import 'config.dart';
import 'core/api_client.dart';
import 'core/session_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController(
    api: ApiClient(baseUrl: AppConfig.defaultApiBaseUrl),
    store: SessionStore(),
  );
  await controller.initialize();
  runApp(BeckonStarsApp(controller: controller));
}
