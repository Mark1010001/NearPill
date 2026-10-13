import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import 'home.dart';
import 'policies_screen.dart';
import 'forgot_password_screen.dart';

const _green = Color(0xFF2E7D32);
const _deepGreen = Color(0xFF1F6B45);
const _ink = Color(0xFF17332A);
const _muted = Color(0xFF61726B);

class AuthPortalScreen extends StatefulWidget {
  const AuthPortalScreen({super.key});

  @override
  State<AuthPortalScreen> createState() => _AuthPortalScreenState();
}

class _AuthPortalScreenState extends State<AuthPortalScreen> {
  final _loginFormKey = GlobalKey<FormState>();
  final _registerFormKey = GlobalKey<FormState>();
  final _loginEmail = TextEditingController();
  final _loginPassword = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _otp = List.generate(6, (_) => TextEditingController());
  final _otpFocus = List.generate(6, (_) => FocusNode());

  bool _isLogin = true;
  int _step = 0;
  bool _showLoginPassword = false;
  bool _showRegisterPassword = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _password.addListener(_passwordChanged);
  }

  void _passwordChanged() => setState(() {});

  @override
  void dispose() {
    for (final controller in [
      _loginEmail,
      _loginPassword,
      _name,
      _email,
      _password,
      ..._otp,
    ]) {
      controller.dispose();
    }
    for (final focusNode in _otpFocus) {
      focusNode.dispose();
    }
    super.dispose();
  }

  Future<void> _login() async {
    if (!(_loginFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthService>().login(
        email: _loginEmail.text.trim(),
        password: _loginPassword.text,
      );
      if (mounted) _goHome();
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'An unexpected error occurred.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _register() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final authService = context.read<AuthService>();
    try {
      await authService.register(
        fullName: _name.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
      );
      _loginEmail.text = _email.text;
      _loginPassword.text = _password.text;
      await authService.login(
        email: _email.text.trim(),
        password: _password.text,
      );
      if (mounted) _goHome();
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'An unexpected error occurred.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _goHome() => Navigator.pushReplacement(
    context,
    MaterialPageRoute(
      builder: (_) => HomeScreen(
        onLogout: () => Navigator.pushReplacementNamed(context, '/login'),
      ),
    ),
  );

  Future<void> _continueSignup() async {
    if (!(_registerFormKey.currentState?.validate() ?? false)) return;
    if (_step == 1) {
      await _sendOtp();
      return;
    }
    setState(() => _step++);
  }

  Future<void> _sendOtp() async {
    final authService = context.read<AuthService>();
    setState(() {
      _loading = true;
      _error = null;
      for (final controller in _otp) {
        controller.clear();
      }
    });
    try {
      final devCode = await authService.sendOtp(email: _email.text.trim());
      if (!mounted) return;
      setState(() => _step = 2);

      if (devCode != null && devCode.length == 6) {
        for (int i = 0; i < 6; i++) {
          _otp[i].text = devCode[i];
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Dev Mode (Resend sandbox): Auto-filled verification code ($devCode)',
            ),
            backgroundColor: _deepGreen,
            duration: const Duration(seconds: 6),
          ),
        );
      } else {
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _otpFocus.first.requestFocus(),
        );
      }
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to send verification code.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyAndRegister() async {
    final code = _otp.map((controller) => controller.text).join();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit verification code.');
      return;
    }
    final authService = context.read<AuthService>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await authService.verifyOtp(email: _email.text.trim(), code: code);
      await _register();
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to verify the code.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resendOtp() async {
    if (_loading) return;
    final authService = context.read<AuthService>();
    setState(() {
      _loading = true;
      _error = null;
      for (final controller in _otp) {
        controller.clear();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _otpFocus.first.requestFocus(),
    );
    try {
      final devCode = await authService.resendOtp(email: _email.text.trim());
      if (mounted) {
        if (devCode != null && devCode.length == 6) {
          for (int i = 0; i < 6; i++) {
            _otp[i].text = devCode[i];
          }
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Dev Mode (Resend sandbox): Auto-filled new code ($devCode)',
              ),
              backgroundColor: _deepGreen,
              duration: const Duration(seconds: 6),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('A new code has been sent.')),
          );
        }
      }
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to resend verification code.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _decoration(String label, IconData icon, {Widget? suffix}) =>
      InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        suffixIcon: suffix,
        constraints: const BoxConstraints(minHeight: 56),
      );

  Widget _googleButton() => SizedBox(
    height: 56,
    width: double.infinity,
    child: OutlinedButton.icon(
      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Google sign-in is coming soon.')),
      ),
      icon: const Text(
        'G',
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: Color(0xFF4285F4),
        ),
      ),
      label: const Text(
        'Continue with Google',
        style: TextStyle(color: _ink, fontWeight: FontWeight.w700),
      ),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: Colors.grey.shade300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
  );

  Widget _header({required String title, required String subtitle}) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: _green.withAlpha(28),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.local_pharmacy_outlined,
          color: _deepGreen,
          size: 26,
        ),
      ),
      const SizedBox(height: 22),
      Text(
        title,
        style: const TextStyle(
          fontSize: 30,
          height: 1.15,
          fontWeight: FontWeight.w800,
          color: _ink,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        subtitle,
        style: const TextStyle(fontSize: 15, height: 1.45, color: _muted),
      ),
    ],
  );

  Widget _loginView() => Form(
    key: _loginFormKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          title: 'Welcome back',
          subtitle: 'Your trusted care, right at your fingertips.',
        ),
        const SizedBox(height: 28),
        TextFormField(
          controller: _loginEmail,
          keyboardType: TextInputType.emailAddress,
          decoration: _decoration('Email address', Icons.email_outlined),
          validator: (value) => value != null && value.contains('@')
              ? null
              : 'Enter a valid email address',
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _loginPassword,
          obscureText: !_showLoginPassword,
          decoration: _decoration(
            'Password',
            Icons.lock_outline,
            suffix: IconButton(
              tooltip: _showLoginPassword ? 'Hide password' : 'Show password',
              icon: Icon(
                _showLoginPassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
              onPressed: () =>
                  setState(() => _showLoginPassword = !_showLoginPassword),
            ),
          ),
          validator: (value) =>
              value == null || value.isEmpty ? 'Enter your password' : null,
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) =>
                    ForgotPasswordScreen(email: _loginEmail.text.trim()),
              ),
            ),
            child: const Text(
              'Forgot Password?',
              style: TextStyle(color: _deepGreen, fontWeight: FontWeight.w700),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const SizedBox(height: 24),
        _primaryButton('Log In', _loading ? null : _login),
      ],
    ),
  );

  Widget _signupView() {
    final titles = [
      ('Create your account', 'Choose an email address and password.'),
      ('Tell us about you', 'A few details help us serve you better.'),
      ('Verify your email', 'Enter the 6-digit code sent to ${_email.text}.'),
    ];
    return Form(
      key: _registerFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Back',
                onPressed: _step == 0 ? null : () => setState(() => _step--),
                icon: const Icon(Icons.arrow_back),
              ),
              const Spacer(),
              Text(
                'STEP ${_step + 1} OF 3',
                style: const TextStyle(
                  color: _deepGreen,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          _header(title: titles[_step].$1, subtitle: titles[_step].$2),
          const SizedBox(height: 28),
          if (_step == 0) ...[
            _googleButton(),
            const SizedBox(height: 22),
            const _OrDivider(),
            const SizedBox(height: 22),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: _decoration('Email address', Icons.email_outlined),
              validator: (value) => value != null && value.contains('@')
                  ? null
                  : 'Enter a valid email address',
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _password,
              obscureText: !_showRegisterPassword,
              decoration: _decoration(
                'Create password',
                Icons.lock_outline,
                suffix: IconButton(
                  tooltip: _showRegisterPassword
                      ? 'Hide password'
                      : 'Show password',
                  icon: Icon(
                    _showRegisterPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                  onPressed: () => setState(
                    () => _showRegisterPassword = !_showRegisterPassword,
                  ),
                ),
              ),
              validator: (value) => value != null && value.length >= 6
                  ? null
                  : 'Use at least 6 characters',
            ),
            _StrengthMeter(password: _password.text),
          ],
          if (_step == 1) ...[
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: _decoration('Full name', Icons.person_outline),
              validator: (value) => value != null && value.trim().length > 1
                  ? null
                  : 'Enter your full name',
            ),
          ],
          if (_step == 2) ...[
            _otpRow(),
            const SizedBox(height: 20),
            Center(
              child: TextButton(
                onPressed: _resendOtp,
                child: const Text(
                  'Resend Code',
                  style: TextStyle(
                    color: _deepGreen,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          _primaryButton(
            _step == 2 ? 'Verify & Create Account' : 'Continue',
            _loading
                ? null
                : (_step == 2 ? _verifyAndRegister : () => _continueSignup()),
          ),
        ],
      ),
    );
  }

  Widget _otpRow() => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: List.generate(
      6,
      (index) => SizedBox(
        width: 46,
        child: TextField(
          controller: _otp[index],
          focusNode: _otpFocus[index],
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          maxLength: 1,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: _ink,
          ),
          decoration: InputDecoration(
            labelText: 'Code digit ${index + 1} of 6',
            counterText: '',
            contentPadding: EdgeInsets.symmetric(vertical: 14),
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            if (value.isNotEmpty && index < 5) {
              _otpFocus[index + 1].requestFocus();
            }
          },
        ),
      ),
    ),
  );

  Widget _primaryButton(String text, VoidCallback? onPressed) => SizedBox(
    width: double.infinity,
    height: 60,
    child: FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: _green,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: _loading
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            )
          : Text(
              text,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFFF7F9F8),
    body: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
        child: Column(
          children: [
            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                color: Colors.red.shade50,
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            Expanded(
              child: SingleChildScrollView(
                child: _isLogin ? _loginView() : _signupView(),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const PoliciesScreen())),
              child: const Text('Privacy, cancellations and terms'),
            ),
            const SizedBox(height: 14),
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  _isLogin ? 'New to NearPill? ' : 'Already have an account? ',
                  style: const TextStyle(color: _muted),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    _isLogin = !_isLogin;
                    _step = 0;
                    _error = null;
                  }),
                  child: Text(
                    _isLogin ? 'Create account' : 'Log in',
                    style: const TextStyle(
                      color: _deepGreen,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(child: Divider(color: Colors.grey.shade300)),
      const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12),
        child: Text(
          'OR',
          style: TextStyle(
            color: _muted,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      Expanded(child: Divider(color: Colors.grey)),
    ],
  );
}

class _StrengthMeter extends StatelessWidget {
  const _StrengthMeter({required this.password});
  final String password;
  @override
  Widget build(BuildContext context) {
    final score = [
      password.length >= 6,
      password.contains(RegExp(r'[A-Z]')),
      password.contains(RegExp(r'\d')),
      password.contains(RegExp(r'[^A-Za-z0-9]')),
    ].where((value) => value).length;
    final label = score < 2
        ? 'Weak'
        : score < 4
        ? 'Good'
        : 'Strong';
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Expanded(
            child: LinearProgressIndicator(
              value: score / 4,
              minHeight: 6,
              borderRadius: BorderRadius.circular(8),
              color: score < 2
                  ? Colors.redAccent
                  : score < 4
                  ? Colors.orange
                  : _green,
              backgroundColor: Colors.grey.shade200,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            password.isEmpty ? 'Use 6+ characters' : label,
            style: const TextStyle(
              color: _muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
