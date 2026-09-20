import '../models/medicine_model.dart';
import 'api_client.dart';

class MedicineService {
  MedicineService({required this.apiClient});

  final ApiClient apiClient;

  Future<List<MedicineModel>> fetchMedicines() async {
    final response = await apiClient.dio.get('/api/medicines');

    if (response.statusCode == 200 && response.data is List) {
      return (response.data as List)
          .map(
            (item) =>
                MedicineModel.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
    }

    return [];
  }

  Future<MedicineModel?> fetchMedicineById(String id) async {
    final response = await apiClient.dio.get('/api/medicines/$id');

    if (response.statusCode == 200 && response.data is Map) {
      return MedicineModel.fromJson(
        Map<String, dynamic>.from(response.data as Map),
      );
    }

    return null;
  }
}
