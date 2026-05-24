import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme.dart';

// ─── Data models ─────────────────────────────────────────────────────────────

class _Hub {
  const _Hub({
    required this.id,
    required this.name,
    required this.emoji,
    required this.heroImage,
    required this.tagline,
    required this.seeds,
    required this.nutrition,
    required this.irrigation,
    required this.advisory,
    required this.growthStages,
    required this.commonMistakes,
    this.climate = 'Tropical',
    this.soil = 'Loamy',
    this.water = 'Moderate',
    this.season = 'Spring',
  });
  final String id, name, emoji, heroImage, tagline;
  final List<_Seed> seeds;
  final List<_Nutr> nutrition;
  final _Irrig irrigation;
  final _Advisory advisory;
  final List<_Stage> growthStages;
  final List<String> commonMistakes;
  final String climate, soil, water, season;
}

class _Seed {
  const _Seed(this.name, this.price, this.img);
  final String name;
  final int price;
  final String img;
}

class _Nutr {
  const _Nutr(this.name, this.desc);
  final String name, desc;
}

class _Irrig {
  const _Irrig(this.image, this.items);
  final String image;
  final List<_IrrigItem> items;
}

class _IrrigItem {
  const _IrrigItem(this.name, this.price);
  final String name, price;
}

class _Advisory {
  const _Advisory(this.title, this.description);
  final String title, description;
}

class _Stage {
  const _Stage(this.phase, this.duration, this.description, this.products);
  final String phase, duration, description;
  final List<String> products;
}

// ─── Fallback hub data ───────────────────────────────────────────────────────

const _hubs = <_Hub>[
  _Hub(
    id: 'mangoes',
    name: 'Mango',
    emoji: '🥭',
    heroImage:
        'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&q=80',
    tagline: 'Orchard management essentials for the King of Fruits.',
    climate: 'Hot & Humid',
    soil: 'Deep Loamy',
    water: 'Moderate',
    season: 'May – July',
    seeds: [
      _Seed('Alphonso Sapling', 250,
          'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&q=80'),
      _Seed('Kesar Sapling', 200,
          'https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&q=80'),
    ],
    nutrition: [
      _Nutr('NPK 10:26:26', 'Pre-flowering boost'),
      _Nutr('Zinc Sulphate', 'Healthy leaf growth'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Ring Irrigation Hose', '₹22/m'),
        _IrrigItem('Sprinkler Head', '₹60/pc'),
      ],
    ),
    advisory: _Advisory('Mango Hopper Management',
        'Hoppers cause significant flower drop. Monitor orchards during panicle emergence. Use neem-based sprays as a preventive measure.'),
    growthStages: [
      _Stage('Juvenile Phase', '1–3 Years',
          'Establishment of root system and canopy structure.', ['Urea', 'DAP', 'Micronutrients']),
      _Stage('Pre-Flowering', 'Nov – Dec',
          'Vegetative growth slows down as trees prepare for bloom.', ['NPK 10:26:26', 'Zinc']),
      _Stage('Flowering', 'Jan – Feb',
          'Critical panicle emergence and pollination period.', ['Boron', 'Calcium Nitrate']),
      _Stage('Fruit Development', 'Mar – May',
          'Rapid fruit sizing and sugar accumulation.', ['Potassium Nitrate', 'Power Plus']),
      _Stage('Harvest', 'May – July',
          'Maturity determination based on fruit shape and color.', ['Ethrel (ripening)']),
    ],
    commonMistakes: [
      'Over-irrigation during flowering causing flower drop.',
      'Neglecting pest control for Mango Hoppers during panicle stage.',
      'Improper pruning leading to dense canopies and low sunlight.',
    ],
  ),
  _Hub(
    id: 'watermelon',
    name: 'Watermelon',
    emoji: '🍉',
    heroImage:
        'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?auto=format&fit=crop&q=80',
    tagline: 'Everything from seed selection to final harvest, curated for maximum yield.',
    climate: 'Warm & Dry',
    soil: 'Sandy Loam',
    water: 'High',
    season: 'Summer',
    seeds: [
      _Seed('Sugar Baby', 250,
          'https://images.unsplash.com/photo-1563114773-84221bd62daa?auto=format&fit=crop&q=80'),
      _Seed('Power Plus Booster', 1350,
          'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png'),
    ],
    nutrition: [
      _Nutr('Urea (Nitrogen Rich)', 'For early vine growth'),
      _Nutr('NPK 19:19:19', 'Balanced flowering stage'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Drip Tape (16mm)', '₹12/m'),
        _IrrigItem('Micro Sprinklers', '₹45/pc'),
      ],
    ),
    advisory: _Advisory('Preventing Blossom End Rot',
        "Inconsistent watering leads to calcium deficiency, causing black sunken spots on the fruit's bottom. Ensure a steady moisture level."),
    growthStages: [
      _Stage('Germination', '1–2 Weeks', 'Seeds sprout and establish initial root system.',
          ['DAP', 'Humic Acid']),
      _Stage('Vegetative Growth', '3–5 Weeks', 'Rapid vine extension and leaf development.',
          ['Urea', 'Magnesium Sulphate']),
      _Stage('Flowering', '6–8 Weeks',
          'Appearance of male and female flowers for pollination.', ['NPK 19:19:19', 'Boron']),
      _Stage('Fruit Expansion', '9–12 Weeks',
          'Fruit gains size and develops internal sugars.', ['Potassium Sulphate', 'Calcium']),
      _Stage('Maturity', '12–14 Weeks',
          'Checking for thumping sound and yellow belly for harvest.', ['Power Plus']),
    ],
    commonMistakes: [
      'Irregular watering schedule leading to fruit cracking.',
      'Over-application of nitrogen during fruit set (reduces sweetness).',
      'Harvesting immature fruits which do not ripen after picking.',
    ],
  ),
  _Hub(
    id: 'cherry',
    name: 'Cherry',
    emoji: '🍒',
    heroImage:
        'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&q=80',
    tagline: 'Expert guidance for growing premium sweet and tart cherries.',
    climate: 'Cool Temperate',
    soil: 'Well-drained',
    water: 'Low-Moderate',
    season: 'Summer',
    seeds: [
      _Seed('Stella Cherry Sapling', 450,
          'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80'),
      _Seed('Bing Cherry Sapling', 400,
          'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&q=80'),
    ],
    nutrition: [
      _Nutr('Boron Solubor', 'Crucial for flower set'),
      _Nutr('Potassium Nitrate', 'Fruit size & sweetness'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Drip Laterals', '₹20/m'),
        _IrrigItem('Tensiometer', '₹1800/pc'),
      ],
    ),
    advisory: _Advisory('Managing Rain Cracking',
        'Rain during harvest can cause fruit to split. Use calcium sprays and protective covers where possible.'),
    growthStages: [
      _Stage('Dormancy', 'Winter', 'Pruning and sanitation to prepare for new season.',
          ['Copper Oxychloride']),
      _Stage('Bud Break', 'Early Spring', 'First signs of green tissue and flower buds.',
          ['Nitrogen', 'Zinc']),
      _Stage(
          'Bloom', 'Spring', 'Pollination phase, critical for final yield.', ['Boron', 'Bees']),
      _Stage('Fruit Development', 'Late Spring', 'Rapid cell division and fruit sizing.',
          ['Calcium Nitrate', 'Potash']),
      _Stage('Harvest', 'Summer', 'Picking based on color, firmness, and brix level.',
          ['Seaweed Extract']),
    ],
    commonMistakes: [
      'Heavy pruning in late spring (increases disease risk).',
      'Poor drainage leading to root rot in cherry trees.',
      'Harvesting too early before full sugar development.',
    ],
  ),
  _Hub(
    id: 'pomegranate',
    name: 'Pomegranate',
    emoji: '🍎',
    heroImage:
        'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80',
    tagline: 'Expert guidance for growing premium export-quality pomegranates.',
    climate: 'Semi-Arid',
    soil: 'Sandy Loam',
    water: 'Low-Moderate',
    season: 'Oct – Feb',
    seeds: [
      _Seed('Bhagwa Sapling', 150,
          'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80'),
      _Seed('Ganesh Sapling', 120,
          'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80'),
    ],
    nutrition: [
      _Nutr('Calcium Nitrate', 'Prevents fruit cracking'),
      _Nutr('Boron', 'Improves fruit set'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Inline Drip Tube', '₹18/m'),
        _IrrigItem('Fertigation Pump', '₹2500/pc'),
      ],
    ),
    advisory: _Advisory('Managing Bacterial Blight',
        'Bacterial blight causes spots on leaves and fruit. Maintain orchard hygiene and prune affected branches.'),
    growthStages: [
      _Stage('New Flush', 'Spring', 'New vegetative growth after pruning.', ['Urea', 'Micronutrients']),
      _Stage('Flowering', '30–45 Days', 'Emergence of hermaphrodite flowers.',
          ['Boron', 'Potassium Nitrate']),
      _Stage('Fruit Set', '15–20 Days', 'Initial fruit development from pollinated flowers.',
          ['Calcium Nitrate']),
      _Stage('Fruit Sizing', '90–120 Days', 'Longest phase where fruit reaches market size.',
          ['SOP (0:0:50)', 'Gibberellic Acid']),
      _Stage('Harvest', 'Final Stage',
          'Harvesting when fruit develops typical color and shine.', ['Power Plus']),
    ],
    commonMistakes: [
      'Neglecting bacterial blight monitoring during monsoon.',
      'Over-irrigation leading to fruit cracking during maturity.',
      'Improper thinning of fruits leading to small sizes.',
    ],
  ),
  _Hub(
    id: 'grapes',
    name: 'Grapes',
    emoji: '🍇',
    heroImage:
        'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&q=80',
    tagline: 'Complete viticulture solutions for table and wine grape varieties.',
    climate: 'Mediterranean',
    soil: 'Well-drained Loam',
    water: 'Moderate',
    season: 'Late Summer',
    seeds: [
      _Seed('Thompson Seedless', 80,
          'https://images.unsplash.com/photo-1537248174116-24f6fc1edff0?auto=format&fit=crop&q=80'),
      _Seed('Sharad Seedless', 90,
          'https://images.unsplash.com/photo-1616142718109-c16fbeae5604?auto=format&fit=crop&q=80'),
    ],
    nutrition: [
      _Nutr('Potassium Sulphate', 'Enhances fruit size & sugar'),
      _Nutr('Magnesium', 'Prevents yellowing'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Dripper Line 2.4 LPH', '₹15/m'),
        _IrrigItem('Moisture Sensor', '₹850/pc'),
      ],
    ),
    advisory: _Advisory('Controlling Powdery Mildew',
        'Powdery mildew thrives in humid conditions. Ensure good canopy ventilation and apply sulfur-based fungicides preventively.'),
    growthStages: [
      _Stage('Bud Break', 'Late Winter', 'New green growth emerges from dormant buds.',
          ['Urea', 'Zinc']),
      _Stage('Bloom', 'Spring', 'Flowering and pollination stage.', ['Boron', 'GA3']),
      _Stage('Fruit Set', 'Post-Bloom', 'Berries begin to develop.', ['NPK 19:19:19']),
      _Stage('Veraison', 'Summer', 'Berries soften and begin to change color.',
          ['Potassium Sulphate']),
      _Stage('Harvest', 'Late Summer', 'Picking when sugar levels (Brix) are optimal.',
          ['Silicon']),
    ],
    commonMistakes: [
      'Poor canopy management leading to lack of sunlight.',
      'Delaying sulfur application for mildew control.',
      'Late nitrogen application affecting fruit storage life.',
    ],
  ),
  _Hub(
    id: 'banana',
    name: 'Banana',
    emoji: '🍌',
    heroImage:
        'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&q=80',
    tagline: 'Scale your plantation with tissue culture and expert management.',
    climate: 'Tropical Humid',
    soil: 'Rich Loamy',
    water: 'High',
    season: 'Year-Round',
    seeds: [
      _Seed('G-9 Tissue Culture', 18,
          'https://images.unsplash.com/photo-1571141380069-521a19e0576c?auto=format&fit=crop&q=80'),
      _Seed('Power Plus Booster', 1350,
          'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png'),
    ],
    nutrition: [
      _Nutr('Potassium (MOP)', 'Crucial for bunch weight'),
      _Nutr('Boron', 'Prevents fruit cracking'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Drip system (2-way)', '₹45/plant'),
        _IrrigItem('Venturi unit', '₹1500/pc'),
      ],
    ),
    advisory: _Advisory('Sigatoka Leaf Spot Control',
        'Remove and burn infected leaves. Maintain field sanitation and apply recommended fungicides promptly.'),
    growthStages: [
      _Stage('Establishment', '0–3 Months', 'Initial growth of tissue culture plantlets.',
          ['DAP', 'Urea']),
      _Stage('Vegetative', '3–7 Months', 'Leaf production and stem thickening.',
          ['Urea', 'Potash']),
      _Stage('Flower Initiation', '7–9 Months', 'Emergence of the flower bud (bell).',
          ['Boron', 'Zinc']),
      _Stage('Bunch Dev', '9–12 Months', 'Fruit hands develop and increase in weight.',
          ['MOP (Potash)', 'SOP']),
      _Stage('Harvest', '12–14 Months', 'Maturity reached when fingers are rounded.',
          ['Seaweed']),
    ],
    commonMistakes: [
      'Allowing too many suckers to grow (competes for nutrition).',
      'Neglecting Sigatoka leaf spot during rainy season.',
      'Inadequate potassium during bunch development.',
    ],
  ),
  _Hub(
    id: 'sugarcane',
    name: 'Sugarcane',
    emoji: '🌿',
    heroImage:
        'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&q=80',
    tagline: 'Advanced solutions for maximizing sugar recovery and tonnage.',
    climate: 'Tropical',
    soil: 'Deep Clay Loam',
    water: 'High',
    season: 'Oct – Mar',
    seeds: [
      _Seed('Co 86032 Sets', 450,
          'https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&q=80'),
      _Seed('Power Plus Booster', 2150,
          'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png'),
    ],
    nutrition: [
      _Nutr('Urea', 'High nitrogen for canopy'),
      _Nutr('DAP', 'Root establishment'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Sub-surface Drip', '₹25/m'),
        _IrrigItem('Pressure Gauge', '₹450/pc'),
      ],
    ),
    advisory: _Advisory('Controlling Internode Borer',
        'Release Trichogramma parasites. Avoid excessive nitrogen fertilizer in later stages.'),
    growthStages: [
      _Stage('Germination', '0–60 Days', 'Sets sprout and establish initial roots.',
          ['DAP', 'Bio-fertilizers']),
      _Stage('Tillering', '60–120 Days', 'Production of multiple shoots from the base.',
          ['Urea', 'Zinc']),
      _Stage('Grand Growth', '120–270 Days', 'Rapid stalk elongation and sugar storage.',
          ['Potash', 'Sulphur']),
      _Stage('Maturity', '270–360 Days', 'Ripening and accumulation of sucrose.',
          ['Power Plus']),
    ],
    commonMistakes: [
      'Late harvesting leading to sugar inversion.',
      'Excessive nitrogen late in the season (reduces sugar %).',
      'Improper trash management after harvest.',
    ],
  ),
  _Hub(
    id: 'cotton',
    name: 'Cotton',
    emoji: '🌱',
    heroImage:
        'https://images.unsplash.com/photo-1594904351111-a072f80b1a71?auto=format&fit=crop&q=80',
    tagline: 'High-performance seeds and protection for your cotton crop.',
    climate: 'Warm & Dry',
    soil: 'Black Cotton Soil',
    water: 'Moderate',
    season: 'Jun – Nov',
    seeds: [
      _Seed('BG-II Hybrid', 850,
          'https://images.unsplash.com/photo-1599307767316-776533bb941c?auto=format&fit=crop&q=80'),
      _Seed('Power Plus Booster', 1350,
          'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png'),
    ],
    nutrition: [
      _Nutr('Magnesium Sulphate', 'Prevents reddening of leaves'),
      _Nutr('Urea', 'Vegetative growth boost'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Rain Pipe', '₹18/m'),
        _IrrigItem('Water Pump 5HP', '₹15000/pc'),
      ],
    ),
    advisory: _Advisory('Pink Bollworm Management',
        'Use pheromone traps to monitor adult activity. Avoid late-season irrigation to reduce pest pressure.'),
    growthStages: [
      _Stage('Seedling', '0–25 Days', 'Emergence and initial leaf development.',
          ['DAP', 'Insecticides']),
      _Stage('Squaring', '25–50 Days', 'First flower buds (squares) appear.',
          ['Magnesium Sulphate']),
      _Stage('Flowering', '50–80 Days', 'Opening of flowers and boll initiation.',
          ['Boron', 'Urea']),
      _Stage('Boll Dev', '80–120 Days', 'Bolls increase in size and fiber develops.',
          ['Potassium Nitrate']),
      _Stage('Maturity', '120–160 Days', 'Bolls open and lint is ready for picking.',
          ['Defoliants']),
    ],
    commonMistakes: [
      'Delaying pest control for pink bollworm.',
      'Improper plant spacing leading to poor airflow.',
      'Excessive irrigation during boll opening stage.',
    ],
  ),
  _Hub(
    id: 'onion',
    name: 'Onion',
    emoji: '🧅',
    heroImage:
        'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&q=80',
    tagline: 'Scale your onion production with expert insights and high-yield varieties.',
    climate: 'Mild & Dry',
    soil: 'Sandy Loam',
    water: 'Moderate',
    season: 'Oct – Feb',
    seeds: [
      _Seed('Bhima Super', 1200,
          'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&q=80'),
      _Seed('Power Plus Booster', 1350,
          'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png'),
    ],
    nutrition: [
      _Nutr('Sulphur 90%', 'Improves pungency & shelf life'),
      _Nutr('NPK 10:26:26', 'Base dose for bulb development'),
    ],
    irrigation: _Irrig(
      'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c18?auto=format&fit=crop&q=80',
      [
        _IrrigItem('Drip Lateral (16mm)', '₹14/m'),
        _IrrigItem('Venturi Injector', '₹1200/pc'),
      ],
    ),
    advisory: _Advisory('Managing Purple Blotch',
        'Purple blotch is a common fungal disease. Avoid overhead irrigation and maintain plant spacing.'),
    growthStages: [
      _Stage('Nursery', '45–50 Days', 'Growing seedlings before transplanting.',
          ['Fungicides', 'DAP']),
      _Stage('Vegetative', '30–40 Days', 'Leaf growth after transplanting.', ['Urea', 'Sulphur']),
      _Stage('Bulb Initiation', '40–60 Days', 'The base begins to swell into a bulb.',
          ['NPK 10:26:26']),
      _Stage('Bulb Dev', '60–100 Days', 'Maximum increase in bulb size and weight.',
          ['Potash', 'Micronutrients']),
      _Stage('Maturity', '100–120 Days', 'Leaves begin to yellow and fall over.',
          ['Power Plus']),
    ],
    commonMistakes: [
      'Over-watering during the bulb maturity stage.',
      'Neglecting thrips control in early stages.',
      'High nitrogen application during bulb storage preparation.',
    ],
  ),
];

// ─── Screen ───────────────────────────────────────────────────────────────────

class HubScreen extends StatefulWidget {
  const HubScreen({super.key});

  @override
  State<HubScreen> createState() => _HubScreenState();
}

class _HubScreenState extends State<HubScreen> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final hub = _hubs[_selectedIndex];
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(hub: hub),
            _CropTabs(
              hubs: _hubs,
              selectedIndex: _selectedIndex,
              onTap: (i) => setState(() => _selectedIndex = i),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _HeroSection(hub: hub),
                    _StatsGrid(hub: hub),
                    _GrowthJourney(hub: hub),
                    _ThreeCards(hub: hub),
                    _MistakesSection(hub: hub),
                    _AdvisorySection(hub: hub),
                    _FaqSection(hub: hub),
                    const SizedBox(height: 48),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Row(
        children: [
          Text(
            '${hub.emoji}  ${hub.name} Hub',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(999),
            ),
            child: const Text(
              'FREE',
              style: TextStyle(
                fontSize: 9,
                color: AppColors.primary,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Crop Tabs ───────────────────────────────────────────────────────────────

class _CropTabs extends StatelessWidget {
  const _CropTabs({
    required this.hubs,
    required this.selectedIndex,
    required this.onTap,
  });
  final List<_Hub> hubs;
  final int selectedIndex;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: hubs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final selected = i == selectedIndex;
          return GestureDetector(
            onTap: () => onTap(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                color: selected ? AppColors.primary : Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selected ? AppColors.primary : AppColors.border,
                ),
              ),
              child: Text(
                '${hubs[i].emoji} ${hubs[i].name}',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : AppColors.text,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

class _HeroSection extends StatelessWidget {
  const _HeroSection({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: SizedBox(
          height: 240,
          child: Stack(
            fit: StackFit.expand,
            children: [
              CachedNetworkImage(
                imageUrl: hub.heroImage,
                fit: BoxFit.cover,
                placeholder: (_, __) => Container(color: AppColors.surfaceAlt),
                errorWidget: (_, __, ___) => Container(
                  color: AppColors.surfaceAlt,
                  child: const Icon(Icons.image_outlined,
                      size: 64, color: AppColors.muted),
                ),
              ),
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black87],
                  ),
                ),
              ),
              Positioned(
                bottom: 20,
                left: 20,
                right: 20,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'OFFICIAL CROP HUB',
                        style: TextStyle(
                          fontSize: 9,
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${hub.name} Hub',
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      hub.tagline,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.85),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Stats Grid ──────────────────────────────────────────────────────────────

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    final stats = [
      (Icons.wb_sunny_outlined, 'Ideal Climate', hub.climate, const Color(0xFFFFF2C7)),
      (Icons.grass_outlined, 'Soil Type', hub.soil, const Color(0xFFFFEAD2)),
      (Icons.water_drop_outlined, 'Water Needs', hub.water, const Color(0xFFDDEEFB)),
      (Icons.calendar_month_outlined, 'Best Season', hub.season, const Color(0xFFE7F4EC)),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 2,
        childAspectRatio: 2.2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        children: stats.map((s) {
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: s.$4,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(s.$1, size: 22, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(s.$2,
                          style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: AppColors.muted,
                              letterSpacing: 0.5)),
                      Text(s.$3,
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.text),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─── Growth Journey ───────────────────────────────────────────────────────────

class _GrowthJourney extends StatelessWidget {
  const _GrowthJourney({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    if (hub.growthStages.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Growth Journey',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          const Text('From seed to harvest — step by step',
              style: TextStyle(
                  fontSize: 11,
                  color: AppColors.muted,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3)),
          const SizedBox(height: 16),
          ...hub.growthStages.asMap().entries.map((entry) {
            final i = entry.key;
            final stage = entry.value;
            final isLast = i == hub.growthStages.length - 1;
            return IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: const BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text('${i + 1}',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12)),
                        ),
                      ),
                      if (!isLast)
                        Expanded(
                          child: Container(
                            width: 2,
                            color: AppColors.border,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(stage.phase,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700, fontSize: 14)),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(alpha: 0.10),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(stage.duration,
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w700)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(stage.description,
                                style: const TextStyle(
                                    fontSize: 12, color: AppColors.muted, height: 1.4)),
                            const SizedBox(height: 8),
                            const Text('Recommended Products',
                                style: TextStyle(
                                    fontSize: 9,
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.5)),
                            const SizedBox(height: 4),
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: stage.products
                                  .map((p) => Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: AppColors.border),
                                        ),
                                        child: Text(p,
                                            style: const TextStyle(
                                                fontSize: 11, fontWeight: FontWeight.w600)),
                                      ))
                                  .toList(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Seeds / Nutrition / Irrigation ──────────────────────────────────────────

class _ThreeCards extends StatelessWidget {
  const _ThreeCards({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        children: [
          _SeedsCard(hub: hub),
          const SizedBox(height: 16),
          _NutritionCard(hub: hub),
          const SizedBox(height: 16),
          _IrrigationCard(hub: hub),
        ],
      ),
    );
  }
}

class _SeedsCard extends StatelessWidget {
  const _SeedsCard({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Premium Seeds',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.tintEmerald,
                  borderRadius: BorderRadius.circular(12),
                ),
                child:
                    const Icon(Icons.eco_outlined, color: AppColors.primary, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: hub.seeds.map((seed) {
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: seed == hub.seeds.last ? 0 : 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: AspectRatio(
                          aspectRatio: 1,
                          child: CachedNetworkImage(
                            imageUrl: seed.img,
                            fit: BoxFit.cover,
                            placeholder: (_, __) =>
                                Container(color: AppColors.surfaceAlt),
                            errorWidget: (_, __, ___) =>
                                Container(color: AppColors.surfaceAlt,
                                    child: const Icon(Icons.grass_outlined,
                                        color: AppColors.muted)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(seed.name,
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w700),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                      Text('₹${seed.price}/unit',
                          style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _NutritionCard extends StatelessWidget {
  const _NutritionCard({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Targeted Nutrition',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.tintAmber,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.science_outlined,
                    color: AppColors.harvest, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...hub.nutrition.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.science_outlined,
                            color: AppColors.primary, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.name,
                                style: const TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.w700)),
                            Text(item.desc,
                                style: const TextStyle(
                                    fontSize: 11, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: AppColors.muted, size: 18),
                    ],
                  ),
                ),
              )),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {},
              child: const Text('Explore Fertilizers'),
            ),
          ),
        ],
      ),
    );
  }
}

class _IrrigationCard extends StatelessWidget {
  const _IrrigationCard({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Irrigation Tools',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.tintSky,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.water_drop_outlined,
                    color: Color(0xFF0369A1), size: 20),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 140,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  CachedNetworkImage(
                    imageUrl: hub.irrigation.image,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AppColors.surfaceAlt),
                    errorWidget: (_, __, ___) =>
                        Container(color: AppColors.surfaceAlt),
                  ),
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black54],
                      ),
                    ),
                  ),
                  const Positioned(
                    bottom: 10,
                    left: 12,
                    child: Text('System Setup',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          ...hub.irrigation.items.asMap().entries.map((entry) {
            final isLast = entry.key == hub.irrigation.items.length - 1;
            final item = entry.value;
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: isLast
                    ? null
                    : const Border(bottom: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(item.name,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w600)),
                  ),
                  Text(item.price,
                      style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w800)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Common Mistakes ─────────────────────────────────────────────────────────

class _MistakesSection extends StatelessWidget {
  const _MistakesSection({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    if (hub.commonMistakes.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A1A),
          borderRadius: BorderRadius.circular(28),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
              ),
              child: const Text('PRO TIP: AVOID THESE',
                  style: TextStyle(
                      fontSize: 10,
                      color: Colors.redAccent,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5)),
            ),
            const SizedBox(height: 12),
            const Text('Mistakes to Avoid',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.white)),
            const SizedBox(height: 6),
            Text(
              'Avoiding these can increase your yield by up to 25%.',
              style: TextStyle(
                  fontSize: 13,
                  color: Colors.white.withValues(alpha: 0.60),
                  height: 1.4),
            ),
            const SizedBox(height: 16),
            ...hub.commonMistakes.map((m) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(14),
                      border:
                          Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: Colors.red.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.close,
                              size: 13, color: Colors.redAccent),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(m,
                              style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.white.withValues(alpha: 0.85),
                                  height: 1.4)),
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        ),
      ),
    );
  }
}

// ─── Advisory Section ─────────────────────────────────────────────────────────

class _AdvisorySection extends StatelessWidget {
  const _AdvisorySection({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.20)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text('AGRONOMY EXPERT INSIGHT',
                      style: TextStyle(
                          fontSize: 9,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5)),
                ),
                const SizedBox(width: 8),
                Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                        color: AppColors.harvest, shape: BoxShape.circle)),
              ],
            ),
            const SizedBox(height: 12),
            Text(hub.advisory.title,
                style: const TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w800, height: 1.2)),
            const SizedBox(height: 10),
            Text(hub.advisory.description,
                style: const TextStyle(
                    fontSize: 14, color: AppColors.muted, height: 1.5)),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.chat_outlined, size: 16),
                    label: const Text('Consult Specialist'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── FAQ Section ─────────────────────────────────────────────────────────────

class _FaqSection extends StatelessWidget {
  const _FaqSection({required this.hub});
  final _Hub hub;

  @override
  Widget build(BuildContext context) {
    final faqs = [
      ('What is the best time to plant ${hub.name}?',
          'For optimal results, planting should occur during ${hub.season.toLowerCase()} when soil temperature is stable.'),
      ('How often should I water my ${hub.name} crop?',
          '${hub.name} requires ${hub.water.toLowerCase()} watering. Frequency should increase during fruit set and high-temperature days.'),
      ('What soil type is ideal for ${hub.name}?',
          'Most varieties thrive in ${hub.soil.toLowerCase()} soil with a pH range of 6.0 to 7.5.'),
      ('Can I grow ${hub.name} in a greenhouse?',
          'Yes, ${hub.name} can be cultivated in controlled environments if temperature and light are precisely managed per growth stages.'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Farmer's Wisdom",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Essential knowledge for ${hub.name} growers',
                style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            const SizedBox(height: 16),
            ...faqs.map((faq) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceAlt,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                color: AppColors.primary.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Center(
                                child: Text('Q',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: AppColors.primary,
                                        fontWeight: FontWeight.w800)),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(faq.$1,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700, fontSize: 13)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.only(left: 30),
                          child: Text(faq.$2,
                              style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                  height: 1.5)),
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
