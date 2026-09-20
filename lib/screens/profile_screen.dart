import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/order_model.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/cart_service.dart';
import '../services/order_service.dart';
import '../utils/formatters.dart';
import 'package:shimmer/shimmer.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.onLogout});

  final VoidCallback? onLogout;

  static const routeName = '/profile';

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  // Personal Info State
  String _fullName = '';
  String _phone = '';
  String _birthdate = '';
  String _email = '';
  final bool _isVerified = true;
  bool _isLoadingUser = true;

  @override
  void initState() {
    super.initState();
    _fetchUserData();
  }

  Future<void> _fetchUserData() async {
    try {
      final authService = context.read<AuthService>();
      final UserModel user = await authService.getMe();

      if (!mounted) return;
      context.read<OrderService>().fetchOrders();

      if (mounted) {
        setState(() {
          _fullName = user.fullName.isNotEmpty ? user.fullName : _fullName;
          _email = user.email.isNotEmpty ? user.email : _email;
          if (user.phone != null && user.phone!.isNotEmpty) {
            _phone = user.phone!;
          }
          if (user.birthDate != null && user.birthDate!.isNotEmpty) {
            _birthdate = user.birthDate!;
          }
          _isLoadingUser = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLoadingUser = false;
        });
      }
    }
  }

  void _showEditProfileDialog() {
    final nameController = TextEditingController(text: _fullName);
    final phoneController = TextEditingController(text: _phone);
    final birthdateController = TextEditingController(text: _birthdate);
    final formKey = GlobalKey<FormState>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            top: 24,
            left: 24,
            right: 24,
          ),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Edit Personal Info',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const Text(
                  'Used to verify doctor prescriptions and contact you for deliveries.',
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Full Name',
                    prefixIcon: Icon(Icons.person),
                  ),
                  validator: (val) =>
                      val == null || val.trim().isEmpty ? 'Enter name' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: phoneController,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(11),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Phone Number',
                    hintText: 'e.g. 09171234567',
                    prefixIcon: Icon(Icons.phone),
                  ),
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) return 'Enter phone';
                    if (val.length < 10) return 'Invalid phone length';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: birthdateController,
                  keyboardType: TextInputType.datetime,
                  inputFormatters: [DateTextFormatter()],
                  decoration: const InputDecoration(
                    labelText: 'Birthdate (MM/DD/YYYY)',
                    hintText: 'MM/DD/YYYY',
                    prefixIcon: Icon(Icons.cake),
                  ),
                  validator: validateBirthdate,
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (formKey.currentState!.validate()) {
                        final authService = context.read<AuthService>();
                        try {
                          await authService.updateProfile(
                            phone: phoneController.text.trim(),
                            birthDate: birthdateController.text.trim(),
                          );
                          if (!mounted) return;
                          setState(() {
                            _fullName = nameController.text.trim();
                            _phone = phoneController.text.trim();
                            _birthdate = birthdateController.text.trim();
                          });
                          if (!ctx.mounted) return;
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Identity info updated successfully.',
                              ),
                              backgroundColor: Color(0xFF4CAF50),
                            ),
                          );
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Failed to update profile.'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      }
                    },
                    child: const Text(
                      'Save Changes',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showCameraRxUploadModal() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Rx Upload will be available soon.'),
        backgroundColor: Color(0xFF4CAF50),
      ),
    );

    /* 
    // Uncomment the code below to enable the "Who is this for?" flow
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Who is this prescription for?',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFE8F5E9),
                  child: Icon(Icons.person, color: Color(0xFF4CAF50)),
                ),
                title: Text('Myself ($_fullName)'),
                subtitle: const Text('Uses your profile details'),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Uploading Rx for $_fullName...'),
                      backgroundColor: const Color(0xFF4CAF50),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFE3F2FD),
                  child: Icon(Icons.child_care, color: Colors.blue),
                ),
                title: const Text('Add a Dependent / Child'),
                subtitle: const Text('Pharmacist will verify patient details from the Rx image'),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Uploading Rx for Dependent... Pharmacist will verify details.'),
                      backgroundColor: Colors.blue,
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
    */
  }

  Future<void> _handleReorder(OrderModel order) async {
    final cartService = context.read<CartService>();
    final items = order.items;

    for (final item in items) {
      if (item is Map) {
        await cartService.addItem(
          id: item['id']?.toString() ?? '',
          name: item['name']?.toString() ?? '',
          price: item['price']?.toString() ?? '',
          drugstoreName: order.storeName,
          drugstoreId: item['drugstoreId']?.toString() ?? '',
          category: item['category']?.toString() ?? '',
          rxRequired: item['rxRequired'] == true,
          quantity: (item['quantity'] as int?) ?? 1,
        );
      }
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Reordered ${items.length} items from ${order.storeName}! Added to Cart.',
          ),
          backgroundColor: const Color(0xFF4CAF50),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F8),
      appBar: AppBar(
        title: const Text(
          'My Profile',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: false,
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout, color: Colors.grey),
            onPressed: () async {
              final authService = context.read<AuthService>();
              final cartService = context.read<CartService>();

              // Logout should not depend on cart storage succeeding.
              await authService.logout();

              unawaited(cartService.clearCart().catchError((_) {}));

              if (!context.mounted) return;

              if (widget.onLogout != null) {
                widget.onLogout!();
              } else {
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/login', (r) => false);
              }
            },
          ),
        ],
      ),
      body: _isLoadingUser
          ? _buildSkeletonLoader()
          : RefreshIndicator(
              color: const Color(0xFF4CAF50),
              onRefresh: () async {
                await _fetchUserData();
              },
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header Section (Jakob's Law: Standard Header Model)
                    _buildProfileHeader(),
                    const SizedBox(height: 24),

                    // Card 1: Essential Identity & Billing (Law of Proximity)
                    _buildIdentityCard(),
                    const SizedBox(height: 24),

                    // Card 2: Essential Pharmacy Features (Fitts's Law, Hick's Law, Miller's Law)
                    _buildPharmacyFeaturesCard(),
                    const SizedBox(height: 24),

                    // Card 3: Essential Logistics & Help (Law of Proximity & Fitts's Law)
                    _buildLogisticsCard(),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSkeletonLoader() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Shimmer.fromColors(
        baseColor: Colors.grey[300]!,
        highlightColor: Colors.grey[100]!,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Skeleton
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
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
                          Container(
                            height: 20,
                            width: 150,
                            color: Colors.white,
                          ),
                          const SizedBox(height: 8),
                          Container(
                            height: 14,
                            width: 100,
                            color: Colors.white,
                          ),
                          const SizedBox(height: 12),
                          Container(
                            height: 24,
                            width: 120,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Section Title Skeleton
            Row(
              children: [
                Container(height: 24, width: 24, color: Colors.white),
                const SizedBox(width: 12),
                Container(height: 20, width: 180, color: Colors.white),
              ],
            ),
            const SizedBox(height: 16),

            // Card 1 Skeleton
            Container(
              height: 140,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            const SizedBox(height: 24),

            // Card 2 Skeleton
            Container(
              height: 200,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            const SizedBox(height: 24),

            // Card 3 Skeleton
            Container(
              height: 140,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Header Component (Jakob's Law)
  Widget _buildProfileHeader() {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: Colors.green.shade100,
                  child: Text(
                    _fullName.isNotEmpty ? _fullName[0].toUpperCase() : 'U',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                ),
                if (_isVerified)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.verified,
                        size: 20,
                        color: Color(0xFF4CAF50),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _fullName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      if (_isLoadingUser)
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF4CAF50),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _email,
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F5E9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(
                          Icons.shield_outlined,
                          size: 14,
                          color: Color(0xFF4CAF50),
                        ),
                        SizedBox(width: 4),
                        Text(
                          'Verified Rx Patient',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF4CAF50),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Card Container 1: Essential Identity & Billing (Law of Proximity)
  Widget _buildIdentityCard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: const [
                Icon(Icons.badge_outlined, color: Color(0xFF4CAF50), size: 20),
                SizedBox(width: 8),
                Text(
                  'Identity & Verification',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            // Fitts's Law: Accessible Edit Action Button
            IconButton(
              onPressed: _showEditProfileDialog,
              icon: const Icon(Icons.edit_outlined, color: Color(0xFF4CAF50)),
              tooltip: 'Edit Identity Info',
            ),
          ],
        ),
        const SizedBox(height: 8),
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(color: Colors.grey.shade200),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                _buildIdentityTile(
                  icon: Icons.person_outline,
                  label: 'Full Name',
                  value: _fullName,
                ),
                const Divider(height: 24),
                _buildIdentityTile(
                  icon: Icons.phone_outlined,
                  label: 'Phone Number',
                  value: _phone,
                ),
                const Divider(height: 24),
                _buildIdentityTile(
                  icon: Icons.cake_outlined,
                  label: 'Birthdate (for Rx verification)',
                  value: _birthdate,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildIdentityTile({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: Colors.grey.shade100,
          child: Icon(icon, size: 18, color: Colors.grey.shade700),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // Card Container 2: Essential Pharmacy Features (Fitts's & Hick's Law)
  Widget _buildPharmacyFeaturesCard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(
              Icons.medical_services_outlined,
              color: Color(0xFF4CAF50),
              size: 20,
            ),
            SizedBox(width: 8),
            Text(
              'Prescriptions',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Quick Camera Shortcut Hero CTA (Fitts's Law: Large Touch Target)
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF4CAF50), Color(0xFF2E7D32)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [
              BoxShadow(
                color: Color.fromRGBO(76, 175, 80, 0.25),
                blurRadius: 10,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _showCameraRxUploadModal,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: const BoxDecoration(
                        color: Color.fromRGBO(255, 255, 255, 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.camera_alt,
                        color: Colors.white,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'Quick Camera Rx Upload',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Snap doctor\'s slip for prescription verification',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color.fromRGBO(255, 255, 255, 0.85),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.arrow_forward_ios,
                      color: Colors.white,
                      size: 16,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 16),
      ],
    );
  }

  // Card Container 3: Essential Logistics & Order History (Law of Proximity & Fitts's Law)
  Widget _buildLogisticsCard() {
    final orderService = context.watch<OrderService>();
    final allOrders = orderService.orders;
    final activeOrders = allOrders.where((o) => o.isActive).toList();
    final pastOrders = allOrders.where((o) => o.isPast).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: const [
                Icon(
                  Icons.local_shipping_outlined,
                  color: Color(0xFF4CAF50),
                  size: 20,
                ),
                SizedBox(width: 8),
                Text(
                  'Order History',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(color: Colors.grey.shade200),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: allOrders.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 20),
                      child: Text(
                        'No recent orders.',
                        style: TextStyle(color: Colors.grey),
                      ),
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (activeOrders.isNotEmpty) ...[
                        Row(
                          children: [
                            const Icon(
                              Icons.timelapse,
                              size: 16,
                              color: Color(0xFF4CAF50),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Active Orders (${activeOrders.length})',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF4CAF50),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        for (final order in activeOrders) ...[
                          _buildOrderTile(order),
                          if (order != activeOrders.last ||
                              pastOrders.isNotEmpty)
                            const Divider(height: 24),
                        ],
                      ],
                      if (pastOrders.isNotEmpty) ...[
                        Row(
                          children: [
                            const Icon(
                              Icons.history,
                              size: 16,
                              color: Colors.blueGrey,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Past Orders (${pastOrders.length})',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: Colors.blueGrey,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        for (final order in pastOrders) ...[
                          _buildOrderTile(order),
                          if (order != pastOrders.last)
                            const Divider(height: 24),
                        ],
                      ],
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildOrderTile(OrderModel order) {
    final items = order.items;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.shopping_bag_outlined,
                      color: Colors.blue,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.storeName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Order #${order.reference} • ${order.placedOn}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.grey,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              order.total,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Color(0xFF4CAF50),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Text(
                order.itemSummary,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 38,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF4CAF50),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 0,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: items.isEmpty ? null : () => _handleReorder(order),
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text(
                  'Reorder',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
