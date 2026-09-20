import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shimmer/shimmer.dart';

import '../config/api_config.dart';
import '../services/cart_service.dart';

class StoreDetailScreen extends StatefulWidget {
  const StoreDetailScreen({super.key});

  static const routeName = '/store-detail';

  @override
  State<StoreDetailScreen> createState() => _StoreDetailScreenState();
}

class _StoreDetailScreenState extends State<StoreDetailScreen> {
  static String get backendUrl => ApiConfig.baseUrl;

  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  // Coalesces rapid repeat taps on "Add" into one toast instead of
  // stacking a new SnackBar per tap.
  Timer? _addFeedbackDebounce;
  String? _addFeedbackItemId;
  int _addFeedbackTotalQty = 0;

  // UI state
  bool _isLoading = false;
  List<dynamic> _inventory = [];
  String _storeId = '';
  Map<String, dynamic>? _storeMeta;

  // categories (example 8 items)
  final List<String> _categories = [
    'All',
    'Pain Relief',
    'Cough & Cold',
    'Vitamins',
  ];
  int _selectedCategory = 0;

  // quantities tracked by item id
  final Map<String, int> _quantities = {};

  String _lastStoreId = '';

  // Local catalog mirrors nearpill_database.csv exactly (drug_name,
  // dosage_form, price, stock_count, prescription_required). The
  // 'category' field does not exist in the CSV -- it's inferred here
  // from generic_name purely so the existing category chips have
  // something to filter on. Swap this for a real category column
  // once one exists in the database.
  List<Map<String, dynamic>> _getStoreInventoryByID(String storeId) {
    final catalog = <String, List<Map<String, dynamic>>>{
      '1': [
        {
          'id': '1',
          'name': 'Biogesic 500mg',
          'dosage': 'Tablet',
          'price': '7.50',
          'stockCount': 350,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '1',
        },
        {
          'id': '2',
          'name': 'Neozep Forte',
          'dosage': 'Tablet',
          'price': '8.00',
          'stockCount': 240,
          'rxRequired': false,
          'category': 'Cough & Cold',
          'drugstoreId': '1',
        },
        {
          'id': '3',
          'name': 'Alaxan FR',
          'dosage': 'Capsule',
          'price': '12.00',
          'stockCount': 180,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '1',
        },
        {
          'id': '4',
          'name': 'Kremil-S',
          'dosage': 'Tablet',
          'price': '9.25',
          'stockCount': 400,
          'rxRequired': false,
          'category': 'Digestive',
          'drugstoreId': '1',
        },
        {
          'id': '5',
          'name': 'Loperamide 2mg',
          'dosage': 'Capsule',
          'price': '6.00',
          'stockCount': 500,
          'rxRequired': false,
          'category': 'Digestive',
          'drugstoreId': '1',
        },
        {
          'id': '6',
          'name': 'Cetirizine 10mg',
          'dosage': 'Tablet',
          'price': '15.00',
          'stockCount': 150,
          'rxRequired': false,
          'category': 'Antihistamine',
          'drugstoreId': '1',
        },
        {
          'id': '7',
          'name': 'Mefenamic Acid 500mg',
          'dosage': 'Tablet',
          'price': '11.50',
          'stockCount': 300,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '1',
        },
        {
          'id': '8',
          'name': 'Vitamin C 500mg',
          'dosage': 'Tablet',
          'price': '5.00',
          'stockCount': 600,
          'rxRequired': false,
          'category': 'Vitamins',
          'drugstoreId': '1',
        },
        {
          'id': '9',
          'name': 'Clonidine 500mg',
          'dosage': 'Tablet',
          'price': '25.00',
          'stockCount': 90,
          'rxRequired': false,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
        {
          'id': '10',
          'name': 'Betadine 60ml',
          'dosage': 'Liquid Solution',
          'price': '145.00',
          'stockCount': 60,
          'rxRequired': false,
          'category': 'First Aid',
          'drugstoreId': '1',
        },
        {
          'id': '11',
          'name': 'Amoxicillin 500mg',
          'dosage': 'Capsule',
          'price': '18.00',
          'stockCount': 200,
          'rxRequired': true,
          'category': 'Antibiotics',
          'drugstoreId': '1',
        },
        {
          'id': '12',
          'name': 'Azithromycin 500mg',
          'dosage': 'Tablet',
          'price': '95.00',
          'stockCount': 85,
          'rxRequired': true,
          'category': 'Antibiotics',
          'drugstoreId': '1',
        },
        {
          'id': '13',
          'name': 'Metformin 500mg',
          'dosage': 'Tablet',
          'price': '14.00',
          'stockCount': 450,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
        {
          'id': '14',
          'name': 'Amlodipine 5mg',
          'dosage': 'Tablet',
          'price': '10.50',
          'stockCount': 500,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
        {
          'id': '15',
          'name': 'Atorvastatin 20mg',
          'dosage': 'Tablet',
          'price': '32.00',
          'stockCount': 120,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
        {
          'id': '16',
          'name': 'Losartan 50mg',
          'dosage': 'Tablet',
          'price': '22.00',
          'stockCount': 380,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
        {
          'id': '17',
          'name': 'Omeprazole 20mg',
          'dosage': 'Capsule',
          'price': '45.00',
          'stockCount': 210,
          'rxRequired': true,
          'category': 'Digestive',
          'drugstoreId': '1',
        },
        {
          'id': '18',
          'name': 'Salbutamol 2mg',
          'dosage': 'Tablet',
          'price': '12.00',
          'stockCount': 140,
          'rxRequired': true,
          'category': 'Respiratory',
          'drugstoreId': '1',
        },
        {
          'id': '19',
          'name': 'Clindamycin 300mg',
          'dosage': 'Capsule',
          'price': '65.00',
          'stockCount': 95,
          'rxRequired': true,
          'category': 'Antibiotics',
          'drugstoreId': '1',
        },
        {
          'id': '20',
          'name': 'Prednisone 5mg',
          'dosage': 'Tablet',
          'price': '8.50',
          'stockCount': 110,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '1',
        },
      ],
      '2': [
        {
          'id': '21',
          'name': 'Biogesic 500mg',
          'dosage': 'Tablet',
          'price': '7.25',
          'stockCount': 400,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '2',
        },
        {
          'id': '22',
          'name': 'Neozep Forte',
          'dosage': 'Tablet',
          'price': '7.75',
          'stockCount': 300,
          'rxRequired': false,
          'category': 'Cough & Cold',
          'drugstoreId': '2',
        },
        {
          'id': '23',
          'name': 'Alaxan FR',
          'dosage': 'Capsule',
          'price': '11.50',
          'stockCount': 220,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '2',
        },
        {
          'id': '24',
          'name': 'Paracetamol Generic',
          'dosage': 'Tablet',
          'price': '3.00',
          'stockCount': 1000,
          'rxRequired': false,
          'category': 'Pain Relief',
          'drugstoreId': '2',
        },
        {
          'id': '25',
          'name': 'Amoxicillin 500mg',
          'dosage': 'Capsule',
          'price': '16.50',
          'stockCount': 310,
          'rxRequired': true,
          'category': 'Antibiotics',
          'drugstoreId': '2',
        },
      ],
      '3': [
        {
          'id': '26',
          'name': 'Multivitamin + Zinc',
          'dosage': 'Capsule',
          'price': '18.50',
          'stockCount': 140,
          'rxRequired': false,
          'category': 'Vitamins',
          'drugstoreId': '3',
        },
        {
          'id': '27',
          'name': 'Fish Oil 1000mg',
          'dosage': 'Softgel',
          'price': '22.00',
          'stockCount': 90,
          'rxRequired': false,
          'category': 'Vitamins',
          'drugstoreId': '3',
        },
        {
          'id': '28',
          'name': 'Insulin Glargine',
          'dosage': 'Injection Pen',
          'price': '980.00',
          'stockCount': 30,
          'rxRequired': true,
          'category': 'Maintenance',
          'drugstoreId': '3',
        },
        {
          'id': '29',
          'name': 'Ventolin Evohaler',
          'dosage': 'Inhaler MDI',
          'price': '420.00',
          'stockCount': 45,
          'rxRequired': true,
          'category': 'Respiratory',
          'drugstoreId': '3',
        },
      ],
    };
    return catalog[storeId] ?? catalog['1']!;
  }

  // Applies the same search/category filtering the backend would, so
  // typing in the search box or tapping a category chip still works
  // while running on fallback data.
  List<Map<String, dynamic>> _filterFallbackInventory({
    String? query,
    String? category,
  }) {
    final all = _getStoreInventoryByID(_storeId);
    final q = (query ?? '').trim().toLowerCase();
    return all.where((item) {
      final matchesCategory =
          category == null || category.isEmpty || category == 'All'
          ? true
          : item['category'] == category;
      final matchesQuery =
          q.isEmpty || item['name'].toString().toLowerCase().contains(q);
      return matchesCategory && matchesQuery;
    }).toList();
  }

  Map<String, dynamic> _getStoreMetaByID(String storeId) {
    final storeMap = {
      '1': {
        'drugstoreName': 'MedPlus Drugstore',
        'branch': 'Colon Street',
        'openNow': true,
        'hours': '8:00 - 21:00',
        'phone': '+63 912 345 6789',
        'facebook': 'https://facebook.com/medplus',
        'location': 'Colon St., Cebu City',
        'distance': '0.5 km',
      },
      '2': {
        'drugstoreName': 'Generika Drugstore',
        'branch': 'Osmeña Blvd',
        'openNow': true,
        'hours': '8:00 - 20:00',
        'phone': '+63 912 345 6790',
        'facebook': 'https://facebook.com/generika',
        'location': 'Osmeña Blvd, Cebu City, Cebu, Philippines',
        'distance': '1.2 km',
      },
      '3': {
        'drugstoreName': 'Wellness Pharmacy',
        'branch': 'Banilad Town Center',
        'openNow': true,
        'hours': '9:00 - 21:00',
        'phone': '+63 912 345 6791',
        'facebook': 'https://facebook.com/wellness',
        'location': 'Banilad, Cebu City',
        'distance': '2.0 km',
      },
    };
    return storeMap[storeId] ?? storeMap['1']!;
  }

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments;
    final newStoreId = args is String && args.isNotEmpty ? args : '1';

    // Only fetch if store ID changed
    if (newStoreId != _lastStoreId) {
      _lastStoreId = newStoreId;
      _storeId = newStoreId;
      _selectedCategory = 0;
      _quantities.clear();
      _searchController.clear();
      _fetchStoreAndInventory();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _addFeedbackDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _fetchInventory(
        query: q,
        category: _selectedCategory == 0
            ? null
            : _categories[_selectedCategory],
      );
    });
  }

  Future<void> _fetchStoreAndInventory() async {
    setState(() => _isLoading = true);
    try {
      // fetch store meta (optional endpoint)
      final metaUri = Uri.parse('$backendUrl/api/stores/$_storeId');
      final metaResp = await http
          .get(metaUri)
          .timeout(const Duration(seconds: 8));
      if (metaResp.statusCode == 200) {
        _storeMeta = jsonDecode(metaResp.body) as Map<String, dynamic>;
      } else {
        // fallback sample meta based on store ID
        _storeMeta = _getStoreMetaByID(_storeId);
      }

      await _fetchInventory();
    } catch (_) {
      // show fallback meta & inventory based on store ID
      _storeMeta ??= _getStoreMetaByID(_storeId);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchInventory({String? query, String? category}) async {
    setState(() => _isLoading = true);
    try {
      final params = <String, String>{};
      if (query != null && query.isNotEmpty) {
        params['search'] = query;
      }
      if (category != null && category.isNotEmpty && category != 'All') {
        params['category'] = category;
      }

      final uri = Uri.parse(
        '$backendUrl/api/stores/$_storeId/inventory',
      ).replace(queryParameters: params.isEmpty ? null : params);
      final resp = await http.get(uri).timeout(const Duration(seconds: 8));
      if (resp.statusCode == 200) {
        final body = jsonDecode(resp.body);
        if (body is List && body.isNotEmpty) {
          setState(() => _inventory = body);
        } else {
          // Backend responded but had nothing for this store/filter yet
          // (e.g. inventory isn't seeded). Fall back so the store still
          // shows its full catalog under "All" instead of an empty list.
          setState(
            () => _inventory = _filterFallbackInventory(
              query: query,
              category: category,
            ),
          );
        }
      } else {
        setState(
          () => _inventory = _filterFallbackInventory(
            query: query,
            category: category,
          ),
        );
      }
    } catch (_) {
      setState(
        () => _inventory = _filterFallbackInventory(
          query: query,
          category: category,
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _launchPhone(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _changeQuantity(String id, int delta) {
    final current = _quantities[id] ?? 0;
    final next = (current + delta).clamp(0, 999);
    setState(() => _quantities[id] = next);
  }

  void _addToCart(Map<String, dynamic> item, int quantity) {
    if (quantity <= 0) return;

    final cartService = context.read<CartService>();
    final id = item['id']?.toString() ?? '';
    final name = item['name']?.toString() ?? 'Unknown';
    final price = item['price']?.toString() ?? 'N/A';
    final drugstoreName =
        _storeMeta?['drugstoreName']?.toString() ??
        item['drugstoreName']?.toString() ??
        '';
    final drugstoreId = item['drugstoreId']?.toString() ?? _storeId;
    final category = item['category']?.toString() ?? '';
    final rxRequired =
        item['rxRequired'] == true || item['rxRequired']?.toString() == '1';

    // Fire the cart update in the background. Don't await it before
    // queuing feedback below -- gating the debounce on network/state
    // completion time was the actual bug: completions can land more
    // than 500ms apart even when taps themselves were rapid, so each
    // one reopened its own window instead of merging.
    cartService.addItem(
      id: id,
      name: name,
      price: price,
      drugstoreName: drugstoreName,
      drugstoreId: drugstoreId,
      category: category,
      rxRequired: rxRequired,
      quantity: quantity,
    );

    _queueAddedToCartFeedback(id: id, name: name, quantity: quantity);
  }

  // Rapid-tapping "Add" used to fire one SnackBar per tap, so they piled
  // up faster than each could animate out and the message visibly
  // spammed. This coalesces every tap on the same item within a short
  // window into a single, updated toast instead:
  //  - Hick's Law: the user is choosing "add more" repeatedly, not
  //    making N distinct decisions, so they should see one updated
  //    result, not N separate confirmations to read.
  //  - Miller's Law: only one chunk of feedback is ever on screen, so
  //    there's nothing to queue up and mentally sort through.
  //  - Fitts's Law: clearing any pending SnackBar before showing the
  //    new one keeps the notification a single stationary target the
  //    eye can find in the same spot, instead of a shifting stack.
  void _queueAddedToCartFeedback({
    required String id,
    required String name,
    required int quantity,
  }) {
    if (_addFeedbackItemId == id) {
      _addFeedbackTotalQty += quantity;
    } else {
      _addFeedbackItemId = id;
      _addFeedbackTotalQty = quantity;
    }

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
            _addFeedbackTotalQty > 1
                ? 'Added $_addFeedbackTotalQty $name to cart'
                : 'Added $name to cart',
          ),
        ),
      );
      _addFeedbackItemId = null;
      _addFeedbackTotalQty = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final storeName = _storeMeta?['drugstoreName'] ?? 'Store';
    final branch = _storeMeta?['branch'] ?? '';
    final openNow = _storeMeta?['openNow'] == true;
    final hours = _storeMeta?['hours'] ?? '';
    final phone = _storeMeta?['phone'] ?? 'N/A';
    final fb = _storeMeta?['facebook'] ?? 'N/A';
    final distance = _storeMeta?['distance'] ?? '';

    return Scaffold(
      appBar: AppBar(
        title: Text('$storeName ${branch.isNotEmpty ? '– $branch' : ''}'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name + open status read as one unit instead of two
                  // separate lines the eye has to reconnect.
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          '$storeName${branch.isNotEmpty ? ' — $branch' : ''}',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: openNow
                              ? Colors.green.shade100
                              : Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          openNow ? 'Open now' : 'Closed',
                          style: TextStyle(
                            color: openNow
                                ? Colors.green.shade700
                                : Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),

                  // Distance and hours merged into one chunk (Miller's
                  // Law) instead of two rows fighting for attention.
                  Text(
                    [
                      if (distance.toString().isNotEmpty) distance.toString(),
                      if (hours.toString().isNotEmpty)
                        'Hours ${hours.toString()}',
                    ].join('  ·  '),
                    style: const TextStyle(color: Colors.grey, fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),

                  // Contact becomes two tappable actions instead of a
                  // card of text to read: fewer things to parse (Hick's
                  // Law), bigger targets side by side (Fitts's Law).
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: phone == 'N/A'
                              ? null
                              : () => _launchPhone(phone.toString()),
                          icon: const Icon(Icons.call, size: 18),
                          label: const Text('Call'),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: fb == 'N/A'
                              ? null
                              : () => _launchUrl(fb.toString()),
                          icon: const Icon(Icons.facebook, size: 18),
                          label: const Text('Message'),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search in this store...',
                      prefixIcon: const Icon(Icons.search),
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onChanged: _onSearchChanged,
                  ),
                ],
              ),
            ),

            // Categories bar. Chips get uniform 44px height and generous
            // horizontal padding so each one is easy to hit without
            // clipping a neighbor (Fitts's Law), and the list stays short
            // enough to scan in one glance (Hick's Law).
            SizedBox(
              height: 44,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                itemCount: _categories.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final selected = i == _selectedCategory;
                  return ChoiceChip(
                    label: Text(_categories[i]),
                    selected: selected,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    onSelected: (_) {
                      setState(() => _selectedCategory = i);
                      _fetchInventory(
                        query: _searchController.text,
                        category: selected ? null : _categories[i],
                      );
                    },
                    selectedColor: Colors.green,
                    backgroundColor: Colors.white,
                    labelStyle: TextStyle(
                      color: selected ? Colors.white : Colors.black87,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 8),

            // Inventory list
            Expanded(
              child: _isLoading
                  ? ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: 5,
                      separatorBuilder: (context, index) => const SizedBox(height: 12),
                      itemBuilder: (context, index) => Shimmer.fromColors(
                        baseColor: Colors.grey[300]!,
                        highlightColor: Colors.grey[100]!,
                        child: Container(
                          height: 120,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    )
                  : _inventory.isEmpty
                  ? const Center(child: Text('No items found in this store.'))
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _inventory.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final item = _inventory[index] as Map<String, dynamic>;
                        final id = item['id']?.toString() ?? index.toString();
                        final name = item['name']?.toString() ?? 'Unknown';
                        final dosage = item['dosage']?.toString() ?? '';
                        final price = item['price']?.toString() ?? 'N/A';
                        final stock = (item['stockCount'] is int)
                            ? item['stockCount'] as int
                            : int.tryParse(
                                    item['stockCount']?.toString() ?? '',
                                  ) ??
                                  0;
                        final rx =
                            item['rxRequired'] == true ||
                            item['rxRequired']?.toString() == '1';

                        final qty = _quantities[id] ?? 1;

                        return Card(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                Container(
                                  width: 64,
                                  height: 64,
                                  decoration: BoxDecoration(
                                    color: Colors.green.shade50,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(
                                    Icons.medication,
                                    color: Colors.green,
                                    size: 32,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '$name ${dosage.isNotEmpty ? '• $dosage' : ''}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                        softWrap: true,
                                      ),
                                      const SizedBox(height: 6),
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 4,
                                        crossAxisAlignment:
                                            WrapCrossAlignment.center,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: stock > 0
                                                  ? Colors.green.shade100
                                                  : Colors.grey.shade200,
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: Text(
                                              stock > 0
                                                  ? 'In stock'
                                                  : 'Out of stock',
                                              style: TextStyle(
                                                color: stock > 0
                                                    ? Colors.green.shade700
                                                    : Colors.grey.shade700,
                                              ),
                                            ),
                                          ),
                                          if (rx)
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 8,
                                                    vertical: 4,
                                                  ),
                                              decoration: BoxDecoration(
                                                color: Colors.orange.shade100,
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                              ),
                                              child: const Text(
                                                'Prescription Required',
                                                style: TextStyle(
                                                  color: Colors.orange,
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 12,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Flexible(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        price,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      // Stepper drawn as one bordered pill
                                      // so the minus/plus zones read as a
                                      // single control with a clear edge,
                                      // each half sized to a full 40px tap
                                      // target (Fitts's Law).
                                      Container(
                                        height: 40,
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                            color: Colors.grey.shade300,
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            _StepperButton(
                                              icon: Icons.remove,
                                              onTap: () =>
                                                  _changeQuantity(id, -1),
                                            ),
                                            SizedBox(
                                              width: 32,
                                              child: Text(
                                                qty.toString(),
                                                textAlign: TextAlign.center,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            ),
                                            _StepperButton(
                                              icon: Icons.add,
                                              onTap: () =>
                                                  _changeQuantity(id, 1),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      SizedBox(
                                        width: 128,
                                        height: 40,
                                        child: FilledButton.icon(
                                          onPressed: stock > 0 && qty > 0
                                              ? () => _addToCart(item, qty)
                                              : null,
                                          style: FilledButton.styleFrom(
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                          ),
                                          icon: const Icon(
                                            Icons.add_shopping_cart,
                                            size: 18,
                                          ),
                                          label: const Text(
                                            'Add',
                                            style: TextStyle(fontSize: 13),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
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

// A single half of the quantity stepper. Wrapped in InkWell with an
// explicit 40x40 constraint so the tap zone matches what the eye reads
// as the button, not just the icon glyph inside it (Fitts's Law).
class _StepperButton extends StatelessWidget {
  const _StepperButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(width: 40, height: 40, child: Icon(icon, size: 18)),
      ),
    );
  }
}
