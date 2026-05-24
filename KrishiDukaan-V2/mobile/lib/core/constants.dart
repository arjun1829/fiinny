class AppConstants {
  static const appName = 'KrishiDukan';
  static const tagline = 'Agri-commerce for every farmer';
  static const supportPhone = '+91-00000-00000';

  // TODO: point at backend API when ready
  static const apiBaseUrl = 'https://api.krishidukan.example.com';
}

enum UserRole { customer, retailer, manufacturer }

extension UserRoleX on UserRole {
  String get label {
    switch (this) {
      case UserRole.customer:
        return 'Farmer / Customer';
      case UserRole.retailer:
        return 'Retailer / Shop owner';
      case UserRole.manufacturer:
        return 'Manufacturer / Dealer';
    }
  }

  String get storageKey => name;

  static UserRole? tryParse(String? v) {
    if (v == null) return null;
    for (final r in UserRole.values) {
      if (r.name == v) return r;
    }
    return null;
  }
}
