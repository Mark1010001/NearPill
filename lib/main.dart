import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_theme.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/cart_service.dart';
import 'services/order_service.dart';
import 'services/session_manager.dart';
import 'widgets/auth_gate.dart';
import 'screens/home.dart';
import 'screens/auth_portal_screen.dart';
import 'screens/search.dart';
import 'screens/srch_medicine_detail.dart';
import 'screens/orders/orders.dart';
import 'screens/home_store_detail.dart';
import 'screens/orders/checkout.dart';
import 'screens/orders/payment.dart';
import 'screens/orders/confirmation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final navigatorKey = GlobalKey<NavigatorState>();
  final sessionManager = SessionManager();
  final apiClient = ApiClient(
    sessionManager: sessionManager,
    onUnauthorized: () {
      navigatorKey.currentState?.pushNamedAndRemoveUntil(
        '/login',
        (route) => false,
      );
    },
  );
  final authService = AuthService(apiClient: apiClient);

  final cartService = CartService();
  await cartService.loadCart();

  final orderService = OrderService(authService: authService);

  runApp(
    MultiProvider(
      providers: [
        Provider<AuthService>.value(value: authService),
        ChangeNotifierProvider<CartService>.value(value: cartService),
        ChangeNotifierProvider<OrderService>.value(value: orderService),
      ],
      child: NearPillApp(navigatorKey: navigatorKey),
    ),
  );
}

class NearPillApp extends StatelessWidget {
  const NearPillApp({super.key, required this.navigatorKey});

  final GlobalKey<NavigatorState> navigatorKey;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'NearPill',
      theme: appThemeData,
      home: AuthGate(
        authService: context.read<AuthService>(),
        navigatorKey: navigatorKey,
      ),
      routes: {
        '/login': (context) => const AuthPortalScreen(),
        HomeScreen.routeName: (context) => HomeScreen(
          onLogout: () => Navigator.of(
            context,
          ).pushNamedAndRemoveUntil('/login', (route) => false),
        ),
        SearchScreen.routeName: (context) => const SearchScreen(),
        MedicineDetailScreen.routeName: (context) =>
            const MedicineDetailScreen(),
        OrdersScreen.routeName: (context) => const OrdersScreen(),
        StoreDetailScreen.routeName: (context) => const StoreDetailScreen(),
        CheckoutFlowScreen.routeName: (context) => const CheckoutFlowScreen(),
        PaymentScreen.routeName: (context) => const PaymentScreen(),
        OrderConfirmationScreen.routeName: (context) =>
            const OrderConfirmationScreen(
              reference: 'NP-00000000',
              storeName: 'Pharmacy Health Plus • Banawa Rd, Cebu City',
            ),
      },
    );
  }
}
