import 'package:flutter/material.dart';

import '../models/order_model.dart';
import 'auth_service.dart';

class OrderService extends ChangeNotifier {
  OrderService({required this.authService});

  final AuthService authService;

  List<OrderModel> _orders = [];
  bool _isLoading = false;
  String? _error;

  List<OrderModel> get orders => List.unmodifiable(_orders);
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<List<OrderModel>> fetchOrders() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await authService.apiClient.dio.get('/api/orders');
      if (response.statusCode == 200 && response.data is List) {
        _orders = (response.data as List)
            .map(
              (item) =>
                  OrderModel.fromJson(Map<String, dynamic>.from(item as Map)),
            )
            .toList();
      } else {
        _orders = [];
      }
    } catch (e) {
      _error = 'Unable to load orders';
      debugPrint('Failed to fetch orders: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
    return _orders;
  }

  Future<void> notifyOrderPlaced() async {
    await fetchOrders();
  }
}
