class AppConfig {
  const AppConfig._();

  static const String defaultApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://144.79.170.102:8787',
  );
}
