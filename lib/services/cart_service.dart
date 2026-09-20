import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CartItem {
  CartItem({
    required this.id,
    required this.name,
    required this.price,
    required this.drugstoreName,
    required this.drugstoreId,
    required this.category,
    required this.rxRequired,
    required this.quantity,
  });

  final String id;
  final String name;
  final String price;
  final String drugstoreName;
  final String drugstoreId;
  final String category;
  final bool rxRequired;
  int quantity;

  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      price: json['price']?.toString() ?? 'N/A',
      drugstoreName: json['drugstoreName']?.toString() ?? '',
      drugstoreId: json['drugstoreId']?.toString() ?? '',
      category: json['category']?.toString() ?? 'General',
      rxRequired:
          json['rxRequired']?.toString() == '1' || json['rxRequired'] == true,
      quantity: int.tryParse(json['quantity']?.toString() ?? '') ?? 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'drugstoreName': drugstoreName,
      'drugstoreId': drugstoreId,
      'category': category,
      'rxRequired': rxRequired ? 1 : 0,
      'quantity': quantity,
    };
  }
}

class CartService extends ChangeNotifier {
  static const _cartKey = 'nearpill_cart';

  CartService({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  final List<CartItem> _items = [];

  List<CartItem> get items => List.unmodifiable(_items);

  String get totalPrice {
    final total = _items.fold<double>(0, (sum, item) {
      final numeric =
          double.tryParse(item.price.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return sum + numeric * item.quantity;
    });
    return '₱${total.toStringAsFixed(2)}';
  }

  Future<void> loadCart() async {
    final raw = await _storage.read(key: _cartKey);
    if (raw == null || raw.isEmpty) return;

    final decoded = jsonDecode(raw);
    if (decoded is List) {
      _items.clear();
      _items.addAll(
        decoded.map(
          (item) => CartItem.fromJson(Map<String, dynamic>.from(item as Map)),
        ),
      );
      notifyListeners();
    }
  }

  Future<void> _saveCart() async {
    final raw = jsonEncode(_items.map((item) => item.toJson()).toList());
    await _storage.write(key: _cartKey, value: raw);
  }

  Future<void> addItem({
    required String id,
    required String name,
    required String price,
    required String drugstoreName,
    required String drugstoreId,
    required String category,
    required bool rxRequired,
    required int quantity,
  }) async {
    final existing = _items.indexWhere((item) => item.id == id);
    if (existing >= 0) {
      _items[existing].quantity += quantity;
    } else {
      _items.add(
        CartItem(
          id: id,
          name: name,
          price: price,
          drugstoreName: drugstoreName,
          drugstoreId: drugstoreId,
          category: category,
          rxRequired: rxRequired,
          quantity: quantity,
        ),
      );
    }
    notifyListeners();
    await _saveCart();
  }

  Future<void> updateQuantity(String id, int newQuantity) async {
    final index = _items.indexWhere((item) => item.id == id);
    if (index < 0) return;
    if (newQuantity <= 0) {
      _items.removeAt(index);
    } else {
      _items[index].quantity = newQuantity;
    }
    notifyListeners();
    await _saveCart();
  }

  Future<void> removeItem(String id) async {
    _items.removeWhere((item) => item.id == id);
    notifyListeners();
    await _saveCart();
  }

  Future<void> clearCart() async {
    _items.clear();
    notifyListeners();
    await _saveCart();
  }
}
