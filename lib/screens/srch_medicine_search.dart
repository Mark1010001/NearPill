import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../services/cart_service.dart';
import 'orders/orders.dart';
import 'home_store_detail.dart';

class MedicineSearchScreen extends StatefulWidget {
  const MedicineSearchScreen({super.key});

  static const routeName = '/search';

  @override
  State<MedicineSearchScreen> createState() => _MedicineSearchScreenState();
}

class _MedicineSearchScreenState extends State<MedicineSearchScreen> {
  final List<String> _filters = ['All', 'Price', 'Distance', 'Available'];
  int _selectedFilter = 0;
  final TextEditingController _searchController = TextEditingController();
  List<dynamic> _medicines = [];
  bool _isLoading = false;
  Timer? _debounce;

  // Coalesces rapid repeat taps of the cart icon on the same item into
  // one toast instead of stacking a SnackBar per tap.
  Timer? _addFeedbackDebounce;
  String? _addFeedbackItemId;
  int _addFeedbackTotalQty = 0;

  static String get backendUrl => ApiConfig.baseUrl;

  @override
  void initState() {
    super.initState();
    _fetchMedicines('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _addFeedbackDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchMedicines(String query) async {
    setState(() {
      _isLoading = true;
    });

    final uri = Uri.parse(
      '$backendUrl/api/medicines',
    ).replace(queryParameters: query.isNotEmpty ? {'search': query} : null);

    try {
      final response = await http.get(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        if (body is List) {
          setState(() {
            _medicines = body;
          });
        } else {
          _showSnackBar('Unexpected response from server.');
        }
      } else {
        _showSnackBar('Server error: ${response.statusCode}');
      }
    } on TimeoutException {
      _showSnackBar('Request timed out. Please try again.');
    } catch (error) {
      _showSnackBar('Unable to reach backend. Check your connection.');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _fetchMedicines(query);
    });
  }

  void _showSnackBar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  // Same fix as the store detail screen's Add button: merges rapid
  // repeat taps on the same item's cart icon into one toast instead of
  // stacking a SnackBar per tap. Triggered at tap-time, not after the
  // cart update completes, so it tracks finger taps rather than
  // network/state completion timing.
  void _queueAddedToCartFeedback({required String id, required int qty}) {
    if (_addFeedbackItemId == id) {
      _addFeedbackTotalQty += qty;
    } else {
      _addFeedbackItemId = id;
      _addFeedbackTotalQty = qty;
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
                ? 'Added to cart (×$_addFeedbackTotalQty).'
                : 'Added to cart.',
          ),
        ),
      );
      _addFeedbackItemId = null;
      _addFeedbackTotalQty = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search Medicines')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_medicines.length} Results found',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search medicines, generics, or brands',
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
                onChanged: _onSearchChanged,
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final selected = index == _selectedFilter;
                    return ChoiceChip(
                      label: Text(_filters[index]),
                      selected: selected,
                      onSelected: (_) =>
                          setState(() => _selectedFilter = index),
                      selectedColor: const Color(0xFF2E7D32),
                      labelStyle: TextStyle(
                        color: selected ? Colors.white : Colors.black87,
                      ),
                      backgroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                    );
                  },
                ),
              ),
              const SizedBox(height: 20),
              if (_isLoading)
                const Expanded(
                  child: Center(child: CircularProgressIndicator()),
                )
              else
                Expanded(
                  child: _medicines.isEmpty
                      ? const Center(
                          child: Text(
                            'No medicines found.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _medicines.length,
                          separatorBuilder: (context, index) =>
                              const SizedBox(height: 16),
                          itemBuilder: (context, index) {
                            final item =
                                _medicines[index] as Map<String, dynamic>;
                            final name = item['name']?.toString() ?? 'Unknown';
                            final price = item['price']?.toString() ?? 'N/A';
                            final drugstoreName =
                                item['drugstoreName']?.toString() ?? '';
                            final distance = item['distance']?.toString() ?? '';
                            final isRx =
                                item['rxRequired'] == true ||
                                item['rxRequired']?.toString() == '1';

                            return GestureDetector(
                              onTap: () {
                                final storeId = item['drugstoreId']?.toString();
                                if (storeId != null && storeId.isNotEmpty) {
                                  Navigator.of(context).pushNamed(
                                    StoreDetailScreen.routeName,
                                    arguments: storeId,
                                  );
                                }
                              },
                              child: Card(
                                child: SizedBox(
                                  height: 120,
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 78,
                                          decoration: BoxDecoration(
                                            color: Colors.green.shade50,
                                            borderRadius: BorderRadius.circular(
                                              20,
                                            ),
                                          ),
                                          child: const Center(
                                            child: Icon(
                                              Icons.medical_services,
                                              size: 36,
                                              color: Color(0xFF2E7D32),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            mainAxisAlignment:
                                                MainAxisAlignment.center,
                                            children: [
                                              Text(
                                                name,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 16,
                                                ),
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                drugstoreName,
                                                style: const TextStyle(
                                                  color: Colors.grey,
                                                ),
                                              ),
                                              const SizedBox(height: 6),
                                              Text(
                                                distance,
                                                style: const TextStyle(
                                                  color: Colors.grey,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Column(
                                          mainAxisAlignment:
                                              MainAxisAlignment.spaceBetween,
                                          crossAxisAlignment:
                                              CrossAxisAlignment.end,
                                          children: [
                                            Text(
                                              price,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 16,
                                              ),
                                            ),
                                            Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                if (isRx)
                                                  Container(
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                          horizontal: 8,
                                                          vertical: 4,
                                                        ),
                                                    decoration: BoxDecoration(
                                                      color:
                                                          Colors.red.shade100,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            12,
                                                          ),
                                                    ),
                                                    child: const Text(
                                                      'Rx',
                                                      style: TextStyle(
                                                        color: Colors.red,
                                                        fontWeight:
                                                            FontWeight.bold,
                                                        fontSize: 12,
                                                      ),
                                                    ),
                                                  ),
                                                const SizedBox(width: 8),
                                                IconButton(
                                                  onPressed: () {
                                                    final id =
                                                        item['id']
                                                            ?.toString() ??
                                                        '';
                                                    context
                                                        .read<CartService>()
                                                        .addItem(
                                                          id: id,
                                                          name: name,
                                                          price: price,
                                                          drugstoreName:
                                                              drugstoreName,
                                                          drugstoreId:
                                                              item['drugstoreId']
                                                                  ?.toString() ??
                                                              '',
                                                          category:
                                                              item['category']
                                                                  ?.toString() ??
                                                              'General',
                                                          rxRequired: isRx,
                                                          quantity: 1,
                                                        );
                                                    _queueAddedToCartFeedback(
                                                      id: id,
                                                      qty: 1,
                                                    );
                                                  },
                                                  icon: const Icon(
                                                    Icons.add_shopping_cart,
                                                    size: 20,
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                ElevatedButton(
                                                  onPressed: () {
                                                    Navigator.of(
                                                      context,
                                                    ).pushNamed(
                                                      OrdersScreen.routeName,
                                                    );
                                                  },
                                                  style: ElevatedButton.styleFrom(
                                                    backgroundColor:
                                                        Colors.green,
                                                    shape: RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            16,
                                                          ),
                                                    ),
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                          horizontal: 16,
                                                          vertical: 12,
                                                        ),
                                                  ),
                                                  child: const Text('Buy'),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
