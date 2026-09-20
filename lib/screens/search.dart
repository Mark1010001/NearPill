import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';

import '../models/medicine_model.dart';
import '../services/auth_service.dart';
import '../services/medicine_service.dart';
import 'srch_medicine_detail.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialKeywords = const []});

  static const routeName = '/search';

  final List<String> initialKeywords;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  bool _isLoadingMedicines = true;
  String? _medicineError;
  final TextEditingController _searchController = TextEditingController();
  final List<MedicineModel> _medicines = [];
  final List<MedicineModel> _filteredMedicines = [];

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_filterMedicines);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMedicines();
    });
  }

  @override
  void dispose() {
    _searchController.removeListener(_filterMedicines);
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMedicines() async {
    try {
      final authService = context.read<AuthService>();
      final medicineService = MedicineService(apiClient: authService.apiClient);
      final medicines = await medicineService.fetchMedicines();

      if (!mounted) return;

      setState(() {
        _medicines
          ..clear()
          ..addAll(medicines);
        _medicineError = null;
        _isLoadingMedicines = false;
      });

      _filterMedicines();
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _medicineError = 'Unable to load medicines. Please try again.';
        _filteredMedicines.clear();
        _isLoadingMedicines = false;
      });
    }
  }

  void _filterMedicines() {
    final query = _searchController.text.trim().toLowerCase();
    final keywords = widget.initialKeywords
        .map((keyword) => keyword.toLowerCase())
        .toList();

    setState(() {
      if (query.isEmpty && keywords.isEmpty) {
        _filteredMedicines
          ..clear()
          ..addAll(_medicines);
      } else {
        _filteredMedicines
          ..clear()
          ..addAll(
            _medicines.where((medicine) {
              final lowerName = medicine.name.toLowerCase();
              final lowerPharmacy = medicine.drugstoreName.toLowerCase();
              final matchesQuery =
                  query.isEmpty ||
                  lowerName.contains(query) ||
                  lowerPharmacy.contains(query);
              final matchesKeywords =
                  keywords.isEmpty ||
                  keywords.any(
                    (keyword) =>
                        lowerName.contains(keyword) ||
                        lowerPharmacy.contains(keyword),
                  );
              return matchesQuery && matchesKeywords;
            }),
          );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Search medicines',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search medicines',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
              ),
            ),
            const SizedBox(height: 18),
            if (_isLoadingMedicines)
              Expanded(
                child: ListView.separated(
                  itemCount: 6,
                  separatorBuilder: (context, index) => const Divider(height: 1),
                  itemBuilder: (context, index) => Shimmer.fromColors(
                    baseColor: Colors.grey[300]!,
                    highlightColor: Colors.grey[100]!,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(height: 16, width: 140, color: Colors.white),
                                const SizedBox(height: 8),
                                Container(height: 12, width: 100, color: Colors.white),
                              ],
                            ),
                          ),
                          Container(height: 16, width: 40, color: Colors.white),
                        ],
                      ),
                    ),
                  ),
                ),
              )
            else if (_medicineError != null)
              Expanded(
                child: Center(
                  child: Text(
                    _medicineError!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              )
            else if (_filteredMedicines.isEmpty)
              const Expanded(
                child: Center(
                  child: Text(
                    'No medicines found.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              )
            else
              Expanded(
                child: ListView.separated(
                  itemCount: _filteredMedicines.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final medicine = _filteredMedicines[index];
                    return Card(
                      child: ListTile(
                        leading: const Icon(
                          Icons.medical_services,
                          color: Colors.green,
                        ),
                        title: Text(medicine.name),
                        subtitle: Text(
                          '${medicine.drugstoreName} • ${medicine.distance}',
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (medicine.rxRequired)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade100,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Text(
                                  'Rx',
                                  style: TextStyle(
                                    color: Colors.red,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            if (medicine.rxRequired) const SizedBox(height: 6),
                            Text(
                              medicine.price,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        onTap: () {
                          Navigator.of(context).pushNamed(
                            MedicineDetailScreen.routeName,
                            arguments: medicine,
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
