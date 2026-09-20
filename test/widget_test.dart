// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nearpill/main.dart';
import 'package:nearpill/services/api_client.dart';
import 'package:nearpill/services/auth_service.dart';
import 'package:nearpill/services/session_manager.dart';

void main() {
  testWidgets('app builds successfully', (WidgetTester tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    final sessionManager = SessionManager();
    final apiClient = ApiClient(sessionManager: sessionManager);
    final authService = AuthService(apiClient: apiClient);

    await tester.pumpWidget(
      Provider<AuthService>.value(
        value: authService,
        child: NearPillApp(navigatorKey: navigatorKey),
      ),
    );

    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
