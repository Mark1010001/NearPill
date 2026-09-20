import 'package:flutter/material.dart';

import '../screens/onboarding_screen.dart';
import '../screens/home.dart';
import '../services/auth_service.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({
    super.key,
    required this.authService,
    required this.navigatorKey,
  });

  final AuthService authService;
  final GlobalKey<NavigatorState> navigatorKey;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _isCheckingSession = true;
  bool _isAuthenticated = false;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    try {
      final loggedIn = await widget.authService.isLoggedIn();
      if (!mounted) {
        return;
      }
      setState(() {
        _isCheckingSession = false;
        _isAuthenticated = loggedIn;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isCheckingSession = false;
        _isAuthenticated = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isCheckingSession) {
      return Scaffold(
        body: Container(
          color: Colors.white,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              Icon(Icons.local_pharmacy, color: Colors.green, size: 96),
              SizedBox(height: 24),
              Text(
                'Loading NearPill',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 12),
              Text(
                'Preparing your app experience…',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16, color: Colors.grey),
              ),
              SizedBox(height: 32),
              CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.green),
              ),
            ],
          ),
        ),
      );
    }

    if (_isAuthenticated) {
      return HomeScreen(
        onLogout: () {
          setState(() => _isAuthenticated = false);
        },
      );
    }

    return const OnboardingScreen();
  }
}
