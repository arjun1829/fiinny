import '../../core/parse.dart';
import '../billing/billing_math.dart';

/// A `products` doc. Read tolerantly — imports left numbers as strings and
/// some docs predate `loosePieces`/`baseUnit` (POSPage.tsx defaults copied).
class Product {
  const Product({
    required this.id,
    required this.name,
    required this.sellingPrice,
    required this.mrp,
    required this.retailerPrice,
    required this.purchasePrice,
    required this.gstPct,
    required this.baseUnit,
    required this.quantity,
    required this.loosePieces,
    required this.boxCapacity,
    this.category = '',
    this.type = '',
    this.barcode = '',
    this.mfgCompany = '',
    this.batchNumber = '',
    this.expiryDate = '',
    this.productNumber = '',
    this.reorderLevel,
  });

  final String id;
  final String name;
  final double sellingPrice;
  final double mrp;
  final double retailerPrice;
  final double purchasePrice;

  /// null when not configured (POS shows 5%, B2B defaults the row to 5).
  final double? gstPct;
  final String baseUnit;

  /// Boxes (old model) — products from the batch system keep this at 0 and
  /// track everything in [loosePieces].
  final double quantity;
  final double loosePieces;
  final double boxCapacity;
  final String category;
  final String type;
  final String barcode;
  final String mfgCompany;
  final String batchNumber;
  final String expiryDate;
  final String productNumber;
  final double? reorderLevel;

  /// On-hand pieces — remainingStockFor() in POSPage.tsx.
  double get stock => loosePieces + quantity * (boxCapacity == 0 ? 1 : boxCapacity);

  /// Same default threshold the web's AI advisor uses (reorderLevel || 10).
  bool get isLowStock => stock < (reorderLevel ?? 10);
  bool get isOutOfStock => stock <= 0;

  double get posRate => posSellingRate(sellingPrice: sellingPrice, mrp: mrp);

  /// B2B row rate: retailerPrice || maxRetailPrice (handleRowChange).
  double get b2bRate => retailerPrice != 0 ? retailerPrice : mrp;

  static Product fromDoc(String id, Map<String, dynamic> d) {
    final gst = d['gstPct'];
    return Product(
      id: id,
      name: str(d['name']),
      sellingPrice: dbl(d['sellingPrice']),
      mrp: dbl(d['maxRetailPrice']),
      retailerPrice: dbl(d['retailerPrice']),
      purchasePrice: dbl(d['purchasePrice']),
      gstPct: gst is num ? gst.toDouble() : (gst is String ? double.tryParse(gst) : null),
      baseUnit: str(d['baseUnit']).isNotEmpty
          ? str(d['baseUnit'])
          : (str(d['unit']).isNotEmpty ? str(d['unit']) : 'pcs'),
      quantity: dbl(d['quantity'] ?? d['stock']),
      loosePieces: dbl(d['loosePieces']),
      boxCapacity: d['boxCapacity'] == null ? 1 : dbl(d['boxCapacity']),
      category: str(d['category']),
      type: str(d['type']),
      barcode: str(d['barcode']),
      mfgCompany: str(d['mfgCompany']),
      batchNumber: str(d['batchNumber']),
      expiryDate: str(d['expiryDate']),
      productNumber: str(d['productNumber']),
      reorderLevel: d['reorderLevel'] == null ? null : dbl(d['reorderLevel']),
    );
  }
}

/// An `inventoryBatches` doc.
class InventoryBatch {
  const InventoryBatch({
    required this.id,
    required this.productId,
    required this.batchNumber,
    required this.quantity,
    required this.expiryDate,
    this.purchaseRate = 0,
  });

  final String id;
  final String productId;
  final String batchNumber;
  final double quantity;
  final String expiryDate;
  final double purchaseRate;

  /// Expiry is stored as YYYY-MM or YYYY-MM-DD. Anything within 60 days
  /// (or past) is flagged on the product screen.
  bool get expiresSoon {
    final d = DateTime.tryParse(
        expiryDate.length == 7 ? '$expiryDate-01' : expiryDate);
    if (d == null) return false;
    return d.isBefore(DateTime.now().add(const Duration(days: 60)));
  }

  BatchStock toStock() => BatchStock(
      id: id, batchNumber: batchNumber, quantity: quantity, expiryDate: expiryDate);

  static InventoryBatch fromDoc(String id, Map<String, dynamic> d) =>
      InventoryBatch(
        id: id,
        productId: str(d['productId']),
        batchNumber: str(d['batchNumber']),
        quantity: dbl(d['quantity']),
        expiryDate: str(d['expiryDate']),
        purchaseRate: dbl(d['purchaseRate']),
      );
}
