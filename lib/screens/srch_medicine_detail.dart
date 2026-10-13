import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/medicine_model.dart';
import '../services/auth_service.dart';
import '../services/cart_service.dart';
import '../services/medicine_service.dart';

class MedicineDetailScreen extends StatefulWidget {
  const MedicineDetailScreen({super.key});

  static const routeName = '/medicine-detail';

  @override
  State<MedicineDetailScreen> createState() => _MedicineDetailScreenState();
}

class _MedicineDetailScreenState extends State<MedicineDetailScreen> {
  int _quantity = 1;

  // Coalesces rapid repeat taps of "Add to cart" into one toast instead
  // of stacking a SnackBar per tap.
  Timer? _addFeedbackDebounce;
  int _addFeedbackTotalQty = 0;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _addFeedbackDebounce?.cancel();
    super.dispose();
  }

  void _updateQuantity(int newQuantity) {
    if (newQuantity < 1) return;
    setState(() {
      _quantity = newQuantity;
    });
  }

  // Same fix as the store detail and search screens: merges rapid
  // repeat taps of "Add to cart" into one toast instead of stacking a
  // SnackBar per tap.
  void _queueAddedToCartFeedback(int qty) {
    _addFeedbackTotalQty += qty;

    _addFeedbackDebounce?.cancel();
    _addFeedbackDebounce = Timer(const Duration(milliseconds: 500), () {
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.clearSnackBars();
      messenger.showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 2),
          content: Text(
            'Added $_addFeedbackTotalQty item${_addFeedbackTotalQty == 1 ? '' : 's'} to cart',
          ),
        ),
      );
      _addFeedbackTotalQty = 0;
    });
  }

  Widget _quantityPillButton({
    required IconData icon,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: enabled ? Colors.white : Colors.grey.shade200,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: enabled ? const Color(0xFF2E7D32) : Colors.grey.shade300,
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? const Color(0xFF2E7D32) : Colors.grey,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final args = ModalRoute.of(context)!.settings.arguments;
    MedicineModel? medicineArg;
    String? medicineId;

    if (args is MedicineModel) {
      medicineArg = args;
      medicineId = medicineArg.id;
    } else if (args is String) {
      medicineId = args;
    }

    return FutureBuilder<MedicineModel?>(
      future: medicineArg != null
          ? Future.value(medicineArg)
          : (medicineId != null
                ? MedicineService(
                    apiClient: context.read<AuthService>().apiClient,
                  ).fetchMedicineById(medicineId)
                : Future.value(null)),
      builder: (context, snapshot) {
        final medicine = snapshot.data;

        if (medicine == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Medicine Details')),
            body: const Center(child: Text('Medicine not found')),
          );
        }

        final priceValue = double.tryParse(medicine.price) ?? 0;
        final totalPrice = (priceValue * _quantity).toStringAsFixed(2);

        return Scaffold(
          appBar: AppBar(
            title: const Text('Medicine Details'),
            elevation: 0,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black87,
          ),
          backgroundColor: Colors.grey.shade100,
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withAlpha(13),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 54,
                              height: 54,
                              decoration: BoxDecoration(
                                color: Colors.green.shade50,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: const Icon(
                                Icons.medical_services,
                                color: Color(0xFF2E7D32),
                                size: 30,
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    medicine.name,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    medicine.drugstoreName,
                                    style: const TextStyle(
                                      color: Colors.grey,
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.green.shade50,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: const Text(
                                'In stock',
                                style: TextStyle(
                                  color: Color(0xFF2E7D32),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Price',
                                    style: TextStyle(
                                      color: Colors.grey,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    medicine.price,
                                    style: const TextStyle(
                                      fontSize: 28,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.green.shade50,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: Row(
                                children: [
                                  _quantityPillButton(
                                    icon: Icons.remove,
                                    enabled: _quantity > 1,
                                    onTap: () => _updateQuantity(_quantity - 1),
                                  ),
                                  Container(
                                    width: 46,
                                    alignment: Alignment.center,
                                    child: Text(
                                      _quantity.toString(),
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  _quantityPillButton(
                                    icon: Icons.add,
                                    enabled: true,
                                    onTap: () => _updateQuantity(_quantity + 1),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 18),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Total',
                              style: TextStyle(color: Colors.grey),
                            ),
                            Text(
                              '₱$totalPrice',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              // Fire-and-forget: don't await, so the UI
                              // responds instantly with no loading state.
                              context.read<CartService>().addItem(
                                id: medicine.id,
                                name: medicine.name,
                                price: medicine.price,
                                drugstoreName: medicine.drugstoreName,
                                drugstoreId: medicine.drugstoreId,
                                category: medicine.category,
                                rxRequired: medicine.rxRequired,
                                quantity: _quantity,
                              );
                              _queueAddedToCartFeedback(_quantity);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2E7D32),
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              'Add $_quantity to cart',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withAlpha(10),
                          blurRadius: 18,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Description',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          medicine.description ??
                              'This medicine is available at the selected pharmacy. Check the product packaging and consult a pharmacist before use.',
                          style: const TextStyle(
                            fontSize: 15,
                            color: Colors.grey,
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'ID',
                              style: TextStyle(color: Colors.grey),
                            ),
                            Text(
                              medicine.id,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
