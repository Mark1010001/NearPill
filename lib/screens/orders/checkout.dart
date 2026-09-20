import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/auth_service.dart';
import '../../services/cart_service.dart';
import '../../services/order_service.dart';
import '../../utils/formatters.dart';
import 'package:flutter/services.dart';
import 'confirmation.dart';

/// Single-page checkout, replacing the old two separate full-screen
/// navigations (CheckoutScreen -> PaymentScreen). Modern commerce apps
/// (TikTok Shop, Shopee, Lazada) keep pickup/delivery details, payment,
/// and the order summary on one scrollable page with a single, always
/// visible primary action — this removes an entire screen transition
/// from the purchase path and lets the shopper see the whole order
/// before committing.
class CheckoutFlowScreen extends StatefulWidget {
  const CheckoutFlowScreen({super.key});

  static const routeName = '/checkout';

  @override
  State<CheckoutFlowScreen> createState() => _CheckoutFlowScreenState();
}

class _CheckoutFlowScreenState extends State<CheckoutFlowScreen> {
  int _selectedDateIndex = 0;
  int _selectedTimeIndex = 0;
  int _paymentPlan = 0;
  bool _isPlacingOrder = false;

  final List<String> _dates = ['Today', 'Tomorrow', 'Fri', 'Sat', 'Sun'];
  final List<String> _timeSlots = [
    '09:00 AM',
    '11:00 AM',
    '01:00 PM',
    '03:00 PM',
    '05:00 PM',
    '07:00 PM',
  ];

  Future<void> _placeOrder() async {
    final cartService = context.read<CartService>();
    final authService = context.read<AuthService>();

    if (cartService.items.isEmpty) return;

    try {
      final user = await authService.getMe();
      if (user.phone == null || user.phone!.isEmpty || 
          user.birthDate == null || user.birthDate!.isEmpty) {
        if (mounted) {
          _showMissingInfoDialog(
            context,
            authService,
            user.phone,
            user.birthDate,
          );
        }
        return;
      }
    } catch (e) {
      // If we fail to fetch the user, we can either block or proceed.
      // Let's proceed and let the backend decide.
    }

    await _placeOrderCore();
  }

  void _showMissingInfoDialog(
    BuildContext context,
    AuthService authService,
    String? currentPhone,
    String? currentBirthDate,
  ) {
    final phoneController = TextEditingController(text: currentPhone);
    final birthdateController = TextEditingController(text: currentBirthDate);
    final formKey = GlobalKey<FormState>();
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
                top: 24,
                left: 24,
                right: 24,
              ),
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Complete Your Profile',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Text(
                      'To fulfill your order, our partner pharmacies require your Phone Number and Birthdate.',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                    const SizedBox(height: 20),
                    TextFormField(
                      controller: phoneController,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(11),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Phone Number',
                        hintText: 'e.g. 09171234567',
                        prefixIcon: Icon(Icons.phone),
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'Enter phone';
                        if (val.length < 10) return 'Invalid phone length';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: birthdateController,
                      keyboardType: TextInputType.datetime,
                      inputFormatters: [
                        DateTextFormatter(),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Birthdate (MM/DD/YYYY)',
                        hintText: 'MM/DD/YYYY',
                        prefixIcon: Icon(Icons.cake),
                      ),
                      validator: validateBirthdate,
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: isSaving ? null : () async {
                          if (formKey.currentState!.validate()) {
                            setModalState(() => isSaving = true);
                            try {
                              await authService.updateProfile(
                                phone: phoneController.text.trim(),
                                birthDate: birthdateController.text.trim(),
                              );
                              if (!context.mounted) return;
                              Navigator.pop(ctx);
                              
                              // Automatically resume checkout!
                              await _placeOrderCore();
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Failed to save info. Please try again.'),
                                  backgroundColor: Colors.red,
                                ),
                              );
                            } finally {
                              if (context.mounted) {
                                setModalState(() => isSaving = false);
                              }
                            }
                          }
                        },
                        child: isSaving
                            ? const CircularProgressIndicator(color: Colors.white)
                            : const Text(
                                'Save & Continue',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _placeOrderCore() async {
    final cartService = context.read<CartService>();
    final authService = context.read<AuthService>();

    setState(() => _isPlacingOrder = true);

    try {
      final response = await authService.apiClient.dio.post(
        '/api/orders',
        data: {
          'items': cartService.items
              .map(
                (item) => {
                  'id': item.id,
                  'name': item.name,
                  'price': item.price,
                  'quantity': item.quantity,
                  'drugstoreId': item.drugstoreId,
                  'drugstoreName': item.drugstoreName,
                },
              )
              .toList(),
          'pickupDate': _dates[_selectedDateIndex],
          'pickupTime': _timeSlots[_selectedTimeIndex],
          'paymentPlan': _paymentPlan == 0 ? 'full' : 'deposit',
          'total': cartService.totalPrice,
        },
      );

      if (!mounted) return;

      if (response.statusCode != 200 && response.statusCode != 201) {
        throw Exception('Order failed with status ${response.statusCode}');
      }

      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : <String, dynamic>{};
      final reference = data['reference']?.toString() ?? '';
      final storeName =
          data['storeName']?.toString() ??
          (cartService.items.isNotEmpty
              ? cartService.items.first.drugstoreName
              : '');

      // Order is confirmed server-side now, so the local cart can be
      // cleared — this is also what makes the "My Orders" tab show it,
      // since that tab reads from the same backend, not from the cart.
      await cartService.clearCart();

      if (!mounted) return;

      // Notify OrderService so Order History screens auto-refresh
      context.read<OrderService>().notifyOrderPlaced();

      if (!mounted) return;

      // Replace the whole checkout stack with the confirmation screen so
      // a back-swipe can't return the shopper into a stale checkout form.
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => OrderConfirmationScreen(
            reference: reference,
            storeName: storeName,
          ),
        ),
        (route) => route.isFirst,
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _isPlacingOrder = false);

      final message = error is DioException
          ? (error.response?.data is Map
              ? (error.response?.data['error']?.toString() ?? 'Could not place order. Please try again.')
              : 'Could not place order. Please try again.')
          : 'Could not place order. Please try again.';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cartService = context.watch<CartService>();

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(title: const Text('Checkout')),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 160),
            children: [
              _SectionCard(
                title: 'Pickup location',
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'Pharmacy Health Plus',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text('123 Banawa Road, Cebu City'),
                          SizedBox(height: 6),
                          Text('Open • 8:00 AM - 9:00 PM'),
                        ],
                      ),
                    ),
                    Container(
                      width: 72,
                      height: 64,
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.map,
                          color: Color(0xFF4CAF50),
                          size: 30,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _SectionCard(
                title: 'Pickup time',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _dates.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final selected = index == _selectedDateIndex;
                          return ChoiceChip(
                            label: Text(_dates[index]),
                            selected: selected,
                            onSelected: (_) =>
                                setState(() => _selectedDateIndex = index),
                            selectedColor: const Color(0xFF4CAF50),
                            backgroundColor: Colors.grey.shade100,
                            labelStyle: TextStyle(
                              color: selected ? Colors.white : Colors.black87,
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (var i = 0; i < _timeSlots.length; i++)
                          _TimeSlotChip(
                            label: _timeSlots[i],
                            selected: i == _selectedTimeIndex,
                            onTap: () => setState(() => _selectedTimeIndex = i),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _SectionCard(
                title: 'Payment',
                child: Column(
                  children: [
                    _PlanTile(
                      selected: _paymentPlan == 0,
                      title: 'Full Amount',
                      subtitle: 'Pay the full price now',
                      onTap: () => setState(() => _paymentPlan = 0),
                    ),
                    const SizedBox(height: 10),
                    _PlanTile(
                      selected: _paymentPlan == 1,
                      title: '50% Deposit',
                      subtitle: 'Reserve with half payment',
                      onTap: () => setState(() => _paymentPlan = 1),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF3E0),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.info_outline, color: Colors.orange, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Payments are non-refundable once processed.',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _PlaceOrderBar(
              isLoading: _isPlacingOrder,
              onPlaceOrder: _placeOrder,
              totalPrice: cartService.totalPrice,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _TimeSlotChip extends StatelessWidget {
  const _TimeSlotChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? const Color(0xFF4CAF50) : Colors.grey.shade300,
            width: selected ? 2 : 1,
          ),
          color: selected ? const Color(0xFFE8F5E9) : Colors.white,
        ),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
      ),
    );
  }
}

class _PlanTile extends StatelessWidget {
  const _PlanTile({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? const Color(0xFF4CAF50) : Colors.grey.shade300,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected
                      ? const Color(0xFF4CAF50)
                      : Colors.grey.shade400,
                  width: 2,
                ),
                color: selected ? const Color(0xFF4CAF50) : Colors.transparent,
              ),
              child: selected
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Sticky bottom bar showing the running total and a single "Place
/// Order" action, with an inline loading state so the button gives
/// immediate feedback instead of the shopper wondering if the tap
/// registered.
class _PlaceOrderBar extends StatelessWidget {
  const _PlaceOrderBar({
    required this.isLoading,
    required this.onPlaceOrder,
    required this.totalPrice,
  });

  final bool isLoading;
  final VoidCallback onPlaceOrder;
  final String totalPrice;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Order total',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
                const SizedBox(height: 2),
                Text(
                  totalPrice,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          FilledButton(
            onPressed: isLoading ? null : onPlaceOrder,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF4CAF50),
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : const Text('Place Order', style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }
}
