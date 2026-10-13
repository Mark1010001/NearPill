import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PoliciesScreen extends StatefulWidget {
  const PoliciesScreen({super.key});

  @override
  State<PoliciesScreen> createState() => _PoliciesScreenState();
}

class _PoliciesScreenState extends State<PoliciesScreen> {
  late final Future<String> _policies = rootBundle.loadString(
    'web/policies.json',
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Privacy and service information')),
    body: FutureBuilder<String>(
      future: _policies,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: SelectableText(
              'Service information could not be loaded. Contact nearpillemail@gmail.com for a copy.',
            ),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final policies = jsonDecode(snapshot.data!) as Map<String, dynamic>;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            SelectableText(
              '${policies['status']}\nUpdated ${policies['updated']}.',
            ),
            for (final section in policies['sections'] as List) ...[
              const SizedBox(height: 24),
              Semantics(
                header: true,
                child: Text(
                  section['title'] as String,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const SizedBox(height: 12),
              SelectableText(section['body'] as String),
            ],
          ],
        );
      },
    ),
  );
}
