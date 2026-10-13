import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:nearpill/screens/forgot_password_screen.dart';
import 'package:nearpill/services/api_client.dart';
import 'package:nearpill/services/auth_service.dart';
import 'package:nearpill/services/session_manager.dart';

class _Session extends SessionManager {
  int refreshReads = 0;
  @override
  Future<String?> getAccessToken() async => null;
  @override
  Future<String?> getRefreshToken() async {
    refreshReads++;
    return null;
  }
}

class _RejectedLogin implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    '{"error":"Unable to sign in. Check your details or try again later."}',
    401,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
  @override
  void close({bool force = false}) {}
}

class _CredentialError implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => throw DioException(
    requestOptions: options,
    message: 'secret-password',
    error: 'secret-password',
    type: DioExceptionType.connectionError,
    response: Response(
      requestOptions: options,
      statusCode: 500,
      data: {'password': 'secret-password'},
    ),
  );
  @override
  void close({bool force = false}) {}
}

void main() {
  test(
    'API debug logs omit credentials from requests, responses and errors',
    () async {
      final logs = <String>[];
      final original = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) =>
          logs.add(message ?? '');
      final client = ApiClient(sessionManager: _Session());
      client.dio.httpClientAdapter = _CredentialError();
      addTearDown(() {
        debugPrint = original;
        client.dio.close(force: true);
      });
      await expectLater(
        client.dio.post(
          '/api/auth/login?secret-password',
          data: {'password': 'secret-password'},
          options: Options(headers: {'Authorization': 'secret-password'}),
        ),
        throwsA(isA<DioException>()),
      );
      expect(logs.join(), contains('connectionError'));
      expect(logs.join(), isNot(contains('secret-password')));
    },
  );

  test('a rejected login is not refreshed or retried', () async {
    final session = _Session();
    var unauthorized = 0;
    final client = ApiClient(
      sessionManager: session,
      onUnauthorized: () => unauthorized++,
    );
    client.dio.httpClientAdapter = _RejectedLogin();
    addTearDown(() => client.dio.close(force: true));
    await expectLater(
      AuthService(
        apiClient: client,
      ).login(email: 'test@example.com', password: 'test-password'),
      throwsA(
        isA<AuthException>().having(
          (e) => e.message,
          'message',
          'Unable to sign in. Check your details or try again later.',
        ),
      ),
    );
    expect(session.refreshReads, 0);
    expect(unauthorized, 0);
  });

  for (final succeeds in [true, false]) {
    testWidgets(
      'password recovery ${succeeds ? 'shows a neutral confirmation' : 'handles a request error'}',
      (tester) async {
        final client = ApiClient(sessionManager: SessionManager());
        addTearDown(() => client.dio.close(force: true));
        client.dio.interceptors.clear();
        final completed = Completer<void>();
        var requests = 0;
        client.dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) async {
              requests++;
              expect(options.path, '/api/auth/forgot-password');
              expect(options.data, {'email': 'test@example.com'});
              await completed.future;
              if (succeeds) {
                handler.resolve(
                  Response(requestOptions: options, statusCode: 200),
                );
              } else {
                handler.reject(
                  DioException(
                    requestOptions: options,
                    type: DioExceptionType.connectionError,
                  ),
                );
              }
            },
          ),
        );
        await tester.pumpWidget(
          Provider<AuthService>.value(
            value: AuthService(apiClient: client),
            child: const MaterialApp(
              home: ForgotPasswordScreen(email: 'test@example.com'),
            ),
          ),
        );
        await tester.tap(find.text('Send reset link'));
        await tester.pump();
        expect(
          tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
          isNull,
        );
        completed.complete();
        await tester.pumpAndSettle();
        expect(
          find.text(
            succeeds
                ? 'If this account can receive email, a reset link will be sent.'
                : 'Unable to reach the server. Please check your connection and try again.',
          ),
          findsOneWidget,
        );
        expect(requests, 1);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
