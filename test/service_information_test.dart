import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:nearpill/app_theme.dart';
import 'package:nearpill/config/service_notices.dart';
import 'package:nearpill/models/order_model.dart';
import 'package:nearpill/screens/auth_portal_screen.dart';
import 'package:nearpill/screens/home_store_detail.dart';
import 'package:nearpill/screens/orders/confirmation.dart';
import 'package:nearpill/screens/policies_screen.dart';

void main() {
  test(
    'white button text has sufficient contrast against the primary green',
    () {
      final luminance = appThemeData.colorScheme.primary.computeLuminance();
      expect(1.05 / (luminance + 0.05), greaterThanOrEqualTo(4.5));
    },
  );

  testWidgets('cancelled orders do not promise a refund or a payment outcome', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: OrderConfirmationScreen(
          reference: 'TEST-1',
          storeName: 'Test pharmacy',
          stage: OrderStage.cancelled,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(cancellationNotice), findsOneWidget);
    expect(find.textContaining('3-5 business days'), findsNothing);
    expect(find.textContaining('You were not charged'), findsNothing);
  });

  testWidgets(
    'shared policies load without an API and include the supplied contact',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home: PoliciesScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Privacy notice'), findsOneWidget);
      expect(find.textContaining('nearpillemail@gmail.com'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'signup works with large text and does not request an unused phone',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.5)),
            child: child!,
          ),
          home: const AuthPortalScreen(),
        ),
      );
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'test@example.com');
      await tester.enterText(fields.at(1), 'Test-password1');
      await tester.ensureVisible(find.text('Continue'));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Full name'), findsOneWidget);
      expect(find.text('Mobile number'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final scenario in [
    'available',
    'empty',
    'failure',
    'invalid',
    'invalid-items',
  ]) {
    testWidgets('store inventory handles $scenario without sample stock', (
      tester,
    ) async {
      var attempts = 0;
      final client = MockClient((request) async {
        attempts++;
        expect(request.url.path, '/api/stores/1/inventory');
        if (scenario == 'failure') return http.Response('Unavailable', 503);
        if (scenario == 'invalid') return http.Response('invalid JSON', 200);
        return http.Response(
          jsonEncode({
            'store': {
              'store_id': 1,
              'store_name': 'Actual pharmacy',
              'openNow': true,
            },
            'inventory': scenario == 'empty'
                ? []
                : scenario == 'invalid-items'
                ? [null]
                : [
                    {
                      'id': 99,
                      'name': 'Actual listing',
                      'price': '12.00',
                      'stockCount': 2,
                      'medicineCategory': 'Pain Relief',
                      'category': 'Tablet',
                      'rxRequired': false,
                      'drugstoreId': 1,
                    },
                  ],
          }),
          200,
        );
      });
      await tester.pumpWidget(
        MaterialApp(home: StoreDetailScreen(client: client)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Biogesic 500mg'), findsNothing);
      if (scenario == 'available') {
        expect(find.textContaining('Actual listing'), findsOneWidget);
        await tester.enterText(find.byType(TextField), 'no match');
        await tester.pump(const Duration(milliseconds: 350));
        await tester.pumpAndSettle();
        expect(find.textContaining('Actual listing'), findsNothing);
        expect(find.text('No items found in this store.'), findsOneWidget);
      } else if (scenario == 'empty') {
        expect(find.text('No items found in this store.'), findsOneWidget);
      } else {
        expect(find.textContaining('Unable to load pharmacy'), findsOneWidget);
        await tester.tap(find.text('Retry'));
        await tester.pumpAndSettle();
        expect(attempts, 2);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
