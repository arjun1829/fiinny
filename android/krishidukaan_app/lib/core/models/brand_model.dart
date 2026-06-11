import 'package:cloud_firestore/cloud_firestore.dart';

class BrandModel {
  final String phone;
  final String businessName;
  final String? ownerName;
  final String? logo;
  final String? tagline;
  final String? description;
  final String? slug;
  final String? primaryColor;
  final String? coverImage;
  final String? website;

  const BrandModel({
    required this.phone,
    required this.businessName,
    this.ownerName,
    this.logo,
    this.tagline,
    this.description,
    this.slug,
    this.primaryColor,
    this.coverImage,
    this.website,
  });

  factory BrandModel.fromFirestore(
    DocumentSnapshot mfrDoc,
    DocumentSnapshot? brandDoc,
  ) {
    final m = mfrDoc.data() as Map<String, dynamic>;
    final b = brandDoc?.data() as Map<String, dynamic>?;
    return BrandModel(
      phone: mfrDoc.id,
      businessName: m['businessName'] as String? ?? m['ownerName'] as String? ?? '',
      ownerName: m['ownerName'] as String?,
      logo: b?['logo'] as String? ?? m['logo'] as String?,
      tagline: b?['tagline'] as String?,
      description: b?['description'] as String?,
      slug: m['slug'] as String?,
      primaryColor: b?['primaryColor'] as String?,
      coverImage: b?['coverImage'] as String?,
      website: m['website'] as String?,
    );
  }
}
