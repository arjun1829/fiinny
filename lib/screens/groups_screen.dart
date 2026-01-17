import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../services/group_service.dart';
import '../services/friend_service.dart';
import 'add_group_screen.dart';
import '../details/group_detail_screen.dart';

// Mint/Tiffany palette
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class GroupsScreen extends StatefulWidget {
  final String userId;
  const GroupsScreen({required this.userId, super.key});

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  Map<String, FriendModel> _friendsById = {};
  bool _loadingFriends = true;

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  void _loadFriends() {
    FriendService().streamFriends(widget.userId).listen((friends) {
      setState(() {
        _friendsById = {for (var f in friends) f.id: f};
        _loadingFriends = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(85),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(20),
          ),
          child: Container(
            height: 85,
            decoration: BoxDecoration(
              color: tiffanyBlue.withValues(alpha: 0.93),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withValues(alpha: 0.13),
                  blurRadius: 14,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: SafeArea(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 19, vertical: 8),
                child: Row(
                  children: [
                    Text(
                      'Groups',
                      style: TextStyle(
                        fontFamily: 'Montserrat',
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: deepTeal,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: Icon(Icons.group_add_rounded,
                          color: deepTeal, size: 29),
                      tooltip: "Create Group",
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                AddGroupScreen(userId: widget.userId),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          _AnimatedMintBackground(),
          _loadingFriends
              ? const Center(child: CircularProgressIndicator())
              : StreamBuilder<List<GroupModel>>(
                  stream: GroupService().streamGroups(widget.userId),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return Center(child: Text("Error: ${snapshot.error}"));
                    }
                    final groups = snapshot.data ?? [];
                    if (groups.isEmpty) {
                      return Center(
                        child: Text(
                          'No groups yet.\nTap + to create one!',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.teal,
                              fontSize: 18,
                              fontWeight: FontWeight.w500),
                        ),
                      );
                    }
                    return ListView.builder(
                      padding: const EdgeInsets.only(
                          top: 98, left: 14, right: 14, bottom: 16),
                      itemCount: groups.length,
                      itemBuilder: (ctx, i) {
                        final g = groups[i];
                        return _GlassDiamondCard(
                          child: ListTile(
                            title: Text(
                              g.name,
                              style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 19,
                                  color: deepTeal),
                            ),
                            subtitle: Text(
                              '${g.memberPhones.length} members',
                              style: TextStyle(
                                  color: Colors.teal[700],
                                  fontSize: 14,
                                  fontWeight: FontWeight.w400),
                            ),
                            trailing:
                                Icon(Icons.chevron_right, color: deepTeal),
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => GroupDetailScreen(
                                    userId: widget.userId,
                                    group: g,
                                    friendsById: _friendsById,
                                  ),
                                ),
                              );
                            },
                          ),
                        );
                      },
                    );
                  },
                ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: mintGreen,
        foregroundColor: deepTeal,
        tooltip: "Add Group",
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AddGroupScreen(userId: widget.userId),
            ),
          );
        },
        child: Icon(Icons.group_add_rounded),
      ),
    );
  }
}

// Animated Mint Glassy BG
class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground();
  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      builder: (context, value, child) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              tiffanyBlue,
              mintGreen,
              Colors.white.withValues(alpha: 0.85),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}

// Glass Diamond Card for Group List
class _GlassDiamondCard extends StatelessWidget {
  final Widget child;
  const _GlassDiamondCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(19),
        border:
            Border.all(color: tiffanyBlue.withValues(alpha: 0.13), width: 1.5),
        color: Colors.white.withValues(alpha: 0.19),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withValues(alpha: 0.13),
            blurRadius: 11,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(19),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: child,
        ),
      ),
    );
  }
}
