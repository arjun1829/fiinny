import 'dart:convert';

class CartItemModel {
  final String catalogId;
  final String catalogName;
  final String? catalogImage;
  final String listingId;
  final String sellerPhone;
  final String sellerName;

  /// Effective (discounted) unit price — what the buyer actually pays per unit.
  final double price;

  /// List price per unit before any discount. Equals [price] when there is no
  /// discount. Used to show the strikethrough original price in the cart.
  final double originalPrice;

  /// Percentage to show on the "X% OFF" badge. 0 for fixed-amount or no
  /// discount (in which case we show the saved amount instead).
  final double discountPct;

  final int quantity;
  final String? variantLabel;

  /// Whether GST applies to this product (synced from catalog/listing).
  final bool gstApplicable;

  /// GST rate in percent (0, 5, 12, 18, 28). Only meaningful when
  /// [gstApplicable] is true.
  final double gstRate;

  const CartItemModel({
    required this.catalogId,
    required this.catalogName,
    this.catalogImage,
    required this.listingId,
    required this.sellerPhone,
    required this.sellerName,
    required this.price,
    double? originalPrice,
    this.discountPct = 0,
    required this.quantity,
    this.variantLabel,
    this.gstApplicable = false,
    this.gstRate = 0,
  }) : originalPrice = originalPrice ?? price;

  double get lineTotal => price * quantity;

  /// True when this store's offer brings the price below the list price.
  bool get hasDiscount => originalPrice > price + 0.009;

  /// Per-unit money saved by the discount.
  double get unitSavings =>
      (originalPrice - price) > 0 ? originalPrice - price : 0;

  /// Total money saved across the whole line.
  double get lineSavings => unitSavings * quantity;

  /// Per-unit GST amount.
  double get unitGst => gstApplicable ? price * gstRate / 100 : 0;

  /// Total GST for this line.
  double get lineGst => unitGst * quantity;

  CartItemModel copyWith({
    String? listingId,
    String? sellerPhone,
    String? sellerName,
    double? price,
    double? originalPrice,
    double? discountPct,
    int? quantity,
    bool? gstApplicable,
    double? gstRate,
  }) =>
      CartItemModel(
        catalogId: catalogId,
        catalogName: catalogName,
        catalogImage: catalogImage,
        listingId: listingId ?? this.listingId,
        sellerPhone: sellerPhone ?? this.sellerPhone,
        sellerName: sellerName ?? this.sellerName,
        price: price ?? this.price,
        originalPrice: originalPrice ?? this.originalPrice,
        discountPct: discountPct ?? this.discountPct,
        quantity: quantity ?? this.quantity,
        variantLabel: variantLabel,
        gstApplicable: gstApplicable ?? this.gstApplicable,
        gstRate: gstRate ?? this.gstRate,
      );

  Map<String, dynamic> toJson() => {
        'catalogId': catalogId,
        'catalogName': catalogName,
        'catalogImage': catalogImage,
        'listingId': listingId,
        'sellerPhone': sellerPhone,
        'sellerName': sellerName,
        'price': price,
        'originalPrice': originalPrice,
        'discountPct': discountPct,
        'quantity': quantity,
        'variantLabel': variantLabel,
        'gstApplicable': gstApplicable,
        'gstRate': gstRate,
      };

  factory CartItemModel.fromJson(Map<String, dynamic> j) {
    final price = (j['price'] as num).toDouble();
    return CartItemModel(
      catalogId: j['catalogId'] as String,
      catalogName: j['catalogName'] as String,
      catalogImage: j['catalogImage'] as String?,
      listingId: j['listingId'] as String,
      sellerPhone: j['sellerPhone'] as String,
      sellerName: j['sellerName'] as String,
      price: price,
      // Carts saved before discounts were tracked won't have these fields.
      originalPrice: (j['originalPrice'] as num?)?.toDouble() ?? price,
      discountPct: (j['discountPct'] as num?)?.toDouble() ?? 0,
      quantity: j['quantity'] as int,
      variantLabel: j['variantLabel'] as String?,
      gstApplicable: j['gstApplicable'] as bool? ?? false,
      gstRate: (j['gstRate'] as num?)?.toDouble() ?? 0,
    );
  }

  static List<CartItemModel> listFromJson(String json) {
    final list = jsonDecode(json) as List;
    return list.map((e) => CartItemModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  static String listToJson(List<CartItemModel> items) =>
      jsonEncode(items.map((e) => e.toJson()).toList());
}
