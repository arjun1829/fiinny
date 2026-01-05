import 'package:flutter/material.dart';

class BrandProfile {
  final String id;
  final String displayName;
  final String? logoPath; // assets/brands/{logoPath}
  final Color? color;
  final String? defaultCategory;
  final String? defaultSubcategory;

  const BrandProfile({
    required this.id,
    required this.displayName,
    this.logoPath,
    this.color,
    this.defaultCategory,
    this.defaultSubcategory,
  });
}

class BrandService {
  BrandService._();
  static final BrandService instance = BrandService._();

  static const Color _defaultColor = Color(0xFF9E9E9E); // Grey

  /// Main registry of known brands
  /// Key = UPPERCASE Normalized Name (from MerchantAlias)
  static final Map<String, BrandProfile> _registry = {
    // food & dining
    'SWIGGY': const BrandProfile(
      id: 'swiggy',
      displayName: 'Swiggy',
      logoPath: 'swiggy.png',
      color: Color(0xFFFC8019),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Delivery',
    ),
    'ZOMATO': const BrandProfile(
      id: 'zomato',
      displayName: 'Zomato',
      logoPath: 'zomato.png',
      color: Color(0xFFCB202D),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Delivery',
    ),
    'DOMINOS': const BrandProfile(
      id: 'dominos',
      displayName: "Domino's Pizza",
      logoPath: 'dominos.png',
      color: Color(0xFF006491),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),
    'STARBUCKS': const BrandProfile(
      id: 'starbucks',
      displayName: 'Starbucks',
      logoPath: 'starbucks.png',
      color: Color(0xFF00704A),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Coffee',
    ),
    'MCDONALDS': const BrandProfile(
      id: 'mcdonalds',
      displayName: "McDonald's",
      logoPath: 'mcdonalds.png',
      color: Color(0xFFFFBC0D),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),
    'KFC': const BrandProfile(
      id: 'kfc',
      displayName: 'KFC',
      logoPath: 'kfc.png',
      color: Color(0xFFA3080C),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),
    'SUBWAY': const BrandProfile(
      id: 'subway',
      displayName: 'Subway',
      logoPath: 'subway.png',
      color: Color(0xFF008C15),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),
    'BURGER KING': const BrandProfile(
      id: 'burger_king',
      displayName: 'Burger King',
      logoPath: 'burger_king.png',
      color: Color(0xFFD62300),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),
    'PIZZA HUT': const BrandProfile(
      id: 'pizza_hut',
      displayName: 'Pizza Hut',
      logoPath: 'pizza_hut.png',
      color: Color(0xFFC8102E),
      defaultCategory: 'Food & Dining',
      defaultSubcategory: 'Restaurants',
    ),

    // grocery & quick commerce
    'BLINKIT': const BrandProfile(
      id: 'blinkit',
      displayName: 'Blinkit',
      logoPath: 'blinkit.png',
      color: Color(0xFFF8CB46),
      defaultCategory: 'Groceries',
      defaultSubcategory: 'Delivery',
    ),
    'ZEPTO': const BrandProfile(
      id: 'zepto',
      displayName: 'Zepto',
      logoPath: 'zepto.png',
      color: Color(0xFF4B0082), // Zepto purple
      defaultCategory: 'Groceries',
      defaultSubcategory: 'Delivery',
    ),
    'BIGBASKET': const BrandProfile(
      id: 'bigbasket',
      displayName: 'BigBasket',
      logoPath: 'bigbasket.png',
      color: Color(0xFF84C225),
      defaultCategory: 'Groceries',
      defaultSubcategory: 'Delivery',
    ),
    'DMART': const BrandProfile(
      id: 'dmart',
      displayName: 'DMart',
      logoPath: 'dmart.png',
      color: Color(0xFF239F3E), // DMart Green
      defaultCategory: 'Groceries',
      defaultSubcategory: 'Supermarket',
    ),
    'INSTAMART': const BrandProfile( // Swiggy Instamart often appears as just Instamart
      id: 'instamart',
      displayName: 'Instamart',
      logoPath: 'swiggy.png', // Reuse swiggy
      color: Color(0xFFFC8019),
      defaultCategory: 'Groceries',
      defaultSubcategory: 'Delivery',
    ),

    // shopping & e-commerce
    'AMAZON': const BrandProfile(
      id: 'amazon',
      displayName: 'Amazon',
      logoPath: 'amazon.png',
      color: Color(0xFFFF9900),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Online',
    ),
    'FLIPKART': const BrandProfile(
      id: 'flipkart',
      displayName: 'Flipkart',
      logoPath: 'flipkart.png',
      color: Color(0xFF2874F0),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Online',
    ),
    'MYNTRA': const BrandProfile(
      id: 'myntra',
      displayName: 'Myntra',
      logoPath: 'myntra.png',
      color: Color(0xFFFF3F6C),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Clothing',
    ),
    'AJIO': const BrandProfile(
      id: 'ajio',
      displayName: 'Ajio',
      logoPath: 'ajio.png',
      color: Color(0xFF2C4152),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Clothing',
    ),
    'NYKAA': const BrandProfile(
      id: 'nykaa',
      displayName: 'Nykaa',
      logoPath: 'nykaa.png',
      color: Color(0xFFFC2779),
      defaultCategory: 'Self Care',
      defaultSubcategory: 'Beauty',
    ),
    'MEESHO': const BrandProfile(
      id: 'meesho',
      displayName: 'Meesho',
      logoPath: 'meesho.png',
      color: Color(0xFF9E208F),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Online',
    ),
    'UNIQLO': const BrandProfile(
      id: 'uniqlo',
      displayName: 'Uniqlo',
      logoPath: 'uniqlo.png',
      color: Color(0xFFFF0000),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Clothing',
    ),
    'ZARA': const BrandProfile(
      id: 'zara',
      displayName: 'Zara',
      logoPath: 'zara.png',
      color: Color(0xFF000000),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Clothing',
    ),
    'H&M': const BrandProfile(
      id: 'hm',
      displayName: 'H&M',
      logoPath: 'hm.png',
      color: Color(0xFFCD2026),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Clothing',
    ),
    'DECATHLON': const BrandProfile(
      id: 'decathlon',
      displayName: 'Decathlon',
      logoPath: 'decathlon.png',
      color: Color(0xFF0082C3),
      defaultCategory: 'Shopping',
      defaultSubcategory: 'Sports',
    ),
    'IKEA': const BrandProfile(
      id: 'ikea',
      displayName: 'IKEA',
      logoPath: 'ikea.png',
      color: Color(0xFF0051BA),
      defaultCategory: 'Home',
      defaultSubcategory: 'Furniture',
    ),

    // travel & transport
    'UBER': const BrandProfile(
      id: 'uber',
      displayName: 'Uber',
      logoPath: 'uber.png',
      color: Color(0xFF000000),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Taxi',
    ),
    'OLA': const BrandProfile(
      id: 'ola',
      displayName: 'Ola',
      logoPath: 'ola.png',
      color: Color(0xFFF4F800), // Ola yellow-green
      defaultCategory: 'Transport',
      defaultSubcategory: 'Taxi',
    ),
    'RAPIDO': const BrandProfile(
      id: 'rapido',
      displayName: 'Rapido',
      logoPath: 'rapido.png',
      color: Color(0xFFF9C937),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Bike Taxi',
    ),
    'BLUESMART': const BrandProfile(
      id: 'bluesmart',
      displayName: 'BluSmart',
      logoPath: 'bluesmart.png',
      color: Color(0xFF0057E7),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Taxi',
    ),
    'IRCTC': const BrandProfile(
      id: 'irctc',
      displayName: 'IRCTC',
      logoPath: 'irctc.png',
      color: Color(0xFF204E8A),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Train',
    ),
    'MAKEMYTRIP': const BrandProfile(
      id: 'makemytrip',
      displayName: 'MakeMyTrip',
      logoPath: 'makemytrip.png',
      color: Color(0xFFEB2026),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Booking',
    ),
    'GOIBIBO': const BrandProfile(
      id: 'goibibo',
      displayName: 'Goibibo',
      logoPath: 'goibibo.png',
      color: Color(0xFF2292E4),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Booking',
    ),
    'AGODA': const BrandProfile(
      id: 'agoda',
      displayName: 'Agoda',
      logoPath: 'agoda.png',
      color: Color(0xFF5882FA),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Hotels',
    ),
    'AIRBNB': const BrandProfile(
      id: 'airbnb',
      displayName: 'Airbnb',
      logoPath: 'airbnb.png',
      color: Color(0xFFFF5A5F),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Hotels',
    ),
    'INDIGO': const BrandProfile(
      id: 'indigo',
      displayName: 'IndiGo',
      logoPath: 'indigo.png',
      color: Color(0xFF003893),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Flights',
    ),
    'AIR INDIA': const BrandProfile( // Normalized from MerchantAlias usually
      id: 'air_india',
      displayName: 'Air India',
      logoPath: 'air_india.png',
      color: Color(0xFFED1C24),
      defaultCategory: 'Travel',
      defaultSubcategory: 'Flights',
    ),

    // entertainment & subscriptions
    'NETFLIX': const BrandProfile(
      id: 'netflix',
      displayName: 'Netflix',
      logoPath: 'netflix.png',
      color: Color(0xFFE50914),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Streaming',
    ),
    'SPOTIFY': const BrandProfile(
      id: 'spotify',
      displayName: 'Spotify',
      logoPath: 'spotify.png',
      color: Color(0xFF1DB954),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Music',
    ),
    'YOUTUBE PREMIUM': const BrandProfile(
      id: 'youtube',
      displayName: 'YouTube',
      logoPath: 'youtube.png',
      color: Color(0xFFFF0000),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Streaming',
    ),
    'HOTSTAR': const BrandProfile(
      id: 'hotstar',
      displayName: 'Disney+ Hotstar',
      logoPath: 'hotstar.png',
      color: Color(0xFF133695),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Streaming',
    ),
    'PRIME VIDEO': const BrandProfile(
      id: 'prime_video',
      displayName: 'Prime Video',
      logoPath: 'prime_video.png',
      color: Color(0xFF00A8E1),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Streaming',
    ),
    'APPLE': const BrandProfile(
      id: 'apple',
      displayName: 'Apple',
      logoPath: 'apple.png',
      color: Color(0xFF000000),
      defaultCategory: 'Electronics',
      defaultSubcategory: 'Services',
    ),
    'BOOKMYSHOW': const BrandProfile(
      id: 'bookmyshow',
      displayName: 'BookMyShow',
      logoPath: 'bookmyshow.png',
      color: Color(0xFFC4242B),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Events',
    ),
    'PVR': const BrandProfile(
      id: 'pvr',
      displayName: 'PVR Cinemas',
      logoPath: 'pvr.png',
      color: Color(0xFFFDB913),
      defaultCategory: 'Entertainment',
      defaultSubcategory: 'Movies',
    ),

    // bills & utilities
    'JIO': const BrandProfile(
      id: 'jio',
      displayName: 'Jio',
      logoPath: 'jio.png',
      color: Color(0xFF0F3CC9),
      defaultCategory: 'Utilities',
      defaultSubcategory: 'Mobile',
    ),
    'AIRTEL': const BrandProfile(
      id: 'airtel',
      displayName: 'Airtel',
      logoPath: 'airtel.png',
      color: Color(0xFFE40000),
      defaultCategory: 'Utilities',
      defaultSubcategory: 'Mobile',
    ),
    'VI': const BrandProfile(
      id: 'vi',
      displayName: 'Vi',
      logoPath: 'vi.png',
      color: Color(0xFFDE0000),
      defaultCategory: 'Utilities',
      defaultSubcategory: 'Mobile',
    ),
    'TATA PLAY': const BrandProfile(
      id: 'tata_play',
      displayName: 'Tata Play',
      logoPath: 'tata_play.png',
      color: Color(0xFFE41D62),
      defaultCategory: 'Utilities',
      defaultSubcategory: 'TV',
    ),
    'BESCOM': const BrandProfile(
      id: 'bescom',
      displayName: 'BESCOM',
      logoPath: 'bescom.png',
      color: null,
      defaultCategory: 'Utilities',
      defaultSubcategory: 'Electricity',
    ),

    // fuel
    'SHELL': const BrandProfile(
      id: 'shell',
      displayName: 'Shell',
      logoPath: 'shell.png',
      color: Color(0xFFFBCE07),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Fuel',
    ),
    'INDIAN OIL': const BrandProfile(
      id: 'iocl',
      displayName: 'Indian Oil',
      logoPath: 'iocl.png',
      color: Color(0xFFF37321),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Fuel',
    ),
    'BPCL': const BrandProfile(
      id: 'bpcl',
      displayName: 'Bharat Petroleum',
      logoPath: 'bpcl.png',
      color: Color(0xFF005DA5),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Fuel',
    ),
    'HPCL': const BrandProfile(
      id: 'hpcl',
      displayName: 'HP Petroleum',
      logoPath: 'hpcl.png',
      color: Color(0xFF003D95),
      defaultCategory: 'Transport',
      defaultSubcategory: 'Fuel',
    ),

    // fintech & wallets
    'PAYTM': const BrandProfile(
      id: 'paytm',
      displayName: 'Paytm',
      logoPath: 'paytm.png',
      color: Color(0xFF00B9F1),
      defaultCategory: 'Transfer',
      defaultSubcategory: 'Wallet',
    ),
    'PHONEPE': const BrandProfile(
      id: 'phonepe',
      displayName: 'PhonePe',
      logoPath: 'phonepe.png',
      color: Color(0xFF5F259F),
      defaultCategory: 'Transfer',
      defaultSubcategory: 'UPI',
    ),
    'GOOGLE PAY': const BrandProfile(
      id: 'gpay',
      displayName: 'Google Pay',
      logoPath: 'gpay.png',
      color: Color(0xFF4285F4),
      defaultCategory: 'Transfer',
      defaultSubcategory: 'UPI',
    ),
    'CRED': const BrandProfile(
      id: 'cred',
      displayName: 'CRED',
      logoPath: 'cred.png',
      color: Color(0xFF000000),
      defaultCategory: 'Bills',
      defaultSubcategory: 'Credit Card',
    ),
    'ZERODHA': const BrandProfile(
      id: 'zerodha',
      displayName: 'Zerodha',
      logoPath: 'zerodha.png',
      color: Color(0xFF387ED1),
      defaultCategory: 'Investment',
      defaultSubcategory: 'Stocks',
    ),
    'GROWW': const BrandProfile(
      id: 'groww',
      displayName: 'Groww',
      logoPath: 'groww.png',
      color: Color(0xFF00D09C),
      defaultCategory: 'Investment',
      defaultSubcategory: 'Mutual Funds',
    ),
  };

  /// Lookup a brand profile by Normalized Name
  BrandProfile? getProfile(String normalizedName) {
    if (normalizedName.isEmpty) return null;
    return _registry[normalizedName.toUpperCase()];
  }

  /// Helper: Check if we have a profile
  bool hasProfile(String normalizedName) {
    return _registry.containsKey(normalizedName.toUpperCase());
  }

  /// Get logo asset path if it exists
  String? getLogoPath(String normalizedName) {
    final p = getProfile(normalizedName);
    if (p?.logoPath != null) {
      return 'assets/brands/${p!.logoPath}'; 
    }
    return null;
  }
}
