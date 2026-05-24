import 'models.dart';

const mockProducts = <Product>[
  Product(
    id: 'p1',
    name: 'Hybrid Tomato Seeds — 10g',
    brand: 'AgriSeed',
    category: 'Seeds',
    priceInr: 240,
    unit: 'pack',
    imageUrl:
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80',
    rating: 4.5,
    description:
        'High-yield hybrid tomato seeds suitable for kharif and rabi seasons. '
        'Resistant to early blight and fusarium wilt.',
  ),
  Product(
    id: 'p2',
    name: 'NPK 19:19:19 Fertilizer — 1kg',
    brand: 'GrowMax',
    category: 'Fertilizer',
    priceInr: 320,
    unit: 'kg',
    imageUrl:
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80',
    rating: 4.7,
    description:
        'Balanced water-soluble fertilizer for all crops. Promotes uniform growth '
        'across vegetative and flowering stages.',
  ),
  Product(
    id: 'p3',
    name: 'Neem Oil Bio-Pesticide — 500ml',
    brand: 'PureFarm',
    category: 'Pesticide',
    priceInr: 410,
    unit: 'bottle',
    imageUrl:
        'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=600&q=80',
    rating: 4.3,
    description:
        'Organic, cold-pressed neem oil. Controls a wide range of soft-bodied '
        'insects and fungal diseases.',
  ),
  Product(
    id: 'p4',
    name: 'Battery Sprayer 16L',
    brand: 'KrishiTools',
    category: 'Tools',
    priceInr: 2890,
    unit: 'unit',
    imageUrl:
        'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=600&q=80',
    rating: 4.6,
    description:
        'Rechargeable knapsack sprayer with brass nozzles. 6-hour battery life '
        'on a full charge.',
  ),
  Product(
    id: 'p5',
    name: 'Drip Irrigation Kit — 1/4 acre',
    brand: 'AquaFarm',
    category: 'Irrigation',
    priceInr: 5499,
    unit: 'kit',
    imageUrl:
        'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=600&q=80',
    rating: 4.4,
    description:
        'Complete drip kit with pipes, drippers, filter, and fittings. Saves up '
        'to 60% water vs flood irrigation.',
  ),
  Product(
    id: 'p6',
    name: 'Wheat Seeds HD-2967 — 10kg',
    brand: 'AgriSeed',
    category: 'Seeds',
    priceInr: 460,
    unit: 'bag',
    imageUrl:
        'https://images.unsplash.com/photo-1535912559178-2d4b1e95f6f5?auto=format&fit=crop&w=600&q=80',
    rating: 4.6,
    description:
        'High-yielding wheat variety with rust resistance. Recommended for '
        'northwest plains zone.',
  ),
];

const mockStores = <Store>[
  Store(
    id: 's1',
    name: 'Patil Krishi Kendra',
    address: 'Market Road, Nashik',
    distanceKm: 1.2,
    lat: 19.9975,
    lng: 73.7898,
    phone: '+91 98000 11111',
    inStock: true,
    status: 'Open Now',
    stock: ['Urea', 'NPK', 'Power Plus'],
  ),
  Store(
    id: 's2',
    name: 'Shree Ganesh Agro',
    address: 'Pune-Nashik Hwy, Sinnar',
    distanceKm: 4.6,
    lat: 19.8499,
    lng: 73.9999,
    phone: '+91 98000 22222',
    inStock: true,
    status: 'Open Now',
    stock: ['Seeds', 'Pesticides', 'Fertilizers'],
  ),
  Store(
    id: 's3',
    name: 'Annapurna Beej Bhandar',
    address: 'College Road, Nashik',
    distanceKm: 2.9,
    lat: 20.0011,
    lng: 73.7766,
    phone: '+91 98000 33333',
    inStock: false,
    status: 'Closed',
    stock: ['Seeds', 'Bio-Stimulants'],
  ),
];

const mockPlans = <SubscriptionPlan>[
  SubscriptionPlan(
    id: 'starter',
    name: 'Starter',
    priceInr: 0,
    period: 'forever',
    features: [
      'Up to 50 product listings',
      'Basic analytics',
      'Email support',
    ],
  ),
  SubscriptionPlan(
    id: 'pro',
    name: 'Pro',
    priceInr: 499,
    period: 'month',
    highlight: true,
    features: [
      'Unlimited listings',
      'Advanced analytics & reviews',
      'Priority store visibility',
      'Priority WhatsApp support',
    ],
  ),
  SubscriptionPlan(
    id: 'business',
    name: 'Business',
    priceInr: 1499,
    period: 'month',
    features: [
      'Everything in Pro',
      'Multi-store / dealer network',
      'API access',
      'Dedicated account manager',
    ],
  ),
];
