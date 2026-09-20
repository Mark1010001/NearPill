import 'dart:convert';

enum OrderStage { placed, preparing, ready, completed, cancelled }

OrderStage stageFromString(String rawStage) {
  switch (rawStage.toLowerCase()) {
    case 'preparing':
      return OrderStage.preparing;
    case 'ready':
      return OrderStage.ready;
    case 'completed':
      return OrderStage.completed;
    case 'cancelled':
      return OrderStage.cancelled;
    default:
      return OrderStage.placed;
  }
}

class OrderModel {
  const OrderModel({
    required this.reference,
    required this.storeName,
    required this.itemSummary,
    required this.itemCount,
    required this.total,
    required this.placedOn,
    required this.stage,
    required this.items,
  });

  final String reference;
  final String storeName;
  final String itemSummary;
  final int itemCount;
  final String total;
  final String placedOn;
  final String stage;
  final List<dynamic> items;

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      reference: json['reference']?.toString() ?? '',
      storeName: json['storeName']?.toString() ?? '',
      itemSummary: json['itemSummary']?.toString() ?? '',
      itemCount: int.tryParse(json['itemCount']?.toString() ?? '') ?? 0,
      total: json['total']?.toString() ?? '₱0.00',
      placedOn: json['placedOn']?.toString() ?? '',
      stage: json['stage']?.toString().toLowerCase() ?? 'placed',
      items: _parseItems(json['items']),
    );
  }

  static List<dynamic> _parseItems(dynamic itemsJson) {
    if (itemsJson == null) return [];
    if (itemsJson is List) return itemsJson;
    if (itemsJson is String) {
      try {
        final decoded = jsonDecode(itemsJson);
        if (decoded is List) return decoded;
      } catch (_) {
        return [];
      }
    }
    return [];
  }
}

extension OrderModelX on OrderModel {
  OrderStage get parsedStage => stageFromString(stage);

  bool get isActive =>
      parsedStage == OrderStage.placed ||
      parsedStage == OrderStage.preparing ||
      parsedStage == OrderStage.ready;

  bool get isPast =>
      parsedStage == OrderStage.completed ||
      parsedStage == OrderStage.cancelled;
}
