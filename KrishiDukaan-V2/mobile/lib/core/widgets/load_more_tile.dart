import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../data/paged_feed.dart';

/// "Load more" at the end of a list backed by a [PagedFeed]. Shows nothing
/// when the feed has no older items.
class LoadMoreTile extends StatefulWidget {
  final PagedFeed<dynamic> feed;
  final String label;
  const LoadMoreTile({super.key, required this.feed, this.label = 'Load more'});

  @override
  State<LoadMoreTile> createState() => _LoadMoreTileState();
}

class _LoadMoreTileState extends State<LoadMoreTile> {
  bool _loading = false;

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      await widget.feed.loadMore();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.feed.hasMore) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: _loading
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : OutlinedButton(
                onPressed: _load,
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.primary),
                child: Text(widget.label),
              ),
      ),
    );
  }
}
