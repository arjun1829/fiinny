// lib/details/group_detail_route_screen.dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/group_model.dart';
import '../services/group_service.dart';
import 'group_detail_screen.dart';

class GroupDetailRouteScreen extends StatefulWidget {
  final String groupId;
  final String? groupNameHint;

  const GroupDetailRouteScreen({
    Key? key,
    required this.groupId,
    this.groupNameHint,
  }) : super(key: key);

  @override
  State<GroupDetailRouteScreen> createState() => _GroupDetailRouteScreenState();
}

class _GroupDetailRouteScreenState extends State<GroupDetailRouteScreen> {
  late final String _userPhone;
  late final Future<GroupModel?> _groupFuture;

  @override
  void initState() {
    super.initState();
    final user = FirebaseAuth.instance.currentUser;
    _userPhone = user?.phoneNumber ?? user?.uid ?? '';
    _groupFuture = _loadGroup();
  }

  Future<GroupModel?> _loadGroup() async {
    if (_userPhone.isEmpty) return null;
    try {
      return await GroupService().getGroupById(widget.groupId);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_userPhone.isEmpty) {
      return _GroupPlaceholder(
        title: widget.groupNameHint ?? 'Group',
        icon: Icons.lock_outline_rounded,
        message: 'Please sign in again to view this group.',
      );
    }

    return FutureBuilder<GroupModel?>(
      future: _groupFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return _GroupPlaceholder(
            title: widget.groupNameHint ?? 'Group',
            icon: Icons.groups_2_rounded,
            isLoading: true,
          );
        }
        if (snapshot.hasError) {
          return _GroupPlaceholder(
            title: widget.groupNameHint ?? 'Group',
            icon: Icons.error_outline_rounded,
            message: 'Unable to load group right now. Please try again.',
          );
        }

        final group = snapshot.data;
        if (group == null) {
          return _GroupPlaceholder(
            title: widget.groupNameHint ?? 'Group',
            icon: Icons.group_off_rounded,
            message: 'This group was removed or is no longer accessible.',
          );
        }

        return GroupDetailScreen(
          userId: _userPhone,
          group: group,
        );
      },
    );
  }
}

class _GroupPlaceholder extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? message;
  final bool isLoading;

  const _GroupPlaceholder({
    required this.title,
    required this.icon,
    this.message,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: isLoading
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    CircularProgressIndicator(),
                  ],
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 48),
                    if (message != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        message!,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}
