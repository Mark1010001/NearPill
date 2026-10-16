import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import 'session_manager.dart';

class ApiClient {
  ApiClient({required this.sessionManager, this.onUnauthorized}) {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        connectTimeout: ApiConfig.connectTimeout,
        receiveTimeout: ApiConfig.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await sessionManager.getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401 &&
              error.requestOptions.path != '/api/auth/login' &&
              error.requestOptions.extra['retried'] != true) {
            final retried = await _refreshAndRetry(error.requestOptions);
            if (retried != null) {
              handler.resolve(retried);
              return;
            }
          }
          if (kDebugMode) {
            debugPrint(
              'API error: ${error.type}; status: ${error.response?.statusCode}',
            );
          }

          handler.next(error);
        },
      ),
    );
  }

  final SessionManager sessionManager;
  final VoidCallback? onUnauthorized;

  late final Dio _dio;

  Dio get dio => _dio;

  Future<Response<dynamic>?> _refreshAndRetry(
    RequestOptions requestOptions,
  ) async {
    final refreshToken = await sessionManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      await _handleUnauthorized();
      return null;
    }

    try {
      final response = await _dio.post(
        '/api/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(validateStatus: (status) => status! < 500),
      );

      if (response.statusCode == 200) {
        final newAccessToken = response.data['accessToken']?.toString();
        if (newAccessToken != null && newAccessToken.isNotEmpty) {
          await sessionManager.saveTokens(newAccessToken, refreshToken);
          final retryOptions = requestOptions.copyWith(
            headers: {
              ...requestOptions.headers,
              'Authorization': 'Bearer $newAccessToken',
            },
            extra: {...requestOptions.extra, 'retried': true},
          );
          return _dio.fetch(retryOptions);
        }
      }
    } catch (_) {}

    await _handleUnauthorized();
    return null;
  }

  Future<void> _handleUnauthorized() async {
    await sessionManager.clearSession();
    onUnauthorized?.call();
  }
}
