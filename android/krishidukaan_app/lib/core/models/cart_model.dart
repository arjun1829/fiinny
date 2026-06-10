import 'dart:convert';

class CartItemModel {
  final String catalogId;
  final String catalogName;
  final String? catalogImage;
  final String listingId;
  final String sellerPhone;
  final String sellerName;
  final double price;
  final int quantity;
  final String? variantLabel;

  const CartItemModel({
    required this.catalogId,
    required this.catalogName,
    this.catalogImage,
    required this.listingId,
    required this.sellerPhone,
    required this.sellerName,
    required this.price,
    required this.quantity,
    this.variantLabel,
  });

  double get lineTotal => price * quantity;

  CartItemModel copyWith({int? quantity}) => CartItemModel(
        catalogId: catalogId,
        catalogName: catalogName,
        catalogImage: catalogImage,
        listingId: listingId,
        sellerPhone: sellerPhone,
        sellerName: sellerName,
        price: price,
        quantity: quantity ?? this.quantity,
        variantLabel: variantLabel,
      );

  Map<String, dynamic> toJson() => {
        'catalogId': catalogId,
        'catalogName': catalogName,
        'catalogImage': catalogImage,
        'listingId': listingId,
        'sellerPhone': sellerPhone,
        'sellerName': sellerName,
        'price': price,
        'quantity': quantity,
        'variantLabel': variantLabel,
      };

  factory CartItemModel.fromJson(Map<String, dynamic> j) => CartItemModel(
        catalogId: j['catalogId'] as String,
        catalogName: j['catalogName'] as String,
        catalogImage: j['catalogImage'] as String?,
        listingId: j['listingId'] as String,
        sellerPhone: j['sellerPhone'] as String,
        sellerName: j['sellerName'] as String,
        price: (j['price'] as num).toDouble(),
        quantity: j['quantity'] as int,
        variantLabel: j['variantLabel'] as String?,
      );

  static List<CartItemModel> listFromJson(String json) {
    final list = jsonDecode(json) as List;
    return list.map((e) => CartItemModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  static String listToJson(List<CartItemModel> items) =>
      jsonEncode(items.map((e) => e.toJson()).toList());
}
