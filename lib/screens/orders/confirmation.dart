import 'package:flutter/material.dart';

import '../../models/order_model.dart';

class OrderConfirmationScreen extends StatefulWidget {
  const OrderConfirmationScreen({
    super.key,
    required this.reference,
    required this.storeName,
    this.stage = OrderStage.placed,
  });

  static const routeName = '/order-confirmation';

  final String reference;
  final String storeName;
  final OrderStage stage;

  @override
  State<OrderConfirmationScreen> createState() =>
      _OrderConfirmationScreenState();
}

class _OrderConfirmationScreenState extends State<OrderConfirmationScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _scale = CurvedAnimation(parent: _controller, curve: Curves.elasticOut);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cancelled = widget.stage == OrderStage.cancelled;
    final (heroIcon, heroColor, heroTitle) = switch (widget.stage) {
      OrderStage.cancelled => (
        Icons.cancel_outlined,
        Colors.red.shade400,
        'Order Cancelled',
      ),
      OrderStage.completed => (
        Icons.check_circle,
        const Color(0xFF4CAF50),
        'Order Completed',
      ),
      _ => (Icons.check_circle, const Color(0xFF4CAF50), 'Order Confirmed!'),
    };

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(title: const Text('Order'), centerTitle: true),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: ScaleTransition(
              scale: _scale,
              child: Icon(heroIcon, color: heroColor, size: 80),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              heroTitle,
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              'Reference: ${widget.reference}',
              style: const TextStyle(color: Colors.grey),
            ),
          ),
          const SizedBox(height: 24),
          if (!cancelled) ...[
            _TimelineCard(stage: widget.stage),
            const SizedBox(height: 16),
          ],
          if (cancelled) ...[_CancelledCard(), const SizedBox(height: 16)],
          if (!cancelled) ...[
            _PickupCard(storeName: widget.storeName),
            const SizedBox(height: 16),
          ],
          _RateAndReorderCard(cancelled: cancelled),
        ],
      ),
    );
  }
}

class _TimelineCard extends StatelessWidget {
  const _TimelineCard({required this.stage});

  final OrderStage stage;

  static const _labels = ['Order Placed', 'Preparing', 'Ready for Pickup'];

  @override
  Widget build(BuildContext context) {
    // completed orders sit visually at the same "Ready" endpoint as an
    // active order that's just arrived there — there's no fourth dot for
    // "picked up", the label context (heroTitle above) already covers that.
    final stageIndex = stage == OrderStage.completed
        ? OrderStage.values.indexOf(OrderStage.ready)
        : OrderStage.values.indexOf(stage);
    final inProgress =
        stage == OrderStage.placed || stage == OrderStage.preparing;

    return Container(
      padding: const EdgeInsets.all(20),
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
        children: [
          Row(
            children: List.generate(_labels.length * 2 - 1, (i) {
              if (i.isEven) {
                final stepIndex = i ~/ 2;
                final reached = stepIndex <= stageIndex;
                return _StepDot(
                  active: reached,
                  current: stepIndex == stageIndex,
                );
              }
              final lineIndex = i ~/ 2;
              final reached = lineIndex < stageIndex;
              return Expanded(
                child: Container(
                  height: 3,
                  color: reached
                      ? const Color(0xFF4CAF50)
                      : Colors.grey.shade300,
                ),
              );
            }),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < _labels.length; i++)
                SizedBox(
                  width: 90,
                  child: Text(
                    _labels[i],
                    textAlign: i == 0
                        ? TextAlign.start
                        : (i == _labels.length - 1
                              ? TextAlign.end
                              : TextAlign.center),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: i == stageIndex
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: i <= stageIndex ? Colors.black87 : Colors.grey,
                    ),
                  ),
                ),
            ],
          ),
          if (inProgress) ...[
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                _CountdownCard(label: 'Hours', value: '01'),
                SizedBox(width: 10),
                _CountdownCard(label: 'Mins', value: '23'),
                SizedBox(width: 10),
                _CountdownCard(label: 'Secs', value: '45'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({required this.active, required this.current});

  final bool active;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final size = current ? 18.0 : 12.0;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? const Color(0xFF4CAF50) : Colors.grey.shade300,
        border: current
            ? Border.all(color: const Color(0xFFA5D6A7), width: 4)
            : null,
      ),
    );
  }
}

class _CountdownCard extends StatelessWidget {
  const _CountdownCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Color(0xFF4CAF50),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(color: Colors.grey, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.storeName});

  final String storeName;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
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
          const Text(
            'Pickup location',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Text(storeName),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.directions),
                  label: const Text('Directions'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF4CAF50),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.call),
                  label: const Text('Call'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CancelledCard extends StatelessWidget {
  const _CancelledCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.red.shade100),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Colors.red.shade400, size: 22),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'This order was cancelled before it was prepared. '
              'You were not charged, and any deposit will be refunded '
              'to your original payment method within 3-5 business days.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

/// Gives the shopper something to do after the order closes out instead
/// of a dead end — a small, low-friction engagement nudge common in top
/// retail apps once a purchase is finished, one way or another.
class _RateAndReorderCard extends StatelessWidget {
  const _RateAndReorderCard({required this.cancelled});

  final bool cancelled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
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
      child: Row(
        children: [
          Icon(
            cancelled ? Icons.refresh : Icons.star_border,
            color: cancelled ? const Color(0xFF4CAF50) : Colors.amber,
            size: 28,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              cancelled
                  ? 'Want to try this order again?'
                  : 'How was your experience with this pharmacy?',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
          TextButton(
            onPressed: () {},
            child: Text(cancelled ? 'Reorder' : 'Rate now'),
          ),
        ],
      ),
    );
  }
}
