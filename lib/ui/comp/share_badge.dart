import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart';

/// Tiny, tappable badge that shows a "Shared" pill + a small facepile.
/// - Works with either raw userIds or enriched participant objects (Map/DTO).
/// - Safe dynamic getters so it won't crash if your objects differ.
/// - If you pass both [participants] and [participantUserIds], [participants] wins.
/// - Use [onTap] to open your share sheet (e.g., ShareSubscriptionSheet).
///
/// Examples:
///   ShareBadge(
///     participants: [{'id':'+9198...', 'name':'Aarav', 'avatarUrl': '...'}, ...],
///     onTap: () => openShareSheet(),
///   )
///
///   // Minimal: only ids (shows "+N" without avatars)
///   ShareBadge(participantUserIds: ['+91...', '+1...'])
class ShareBadge extends StatelessWidget {
  final List<dynamic>?
      participants; // dynamic list of maps/DTOs with id/name/avatar*
  final List<String>? participantUserIds; // fallback: only ids
  final int maxFaces; // how many tiny avatars to render
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool dense; // smaller padding
  final Color? color; // accent color for text/borders
  final Color? background; // pill background
  final EdgeInsetsGeometry? margin;

  const ShareBadge({
    super.key,
    this.participants,
    this.participantUserIds,
    this.maxFaces = 3,
    this.onTap,
    this.onLongPress,
    this.dense = false,
    this.color,
    this.background,
    this.margin,
  });

  /// Convenience to build from a SharedItem-like shape
  /// (any object with .participantUserIds)
  factory ShareBadge.fromItem(
    dynamic item, {
    List<dynamic>? participants,
    int maxFaces = 3,
    VoidCallback? onTap,
    bool dense = false,
    Color? color,
    Color? background,
    EdgeInsetsGeometry? margin,
  }) {
    List<String>? ids;
    try {
      final v = (item as dynamic).participantUserIds;
      if (v is List) {
        ids = v.whereType<String>().toList();
      }
    } catch (_) {}
    return ShareBadge(
      participants: participants,
      participantUserIds: ids,
      maxFaces: maxFaces,
      onTap: onTap,
      dense: dense,
      color: color,
      background: background,
      margin: margin,
    );
  }

  @override
  Widget build(BuildContext context) {
    final faces = _extractFaces(participants, participantUserIds);
    if (faces.isEmpty) return const SizedBox.shrink();

    final c = color ?? AppColors.mint;
    final bg = background ?? c.withValues(alpha: .10);
    final side = c.withValues(alpha: .22);
    final text = c.withValues(alpha: .95);

    final visible = faces.take(maxFaces).toList();
    final overflow = faces.length - visible.length;

    return Semantics(
      label:
          'Shared with ${faces.length - 1} others', // assume self included upstream
      button: onTap != null || onLongPress != null,
      child: Padding(
        padding: margin ?? EdgeInsets.zero,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            onLongPress: onLongPress,
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: EdgeInsets.symmetric(
                horizontal: dense ? 8 : 10,
                vertical: dense ? 5 : 6,
              ),
              decoration: ShapeDecoration(
                color: bg,
                shape: StadiumBorder(side: BorderSide(color: side)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Facepile(faces: visible, color: c),
                  const SizedBox(width: 8),
                  Text(
                    overflow > 0 ? 'Shared · +$overflow' : 'Shared',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: text,
                      fontSize: dense ? 11.5 : 12.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ---- helpers ----

  List<_Face> _extractFaces(List<dynamic>? enriched, List<String>? ids) {
    final list = <_Face>[];

    if (enriched != null && enriched.isNotEmpty) {
      for (final p in enriched) {
        final id = _getId(p);
        if (id == null) continue;
        list.add(_Face(
          id: id,
          name: _getName(p) ?? id,
          avatarUrl: _getAvatar(p),
        ));
      }
      return list;
    }

    // fallback: only ids (render initials only)
    for (final id in (ids ?? const <String>[])) {
      list.add(_Face(id: id, name: id));
    }
    return list;
  }

  String? _getId(dynamic x) {
    try {
      final v = (x as dynamic).id;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    if (x is Map) {
      final v = x['id'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  String? _getName(dynamic x) {
    try {
      final v = (x as dynamic).name;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    try {
      final v = (x as dynamic).label;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    try {
      final v = (x as dynamic).phone;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    if (x is Map) {
      final v = x['name'] ?? x['label'] ?? x['phone'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  String? _getAvatar(dynamic x) {
    try {
      final v = (x as dynamic).avatarUrl;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    try {
      final v = (x as dynamic).photoUrl;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    if (x is Map) {
      final v = x['avatarUrl'] ?? x['photoUrl'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }
}

// ======= Facepile =======

class _Face {
  final String id;
  final String name;
  final String? avatarUrl;
  const _Face({required this.id, required this.name, this.avatarUrl});

  String get initial {
    final s = name.trim();
    if (s.isEmpty) return '•';
    return s.characters.first.toUpperCase();
  }
}

class _Facepile extends StatelessWidget {
  final List<_Face> faces;
  final Color color;
  final double size = 24.0;
  const _Facepile({
    required this.faces,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final border = Colors.white; // looks crisp on white cards
    final children = <Widget>[];
    for (var i = 0; i < faces.length; i++) {
      final f = faces[i];
      children.add(Positioned(
        left: i * (size * .62),
        child: _FaceDot(face: f, size: size, ring: border, accent: color),
      ));
    }
    final width =
        faces.isEmpty ? 0.0 : size + (faces.length - 1) * (size * .62);
    return SizedBox(
      width: width,
      height: size,
      child: Stack(clipBehavior: Clip.none, children: children),
    );
  }
}

class _FaceDot extends StatelessWidget {
  final _Face face;
  final Color ring;
  final Color accent;
  final double size;

  const _FaceDot({
    required this.face,
    required this.ring,
    required this.accent,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final radius = size / 2;
    final bg = accent.withValues(alpha: .12);

    if (face.avatarUrl != null && face.avatarUrl!.isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: ring, width: 2),
          image: DecorationImage(
              image: NetworkImage(face.avatarUrl!), fit: BoxFit.cover),
        ),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(color: ring, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        face.initial,
        style: TextStyle(
          fontSize: radius * .95,
          fontWeight: FontWeight.w900,
          color: accent,
          height: 1.0,
        ),
      ),
    );
  }
}
