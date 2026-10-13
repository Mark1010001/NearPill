import 'dart:async';

import 'package:dio/dio.dart';

import '../models/auth_response_model.dart';
import '../models/user_model.dart';
import 'api_client.dart';

class AuthException implements Exception {
  AuthException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AuthService {
  AuthService({required this.apiClient});

  final ApiClient apiClient;

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
  }) async {
    try {
      final response = await apiClient.dio.post(
        '/api/auth/register',
        data: {'fullName': fullName, 'email': email, 'password': password},
      );

      if (response.statusCode != 201) {
        throw AuthException('Registration failed. Please try again.');
      }
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<String?> sendOtp({required String email}) async {
    return await _requestOtp('/api/auth/send-otp', email);
  }

  Future<String?> resendOtp({required String email}) async {
    return await _requestOtp('/api/auth/send-otp', email);
  }

  Future<String?> _requestOtp(String path, String email) async {
    try {
      final response = await apiClient.dio.post(path, data: {'email': email});
      if (response.statusCode != 200) {
        throw AuthException('Unable to send verification code.');
      }
      if (response.data is Map && response.data['devCode'] != null) {
        return response.data['devCode'].toString();
      }
      return null;
    } on DioException catch (error) {
      if (error.response?.data is Map &&
          error.response?.data['error'] != null) {
        throw AuthException(error.response!.data['error'].toString());
      }
      throw _mapError(error);
    }
  }

  Future<void> verifyOtp({required String email, required String code}) async {
    try {
      final response = await apiClient.dio.post(
        '/api/auth/verify-otp',
        data: {'email': email, 'code': code},
      );
      if (response.statusCode != 200) {
        throw AuthException('The code is invalid or expired.');
      }
    } on DioException catch (error) {
      if (error.response?.data is Map &&
          error.response?.data['error'] != null) {
        throw AuthException(error.response!.data['error'].toString());
      }
      throw _mapError(error);
    }
  }

  Future<AuthResponseModel> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await apiClient.dio.post(
        '/api/auth/login',
        data: {'email': email, 'password': password},
      );

      if (response.statusCode != 200) {
        throw AuthException('Invalid email or password.');
      }

      final authResponse = AuthResponseModel.fromJson(
        Map<String, dynamic>.from(response.data as Map),
      );

      if (authResponse.accessToken != null &&
          authResponse.refreshToken != null) {
        await apiClient.sessionManager.saveTokens(
          authResponse.accessToken!,
          authResponse.refreshToken!,
        );
      }

      return authResponse;
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<void> logout() async {
    String? refreshToken;
    try {
      refreshToken = await apiClient.sessionManager.getRefreshToken();
    } catch (_) {
      refreshToken = null;
    }

    await apiClient.sessionManager.clearSession();

    if (refreshToken != null && refreshToken.isNotEmpty) {
      unawaited(_notifyServerLogout(refreshToken));
    }
  }

  Future<void> _notifyServerLogout(String refreshToken) async {
    try {
      await apiClient.dio.post(
        '/api/auth/logout',
        data: {'refreshToken': refreshToken},
      );
    } catch (_) {}
  }

  Future<UserModel> getMe() async {
    try {
      final response = await apiClient.dio.get('/api/auth/me');
      if (response.statusCode != 200) {
        throw AuthException('Unable to load profile.');
      }

      return UserModel.fromJson(
        Map<String, dynamic>.from(response.data as Map),
      );
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<void> updateProfile({String? phone, String? birthDate}) async {
    try {
      final response = await apiClient.dio.put(
        '/api/auth/me',
        data: {'phone': phone, 'birthDate': birthDate},
      );
      if (response.statusCode != 200) {
        throw AuthException('Failed to update profile.');
      }
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<bool> isLoggedIn() async {
    try {
      return await apiClient.sessionManager.isLoggedIn();
    } catch (e) {
      return false;
    }
  }

  AuthException _mapError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.receiveTimeout) {
      return AuthException(
        'Unable to reach the server. Please check your connection and try again.',
      );
    }

    if (error.response?.statusCode == 401) {
      return AuthException('Invalid email or password.');
    }

    if (error.response?.statusCode == 400 ||
        error.response?.statusCode == 413) {
      return AuthException('Please check your details and try again.');
    }

    return AuthException('Something went wrong. Please try again.');
  }
}
