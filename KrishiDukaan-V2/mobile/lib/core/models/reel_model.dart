import 'package:cloud_firestore/cloud_firestore.dart';

class ReelModel {
  final String id;
  final String shopOwnerId;
  final String shopName;
  final String? shopProfilePic;
  final String videoUrl;
  final String caption;
  final String? linkedProductId;
  final String? linkedProductName;
  final String? linkedProductImageUrl;
  final int likesCount;
  final int commentsCount;
  final int viewsCount;
  final DateTime createdAt;

  const ReelModel({
    required this.id,
    required this.shopOwnerId,
    required this.shopName,
    this.shopProfilePic,
    required this.videoUrl,
    required this.caption,
    this.linkedProductId,
    this.linkedProductName,
    this.linkedProductImageUrl,
    required this.likesCount,
    required this.commentsCount,
    required this.viewsCount,
    required this.createdAt,
  });

  factory ReelModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ReelModel(
      id: doc.id,
      shopOwnerId: data['shopOwnerId'] as String? ?? '',
      shopName: data['shopName'] as String? ?? '',
      shopProfilePic: data['shopProfilePic'] as String?,
      videoUrl: data['videoUrl'] as String? ?? '',
      caption: data['caption'] as String? ?? '',
      linkedProductId: data['linkedProductId'] as String?,
      linkedProductName: data['linkedProductName'] as String?,
      linkedProductImageUrl: data['linkedProductImageUrl'] as String?,
      likesCount: (data['likesCount'] as num?)?.toInt() ?? 0,
      commentsCount: (data['commentsCount'] as num?)?.toInt() ?? 0,
      viewsCount: (data['viewsCount'] as num?)?.toInt() ?? 0,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  ReelModel copyWith({
    String? caption,
    String? linkedProductId,
    String? linkedProductName,
    String? linkedProductImageUrl,
    int? likesCount,
    int? commentsCount,
    int? viewsCount,
  }) =>
      ReelModel(
        id: id,
        shopOwnerId: shopOwnerId,
        shopName: shopName,
        shopProfilePic: shopProfilePic,
        videoUrl: videoUrl,
        caption: caption ?? this.caption,
        linkedProductId: linkedProductId ?? this.linkedProductId,
        linkedProductName: linkedProductName ?? this.linkedProductName,
        linkedProductImageUrl:
            linkedProductImageUrl ?? this.linkedProductImageUrl,
        likesCount: likesCount ?? this.likesCount,
        commentsCount: commentsCount ?? this.commentsCount,
        viewsCount: viewsCount ?? this.viewsCount,
        createdAt: createdAt,
      );
}
