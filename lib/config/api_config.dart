/// Centralized API and Network Configuration
class ApiConfig {
  ApiConfig._();

  /// Base URL for the backend API.
  /// Defaults to `http://10.0.2.2:3001` for Android Emulator local backend access.
  /// Can be overridden at compile/run time via `--dart-define=API_BASE_URL=http://your-ip:3001`
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );

  /// Default timeouts for API HTTP client
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 10);
}
