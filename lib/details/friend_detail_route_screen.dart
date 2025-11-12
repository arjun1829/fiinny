// lib/details/friend_detail_route_screen.dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/friend_model.dart';
import '../services/friend_service.dart';
import 'friend_detail_screen.dart';

class FriendDetailRouteScreen extends StatefulWidget {
  final String friendId;
  final String? friendNameHint;

  const FriendDetailRouteScreen({
    Key? key,
    required this.friendId,
    this.friendNameHint,
  }) : super(key: key);

  @override
  State<FriendDetailRouteScreen> createState() => _FriendDetailRouteScreenState();
}

class _FriendDetailRouteScreenState extends State<FriendDetailRouteScreen> {
  late final String _userPhone;
  late final String _userName;
  late final Future<FriendModel?> _friendFuture;

  @override
  void initState() {
    super.initState();
    final user = FirebaseAuth.instance.currentUser;
    _userPhone = user?.phoneNumber ?? user?.uid ?? '';
    _userName = (user?.displayName?.trim().isNotEmpty ?? false)
        ? user!.displayName!.trim()
        : 'You';
    _friendFuture = _loadFriend();
  }

  Future<FriendModel?> _loadFriend() async {
    if (_userPhone.isEmpty) return null;
    try {
      return await FriendService().getFriendByPhone(_userPhone, widget.friendId);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_userPhone.isEmpty) {
      return _ErrorScaffold(
        title: widget.friendNameHint ?? 'Friend',
        message: 'Please sign in again to view this friend.',
      );
    }

    return FutureBuilder<FriendModel?>(
      future: _friendFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return _LoadingScaffold(title: widget.friendNameHint ?? 'Friend');
        }
        if (snapshot.hasError) {
          return _ErrorScaffold(
            title: widget.friendNameHint ?? 'Friend',
            message: 'Unable to load friend right now. Please try again.',
          );
        }

        final friend = snapshot.data ?? FriendModel(
          phone: widget.friendId,
          name: widget.friendNameHint ?? widget.friendId,
        );

        return FriendDetailScreen(
          userPhone: _userPhone,
          userName: _userName,
          friend: friend,
        );
      },
    );
  }
}

class _LoadingScaffold extends StatelessWidget {
  final String title;

  const _LoadingScaffold({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: const Center(child: CircularProgressIndicator()),
    );
  }
}

class _ErrorScaffold extends StatelessWidget {
  final String title;
  final String message;

  const _ErrorScaffold({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
