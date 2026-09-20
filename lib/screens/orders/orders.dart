import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';

import '../../models/order_model.dart';
import '../../services/cart_service.dart';
import '../../services/order_service.dart';
import 'checkout.dart';
import 'confirmation.dart';

OrderStage _stageFromString(String rawStage) => stageFromString(rawStage);

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  static const routeName = '/orders';

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  int _refreshKey = 0;

  void _onCheckoutComplete() {
    setState(() => _refreshKey++);
    _tabController.animateTo(1);
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartService>();

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(
        title: const Text('Orders'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF4CAF50),
          labelColor: const Color(0xFF4CAF50),
          unselectedLabelColor: Colors.grey,
          tabs: [
            Tab(text: 'Cart (${cart.items.length})'),
            const Tab(text: 'My Orders'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _CartTab(cart: cart, onCheckoutComplete: _onCheckoutComplete),
          _MyOrdersTab(key: ValueKey(_refreshKey)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// CART TAB
// ---------------------------------------------------------------------------

class _CartTab extends StatelessWidget {
  const _CartTab({required this.cart, required this.onCheckoutComplete});

  final CartService cart;
  final VoidCallback onCheckoutComplete;

  @override
  Widget build(BuildContext context) {
    final items = cart.items;

    if (items.isEmpty) {
      return _EmptyState(
        icon: Icons.shopping_bag_outlined,
        title: 'Your cart is empty',
        subtitle: 'Browse nearby pharmacies to add medicines.',
      );
    }

    // Group items by pharmacy, mirroring how TikTok Shop groups a cart
    // by seller — it makes multi-store carts scannable at a glance.
    final Map<String, List<CartItem>> grouped = {};
    for (final item in items) {
      grouped.putIfAbsent(item.drugstoreName, () => []).add(item);
    }

    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 180 + bottomInset),
            children: [
              for (final entry in grouped.entries) ...[
                _StoreGroupHeader(storeName: entry.key),
                const SizedBox(height: 10),
                for (final item in entry.value) ...[
                  _CartItemCard(item: item),
                  const SizedBox(height: 12),
                ],
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
        SafeArea(top: false, child: _CheckoutSummaryBar(cart: cart, onCheckoutComplete: onCheckoutComplete)),
      ],
    );
  }
}

class _StoreGroupHeader extends StatelessWidget {
  const _StoreGroupHeader({required this.storeName});

  final String storeName;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.storefront, size: 18, color: Color(0xFF4CAF50)),
        const SizedBox(width: 8),
        Text(
          storeName,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ],
    );
  }
}

class _CartItemCard extends StatefulWidget {
  const _CartItemCard({required this.item});

  final CartItem item;

  @override
  State<_CartItemCard> createState() => _CartItemCardState();
}

class _CartItemCardState extends State<_CartItemCard> {
  Future<void> _updateQuantity(BuildContext context, int newQuantity) async {
    await context.read<CartService>().updateQuantity(
      widget.item.id,
      newQuantity,
    );
  }

  Future<void> _removeItem(BuildContext context) async {
    await context.read<CartService>().removeItem(widget.item.id);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;

    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => _removeItem(context),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        decoration: BoxDecoration(
          color: Colors.red.shade400,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.medical_services,
                  color: Color(0xFF4CAF50),
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (item.rxRequired)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text(
                              'Rx',
                              style: TextStyle(
                                color: Colors.red,
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        const SizedBox(width: 8),
                        InkWell(
                          onTap: () => _removeItem(context),
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.delete_outline,
                              size: 18,
                              color: Colors.redAccent,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.price,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _QuantityControl(
                          icon: Icons.remove,
                          onTap: item.quantity > 1
                              ? () =>
                                    _updateQuantity(context, item.quantity - 1)
                              : null,
                        ),
                        const SizedBox(width: 10),
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          transitionBuilder: (child, animation) =>
                              ScaleTransition(scale: animation, child: child),
                          child: Text(
                            item.quantity.toString(),
                            key: ValueKey(item.quantity),
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        _QuantityControl(
                          icon: Icons.add,
                          onTap: () =>
                              _updateQuantity(context, item.quantity + 1),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuantityControl extends StatelessWidget {
  const _QuantityControl({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: onTap == null ? Colors.grey.shade200 : Colors.green.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: onTap == null
                ? Colors.grey.shade300
                : const Color(0xFF4CAF50),
          ),
        ),
        child: Icon(
          icon,
          size: 18,
          color: onTap == null ? Colors.grey : const Color(0xFF4CAF50),
        ),
      ),
    );
  }
}

/// Sticky bottom summary + CTA. Kept persistent (rather than requiring a
/// full screen navigation to see the total) so the total price and the
/// primary action are always one tap away, reducing checkout friction.
class _CheckoutSummaryBar extends StatelessWidget {
  const _CheckoutSummaryBar({required this.cart, required this.onCheckoutComplete});

  final CartService cart;
  final VoidCallback onCheckoutComplete;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Estimated total',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
                const SizedBox(height: 2),
                Text(
                  cart.totalPrice,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          FilledButton(
            onPressed: cart.items.isEmpty
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const CheckoutFlowScreen(),
                      ),
                    ).then((_) => onCheckoutComplete());
                  },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF4CAF50),
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('Checkout', style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// MY ORDERS TAB
// ---------------------------------------------------------------------------

enum _OrderFilter { all, active, completed, cancelled }

extension on _OrderFilter {
  String get label => switch (this) {
    _OrderFilter.all => 'All',
    _OrderFilter.active => 'Active',
    _OrderFilter.completed => 'Completed',
    _OrderFilter.cancelled => 'Cancelled',
  };

  bool matches(OrderModel order) => switch (this) {
    _OrderFilter.all => true,
    _OrderFilter.active => order.isActive,
    _OrderFilter.completed => order.parsedStage == OrderStage.completed,
    _OrderFilter.cancelled => order.parsedStage == OrderStage.cancelled,
  };
}

class _MyOrdersTab extends StatefulWidget {
  const _MyOrdersTab({super.key});

  @override
  State<_MyOrdersTab> createState() => _MyOrdersTabState();
}

class _MyOrdersTabState extends State<_MyOrdersTab> {
  _OrderFilter _filter = _OrderFilter.all;
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OrderService>().fetchOrders();
    });
  }

  List<OrderModel> _filterOrders(List<OrderModel> orders) {
    final query = _query.trim().toLowerCase();
    return orders.where((order) {
      if (!_filter.matches(order)) return false;
      if (query.isEmpty) return true;
      return order.storeName.toLowerCase().contains(query) ||
          order.reference.toLowerCase().contains(query) ||
          order.itemSummary.toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final orderService = context.watch<OrderService>();

    if (orderService.isLoading && orderService.orders.isEmpty) {
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: 4,
        separatorBuilder: (context, index) => const SizedBox(height: 16),
        itemBuilder: (context, index) => Shimmer.fromColors(
          baseColor: Colors.grey[300]!,
          highlightColor: Colors.grey[100]!,
          child: Container(
            height: 120,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      );
    }

    if (orderService.error != null && orderService.orders.isEmpty) {
      return RefreshIndicator(
        color: const Color(0xFF4CAF50),
        onRefresh: () => context.read<OrderService>().fetchOrders(),
        child: ListView(
          children: const [
            SizedBox(height: 100),
            _EmptyState(
              icon: Icons.error_outline,
              title: 'Unable to load orders',
              subtitle: 'Please try again later.',
            ),
          ],
        ),
      );
    }

    final orders = orderService.orders;
    if (orders.isEmpty) {
      return RefreshIndicator(
        color: const Color(0xFF4CAF50),
        onRefresh: () => context.read<OrderService>().fetchOrders(),
        child: ListView(
          children: const [
            SizedBox(height: 100),
            _EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No orders yet',
              subtitle: 'Your placed orders will show up here with live status.',
            ),
          ],
        ),
      );
    }

    final filteredOrders = _filterOrders(orders);
    final activeOrders = filteredOrders.where((o) => o.isActive).toList();
    final pastOrders = filteredOrders.where((o) => o.isPast).toList();

    return RefreshIndicator(
      color: const Color(0xFF4CAF50),
      onRefresh: () => context.read<OrderService>().fetchOrders(),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                hintText: 'Search by pharmacy or order number',
                hintStyle: const TextStyle(fontSize: 13),
                prefixIcon: const Icon(Icons.search, size: 20),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _OrderFilter.values.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final filter = _OrderFilter.values[index];
                final count = orders
                    .where((order) => filter.matches(order))
                    .length;
                final selected = filter == _filter;
                return ChoiceChip(
                  label: Text('${filter.label} ($count)'),
                  selected: selected,
                  onSelected: (_) => setState(() => _filter = filter),
                  selectedColor: const Color(0xFF4CAF50),
                  backgroundColor: Colors.white,
                  labelStyle: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : Colors.black87,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(
                      color: selected
                          ? const Color(0xFF4CAF50)
                          : Colors.grey.shade300,
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: filteredOrders.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 60),
                      _EmptyState(
                        icon: Icons.search_off,
                        title: 'No matching orders',
                        subtitle: 'Try a different filter or search term.',
                      ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    children: [
                      if (activeOrders.isNotEmpty) ...[
                        _SectionHeader(
                          title: 'Active Orders',
                          count: activeOrders.length,
                          icon: Icons.timelapse,
                          color: const Color(0xFF4CAF50),
                        ),
                        const SizedBox(height: 6),
                        for (final order in activeOrders) ...[
                          _OrderCard(order: order),
                          const SizedBox(height: 14),
                        ],
                      ],
                      if (pastOrders.isNotEmpty) ...[
                        _SectionHeader(
                          title: 'Past Orders',
                          count: pastOrders.length,
                          icon: Icons.history,
                          color: Colors.blueGrey,
                        ),
                        const SizedBox(height: 6),
                        for (final order in pastOrders) ...[
                          _OrderCard(order: order),
                          const SizedBox(height: 14),
                        ],
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.count,
    required this.icon,
    required this.color,
  });

  final String title;
  final int count;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Text(
            '$title ($count)',
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final OrderModel order;

  void _openDetail(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OrderConfirmationScreen(
          reference: order.reference,
          storeName: order.storeName,
          stage: _stageFromString(order.stage),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orderStage = _stageFromString(order.stage);
    final cancelled = orderStage == OrderStage.cancelled;

    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => _openDetail(context),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.storefront, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    order.storeName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _StatusChip(stage: orderStage),
              ],
            ),
            const SizedBox(height: 12),
            Opacity(
              opacity: cancelled ? 0.5 : 1,
              child: Row(
                children: [
                  _ItemThumbnailStack(count: order.itemCount),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.itemSummary,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, height: 1.3),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${order.reference} · ${order.placedOn}',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  order.total,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                _OrderCardActions(
                  order: order,
                  orderStage: orderStage,
                  onTrack: () => _openDetail(context),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Small grid of item "thumbnails" — since the catalog doesn't have
/// product photography, a filled icon tile stands in, echoing the way
/// TikTok Shop / Shopee lead each order card with a product image
/// instead of pure text.
class _ItemThumbnailStack extends StatelessWidget {
  const _ItemThumbnailStack({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final tileCount = count > 3 ? 2 : (count < 1 ? 1 : count);
    final overflow = count > 3 ? count - 2 : null;

    return SizedBox(
      width: 56,
      height: 56,
      child: Stack(
        children: [
          for (var i = tileCount - 1; i >= 0; i--)
            Positioned(
              left: i * 6.0,
              top: i * 6.0,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: overflow != null && i == tileCount - 1
                    ? Center(
                        child: Text(
                          '+$overflow',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF4CAF50),
                          ),
                        ),
                      )
                    : const Icon(
                        Icons.medical_services,
                        size: 16,
                        color: Color(0xFF4CAF50),
                      ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The action row is the other piece TikTok Shop-style order tabs get
/// right that a generic list doesn't: the button changes with the
/// order's actual state instead of always saying "Track order".
class _OrderCardActions extends StatelessWidget {
  const _OrderCardActions({
    required this.order,
    required this.orderStage,
    required this.onTrack,
  });

  final OrderModel order;
  final OrderStage orderStage;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    return switch (orderStage) {
      OrderStage.placed || OrderStage.preparing =>
        _PrimaryPill(label: 'Track Order', onTap: onTrack),
      OrderStage.ready =>
        _PrimaryPill(label: 'Get Directions', onTap: onTrack),
      OrderStage.completed => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _TextPill(label: 'Rate', onTap: onTrack),
            const SizedBox(width: 4),
            _PrimaryPill(label: 'Buy Again', onTap: onTrack),
          ],
        ),
      OrderStage.cancelled =>
        _OutlinedPill(label: 'Reorder', onTap: onTrack),
    };
  }
}

class _PrimaryPill extends StatelessWidget {
  const _PrimaryPill({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF4CAF50),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12.5)),
    );
  }
}

class _OutlinedPill extends StatelessWidget {
  const _OutlinedPill({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12.5)),
    );
  }
}

class _TextPill extends StatelessWidget {
  const _TextPill({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        foregroundColor: Colors.grey.shade700,
      ),
      child: Text(label, style: const TextStyle(fontSize: 12.5)),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.stage});

  final OrderStage stage;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (stage) {
      OrderStage.placed => ('Order Placed', Colors.blueGrey),
      OrderStage.preparing => ('Preparing', Colors.orange),
      OrderStage.ready => ('Ready for Pickup', const Color(0xFF4CAF50)),
      OrderStage.completed => ('Completed', Colors.blue),
      OrderStage.cancelled => ('Cancelled', Colors.red),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 11,
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
