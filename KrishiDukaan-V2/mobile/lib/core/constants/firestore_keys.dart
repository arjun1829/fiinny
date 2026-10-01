class FirestoreKeys {
  FirestoreKeys._();

  // Collections
  static const users = 'users';
  static const uidIndex = 'uidIndex';
  static const catalog = 'catalog';
  static const listings = 'listings';
  static const retailers = 'retailers';
  static const manufacturers = 'manufacturers';
  static const profiles = 'profiles';
  static const manufacturerNetwork = 'manufacturerNetwork';
  static const orders = 'orders';
  static const subscriptions = 'subscriptions';
  static const payments = 'payments';
  static const deliverySettings = 'deliverySettings';
  static const hubs = 'hubs';
  static const blogPosts = 'blogPosts';
  static const brandPages = 'brandPages';
  static const productReviews = 'productReviews';
  static const storeReviews = 'storeReviews';
  static const companyPages = 'companyPages';

  // users/{phone} fields
  static const uid = 'uid';
  static const phone = 'phone';
  static const name = 'name';
  static const email = 'email';
  static const role = 'role';
  static const isPaid = 'isPaid';
  static const totalSeats = 'totalSeats';
  static const productCount = 'productCount';
  static const fcmToken = 'fcmToken';
  static const createdAt = 'createdAt';

  // roles
  static const roleConsumer = 'consumer';
  static const roleRetailer = 'retailer';
  static const roleManufacturer = 'manufacturer';
  static const roleAdmin = 'admin';

  // listings fields
  static const catalogId = 'catalogId';
  static const sellerPhone = 'sellerPhone';
  static const sellerType = 'sellerType';
  static const price = 'price';
  static const stockQuantity = 'stockQuantity';
  static const variants = 'variants';

  // orders fields
  static const customerId = 'customerId';
  static const customerPhone = 'customerPhone';
  static const sellerId = 'sellerId';
  static const status = 'status';
  static const items = 'items';

  // Order statuses — these are the CANONICAL Firestore values, identical to
  // OrderStatus in types/order.ts on the web. Mobile used to keep its own
  // vocabulary ('pending'/'dispatched'/'cancelled') and translate on read and
  // write, which broke the moment 'dispatched' became a real status of its own:
  // mobile's 'dispatched' meant out_for_delivery, so the two collided. There is
  // no translation layer any more — what Firestore stores is what mobile uses.
  static const statusPlaced = 'placed';
  static const statusAccepted = 'accepted';
  static const statusDispatched = 'dispatched';
  static const statusOutForDelivery = 'out_for_delivery';
  static const statusDelivered = 'delivered';
  static const statusRejected = 'rejected';

  /// Progression order, mirroring ORDER_STATUS_FLOW on the web.
  static const orderStatusFlow = [
    statusPlaced,
    statusAccepted,
    statusDispatched,
    statusOutForDelivery,
    statusDelivered,
  ];

  // manufacturerNetwork fields
  static const manufacturerPhone = 'manufacturerPhone';
  static const retailerPhone = 'retailerPhone';
  static const inviteCode = 'inviteCode';
  static const networkStatus = 'status';
  static const statusInvited = 'invited';
  static const statusActive = 'active';
  static const statusRevoked = 'revoked';
}
