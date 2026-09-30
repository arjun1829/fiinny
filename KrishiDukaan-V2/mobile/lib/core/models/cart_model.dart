import 'dart:convert';

import '../utils/gst_utils.dart';

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

  /// GST rate in percent — a preset (0, 5, 12, 18, 28) or a custom rate the
  /// seller entered. Only meaningful when [gstApplicable] is true.
  final double gstRate;

  /// Whether [gstRate] is already INSIDE [price] (the default). Included GST is
  /// shown as a component of the price and never added; only an explicitly
  /// exclusive line (false) has GST added on top at checkout.
  final bool gstIncluded;

  /// Per-product delivery surcharge (₹), added on top of the seller's
  /// weight-slab charge.
  final double extraDeliveryCharge;

  /// This product ships free: it adds no weight and no charge to the seller's
  /// delivery fee.
  final bool freeDelivery;

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
    this.gstIncluded = true,
    this.extraDeliveryCharge = 0,
    this.freeDelivery = false,
  }) : originalPrice = originalPrice ?? price;

  double get lineTotal => price * quantity;

  /// True when this store's offer brings the price below the list price.
  bool get hasDiscount => originalPrice > price + 0.009;

  /// Per-unit money saved by the discount.
  double get unitSavings =>
      (originalPrice - price) > 0 ? originalPrice - price : 0;

  /// Total money saved across the whole line.
  double get lineSavings => unitSavings * quantity;

  /// The authoritative line pricing (GST on the discounted price) — the same
  /// rules as the website and the server (core/utils/gst_utils.dart).
  LinePricing get pricing => computeLinePricing(
        unitPrice: price,
        qty: quantity,
        gstApplicable: gstApplicable,
        gstRate: gstRate,
        gstIncluded: gstIncluded,
      );

  /// GST per unit — backed out of the price when included, on top when not.
  double get unitGst => pricing.gstPerUnit;

  /// All GST in this line (included + added) — for the invoice.
  double get lineGstTotal => pricing.gstTotal;

  /// GST ADDED to what the customer pays for this line (exclusive lines only).
  double get lineGstAdded => pricing.gstAdded;

  /// What the customer pays for this line: net price plus any GST added.
  double get payableLineTotal => pricing.lineTotal;

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
    bool? gstIncluded,
    double? extraDeliveryCharge,
    bool? freeDelivery,
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
        gstIncluded: gstIncluded ?? this.gstIncluded,
        extraDeliveryCharge: extraDeliveryCharge ?? this.extraDeliveryCharge,
        freeDelivery: freeDelivery ?? this.freeDelivery,
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
        'gstIncluded': gstIncluded,
        'extraDeliveryCharge': extraDeliveryCharge,
        'freeDelivery': freeDelivery,
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
      // Carts saved before these fields existed: GST was the old "added on
      // top" behaviour, but new checkouts follow the platform default.
      gstIncluded: j['gstIncluded'] as bool? ?? true,
      extraDeliveryCharge: (j['extraDeliveryCharge'] as num?)?.toDouble() ?? 0,
      freeDelivery: j['freeDelivery'] as bool? ?? false,
    );
  }

  static List<CartItemModel> listFromJson(String json) {
    final list = jsonDecode(json) as List;
    return list.map((e) => CartItemModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  static String listToJson(List<CartItemModel> items) =>
      jsonEncode(items.map((e) => e.toJson()).toList());
}
