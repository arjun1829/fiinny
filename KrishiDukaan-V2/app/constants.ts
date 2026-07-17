import { 
  Home, 
  Store, 
  BrainCircuit, 
  ReceiptText, 
  MapPin, 
  ShoppingBasket, 
  Search, 
  ArrowRight, 
  Handshake, 
  Zap, 
  ChevronRight, 
  Star, 
  Truck, 
  CheckCircle2, 
  Info,
  Microscope,
  Droplets,
  Sprout,
  Plus,
  Minus,
  ShoppingCart,
  Phone,
  MessageSquare,
  LocateFixed,
  Navigation,
  X,
  LifeBuoy,
  BookOpen,
  Compass,
  LayoutDashboard,
  Package,
  Users,
  CreditCard,
  ListChecks,
  MessageCircle,
  Settings,
  Network,
  KeyRound,
  Share2,
  ClipboardList,
  CircleUser
} from 'lucide-react';
import { MarketplaceProduct } from '../types/product';

export const ICONS = {
  Home,
  Market: Store,
  Hub: BrainCircuit,
  Orders: ReceiptText,
  Location: MapPin,
  Cart: ShoppingBasket,
  Search,
  ArrowRight,
  Trust: Handshake,
  Efficiency: Zap,
  ChevronRight,
  Star,
  Delivery: Truck,
  Check: CheckCircle2,
  Info,
  Science: Microscope,
  Water: Droplets,
  Sprout,
  Plus,
  Minus,
  AddToCart: ShoppingCart,
  Phone,
  Chat: MessageSquare,
  MyPosition: LocateFixed,
  Directions: Navigation,
  X,
  Help: LifeBuoy,
  Docs: BookOpen,
  Compass,
  Dashboard: LayoutDashboard,
  Package,
  Users,
  Payment: CreditCard,
  ListChecks,
  Review: MessageCircle,
  Settings,
  Network,
  Auth: KeyRound,
  Share: Share2,
  Clipboard: ClipboardList,
  Account: CircleUser
};

export const COLORS = {
  primary: '#154212',
  secondary: '#705a4c',
  harvest: '#f57c00',
  surface: '#fbf9f7',
  onSurface: '#1b1c1b'
};

export const CROPS = [
  { id: 'watermelon', name: 'Watermelon', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDSGbELbnV8HdsslJ8hy2mq0a_hvzZrr4cwUKHrze-GEeDpv0Z0VAvA62LryAUopIvuvGVeMWJJbVbRbtq1vKgcoaC4k3njelp3OPJb4_vjrijsdG-_1eEve_PojVdVNedf02IxptPKFjsUkGRH1oiP1H0007UHuQJ18mVTW7N6Vr0wdS7106fBV-qwwwXtBDWxaYcfvkouSyItxhdz24OL3GaUYJVj1YAyxMbObWYCQ7RpC1_QTpxN-wK8fDzDpx5JjUPaRwkLJq3m' },
  { id: 'cotton', name: 'Cotton', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAi13WleIFmuHicYHUY0W-rwufSddyMDo6kb2AcbrntT8BejZDYLjTxaKtV_Y7mnIsnnZJB27-jLhcDJJ-INGrThJKx-ezn-v1eICtCBg9KvmrOIjxCzqye2mi_tIn2fzO64bWu8QByBgH2JQTivKMjxsEsgphoj0fCIMsFB7enUvlyLg-6IkDTTWxfnEszM37GZrGUGaIDzJCwiztMcbaYmVPS8EIuSqQY0ewtQb8oZbCMTLeltwk9U7G9_lPwLTyFLt5WcDAd8f1r' },
  { id: 'mangoes', name: 'Mango', image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=400&q=70' },
  { id: 'pomegranate', name: 'Pomegranate', image: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&w=400&q=70' },
  { id: 'grapes', name: 'Grapes', image: 'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&w=400&q=70' },
  { id: 'banana', name: 'Banana', image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=70' },
  { id: 'sugarcane', name: 'Sugarcane', image: 'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&w=400&q=70' },
  { id: 'onion', name: 'Onion', image: 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&w=400&q=70' },
  { id: 'cherry', name: 'Cherry', image: 'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&w=400&q=70' },
  { id: 'orange', name: 'Orange', image: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=400&q=70' },
];

export const STORES = [
  {
    id: 's1',
    name: "Balaji Krishi Seva Kendra",
    ownerName: "Harsh",
    phone: "+919657389043",
    address: "Baner, Pune, Pune, Maharashtra 413102",
    status: "Open until 8:00 PM",
    distance: "1.2 km away",
    isHot: true,
    location: {
      lat: 18.598552,
      lng: 73.813938
    },
    stock: ['Urea', 'NPK', 'Seeds']
  },
  {
    id: 's2',
    name: "Surve Agro",
    ownerName: "Sai Surve",
    phone: "+919921929137",
    address: "Vadgaon, Maval, Pune",
    status: "Open until 7:00 PM",
    distance: "3.5 km away",
    location: {
      lat: 18.7391,
      lng: 73.6415
    },
    stock: ['Fertilizers', 'Tools']
  },
  {
    id: 's3',
    name: "Dongre Patil Agro",
    ownerName: "Patil",
    phone: "+918605760219",
    address: "Patoda, Yeola, Nashik",
    status: "Open until 6:30 PM",
    distance: "12.0 km away",
    location: {
      lat: 20.0421,
      lng: 74.4893
    },
    stock: ['Seeds', 'Pesticides']
  },
  {
    id: 's4',
    name: "Kisan Agro Traders",
    ownerName: "Kisan Agro",
    phone: "+917038143893",
    address: "Kokamgaon, Kopargaon, Ahilyanagar",
    status: "Open until 8:00 PM",
    distance: "15.5 km away",
    location: {
      lat: 19.9011,
      lng: 74.5012
    },
    stock: ['Tools', 'Hardware']
  },
  {
    id: 's5',
    name: "Yogesh Krushi Agencies",
    ownerName: "Yogesh",
    phone: "+919921930466",
    address: "Lasalgaon, Niphad, Nashik 422306",
    status: "Open until 7:00 PM",
    distance: "8.2 km away",
    location: {
      lat: 20.1427,
      lng: 74.2391
    },
    stock: ['Seeds', 'Fertilizers']
  },
  // ── DS Green Agriculture distribution points – Shirur / Pune region ──────────
  {
    id: 'ga-s1',
    name: 'Sadalgaon Krishi Seva Kendra',
    ownerName: 'Ganesh Bhandare',
    phone: '+919730123456',
    address: 'Sadalgaon, Tal-Shirur, Dist-Pune 411211',
    status: 'Open until 7:00 PM',
    distance: '0.5 km away',
    location: { lat: 18.8812, lng: 74.3945 },
    stock: ['DS Humi Gold+', 'Grand Vita', 'Sandy Super', 'All Sticky+']
  },
  {
    id: 'ga-s2',
    name: 'Ranjangaon Agri Center',
    ownerName: 'Sanjay More',
    phone: '+919823456789',
    address: 'Main Road, Ranjangaon, Shirur, Pune',
    status: 'Open until 8:00 PM',
    distance: '6.2 km away',
    location: { lat: 18.8751, lng: 74.3356 },
    stock: ['DS Humi Gold+', 'Grand Vita', 'Sandy Super']
  },
  {
    id: 'ga-s3',
    name: 'Shirur Kisan Agro',
    ownerName: 'Prashant Jadhav',
    phone: '+917588901234',
    address: 'Station Road, Shirur, Pune 412210',
    status: 'Open until 6:30 PM',
    distance: '8.5 km away',
    location: { lat: 18.8267, lng: 74.3611 },
    stock: ['DS Humi Gold+', 'All Sticky+']
  },
  {
    id: 'ga-s4',
    name: 'Koregaon Bhima Fertilizer Store',
    ownerName: 'Rajesh Kale',
    phone: '+918600234567',
    address: 'Bazar Peth, Koregaon Bhima, Pune',
    status: 'Open until 7:30 PM',
    distance: '22 km away',
    location: { lat: 18.6540, lng: 74.5060 },
    stock: ['DS Humi Gold+', 'Grand Vita', 'Sandy Super', 'All Sticky+']
  },
  {
    id: 'ga-s5',
    name: 'Nagar Road Agro World',
    ownerName: 'Vinod Patil',
    phone: '+919765087654',
    address: 'Nagar Road, Wagholi, Pune 412207',
    status: 'Open until 8:00 PM',
    distance: '35 km away',
    location: { lat: 18.5621, lng: 73.9797 },
    stock: ['DS Humi Gold+', 'Sandy Super', 'All Sticky+']
  },
  // ── Karan Arjun Power Plus distribution points – Karjat / Ahmednagar region ──
  {
    id: 'ka-s1',
    name: 'Karjat Krishi Seva Kendra',
    ownerName: 'Ramesh Shinde',
    phone: '+919307199040',
    address: 'Main Bazar, Karjat, Ahmednagar, Maharashtra 414402',
    status: 'Open until 7:30 PM',
    distance: '0.3 km away',
    location: { lat: 18.9602, lng: 75.1705 },
    stock: ['Power Plus 1L', 'Power Plus 3L', 'Power Plus 5L']
  },
  {
    id: 'ka-s2',
    name: 'Vitthal Agro Center',
    ownerName: 'Vitthal Jadhav',
    phone: '+919823001122',
    address: 'Station Road, Shrigonda, Ahmednagar 413701',
    status: 'Open until 8:00 PM',
    distance: '14 km away',
    location: { lat: 18.6178, lng: 74.7092 },
    stock: ['Power Plus 1L', 'Power Plus 3L']
  },
  {
    id: 'ka-s3',
    name: 'Kisan Agri Bhandar',
    ownerName: 'Datta Kulkarni',
    phone: '+917588112233',
    address: 'Parbhani Road, Newasa, Ahmednagar 414603',
    status: 'Open until 6:30 PM',
    distance: '26 km away',
    location: { lat: 19.5483, lng: 74.9868 },
    stock: ['Power Plus 1L', 'Power Plus 5L']
  },
  {
    id: 'ka-s4',
    name: 'Mauli Krishi Kendra',
    ownerName: 'Suresh Gaikwad',
    phone: '+918600445566',
    address: 'Market Yard, Pathardi, Ahmednagar 414101',
    status: 'Open until 7:00 PM',
    distance: '32 km away',
    location: { lat: 19.2575, lng: 74.6993 },
    stock: ['Power Plus 1L', 'Power Plus 3L', 'Power Plus 5L']
  },
  {
    id: 'ka-s5',
    name: 'Sai Agro Hub',
    ownerName: 'Nitin Borse',
    phone: '+919765334455',
    address: 'Kopargaon Road, Rahata, Ahmednagar 423107',
    status: 'Open until 7:30 PM',
    distance: '45 km away',
    location: { lat: 19.7147, lng: 74.4820 },
    stock: ['Power Plus 1L', 'Power Plus 3L']
  },
  // Golden Future Life Care distribution points – Kolhapur region
  {
    id: 'gf-s1',
    name: "Kisan Agri Center",
    ownerName: "Rajendra Patil",
    phone: "+919876501234",
    address: "Station Road, Kolhapur, Maharashtra 416001",
    status: "Open until 7:00 PM",
    distance: "0.8 km away",
    location: { lat: 16.7050, lng: 74.2433 },
    stock: ['Soil Amrut', 'Crop Magic']
  },
  {
    id: 'gf-s2',
    name: "Shree Agro Seva",
    ownerName: "Suresh Shinde",
    phone: "+919823401234",
    address: "Shahupuri, Kolhapur, Maharashtra 416001",
    status: "Open until 8:00 PM",
    distance: "2.3 km away",
    location: { lat: 16.6970, lng: 74.2350 },
    stock: ['Soil Amrut', 'Root Magic']
  },
  {
    id: 'gf-s3',
    name: "Mahalaxmi Krishi Kendra",
    ownerName: "Balu Desai",
    phone: "+917654301234",
    address: "Karveer, Kolhapur, Maharashtra 416005",
    status: "Open until 6:00 PM",
    distance: "5.5 km away",
    location: { lat: 16.6540, lng: 74.2100 },
    stock: ['Soil Amrut', 'Crop Magic', 'Root Magic']
  },
  {
    id: 'gf-s4',
    name: "Shivaji Krishi Seva",
    ownerName: "Manoj Kulkarni",
    phone: "+919765401234",
    address: "Ichalkaranji, Kolhapur, Maharashtra 416115",
    status: "Open until 7:30 PM",
    distance: "18 km away",
    location: { lat: 16.6899, lng: 74.4631 },
    stock: ['Soil Amrut', 'Crop Magic']
  },
  {
    id: 'gf-s5',
    name: "Gavali Agro Hub",
    ownerName: "Sanjay Gavali",
    phone: "+918654301234",
    address: "Kagal, Kolhapur, Maharashtra 416216",
    status: "Open until 7:00 PM",
    distance: "25 km away",
    location: { lat: 16.5738, lng: 74.3126 },
    stock: ['Soil Amrut']
  }
];

export const PRODUCTS: MarketplaceProduct[] = [
  {
    id: 'p1',
    name: 'Premium Wheat Seeds',
    fullName: 'Premium Golden Wheat Seeds (Hybrid)',
    price: 1200,
    oldPrice: 1400,
    category: 'seeds',
    description: 'High-yield variety, suitable for local soil conditions. Drought resistant.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9DzE2OB77Rgv1NwTy7JTBCgFSx2IWia8qNQ3S0rtSkbpNjXc23to77zsOMOdw7GnIxonAWKD_J95prSm1HHoU2-qFcJV746h5UpRa27VzKlzySDbpj113cgYgy5Aloy9q2KRRhZnC9haCd4DVupUB3pj2SV7CGzVOPf0QcDdNxPoS5389PNv5WzYsqcim342Qxeky-arBg88aAW245GoXUyRGTFK55SBklq-Sz3_DLtwhSB4QVBOjJC_p_AdlTjnDYgqO5lRa62P6',
    stock: 'In Stock',
    store: 'Balaji Krishi Seva Kendra',
    distance: '1.2km',
    availability: [
      { storeId: 's1', stockLevel: 'In Stock' }
    ]
  },
  {
    id: 'p2',
    name: 'Bio-Active Fertilizer',
    fullName: 'Samruddhi NPK 19:19:19',
    price: 850,
    category: 'fertilizers',
    description: '100% organic compost mix for healthier crop growth.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB2WDW8n84ARpG1rKuqGsgPJ6DH-K_TGgT2BhcMvWXVlj0-wQMhgkIlMit2lSvWxek2a1m6zuh1KvEEW24PWTv4w-z_-j_Vetv8EyJcha1AMMb2Y4y9Uz3ay5lhhylUC6ZRuU981JFFLbDt0lLn99tSC5Jf0ceN_5WcBGlbJ5J0E1_NgwYlUAGZH005ylDSYopd5G0QRLaoksL7vi3xZ7IcWobKDhijMZcwJK2-k-FSlSFAY2Megman0hXlvpr8P-I9cHeuI4H1Ow-U',
    stock: 'Fast Selling',
    store: 'Balaji Krishi Seva Kendra',
    distance: '1.2km',
    availability: [
      { storeId: 's1', stockLevel: 'Fast Selling' }
    ]
  },
  {
    id: 'p3',
    name: 'Pro Pruning Shears',
    price: 450,
    category: 'tools',
    description: 'Ergonomic design with high-carbon steel blades.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0lKpQNZwsNobPjdMrfQ1RArKB3PDGd2wb97adUURc2Dj-YyC4LmH5BGv4C7p08DMZejvtg1fr2b_zgV8b3R26Ua2KRECh6nsoWlbvzt-GFXcziFU0yRgHUvxGG1DDv1COqqNbkD69EYziOBsrQkkYzmhOqERacnmBDeHca7dtmCoPV7ltojPylMI7wZhuXeiWq6Au3zaSeAwVCH2Vz5KHmEnYAeiR5Fz0pg0acr04msE-dkcGlgsyVHaStKFwHwoDYb5_XrF2umgu',
    stock: 'Low Stock',
    store: 'Surve Agro',
    distance: '3.5km',
    availability: [
      { storeId: 's2', stockLevel: 'Low Stock' }
    ]
  },
  {
    id: 'p4',
    name: 'Power Plus',
    fullName: 'Power Plus Micronutrient Growth Booster',
    price: 500,
    category: 'fertilizers',
    description: 'Advanced plant growth stimulator for enhanced nutrient absorption and maximum yield.',
    image: '/images/regenerated_image_1778304077291.png',
    stock: 'Trending',
    store: 'Dongre Patil Agro',
    distance: '12.0km',
    availability: [
      { storeId: 's3', stockLevel: 'In Stock' }
    ]
  },
  // ── Golden Future Life Care Pvt. Ltd. ──────────────────────────────────────
  {
    id: 'soil-amrut-gf',
    name: 'Soil Amrut',
    fullName: 'Soil Amrut – Organic Phospho Gypsum Soil Conditioner (25 kg)',
    price: 850,
    oldPrice: 950,
    category: 'fertilizers',
    description: 'Premium Phospho Gypsum soil conditioner. Improves soil structure, water retention, and organic carbon content. 100% organic and chemical-free.',
    image: '/images/golden-future/soil-amrut-poster.jpeg',
    images: [
      '/images/golden-future/soil-amrut-poster.jpeg',
      '/images/golden-future/soil-amrut-poster-2.jpeg',
      '/images/golden-future/soil-amrut-clean.jpeg',
    ],
    stock: 'In Stock',
    store: 'Kisan Agri Center',
    distance: '0.8km',
    manufacturerId: 'golden-future-life-care',
    isOnline: false,
    availability: [
      { storeId: 'gf-s1', stockLevel: 'In Stock' },
      { storeId: 'gf-s2', stockLevel: 'In Stock' },
      { storeId: 'gf-s3', stockLevel: 'In Stock' },
      { storeId: 'gf-s4', stockLevel: 'In Stock' },
      { storeId: 'gf-s5', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'crop-magic-gf',
    name: 'Crop Magic',
    fullName: 'Crop Magic – Micronutrient Fertilizer Grade I (5 kg)',
    price: 650,
    category: 'fertilizers',
    description: 'Grade I micronutrient fertilizer for soil application. Boosts crop production, disease resistance, and improves fruit quality and colour.',
    image: '/images/golden-future/crop-magic.jpeg',
    images: [
      '/images/golden-future/crop-magic.jpeg',
    ],
    stock: 'In Stock',
    store: 'Kisan Agri Center',
    distance: '0.8km',
    manufacturerId: 'golden-future-life-care',
    isOnline: false,
    availability: [
      { storeId: 'gf-s1', stockLevel: 'In Stock' },
      { storeId: 'gf-s3', stockLevel: 'In Stock' },
      { storeId: 'gf-s4', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'root-magic-gf',
    name: 'Root Magic',
    fullName: 'Root Magic Mycorrhiza – VAM Bio-Fertilizer (500 g)',
    price: 480,
    category: 'fertilizers',
    description: 'Vesicular Arbuscular Mycorrhiza biofertilizer. Massively strengthens root systems, enhances phosphorus & nitrogen uptake, and builds drought resistance.',
    image: '/images/golden-future/root-magic.jpeg',
    images: [
      '/images/golden-future/root-magic.jpeg',
    ],
    stock: 'In Stock',
    store: 'Shree Agro Seva',
    distance: '2.3km',
    manufacturerId: 'golden-future-life-care',
    isOnline: false,
    availability: [
      { storeId: 'gf-s2', stockLevel: 'In Stock' },
      { storeId: 'gf-s3', stockLevel: 'In Stock' },
    ]
  },
  // ── DS Green Agriculture ──────────────────────────────────────────────────────
  {
    id: 'ga-humi-gold',
    name: 'DS Humi Gold+',
    fullName: 'DS Humi Gold+ – Super Potassium Humate 98% (1 kg)',
    price: 450,
    oldPrice: 520,
    category: 'fertilizers',
    description: 'Super Potassium Humate 98% — improves soil health, enhances root development, boosts organic carbon, and increases crop resistance. 100% Organic, Eco Friendly, Safe for all crops.',
    image: '/images/green-agriculture/ds-humi-gold-clean.jpeg',
    images: [
      '/images/green-agriculture/ds-humi-gold-clean.jpeg',
      '/images/green-agriculture/ds-humi-gold-product.jpeg',
    ],
    stock: 'In Stock',
    store: 'Sadalgaon Krishi Seva Kendra',
    distance: '0.5km',
    manufacturerId: 'ds-green-agriculture',
    isOnline: false,
    composition: [
      { name: 'Potassium Humate', value: '98%', color: '#154212' },
    ],
    application: '1–2 g per litre for foliar spray; 2–3 kg per acre for soil application.',
    benefits: ['Improves Soil Health', 'Stronger Root Development', 'Increases Crop Resistance', 'Higher Yield & Better Returns', '100% Organic', 'Eco Friendly'],
    availability: [
      { storeId: 'ga-s1', stockLevel: 'In Stock' },
      { storeId: 'ga-s2', stockLevel: 'In Stock' },
      { storeId: 'ga-s3', stockLevel: 'In Stock' },
      { storeId: 'ga-s4', stockLevel: 'In Stock' },
      { storeId: 'ga-s5', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'ga-grand-vita',
    name: 'Grand Vita',
    fullName: 'Grand Vita – Seaweed + Amino + Humic + Multivitamin (500 ml)',
    price: 350,
    oldPrice: 420,
    category: 'fertilizers',
    description: 'Powerful combination of Seaweed, Amino Acids, Humic Acid and Multivitamins for crop production boost. Improves fruit size, colour, and overall plant health.',
    image: '/images/green-agriculture/grand-vita-clean.jpeg',
    images: [
      '/images/green-agriculture/grand-vita-clean.jpeg',
      '/images/green-agriculture/grand-vita-product.jpeg',
    ],
    stock: 'In Stock',
    store: 'Sadalgaon Krishi Seva Kendra',
    distance: '0.5km',
    manufacturerId: 'ds-green-agriculture',
    isOnline: false,
    composition: [
      { name: 'Seaweed Extract', value: '15%', color: '#0ea5e9' },
      { name: 'Amino Acids', value: '10%', color: '#f59e0b' },
      { name: 'Humic Acid', value: '8%', color: '#7c3aed' },
      { name: 'Multivitamins', value: '5%', color: '#16a34a' },
    ],
    application: 'Vegetables: 2 ml/litre; Drip: 5 ml/1 kg; Fruits: 5–7 ml/litre; Soil: 1–1.5 litre/acre.',
    benefits: ['Increases Crop Production', 'Improves Fruit Quality & Colour', 'Better Root & Shoot Growth', 'Natural Nutrition', 'Suitable for All Crops'],
    availability: [
      { storeId: 'ga-s1', stockLevel: 'In Stock' },
      { storeId: 'ga-s2', stockLevel: 'In Stock' },
      { storeId: 'ga-s4', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'ga-sandy-super',
    name: 'Sandy Super',
    fullName: 'Sandy Super – Broad Spectrum Insecticide (500 ml)',
    price: 280,
    oldPrice: 320,
    category: 'pesticides',
    description: 'Effective broad-spectrum control on sucking insects and pests. Controls Mites, Jassids, Thrips, Whitefly, Aphids and more. Fast action, long lasting, systemic protection.',
    image: '/images/green-agriculture/sandy-super-clean.jpeg',
    images: [
      '/images/green-agriculture/sandy-super-clean.jpeg',
      '/images/green-agriculture/sandy-super-product.jpeg',
    ],
    stock: 'Trending',
    store: 'Sadalgaon Krishi Seva Kendra',
    distance: '0.5km',
    manufacturerId: 'ds-green-agriculture',
    isOnline: false,
    benefits: ['Broad Spectrum Control', 'Effective on Sucking Pests', 'Protects Crop Health', 'Fast Action & Long Lasting', 'Systemic Protection', 'Safe for Plants'],
    application: 'Mix 1–2 ml per litre of water. Apply during early infestation for best results.',
    availability: [
      { storeId: 'ga-s1', stockLevel: 'Trending' },
      { storeId: 'ga-s2', stockLevel: 'In Stock' },
      { storeId: 'ga-s4', stockLevel: 'In Stock' },
      { storeId: 'ga-s5', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'ga-all-sticky',
    name: 'All Sticky+',
    fullName: 'All Sticky+ – Non Ionic Silicon Based Sticker/Spreader (500 ml)',
    price: 190,
    oldPrice: 230,
    category: 'pesticides',
    description: 'Silicon based non-ionic sticker, spreader and penetrator. Improves pesticide effectiveness, ensures better spreading & adhesion, and enhances absorption for all crops in all conditions.',
    image: '/images/green-agriculture/all-sticky-clean.jpeg',
    images: [
      '/images/green-agriculture/all-sticky-clean.jpeg',
      '/images/green-agriculture/all-sticky-product.jpeg',
    ],
    stock: 'In Stock',
    store: 'Sadalgaon Krishi Seva Kendra',
    distance: '0.5km',
    manufacturerId: 'ds-green-agriculture',
    isOnline: false,
    benefits: ['Improves Pesticide Effectiveness', 'Better Spreading & Adhesion', 'Enhances Penetration & Absorption', 'Better Crop Health', 'Non Ionic & Safe', 'Silicon Based Technology'],
    application: 'Add 0.5–1 ml per litre of spray solution along with any pesticide or fertilizer.',
    availability: [
      { storeId: 'ga-s1', stockLevel: 'In Stock' },
      { storeId: 'ga-s3', stockLevel: 'In Stock' },
      { storeId: 'ga-s4', stockLevel: 'In Stock' },
      { storeId: 'ga-s5', stockLevel: 'In Stock' },
    ]
  },
  // ── Karan Arjun Power Plus ────────────────────────────────────────────────────
  {
    id: 'ka-power-1l',
    name: 'Power Plus 1L',
    fullName: 'Karan Arjun Power Plus™ – Advanced Plant Growth Stimulator (1 Litre)',
    price: 500,
    oldPrice: 620,
    category: 'fertilizers',
    description: 'Advanced plant growth stimulator combining 22% Humates & Fulvates (pH 9.0+). Boosts drought tolerance, disease resistance, root development, and extends post-harvest freshness. Safe for all crops — grapes, onions, pomegranates, cotton and more.',
    image: '/images/karan-arjun/bottle-1l.png',
    images: [
      '/images/karan-arjun/bottle-1l.png',
      '/images/karan-arjun/orangeimage.png',
      '/images/karan-arjun/cherryimage.png',
    ],
    stock: 'In Stock',
    store: 'Karjat Krishi Seva Kendra',
    distance: '0.3km',
    manufacturerId: 'karan-arjun-power-plus',
    isOnline: false,
    composition: [
      { name: 'Humates & Fulvates', value: '22%', color: '#b45309' },
      { name: 'pH Level', value: '9.0+', color: '#7c3aed' },
      { name: 'Shelf Life', value: '3 yrs', color: '#15803d' },
    ],
    benefits: ['Drought Tolerance', 'Disease Resistance', 'Root Development', 'Extended Freshness', 'Natural Sugar Content', 'Premium Quality'],
    application: 'Drip Irrigation: 2–3 L/acre. Foliar Spray: 3–5 ml/litre of water. Apply at critical growth stages for best results.',
    availability: [
      { storeId: 'ka-s1', stockLevel: 'In Stock' },
      { storeId: 'ka-s2', stockLevel: 'In Stock' },
      { storeId: 'ka-s3', stockLevel: 'In Stock' },
      { storeId: 'ka-s4', stockLevel: 'In Stock' },
      { storeId: 'ka-s5', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'ka-power-3l',
    name: 'Power Plus 3L',
    fullName: 'Karan Arjun Power Plus™ – Advanced Plant Growth Stimulator (3 Litres)',
    price: 1350,
    oldPrice: 1700,
    category: 'fertilizers',
    description: 'Economy pack — same powerful formula as the 1L, ideal for medium farm plots. 22% Humates & Fulvates with certified holographic QR for authenticity. Trusted by 75,800+ farmers.',
    image: '/images/karan-arjun/bottle-3l.png',
    images: [
      '/images/karan-arjun/bottle-3l.png',
      '/images/karan-arjun/orangeimage.png',
    ],
    stock: 'Fast Selling',
    store: 'Karjat Krishi Seva Kendra',
    distance: '0.3km',
    manufacturerId: 'karan-arjun-power-plus',
    isOnline: false,
    composition: [
      { name: 'Humates & Fulvates', value: '22%', color: '#b45309' },
      { name: 'pH Level', value: '9.0+', color: '#7c3aed' },
      { name: 'Shelf Life', value: '3 yrs', color: '#15803d' },
    ],
    benefits: ['Drought Tolerance', 'Disease Resistance', 'Root Development', 'Extended Freshness', 'Natural Sugar Content', 'Premium Quality'],
    application: 'Drip Irrigation: 2–3 L/acre. Foliar Spray: 3–5 ml/litre of water. Apply at critical growth stages for best results.',
    availability: [
      { storeId: 'ka-s1', stockLevel: 'Fast Selling' },
      { storeId: 'ka-s2', stockLevel: 'In Stock' },
      { storeId: 'ka-s4', stockLevel: 'In Stock' },
      { storeId: 'ka-s5', stockLevel: 'In Stock' },
    ]
  },
  {
    id: 'ka-power-5l',
    name: 'Power Plus 5L',
    fullName: 'Karan Arjun Power Plus™ – Advanced Plant Growth Stimulator (5 Litres)',
    price: 2150,
    oldPrice: 2700,
    category: 'fertilizers',
    description: 'Bulk value pack for large farms. Full-season supply of Power Plus at the best per-litre rate. ISO 9001:2015 certified. Holographic QR verified for authenticity.',
    image: '/images/karan-arjun/bottle-5l.png',
    images: [
      '/images/karan-arjun/bottle-5l.png',
      '/images/karan-arjun/cherryimage.png',
    ],
    stock: 'In Stock',
    store: 'Karjat Krishi Seva Kendra',
    distance: '0.3km',
    manufacturerId: 'karan-arjun-power-plus',
    isOnline: false,
    composition: [
      { name: 'Humates & Fulvates', value: '22%', color: '#b45309' },
      { name: 'pH Level', value: '9.0+', color: '#7c3aed' },
      { name: 'Shelf Life', value: '3 yrs', color: '#15803d' },
    ],
    benefits: ['Drought Tolerance', 'Disease Resistance', 'Root Development', 'Extended Freshness', 'Natural Sugar Content', 'Premium Quality'],
    application: 'Drip Irrigation: 2–3 L/acre. Foliar Spray: 3–5 ml/litre of water. Apply at critical growth stages for best results.',
    availability: [
      { storeId: 'ka-s1', stockLevel: 'In Stock' },
      { storeId: 'ka-s3', stockLevel: 'In Stock' },
      { storeId: 'ka-s4', stockLevel: 'In Stock' },
    ]
  },
];

export const MANUFACTURERS: Record<string, {
  id: string;
  name: string;
  tagline: string;
  location: string;
  about: string;
  founded: string;
  website?: string;
  socialProof: string;
  certifications: string[];
  productIds: string[];
  storeIds: string[];
  primaryColor: string;
  accentColor: string;
  phone?: string;
  email?: string;
  videos?: string[];
}> = {
  'karan-arjun-power-plus': {
    id: 'karan-arjun-power-plus',
    name: 'Karan Arjun Power Plus™',
    tagline: 'नातं विश्वासचं, एक पाऊल आधुनिकतेचं',
    location: 'Karjat, Ahmednagar, Maharashtra 414402',
    about: 'Karan Arjun Power Plus™ is a scientifically formulated plant growth stimulator made from 22% Humates & Fulvates. Developed to help Maharashtra\'s farmers achieve maximum yield — from grapes and pomegranates to onions and cotton. ISO 9001:2015 certified with holographic QR authentication on every bottle for guaranteed quality.',
    founded: '2019',
    website: 'https://karanarjun-power-plus.web.app/',
    socialProof: '75,800+ farmers trust Power Plus',
    certifications: ['ISO 9001:2015', 'Holographic QR Verified', 'Premium Quality', 'Safe for All Crops'],
    productIds: ['ka-power-1l', 'ka-power-3l', 'ka-power-5l'],
    storeIds: ['ka-s1', 'ka-s2', 'ka-s3', 'ka-s4', 'ka-s5'],
    primaryColor: '#7c2d12',
    accentColor: '#f97316',
    phone: '9307199040',
    videos: ['dmCafHKBuIY', 'AKFS1bF5AG4', 'qH0ah_cm2fA'],
  },
  'ds-green-agriculture': {
    id: 'ds-green-agriculture',
    name: 'DS Green Agriculture',
    tagline: 'Seeding Change for a Greener Future',
    location: 'Sadalgaon, Tal-Shirur, Dist-Pune 411211',
    about: 'DS Green Agriculture delivers high-quality, farmer-first agri inputs — from soil conditioners to systemic pest controls — built for Maharashtra\'s diverse crops and soils. Trusted by farmers across Pune, Nashik and beyond.',
    founded: '2024',
    website: '',
    socialProof: '500+ farmers trust our products across Pune district',
    certifications: ['100% Organic', 'Eco Friendly', 'Safe for All Crops', 'ISO Certified'],
    productIds: ['ga-humi-gold', 'ga-grand-vita', 'ga-sandy-super', 'ga-all-sticky'],
    storeIds: ['ga-s1', 'ga-s2', 'ga-s3', 'ga-s4', 'ga-s5'],
    primaryColor: '#1a5c1a',
    accentColor: '#22c55e',
    phone: '7387502916',
    email: 'dsgreeagriculture2024@gmail.com',
  },
  'golden-future-life-care': {
    id: 'golden-future-life-care',
    name: 'Golden Future Life Care Pvt. Ltd.',
    tagline: 'मातीला द्या नवा जीव — उत्पन्नात वाढ नक्कीच!',
    location: 'Kolhapur, Maharashtra',
    about: 'Committed to organic and bio-farming solutions that restore soil health and deliver consistent, reliable crop yield for farmers across Maharashtra.',
    founded: '2018',
    website: 'https://goldenfuture.life/',
    socialProof: '1,000 bags sold in just 10 days',
    certifications: ['100% Organic', 'Chemical-Free', 'Premium Quality'],
    productIds: ['soil-amrut-gf', 'crop-magic-gf', 'root-magic-gf'],
    storeIds: ['gf-s1', 'gf-s2', 'gf-s3', 'gf-s4', 'gf-s5'],
    primaryColor: '#154212',
    accentColor: '#f57c00',
  }
};

export const INVENTORY = [
  { retailerId: "s1", productId: "p1", stock: 40, price: 1250 },
  { retailerId: "s1", productId: "p2", stock: 18, price: 890 },
  { retailerId: "s2", productId: "p3", stock: 22, price: 1450 },
  { retailerId: "s3", productId: "p4", stock: 35, price: 420 },
  { retailerId: "s4", productId: "p3", stock: 50, price: 320 },
  { retailerId: "s5", productId: "p1", stock: 60, price: 280 }
];
