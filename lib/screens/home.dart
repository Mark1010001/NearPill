import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/medicine_model.dart';
import '../services/auth_service.dart';
import '../services/medicine_service.dart';
import '../widgets/bottom_nav_bar.dart';
import 'orders/orders.dart';
import 'home_store_detail.dart';
import 'search.dart';
import 'map.dart';
import 'profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onLogout});

  final VoidCallback onLogout;

  static const routeName = '/home';

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  final List<MedicineModel> _medicines = [];
  final List<MedicineModel> _filteredMedicines = [];

  List<Map<String, dynamic>> _drugstores = [];

  final List<Map<String, String>> _categories = const [
    {
      'title': 'Pain & Fever Relief',
      'subtitle': 'Biogesic, Alaxan, Paracetamol',
      'icon': '🩺',
    },
    {
      'title': 'Cough, Cold & Flu',
      'subtitle': 'Neozep, Loperamide, Cetirizine',
      'icon': '🌬️',
    },
    {
      'title': 'Allergy & Asthma',
      'subtitle': 'Ventolin, Cetirizine, Fluticasone',
      'icon': '🌿',
    },
    {
      'title': 'Stomach & Digestion',
      'subtitle': 'Maalox, Pepto, Loperamide',
      'icon': '🧴',
    },
    {
      'title': 'First Aid & Wounds',
      'subtitle': 'Betadine, Bandages, Antiseptic',
      'icon': '🩹',
    },
    {
      'title': 'Vitamins & Supplements',
      'subtitle': 'Vitamin C, Fish Oil, Multivitamin',
      'icon': '💊',
    },
    {
      'title': 'Prescription / Maintenance',
      'subtitle': 'Amlodipine, Losartan, Atorvastatin',
      'icon': '📋',
    },
    {
      'title': 'Antibiotics (Rx Required)',
      'subtitle': 'Amoxicillin, Azithromycin, Clindamycin',
      'icon': '🧪',
    },
  ];

  final Map<String, List<String>> _categoryKeywords = const {
    'Pain & Fever Relief': [
      'biogesic 500mg',
      'paracetamol generic',
      'alaxan fr',
      'mefenamic acid 500mg',
    ],
    'Cough, Cold & Flu': [
      'biogesic 500mg',
      'paracetamol generic',
      'neozep forte',
    ],
    'Allergy & Asthma': [
      'cetirizine 10mg',
      'salbutamol 2mg',
      'ventolin evohaler',
      'prednisone 5mg',
    ],
    'Stomach & Digestion': ['kremil-s', 'loperamide 2mg', 'omeprazole 20mg'],
    'First Aid & Wounds': ['betadine 60ml'],
    'Vitamins & Supplements': [
      'vitamin c 500mg',
      'multivitamin + zinc',
      'fish oil 1000mg',
    ],
    'Prescription / Maintenance': [
      'metformin 500mg',
      'insulin glargine',
      'amlodipine 5mg',
      'losartan 50mg',
      'clonidine',
      'atorvastatin 20mg',
    ],
    'Antibiotics (Rx Required)': [
      'amoxicillin 500mg',
      'azithromycin 500mg',
      'clindamycin 300mg',
    ],
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMedicines();
    });
  }

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  Future<void> _loadMedicines() async {
    try {
      final authService = context.read<AuthService>();
      final medicineService = MedicineService(apiClient: authService.apiClient);
      final medicines = await medicineService.fetchMedicines();

      try {
        final response = await authService.apiClient.dio.get('/api/stores');
        if (response.statusCode == 200 && response.data is List) {
          final List<dynamic> data = response.data as List<dynamic>;
          if (data.isNotEmpty) {
            final List<Map<String, dynamic>> fetchedStores = [];
            final colors = [
              const Color(0xFFE8F5E9),
              const Color(0xFFF1F8E9),
              const Color(0xFFE3F2FD),
              const Color(0xFFFFF3E0),
            ];
            for (int i = 0; i < data.length; i++) {
              final item = data[i];
              fetchedStores.add({
                'id': item['store_id'].toString(),
                'name': item['store_name'] ?? 'Pharmacy',
                'openNow': item['openNow'],
                'hoursDisplay': item['operating_hours'],
                'color': colors[i % colors.length],
              });
            }
            if (mounted) {
              setState(() {
                _drugstores = fetchedStores;
              });
            }
          }
        }
      } catch (_) {}

      if (mounted) {
        setState(() {
          _medicines
            ..clear()
            ..addAll(medicines);
        });
      }
    } catch (_) {
      if (mounted) setState(() {});
    }
  }

  Widget _buildHomeContent() {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Delivering to',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: const [
                    Icon(Icons.place, color: Color(0xFF2E7D32), size: 28),
                    SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        'Cebu City, Philippines',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: const [
                Text(
                  'Nearby Drugstores',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                Text('See all', style: TextStyle(color: Colors.green)),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 280,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _drugstores.length,
                separatorBuilder: (context, index) => const SizedBox(width: 16),
                itemBuilder: (context, index) {
                  final item = _drugstores[index];
                  return SizedBox(
                    width: 190,
                    child: GestureDetector(
                      onTap: () {
                        Navigator.of(context).pushNamed(
                          StoreDetailScreen.routeName,
                          arguments: (index + 1).toString(),
                        );
                      },
                      child: Card(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 110,
                              decoration: BoxDecoration(
                                color: item['color'] as Color,
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(24),
                                ),
                              ),
                              child: const Center(
                                child: Icon(
                                  Icons.local_pharmacy,
                                  size: 46,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item['name'] as String,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  const SizedBox(height: 12),
                                  Builder(
                                    builder: (_) {
                                      final bool isOpen =
                                          (item['openNow'] == 1 ||
                                          item['openNow'] == true ||
                                          item['isOpen'] == true);
                                      final String hoursStr =
                                          item['hoursDisplay'] ??
                                          'Hours not provided';
                                      return Wrap(
                                        spacing: 6,
                                        runSpacing: 6,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: isOpen
                                                  ? Colors.green.shade50
                                                  : Colors.red.shade50,
                                              borderRadius:
                                                  BorderRadius.circular(20),
                                              border: Border.all(
                                                color: isOpen
                                                    ? Colors.green.shade200
                                                    : Colors.red.shade200,
                                              ),
                                            ),
                                            child: Text(
                                              isOpen
                                                  ? 'OPEN NOW ($hoursStr)'
                                                  : 'CLOSED ($hoursStr)',
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.bold,
                                                color: isOpen
                                                    ? Colors.green.shade800
                                                    : Colors.red.shade800,
                                              ),
                                            ),
                                          ),
                                        ],
                                      );
                                    },
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
              ),
            ),
            const SizedBox(height: 28),
            const Text(
              'Categories',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            Column(
              children: _categories.map((category) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 18,
                      ),
                      leading: CircleAvatar(
                        radius: 26,
                        backgroundColor: Colors.green.shade50,
                        child: Text(
                          category['icon']!,
                          style: const TextStyle(fontSize: 20),
                        ),
                      ),
                      title: Text(
                        category['title']!,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(category['subtitle']!),
                      trailing: const Icon(Icons.arrow_forward_ios, size: 18),
                      onTap: () {
                        final keywords =
                            _categoryKeywords[category['title']!]
                                ?.map((keyword) => keyword.toLowerCase())
                                .toList() ??
                            [];
                        setState(() {
                          _filteredMedicines
                            ..clear()
                            ..addAll(
                              _medicines.where((medicine) {
                                final lowerName = medicine.name.toLowerCase();
                                final lowerPharmacy = medicine.drugstoreName
                                    .toLowerCase();
                                return keywords.any(
                                  (keyword) =>
                                      lowerName.contains(keyword) ||
                                      lowerPharmacy.contains(keyword),
                                );
                              }),
                            );
                          _selectedIndex = 1;
                        });
                      },
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildHomeContent(),
      const SearchScreen(),
      const MapScreen(),
      const OrdersScreen(),
      ProfileScreen(onLogout: widget.onLogout),
    ];

    return Scaffold(
      appBar: null,
      body: pages[_selectedIndex],
      bottomNavigationBar: BttmNaviBar(
        currentIndex: _selectedIndex,
        onTap: _onItemTapped,
      ),
    );
  }
}
