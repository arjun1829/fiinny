import '../../../core/models/hub_model.dart';

/// Fallback hubs used when Firestore fetch fails or returns empty.
/// Mirrors the web's initialHubs.ts.
const List<Map<String, dynamic>> kInitialHubsRaw = [
  {
    'id': 'mangoes',
    'name': 'Mango',
    'heroImage': 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&q=80',
    'tagline': 'Orchard management essentials for the King of Fruits.',
    'idealClimate': 'Tropical',
    'soilType': 'Loamy',
    'waterNeeds': 'Moderate',
    'bestSeason': 'Spring',
    'seeds': [
      {'name': 'Alphonso Sapling', 'price': 250.0, 'img': 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&q=80'},
      {'name': 'Kesar Sapling', 'price': 200.0, 'img': 'https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'NPK 10:26:26', 'desc': 'Pre-flowering boost', 'icon': 'Sprout'},
      {'name': 'Zinc Sulphate', 'desc': 'Healthy leaf growth', 'icon': 'Science'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Ring Irrigation Hose', 'price': '₹22/m'},
        {'name': 'Sprinkler Head', 'price': '₹60/pc'},
      ],
    },
    'advisory': {
      'title': 'Mango Hopper Management',
      'description': 'Hoppers cause significant flower drop. Monitor orchards during panicle emergence. Use neem-based sprays as a preventive measure.',
    },
    'growthStages': [
      {'phase': 'Juvenile Phase', 'duration': '1-3 Years', 'description': 'Establishment of root system and canopy structure.', 'products': ['Urea', 'DAP', 'Micronutrients']},
      {'phase': 'Pre-Flowering', 'duration': 'Nov - Dec', 'description': 'Vegetative growth slows down as trees prepare for bloom.', 'products': ['NPK 10:26:26', 'Zinc']},
      {'phase': 'Flowering', 'duration': 'Jan - Feb', 'description': 'Critical panicle emergence and pollination period.', 'products': ['Boron', 'Calcium Nitrate']},
      {'phase': 'Fruit Development', 'duration': 'Mar - May', 'description': 'Rapid fruit sizing and sugar accumulation.', 'products': ['Potassium Nitrate', 'Power Plus']},
      {'phase': 'Harvest', 'duration': 'May - July', 'description': 'Maturity determination based on fruit shape and color.', 'products': ['Ethrel (for ripening)']},
    ],
    'commonMistakes': [
      'Over-irrigation during flowering causing flower drop.',
      'Neglecting pest control for Mango Hoppers during panicle stage.',
      'Improper pruning leading to dense canopies and low sunlight.',
    ],
  },
  {
    'id': 'watermelon',
    'name': 'Watermelon',
    'heroImage': 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&q=80',
    'tagline': 'Everything required from seed selection to final harvest, curated for maximum yield.',
    'idealClimate': 'Hot & Dry',
    'soilType': 'Sandy Loam',
    'waterNeeds': 'High',
    'bestSeason': 'Summer',
    'seeds': [
      {'name': 'Sugar Baby', 'price': 250.0, 'img': 'https://images.unsplash.com/photo-1582281298055-e25b84a30b0b?auto=format&fit=crop&q=80'},
      {'name': 'Power Plus Booster', 'price': 1350.0, 'img': 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'Urea (Nitrogen Rich)', 'desc': 'For early vine growth', 'icon': 'Water'},
      {'name': 'NPK 19:19:19', 'desc': 'Balanced flowering stage', 'icon': 'Sprout'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Drip Tape (16mm)', 'price': '₹12/m'},
        {'name': 'Micro Sprinklers', 'price': '₹45/pc'},
      ],
    },
    'advisory': {
      'title': 'Preventing Blossom End Rot',
      'description': 'Inconsistent watering leads to calcium deficiency, causing black sunken spots on the fruit\'s bottom. Ensure a steady moisture level.',
    },
    'growthStages': [
      {'phase': 'Germination', 'duration': '1-2 Weeks', 'description': 'Seeds sprout and establish initial root system.', 'products': ['DAP', 'Humic Acid']},
      {'phase': 'Vegetative Growth', 'duration': '3-5 Weeks', 'description': 'Rapid vine extension and leaf development.', 'products': ['Urea', 'Magnesium Sulphate']},
      {'phase': 'Flowering', 'duration': '6-8 Weeks', 'description': 'Appearance of male and female flowers for pollination.', 'products': ['NPK 19:19:19', 'Boron']},
      {'phase': 'Fruit Expansion', 'duration': '9-12 Weeks', 'description': 'Fruit gains size and develops internal sugars.', 'products': ['Potassium Sulphate', 'Calcium']},
      {'phase': 'Maturity', 'duration': '12-14 Weeks', 'description': 'Checking for thumping sound and yellow belly for harvest.', 'products': ['Power Plus']},
    ],
    'commonMistakes': [
      'Irregular watering schedule leading to fruit cracking.',
      'Over-application of nitrogen during fruit set (reduces sweetness).',
      'Harvesting immature fruits which do not ripen after picking.',
    ],
  },
  {
    'id': 'pomegranate',
    'name': 'Pomegranate',
    'heroImage': 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80',
    'tagline': 'Expert guidance and tools for growing premium export-quality pomegranates.',
    'idealClimate': 'Semi-Arid',
    'soilType': 'Well-drained Loam',
    'waterNeeds': 'Low to Moderate',
    'bestSeason': 'Spring',
    'seeds': [
      {'name': 'Bhagwa Sapling', 'price': 150.0, 'img': 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80'},
      {'name': 'Ganesh Sapling', 'price': 120.0, 'img': 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'Calcium Nitrate', 'desc': 'Prevents fruit cracking', 'icon': 'Science'},
      {'name': 'Boron', 'desc': 'Improves fruit set', 'icon': 'Sprout'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Inline Drip Tube', 'price': '₹18/m'},
        {'name': 'Fertigation Pump', 'price': '₹2500/pc'},
      ],
    },
    'advisory': {
      'title': 'Managing Bacterial Blight',
      'description': 'Bacterial blight causes spots on leaves and fruit. Maintain orchard hygiene and prune affected branches.',
    },
    'growthStages': [
      {'phase': 'New Flush', 'duration': 'Spring', 'description': 'New vegetative growth after pruning.', 'products': ['Urea', 'Micronutrients']},
      {'phase': 'Flowering', 'duration': '30-45 Days', 'description': 'Emergence of hermaphrodite flowers.', 'products': ['Boron', 'Potassium Nitrate']},
      {'phase': 'Fruit Set', 'duration': '15-20 Days', 'description': 'Initial fruit development from pollinated flowers.', 'products': ['Calcium Nitrate']},
      {'phase': 'Fruit Sizing', 'duration': '90-120 Days', 'description': 'Longest phase where fruit reaches market size.', 'products': ['SOP (0:0:50)', 'Gibberellic Acid']},
      {'phase': 'Harvest', 'duration': 'Final Stage', 'description': 'Harvesting when fruit develops typical color and shine.', 'products': ['Power Plus']},
    ],
    'commonMistakes': [
      'Neglecting bacterial blight monitoring during monsoon.',
      'Over-irrigation leading to fruit cracking during maturity.',
      'Improper thinning of fruits leading to small sizes.',
    ],
  },
  {
    'id': 'grapes',
    'name': 'Grapes',
    'heroImage': 'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&q=80',
    'tagline': 'Complete viticulture solutions for table and wine grape varieties.',
    'idealClimate': 'Mediterranean',
    'soilType': 'Sandy Loam',
    'waterNeeds': 'Moderate',
    'bestSeason': 'Spring',
    'seeds': [
      {'name': 'Thompson Seedless', 'price': 80.0, 'img': 'https://images.unsplash.com/photo-1537248174116-24f6fc1edff0?auto=format&fit=crop&q=80'},
      {'name': 'Sharad Seedless', 'price': 90.0, 'img': 'https://images.unsplash.com/photo-1616142718109-c16fbeae5604?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'Potassium Sulphate', 'desc': 'Enhances fruit size & sugar', 'icon': 'Science'},
      {'name': 'Magnesium', 'desc': 'Prevents yellowing', 'icon': 'Water'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Dripper Line 2.4 LPH', 'price': '₹15/m'},
        {'name': 'Moisture Sensor', 'price': '₹850/pc'},
      ],
    },
    'advisory': {
      'title': 'Controlling Powdery Mildew',
      'description': 'Powdery mildew thrives in humid conditions. Ensure good canopy ventilation and apply sulfur.',
    },
    'growthStages': [
      {'phase': 'Bud Break', 'duration': 'Late Winter', 'description': 'New green growth emerges from dormant buds.', 'products': ['Urea', 'Zinc']},
      {'phase': 'Bloom', 'duration': 'Spring', 'description': 'Flowering and pollination stage.', 'products': ['Boron', 'GA3']},
      {'phase': 'Fruit Set', 'duration': 'Post-Bloom', 'description': 'Berries begin to develop.', 'products': ['NPK 19:19:19']},
      {'phase': 'Veraison', 'duration': 'Summer', 'description': 'Berries soften and begin to change color.', 'products': ['Potassium Sulphate']},
      {'phase': 'Harvest', 'duration': 'Late Summer', 'description': 'Picking when sugar levels (Brix) are optimal.', 'products': ['Silicon']},
    ],
    'commonMistakes': [
      'Poor canopy management leading to lack of sunlight.',
      'Delaying sulfur application for mildew control.',
      'Late nitrogen application affecting fruit storage life.',
    ],
  },
  {
    'id': 'banana',
    'name': 'Banana',
    'heroImage': 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&q=80',
    'tagline': 'Scale your plantation with tissue culture and expert management.',
    'idealClimate': 'Tropical',
    'soilType': 'Rich Loam',
    'waterNeeds': 'High',
    'bestSeason': 'Year Round',
    'seeds': [
      {'name': 'G-9 Tissue Culture', 'price': 18.0, 'img': 'https://images.unsplash.com/photo-1571141380069-521a19e0576c?auto=format&fit=crop&q=80'},
      {'name': 'Grand Naine', 'price': 25.0, 'img': 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'Potassium (MOP)', 'desc': 'Crucial for bunch weight', 'icon': 'Science'},
      {'name': 'Boron', 'desc': 'Prevents fruit cracking', 'icon': 'Sprout'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Drip system (2-way)', 'price': '₹45/plant'},
        {'name': 'Venturi unit', 'price': '₹1500/pc'},
      ],
    },
    'advisory': {
      'title': 'Sigatoka Leaf Spot Control',
      'description': 'Remove and burn infected leaves. Maintain field sanitation and apply recommended fungicides.',
    },
    'growthStages': [
      {'phase': 'Establishment', 'duration': '0-3 Months', 'description': 'Initial growth of tissue culture plantlets.', 'products': ['DAP', 'Urea']},
      {'phase': 'Vegetative', 'duration': '3-7 Months', 'description': 'Leaf production and stem thickening.', 'products': ['Urea', 'Potash']},
      {'phase': 'Flower Initiation', 'duration': '7-9 Months', 'description': 'Emergence of the flower bud (bell).', 'products': ['Boron', 'Zinc']},
      {'phase': 'Bunch Dev', 'duration': '9-12 Months', 'description': 'Fruit hands develop and increase in weight.', 'products': ['MOP (Potash)', 'SOP']},
      {'phase': 'Harvest', 'duration': '12-14 Months', 'description': 'Maturity reached when fingers are rounded.', 'products': ['Seaweed']},
    ],
    'commonMistakes': [
      'Allowing too many suckers to grow (competes for nutrition).',
      'Neglecting Sigatoka leaf spot during rainy season.',
      'Inadequate potassium during bunch development.',
    ],
  },
  {
    'id': 'onion',
    'name': 'Onion',
    'heroImage': 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&q=80',
    'tagline': 'Scale your onion production with expert insights and high-yield varieties.',
    'idealClimate': 'Cool & Dry',
    'soilType': 'Sandy Loam',
    'waterNeeds': 'Moderate',
    'bestSeason': 'Winter',
    'seeds': [
      {'name': 'Bhima Super', 'price': 1200.0, 'img': 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&q=80'},
      {'name': 'Nasik Red', 'price': 950.0, 'img': 'https://images.unsplash.com/photo-1567529684892-09290a1b2d05?auto=format&fit=crop&q=80'},
    ],
    'nutrition': [
      {'name': 'Sulphur 90%', 'desc': 'Improves pungency & shelf life', 'icon': 'Science'},
      {'name': 'NPK 10:26:26', 'desc': 'Base dose for bulb development', 'icon': 'Sprout'},
    ],
    'irrigation': {
      'image': 'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c18?auto=format&fit=crop&q=80',
      'items': [
        {'name': 'Drip Lateral (16mm)', 'price': '₹14/m'},
        {'name': 'Venturi Injector', 'price': '₹1200/pc'},
      ],
    },
    'advisory': {
      'title': 'Managing Purple Blotch',
      'description': 'Purple blotch is a common fungal disease. Avoid overhead irrigation and maintain spacing.',
    },
    'growthStages': [
      {'phase': 'Nursery', 'duration': '45-50 Days', 'description': 'Growing seedlings before transplanting.', 'products': ['Fungicides', 'DAP']},
      {'phase': 'Vegetative', 'duration': '30-40 Days', 'description': 'Leaf growth after transplanting.', 'products': ['Urea', 'Sulphur']},
      {'phase': 'Bulb Initiation', 'duration': '40-60 Days', 'description': 'The base begins to swell into a bulb.', 'products': ['NPK 10:26:26']},
      {'phase': 'Bulb Dev', 'duration': '60-100 Days', 'description': 'Maximum increase in bulb size and weight.', 'products': ['Potash', 'Micronutrients']},
      {'phase': 'Maturity', 'duration': '100-120 Days', 'description': 'Leaves begin to yellow and fall over.', 'products': ['Power Plus']},
    ],
    'commonMistakes': [
      'Over-watering during the bulb maturity stage.',
      'Neglecting thrips control in early stages.',
      'High nitrogen application during bulb storage preparation.',
    ],
  },
];

List<HubModel> get kInitialHubs =>
    kInitialHubsRaw.map(HubModel.fromMap).toList();
