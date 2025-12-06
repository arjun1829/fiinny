// lib/screens/assets_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_shell.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';
import '../widgets/asset_card.dart'; // New Card Import
import '../themes/tokens.dart';

class AssetsScreen extends StatefulWidget {
  final String userId;
  const AssetsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  late Future<List<AssetModel>> _assetsFuture;

  // UI/state
  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  // Category filter
  String _segment = 'all'; 

  @override
  void initState() {
    super.initState();
    _fetchAssets();
  }

  void _fetchAssets() {
    setState(() {
       _assetsFuture = AssetService().getAssets(widget.userId);
    });
  }

  // ----------------------------- Helpers --------------------------------

  List<AssetModel> _filterBySegment(List<AssetModel> all) {
    if (_segment == 'all') return all;
    return all.where((a) => (a.assetType.toLowerCase() == _segment)).toList();
  }

  Map<String, double> _breakdownByType(List<AssetModel> list) {
    final Map<String, double> m = {};
    for (final a in list) {
      final key = a.assetType.toLowerCase();
      m[key] = (m[key] ?? 0) + a.value;
    }
     // Sort by value descending
    var sortedEntries = m.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sortedEntries);
  }

  Future<void> _confirmDelete(AssetModel asset) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Asset?'),
        content: Text('Are you sure you want to delete "${asset.title}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await AssetService().deleteAsset(asset.id!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Asset "${asset.title}" deleted!'), backgroundColor: Colors.red),
      );
      _fetchAssets();
    }
  }

  // ------------------------------ UI -----------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50], // Clean background
      floatingActionButton: FloatingActionButton.extended(
          onPressed: () async {
            final added = await Navigator.pushNamed(context, '/addAsset', arguments: widget.userId);
            if (added == true) _fetchAssets();
          },
          backgroundColor: Colors.black, // Modern FAB
          icon: const Icon(Icons.add_rounded, color: Colors.white),
          label: const Text("Add Asset", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: FutureBuilder<List<AssetModel>>(
          future: _assetsFuture,
          builder: (context, snap) {
            final bottomInset = context.adsBottomPadding(extra: 80); // Extra for FAB

            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            
            final assets = snap.data ?? [];
            final total = assets.fold<double>(0.0, (s, a) => s + a.value);
            final breakdown = _breakdownByType(assets);
            final filtered = _filterBySegment(assets);

            return RefreshIndicator(
              onRefresh: () async {
                _fetchAssets();
                await Future.delayed(const Duration(milliseconds: 300));
              },
              child: CustomScrollView(
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  // App Bar / Header
                   SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(24, 60, 24, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Your Portfolio",
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _inr.format(total),
                            style: const TextStyle(
                              fontSize: 36,
                              fontWeight: FontWeight.w900,
                              color: Colors.black87,
                              letterSpacing: -1.0,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Chart/Summary Block (Optional - Keep simple for now, maybe just top 3 cats)
                  if (assets.isNotEmpty)
                    SliverToBoxAdapter(
                        child: Container(
                            height: 40,
                            margin: const EdgeInsets.only(bottom: 24),
                            child: ListView.separated(
                                padding: const EdgeInsets.symmetric(horizontal: 24),
                                scrollDirection: Axis.horizontal,
                                itemCount: breakdown.length > 5 ? 6 : breakdown.length, 
                                separatorBuilder: (_,__) => const SizedBox(width: 8),
                                itemBuilder: (context, index) {
                                    final entry = breakdown.entries.elementAt(index);
                                    // Map back to filter keys roughly or just use display
                                    // For now let's just show top stats as chips
                                    final pct = (entry.value / total * 100).toStringAsFixed(0);
                                    return Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        decoration: BoxDecoration(
                                            color: Colors.white,
                                            borderRadius: BorderRadius.circular(20),
                                            border: Border.all(color: Colors.grey.shade200)
                                        ),
                                        alignment: Alignment.center,
                                        child: Row(
                                            children: [
                                                // Dot
                                                Container(width: 8, height: 8, decoration: BoxDecoration(color: _colorByKey(entry.key), shape: BoxShape.circle)),
                                                const SizedBox(width: 6),
                                                Text(_labelByKey(entry.key), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                                const SizedBox(width: 4),
                                                Text("$pct%", style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
                                            ]
                                        )
                                    );
                                }
                            ),
                        ),
                    ),

                    // Filter Chips (Replacing Segments)
                    SliverToBoxAdapter(
                        child: SizedBox(
                            height: 50,
                             child: ListView(
                                scrollDirection: Axis.horizontal,
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                                children: [
                                    _FilterChip(label: 'All', selected: _segment == 'all', onTap: () => setState(() => _segment = 'all')),
                                    const SizedBox(width: 8),
                                    _FilterChip(label: 'Stocks', selected: _segment == 'equity', onTap: () => setState(() => _segment = 'equity')),
                                    const SizedBox(width: 8),
                                    _FilterChip(label: 'MF/ETF', selected: _segment == 'mf_etf', onTap: () => setState(() => _segment = 'mf_etf')),
                                    const SizedBox(width: 8),
                                    _FilterChip(label: 'Gold', selected: _segment == 'gold', onTap: () => setState(() => _segment = 'gold')),
                                    const SizedBox(width: 8),
                                    _FilterChip(label: 'FD', selected: _segment == 'fixed_deposit', onTap: () => setState(() => _segment = 'fixed_deposit')),
                                    const SizedBox(width: 8),
                                    _FilterChip(label: 'Real Estate', selected: _segment == 'real_estate', onTap: () => setState(() => _segment = 'real_estate')),
                                     const SizedBox(width: 8),
                                    _FilterChip(label: 'Crypto', selected: _segment == 'crypto', onTap: () => setState(() => _segment = 'crypto')),
                                     const SizedBox(width: 8),
                                    _FilterChip(label: 'Bank', selected: _segment == 'cash_bank', onTap: () => setState(() => _segment = 'cash_bank')),
                                ],
                             ),
                        ),
                    ),

                     const SliverPadding(padding: EdgeInsets.only(top: 16)),

                  // List
                  if (filtered.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.pie_chart_outline_rounded, size: 60, color: Colors.grey),
                            const SizedBox(height: 12),
                            const Text("No assets found.", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey)),
                            if (assets.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 16.0),
                                  child: TextButton(onPressed: _fetchAssets, child: const Text("Refresh")),
                                )
                          ],
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(24, 0, 24, bottomInset),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            final asset = filtered[index];
                            return AssetCard(
                                asset: asset,
                                currency: _inr,
                                onTap: () => _showEditMenu(asset),
                                onDelete: () => _confirmDelete(asset),
                            );
                          },
                          childCount: filtered.length,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
    );
  }

  void _showEditMenu(AssetModel asset) {
      showModalBottomSheet(
          context: context,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          builder: (context) => SafeArea(
              child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                      ListTile(
                          leading: const Icon(Icons.edit_rounded),
                          title: const Text("Edit Asset"),
                          onTap: () async {
                              Navigator.pop(context);
                              final edited = await Navigator.pushNamed(context, '/editAsset', arguments: asset.id);
                              if (edited == true) _fetchAssets();
                          },
                      ),
                       ListTile(
                          leading: const Icon(Icons.delete_rounded, color: Colors.red),
                          title: const Text("Delete Asset", style: TextStyle(color: Colors.red)),
                          onTap: () {
                              Navigator.pop(context);
                              _confirmDelete(asset);
                          },
                      ),
                  ],
              )
          )
      );
  }
  
    String _labelByKey(String key) {
    switch (key) {
      case 'equity': return 'Equity';
      case 'mf_etf': return 'MF/ETF';
      case 'fixed_deposit': return 'FD';
      case 'real_estate': return 'Real Estate';
      case 'gold': return 'Gold';
      case 'bonds': return 'Bonds';
      case 'crypto': return 'Crypto';
      case 'cash_bank': return 'Bank';
      case 'retirement': return 'Retirement';
      default: return 'Other';
    }
  }

  Color _colorByKey(String key) {
    switch (key) {
      case 'equity': return const Color(0xFF22C55E);
      case 'mf_etf': return const Color(0xFF06B6D4);
      case 'fixed_deposit': return const Color(0xFFF59E0B);
      case 'real_estate': return const Color(0xFF8B5CF6);
      case 'gold': return const Color(0xFFEAB308);
      case 'bonds': return const Color(0xFF0EA5E9);
      case 'crypto': return const Color(0xFFEF4444);
      case 'cash_bank': return const Color(0xFF10B981);
      default: return const Color(0xFF94A3B8);
    }
  }
}

class _FilterChip extends StatelessWidget {
    final String label;
    final bool selected;
    final VoidCallback onTap;

    const _FilterChip({required this.label, required this.selected, required this.onTap});

    @override
    Widget build(BuildContext context) {
        return GestureDetector(
            onTap: onTap,
            child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                    color: selected ? Colors.black : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: selected ? Colors.black : Colors.grey.shade300)
                ),
                alignment: Alignment.center,
                child: Text(
                    label,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: selected ? Colors.white : Colors.black87
                    )
                )
            ),
        );
    }
}
