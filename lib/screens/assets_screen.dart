import 'package:flutter/material.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';

class AssetsScreen extends StatefulWidget {
  final String userId;
  const AssetsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  late Future<List<AssetModel>> _assetsFuture;

  @override
  void initState() {
    super.initState();
    _fetchAssets();
  }

  void _fetchAssets() {
    _assetsFuture = AssetService().getAssets(widget.userId);
  }

  Future<void> _deleteAsset(AssetModel asset) async {
    await AssetService().deleteAsset(asset.id!);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Asset "${asset.title}" deleted!'), backgroundColor: Colors.red),
    );
    setState(_fetchAssets);
  }

  void _showAssetDetails(AssetModel asset) async {
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(asset.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Value: ₹${asset.value.toStringAsFixed(0)}"),
            Text("Type: ${asset.assetType}"),
            if (asset.purchaseValue != null)
              Text("Purchase Value: ₹${asset.purchaseValue!.toStringAsFixed(0)}"),
            if (asset.purchaseDate != null)
              Text("Purchase Date: ${asset.purchaseDate!.day}/${asset.purchaseDate!.month}/${asset.purchaseDate!.year}"),
            if (asset.notes != null && asset.notes!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text("Notes: ${asset.notes}"),
              ),
            if (asset.createdAt != null)
              Text("Added: ${asset.createdAt!.day}/${asset.createdAt!.month}/${asset.createdAt!.year}"),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _confirmDeleteAsset(asset);
            },
            child: const Text("Delete", style: TextStyle(color: Colors.red)),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text("Close"),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteAsset(AssetModel asset) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Asset?'),
        content: Text('Are you sure you want to delete "${asset.title}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _deleteAsset(asset);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Your Assets"),
      ),
      body: FutureBuilder<List<AssetModel>>(
        future: _assetsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text("No assets found."));
          }
          final assets = snapshot.data!;
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: assets.length,
            separatorBuilder: (_, __) => const Divider(height: 16),
            itemBuilder: (context, i) {
              final asset = assets[i];
              return Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 3,
                child: ListTile(
                  leading: const Icon(Icons.savings_rounded, color: Colors.teal),
                  title: Text(asset.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Value: ₹${asset.value.toStringAsFixed(0)}"),
                      Text("Type: ${asset.assetType}"),
                      if (asset.purchaseDate != null)
                        Text("Bought: ${asset.purchaseDate!.day}/${asset.purchaseDate!.month}/${asset.purchaseDate!.year}"),
                    ],
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: () => _confirmDeleteAsset(asset),
                  ),
                  onTap: () => _showAssetDetails(asset),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () async {
          final added = await Navigator.pushNamed(context, '/addAsset', arguments: widget.userId);
          if (added == true) setState(_fetchAssets);
        },
      ),
    );
  }
}
