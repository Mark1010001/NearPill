class MedicineModel {
  MedicineModel({
    required this.id,
    required this.name,
    required this.price,
    required this.drugstoreName,
    required this.drugstoreId,
    required this.category,
    required this.distance,
    required this.stockCount,
    required this.rxRequired,
    this.description,
  });

  final String id;
  final String name;
  final String price;
  final String drugstoreName;
  final String drugstoreId;
  final String category;
  final String distance;
  final int stockCount;
  final bool rxRequired;
  final String? description;

  factory MedicineModel.fromJson(Map<String, dynamic> json) {
    return MedicineModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      price: json['price']?.toString() ?? 'N/A',
      drugstoreName:
          json['drugstoreName']?.toString() ??
          json['pharmacy']?.toString() ??
          'Unknown pharmacy',
      drugstoreId: json['drugstoreId']?.toString() ?? '',
      category: json['category']?.toString() ?? 'General',
      distance: json['distance']?.toString() ?? 'Unknown distance',
      stockCount: int.tryParse(json['stockCount']?.toString() ?? '') ?? 0,
      rxRequired:
          json['rxRequired']?.toString() == '1' || json['rxRequired'] == 1,
      description: json['description']?.toString(),
    );
  }
}
