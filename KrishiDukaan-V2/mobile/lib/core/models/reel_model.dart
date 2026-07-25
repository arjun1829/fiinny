import 'package:cloud_firestore/cloud_firestore.dart';

class ReelModel {
  final String id;
  final String shopOwnerId;
  final String shopName;
  final String? shopProfilePic;
  final String videoUrl;
  final String? thumbnailUrl;
  final String title;
  final String caption;
  final String? linkedProductId;
  final String? linkedProductName;
  final String? linkedProductImageUrl;
  final int likesCount;
  final int commentsCount;
  final int viewsCount;
  final DateTime createdAt;
  // Collaboration tagging
  final List<Map<String, dynamic>> taggedShops;
  final List<String> taggedShopIds;

  /// Playback-time edits (see reel_filters.dart): a look filter id and an
  /// optional text overlay. Rendered by every player, not burned into pixels.
  final String? filterId;
  final String? overlayText;
  final String? overlayPos; // 'top' | 'center' | 'bottom'
  final String? originalReelId;
  final String? originalShopOwnerId;
  final String? originalShopName;

  /// 'approved' | 'flagged'. Missing on every reel written before this field
  /// existed, which is treated as 'approved' — moderation gates new reports,
  /// it does not retroactively hide the existing corpus. Only the
  /// `flagReelOnReports` Cloud Function (admin SDK, bypasses rules) can set
  /// this to 'flagged'; see firestore.rules for why clients — including the
  /// reel's own owner — cannot write it directly.
  final String moderationStatus;

  const ReelModel({
    required this.id,
    required this.shopOwnerId,
    required this.shopName,
    this.shopProfilePic,
    required this.videoUrl,
    this.thumbnailUrl,
    this.title = '',
    required this.caption,
    this.linkedProductId,
    this.linkedProductName,
    this.linkedProductImageUrl,
    required this.likesCount,
    required this.commentsCount,
    required this.viewsCount,
    required this.createdAt,
    this.taggedShops = const [],
    this.taggedShopIds = const [],
    this.filterId,
    this.overlayText,
    this.overlayPos,
    this.originalReelId,
    this.originalShopOwnerId,
    this.originalShopName,
    this.moderationStatus = 'approved',
  });

  factory ReelModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ReelModel(
      id: doc.id,
      shopOwnerId: data['shopOwnerId'] as String? ?? '',
      shopName: data['shopName'] as String? ?? '',
      shopProfilePic: data['shopProfilePic'] as String?,
      videoUrl: data['videoUrl'] as String? ?? '',
      thumbnailUrl: data['thumbnailUrl'] as String?,
      title: data['title'] as String? ?? '',
      caption: data['caption'] as String? ?? '',
      linkedProductId: data['linkedProductId'] as String?,
      linkedProductName: data['linkedProductName'] as String?,
      linkedProductImageUrl: data['linkedProductImageUrl'] as String?,
      likesCount: (data['likesCount'] as num?)?.toInt() ?? 0,
      commentsCount: (data['commentsCount'] as num?)?.toInt() ?? 0,
      viewsCount: (data['viewsCount'] as num?)?.toInt() ?? 0,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      taggedShops:
          (data['taggedShops'] as List<dynamic>?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          const [],
      taggedShopIds:
          (data['taggedShopIds'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      filterId: data['filterId'] as String?,
      overlayText: data['overlayText'] as String?,
      overlayPos: data['overlayPos'] as String?,
      originalReelId: data['originalReelId'] as String?,
      originalShopOwnerId: data['originalShopOwnerId'] as String?,
      originalShopName: data['originalShopName'] as String?,
      moderationStatus: data['moderationStatus'] as String? ?? 'approved',
    );
  }

  ReelModel copyWith({
    String? title,
    String? caption,
    String? linkedProductId,
    String? linkedProductName,
    String? linkedProductImageUrl,
    int? likesCount,
    int? commentsCount,
    int? viewsCount,
    List<Map<String, dynamic>>? taggedShops,
    List<String>? taggedShopIds,
  }) => ReelModel(
    id: id,
    shopOwnerId: shopOwnerId,
    shopName: shopName,
    shopProfilePic: shopProfilePic,
    videoUrl: videoUrl,
    thumbnailUrl: thumbnailUrl,
    title: title ?? this.title,
    caption: caption ?? this.caption,
    linkedProductId: linkedProductId ?? this.linkedProductId,
    linkedProductName: linkedProductName ?? this.linkedProductName,
    linkedProductImageUrl: linkedProductImageUrl ?? this.linkedProductImageUrl,
    likesCount: likesCount ?? this.likesCount,
    commentsCount: commentsCount ?? this.commentsCount,
    viewsCount: viewsCount ?? this.viewsCount,
    createdAt: createdAt,
    taggedShops: taggedShops ?? this.taggedShops,
    taggedShopIds: taggedShopIds ?? this.taggedShopIds,
    filterId: filterId,
    overlayText: overlayText,
    overlayPos: overlayPos,
    originalReelId: originalReelId,
    originalShopOwnerId: originalShopOwnerId,
    originalShopName: originalShopName,
  );
}
