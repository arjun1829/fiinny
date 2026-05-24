class Product {
  const Product({
    required this.id,
    required this.name,
    required this.brand,
    required this.category,
    required this.priceInr,
    required this.unit,
    required this.imageUrl,
    required this.rating,
    required this.description,
    this.mrpInr = 0,
  });

  final String id;
  final String name;
  final String brand;
  final String category;
  final int priceInr;
  final int mrpInr;
  final String unit;
  final String imageUrl;
  final double rating;
  final String description;
}

class Store {
  const Store({
    required this.id,
    required this.name,
    required this.address,
    required this.distanceKm,
    required this.lat,
    required this.lng,
    required this.phone,
    required this.inStock,
    this.status = 'Open Now',
    this.stock = const [],
  });

  final String id;
  final String name;
  final String address;
  final double distanceKm;
  final double lat;
  final double lng;
  final String phone;
  final bool inStock;
  final String status;
  final List<String> stock;
}

// ── Dashboard / subscription models ─────────────────────────────────────────

class AppSubscription {
  const AppSubscription({
    required this.id,
    required this.ownerId,
    required this.ownerType,
    required this.planName,
    required this.seatsPurchased,
    required this.amountPaid,
    required this.status,
    this.startDate,
    this.expiryDate,
    this.razorpayOrderId,
    this.razorpayPaymentId,
    this.createdAt,
  });
  final String id;
  final String ownerId;
  final String ownerType;
  final String planName;
  final int seatsPurchased;
  final double amountPaid;
  final String status; // 'active' | 'expired' | 'cancelled'
  final DateTime? startDate;
  final DateTime? expiryDate;
  final String? razorpayOrderId;
  final String? razorpayPaymentId;
  final DateTime? createdAt;

  bool get isActive =>
      status == 'active' &&
      (expiryDate == null || expiryDate!.isAfter(DateTime.now()));

  bool get isExpiringSoon {
    if (!isActive || expiryDate == null) return false;
    return expiryDate!.difference(DateTime.now()).inDays <= 30;
  }
}

class SeatListing {
  const SeatListing({
    required this.id,
    required this.ownerId,
    required this.listingType,
    required this.status,
    this.retailerId,
    this.productId,
    this.assignedAt,
    this.expiresAt,
  });
  final String id;
  final String ownerId;
  final String listingType; // 'own' | 'assigned'
  final String status; // 'active' | 'released' | 'expired'
  final String? retailerId;
  final String? productId;
  final DateTime? assignedAt;
  final DateTime? expiresAt;

  bool get isActive =>
      status == 'active' &&
      (expiresAt == null || expiresAt!.isAfter(DateTime.now()));
}

class SeatStats {
  const SeatStats({
    this.totalPurchased = 0,
    this.activeUsed = 0,
    this.available = 0,
    this.expiringSoon = 0,
  });
  final int totalPurchased;
  final int activeUsed;
  final int available;
  final int expiringSoon;
}

class InventoryRow {
  const InventoryRow({
    required this.inventoryId,
    required this.productId,
    required this.productName,
    required this.category,
    required this.unit,
    required this.stockQuantity,
    required this.sellingPrice,
    required this.reorderThreshold,
    required this.status,
    this.updatedAt,
    this.source,
    this.imageUrl = '',
  });
  final String inventoryId;
  final String productId;
  final String productName;
  final String category;
  final String unit;
  final int stockQuantity;
  final double sellingPrice;
  final int reorderThreshold;
  final String status; // 'in_stock' | 'low_stock' | 'out_of_stock'
  final DateTime? updatedAt;
  final String? source;
  final String imageUrl;
}

class ManufacturerProductRow {
  const ManufacturerProductRow({
    required this.productId,
    required this.productName,
    required this.category,
    required this.unit,
    required this.price,
    required this.isActive,
    this.updatedAt,
    this.imageUrl = '',
  });
  final String productId;
  final String productName;
  final String category;
  final String unit;
  final double price;
  final bool isActive;
  final DateTime? updatedAt;
  final String imageUrl;
}

class SubscriptionPlan {
  const SubscriptionPlan({
    required this.id,
    required this.name,
    required this.priceInr,
    required this.period,
    required this.features,
    this.highlight = false,
  });

  final String id;
  final String name;
  final int priceInr;
  final String period;
  final List<String> features;
  final bool highlight;
}
