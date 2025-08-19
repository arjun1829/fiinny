import 'package:flutter/material.dart';

class AssetsSummaryCard extends StatelessWidget {
  final String userId;
  final int assetCount;
  final double totalAssets;
  final VoidCallback onAddAsset;

  const AssetsSummaryCard({
    required this.userId,
    required this.assetCount,
    required this.totalAssets,
    required this.onAddAsset,
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(13.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Assets", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.teal[800], fontSize: 16)),
            SizedBox(height: 7),
            Text("₹${totalAssets.toStringAsFixed(0)}", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.green[700])),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("$assetCount items", style: TextStyle(fontSize: 13)),
                IconButton(
                  icon: Icon(Icons.add_circle, color: Colors.teal),
                  tooltip: "Add Asset",
                  onPressed: onAddAsset,
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
