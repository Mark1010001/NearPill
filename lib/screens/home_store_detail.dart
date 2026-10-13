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
  const StoreDetailScreen({super.key, this.client});

  final http.Client? client;

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

  late final http.Client _client = widget.client ?? http.Client();
  String? _loadError;

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
      _fetchInventory();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _addFeedbackDebounce?.cancel();
    _searchController.dispose();
    _client.close();
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

  Future<void> _fetchInventory({String? query, String? category}) async {
    setState(() {
      _isLoading = true;
      _loadError = null;
    });
    try {
      final uri = Uri.parse('$backendUrl/api/stores/$_storeId/inventory');
      final response = await _client
          .get(uri)
          .timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) {
        throw const FormatException('Inventory unavailable');
      }
      final data = jsonDecode(response.body);
      if (data is! Map || data['inventory'] is! List || data['store'] is! Map) {
        throw const FormatException('Invalid inventory response');
      }
      if ((data['inventory'] as List).any((item) => item is! Map)) {
        throw const FormatException('Invalid inventory item');
      }
      final inventory = (data['inventory'] as List).where((item) {
        final matchesCategory =
            category == null ||
            category == 'All' ||
            item['medicineCategory'] == category;
        final search = (query ?? '').trim().toLowerCase();
        final matchesQuery =
            search.isEmpty ||
            '${item['name']} ${item['genericName']}'.toLowerCase().contains(
              search,
            );
        return matchesCategory && matchesQuery;
      }).toList();
      if (!mounted) return;
      setState(() {
        _storeMeta = Map<String, dynamic>.from(data['store'] as Map);
        _inventory = inventory;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _inventory = [];
        _storeMeta = null;
        _loadError = 'Unable to load pharmacy details and stock. Please retry.';
      });
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
        _storeMeta?['store_name']?.toString() ??
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
    final storeName = _storeMeta?['store_name'] ?? 'Store';
    final branch = _storeMeta?['branch'] ?? '';
    final openNow = _storeMeta?['openNow'];
    final hours = _storeMeta?['operating_hours'] ?? '';
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
                          color: openNow == true
                              ? Colors.green.shade100
                              : Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          openNow == null
                              ? 'Hours not confirmed'
                              : openNow == true
                              ? 'Open now'
                              : 'Closed',
                          style: TextStyle(
                            color: openNow == true
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
                      labelText: 'Search in this store',
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
                        category: i == 0 ? null : _categories[i],
                      );
                    },
                    selectedColor: const Color(0xFF2E7D32),
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
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 12),
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
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_loadError ?? 'No items found in this store.'),
                          if (_loadError != null)
                            TextButton(
                              onPressed: _fetchInventory,
                              child: const Text('Retry'),
                            ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _inventory.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final item = _inventory[index] as Map<String, dynamic>;
                        final id = item['id']?.toString() ?? index.toString();
                        final name = item['name']?.toString() ?? 'Unknown';
                        final dosage = item['category']?.toString() ?? '';
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
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            icon,
            size: 18,
            semanticLabel: icon == Icons.add ? 'Increase quantity' : 'Decrease quantity',
          ),
        ),
      ),
    );
  }
}
