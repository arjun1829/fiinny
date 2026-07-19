export type Hub = {
  id: string;
  name: string;
  heroImage: string;
  iconImage?: string;
  tagline: string;
  seeds: { name: string; price: number; img: string }[];
  nutrition: { name: string; desc: string; icon: string }[];
  irrigation: { image: string; items: { name: string; price: string }[] };
  advisory: { title: string; description: string };
  growthStages?: { phase: string; duration: string; description: string; products: string[] }[];
  commonMistakes?: string[];
  idealClimate?: string;
  soilType?: string;
  waterNeeds?: string;
  bestSeason?: string;
  videos?: { id: string; title: string; url: string; thumbnail: string; description: string }[];
};

export const INITIAL_HUBS: Hub[] = [
  {
    id: 'mangoes',
    name: 'Mango',
    heroImage: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=400&q=70',
    tagline: 'Orchard management essentials for the King of Fruits.',
    seeds: [
      { name: 'Alphonso Sapling', price: 250, img: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&w=400&q=70' },
      { name: 'Kesar Sapling', price: 200, img: 'https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&w=400&q=70' }
    ],
    nutrition: [
      { name: 'NPK 10:26:26', desc: 'Pre-flowering boost', icon: 'Sprout' },
      { name: 'Zinc Sulphate', desc: 'Healthy leaf growth', icon: 'Science' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Ring Irrigation Hose', price: '₹22/m' },
        { name: 'Sprinkler Head', price: '₹60/pc' }
      ]
    },
    advisory: {
      title: 'Mango Hopper Management',
      description: 'Hoppers cause significant flower drop. Monitor orchards during panicle emergence. Use neem-based sprays as a preventive measure.'
    },
    growthStages: [
      { phase: 'Juvenile Phase', duration: '1-3 Years', description: 'Establishment of root system and canopy structure.', products: ['Urea', 'DAP', 'Micronutrients'] },
      { phase: 'Pre-Flowering', duration: 'Nov - Dec', description: 'Vegetative growth slows down as trees prepare for bloom.', products: ['NPK 10:26:26', 'Zinc'] },
      { phase: 'Flowering', duration: 'Jan - Feb', description: 'Critical panicle emergence and pollination period.', products: ['Boron', 'Calcium Nitrate'] },
      { phase: 'Fruit Development', duration: 'Mar - May', description: 'Rapid fruit sizing and sugar accumulation.', products: ['Potassium Nitrate', 'Power Plus'] },
      { phase: 'Harvest', duration: 'May - July', description: 'Maturity determination based on fruit shape and color.', products: ['Ethrel (for ripening)'] }
    ],
    commonMistakes: [
      'Over-irrigation during flowering causing flower drop.',
      'Neglecting pest control for Mango Hoppers during panicle stage.',
      'Improper pruning leading to dense canopies and low sunlight.'
    ]
  },
  {
    id: 'watermelon',
    name: 'Watermelon',
    heroImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuShWApLmd5orpbfCQ7ygmjWA2q0BgOL3TUTOio-WN0NkMwFg5_h-EH9g3y-w1-6oC0wSXQML-mnfg8yXuc01VGH-dCPmVLcuMxg5_efLEOzm28E4LyalAxJSZ9ovVXj4PGtDA34b_c-3e1eFFqWla8pryOHK4d2XXK0Asc7R2hgGkWwuz68m7DEvfIX02LRu5Yj0ZpYms9UGHBBd5DbaEwinBYuDXuGHpBgAHZUm6G3chxh-S-jrFLwLfPGmA-I1zal0Z0mbzLpPNo',
    iconImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDSGbELbnV8HdsslJ8hy2mq0a_hvzZrr4cwUKHrze-GEeDpv0Z0VAvA62LryAUopIvuvGVeMWJJbVbRbtq1vKgcoaC4k3njelp3OPJb4_vjrijsdG-_1eEve_PojVdVNedf02IxptPKFjsUkGRH1oiP1H0007UHuQJ18mVTW7N6Vr0wdS7106fBV-qwwwXtBDWxaYcfvkouSyItxhdz24OL3GaUYJVj1YAyxMbObWYCQ7RpC1_QTpxN-wK8fDzDpx5JjUPaRwkLJq3m',
    tagline: 'Everything required from seed selection to final harvest, curated for maximum yield.',
    seeds: [
      { name: 'Sugar Baby', price: 250, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuByv4cPqlB1KYhELYjTmiYEkyUvKp9WVaye2AODgv8iz0zWp-dBoAq4amESYk6lY1LvA9UYb2sVqE6F91lDwmCSWOC86XN8a2C4BjFSsLROvs0SE1MMZLxfMkAfQUDpEBPBHIwHPFGEsrKqWrf2x_MDsMCo3kKhfkoeClw8BmDJOXClpDykV6mx-8Eqktiha67i1uMyfEzJ-maCYo7liILE2i8yqsNNEbYFCZ4sBGfLOasGGPaRcwV1iRU4SNm2L0mzt9_Vzx_1oSfK' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Urea (Nitrogen Rich)', desc: 'For early vine growth', icon: 'Water' },
      { name: 'NPK 19:19:19', desc: 'Balanced flowering stage', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCHM1kISdBgIMrknFsWdRp0svPPesWg7V_hAQUsj40ogBH_6B38JcIvOIjAeG1jXx3nM6VQPvL6foRHmsrU8VS6Z7IKidreaDh7fKyR0qsFlE6qmhpilDz23-TobHDV41BTLCN6Au8hM0JIXxubnfiKNGQqMeR3f8POsHcHQE-qBHwBdmPBeTycSeE30DuYdwfJs_E9kjNZc-zxQs-MPZrPZ1YOKkfETfixtuBk-6zSwDLt_LSl3NuD4NA_rl3fsqNS5qH7cMqCpC_P',
      items: [
        { name: 'Drip Tape (16mm)', price: '₹12/m' },
        { name: 'Micro Sprinklers', price: '₹45/pc' }
      ]
    },
    advisory: {
      title: 'Preventing Blossom End Rot',
      description: 'Inconsistent watering leads to calcium deficiency, causing black sunken spots on the fruit\'s bottom. Ensure a steady moisture level.'
    },
    growthStages: [
      { phase: 'Germination', duration: '1-2 Weeks', description: 'Seeds sprout and establish initial root system.', products: ['DAP', 'Humic Acid'] },
      { phase: 'Vegetative Growth', duration: '3-5 Weeks', description: 'Rapid vine extension and leaf development.', products: ['Urea', 'Magnesium Sulphate'] },
      { phase: 'Flowering', duration: '6-8 Weeks', description: 'Appearance of male and female flowers for pollination.', products: ['NPK 19:19:19', 'Boron'] },
      { phase: 'Fruit Expansion', duration: '9-12 Weeks', description: 'Fruit gains size and develops internal sugars.', products: ['Potassium Sulphate', 'Calcium'] },
      { phase: 'Maturity', duration: '12-14 Weeks', description: 'Checking for thumping sound and yellow belly for harvest.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Irregular watering schedule leading to fruit cracking.',
      'Over-application of nitrogen during fruit set (reduces sweetness).',
      'Harvesting immature fruits which do not ripen after picking.'
    ]
  },
  {
    id: 'cherry',
    name: 'Cherry',
    heroImage: 'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&w=400&q=70',
    tagline: 'Expert guidance for growing premium sweet and tart cherries.',
    seeds: [
      { name: 'Stella Cherry Sapling', price: 450, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&w=400&q=70' },
      { name: 'Bing Cherry Sapling', price: 400, img: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=400&q=70' }
    ],
    nutrition: [
      { name: 'Boron Solubor', desc: 'Crucial for flower set', icon: 'Science' },
      { name: 'Potassium Nitrate', desc: 'Fruit size & sweetness', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Drip Laterals', price: '₹20/m' },
        { name: 'Tensiometer', price: '₹1800/pc' }
      ]
    },
    advisory: {
      title: 'Managing Rain Cracking',
      description: 'Rain during harvest can cause fruit to split. Use calcium sprays and protective covers where possible.'
    },
    growthStages: [
      { phase: 'Dormancy', duration: 'Winter', description: 'Pruning and sanitation to prepare for new season.', products: ['Copper Oxychloride'] },
      { phase: 'Bud Break', duration: 'Early Spring', description: 'First signs of green tissue and flower buds.', products: ['Nitrogen', 'Zinc'] },
      { phase: 'Bloom', duration: 'Spring', description: 'Pollination phase, critical for final yield.', products: ['Boron', 'Bees (Pollinators)'] },
      { phase: 'Fruit Development', duration: 'Late Spring', description: 'Rapid cell division and fruit sizing.', products: ['Calcium Nitrate', 'Potash'] },
      { phase: 'Harvest', duration: 'Summer', description: 'Picking based on color, firmness, and brix level.', products: ['Seaweed Extract'] }
    ],
    commonMistakes: [
      'Heavy pruning in late spring (increases disease risk).',
      'Poor drainage leading to root rot in cherry trees.',
      'Harvesting too early before full sugar development.'
    ]
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    heroImage: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&w=400&q=70',
    tagline: 'Expert guidance and tools for growing premium export-quality pomegranates.',
    seeds: [
      { name: 'Bhagwa Sapling', price: 150, img: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&w=400&q=70' },
      { name: 'Ganesh Sapling', price: 120, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&w=400&q=70' }
    ],
    nutrition: [
      { name: 'Calcium Nitrate', desc: 'Prevents fruit cracking', icon: 'Science' },
      { name: 'Boron', desc: 'Improves fruit set', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Inline Drip Tube', price: '₹18/m' },
        { name: 'Fertigation Pump', price: '₹2500/pc' }
      ]
    },
    advisory: {
      title: 'Managing Bacterial Blight',
      description: 'Bacterial blight causes spots on leaves and fruit. Maintain orchard hygiene and prune affected branches.'
    },
    growthStages: [
      { phase: 'New Flush', duration: 'Spring', description: 'New vegetative growth after pruning.', products: ['Urea', 'Micronutrients'] },
      { phase: 'Flowering', duration: '30-45 Days', description: 'Emergence of hermaphrodite flowers.', products: ['Boron', 'Potassium Nitrate'] },
      { phase: 'Fruit Set', duration: '15-20 Days', description: 'Initial fruit development from pollinated flowers.', products: ['Calcium Nitrate'] },
      { phase: 'Fruit Sizing', duration: '90-120 Days', description: 'Longest phase where fruit reaches market size.', products: ['SOP (0:0:50)', 'Gibberellic Acid'] },
      { phase: 'Harvest', duration: 'Final Stage', description: 'Harvesting when fruit develops typical color and shine.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Neglecting bacterial blight monitoring during monsoon.',
      'Over-irrigation leading to fruit cracking during maturity.',
      'Improper thinning of fruits leading to small sizes.'
    ]
  },
  {
    id: 'grapes',
    name: 'Grapes',
    heroImage: 'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&w=400&q=70',
    tagline: 'Complete viticulture solutions for table and wine grape varieties.',
    seeds: [
      { name: 'Thompson Seedless', price: 80, img: 'https://images.unsplash.com/photo-1537248174116-24f6fc1edff0?auto=format&fit=crop&w=400&q=70' },
      { name: 'Sharad Seedless', price: 90, img: 'https://images.unsplash.com/photo-1616142718109-c16fbeae5604?auto=format&fit=crop&w=400&q=70' }
    ],
    nutrition: [
      { name: 'Potassium Sulphate', desc: 'Enhances fruit size & sugar', icon: 'Science' },
      { name: 'Magnesium', desc: 'Prevents yellowing', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Dripper Line 2.4 LPH', price: '₹15/m' },
        { name: 'Moisture Sensor', price: '₹850/pc' }
      ]
    },
    advisory: {
      title: 'Controlling Powdery Mildew',
      description: 'Powdery mildew thrives in humid conditions. Ensure good canopy ventilation and apply sulfur.'
    },
    growthStages: [
      { phase: 'Bud Break', duration: 'Late Winter', description: 'New green growth emerges from dormant buds.', products: ['Urea', 'Zinc'] },
      { phase: 'Bloom', duration: 'Spring', description: 'Flowering and pollination stage.', products: ['Boron', 'GA3'] },
      { phase: 'Fruit Set', duration: 'Post-Bloom', description: 'Berries begin to develop.', products: ['NPK 19:19:19'] },
      { phase: 'Veraison', duration: 'Summer', description: 'Berries soften and begin to change color.', products: ['Potassium Sulphate'] },
      { phase: 'Harvest', duration: 'Late Summer', description: 'Picking when sugar levels (Brix) are optimal.', products: ['Silicon'] }
    ],
    commonMistakes: [
      'Poor canopy management leading to lack of sunlight.',
      'Delaying sulfur application for mildew control.',
      'Late nitrogen application affecting fruit storage life.'
    ]
  },
  {
    id: 'banana',
    name: 'Banana',
    heroImage: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=70',
    tagline: 'Scale your plantation with tissue culture and expert management.',
    seeds: [
      { name: 'G-9 Tissue Culture', price: 18, img: 'https://images.unsplash.com/photo-1571141380069-521a19e0576c?auto=format&fit=crop&w=400&q=70' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Potassium (MOP)', desc: 'Crucial for bunch weight', icon: 'Science' },
      { name: 'Boron', desc: 'Prevents fruit cracking', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Drip system (2-way)', price: '₹45/plant' },
        { name: 'Venturi unit', price: '₹1500/pc' }
      ]
    },
    advisory: {
      title: 'Sigatoka Leaf Spot Control',
      description: 'Remove and burn infected leaves. Maintain field sanitation and apply recommended fungicides.'
    },
    growthStages: [
      { phase: 'Establishment', duration: '0-3 Months', description: 'Initial growth of tissue culture plantlets.', products: ['DAP', 'Urea'] },
      { phase: 'Vegetative', duration: '3-7 Months', description: 'Leaf production and stem thickening.', products: ['Urea', 'Potash'] },
      { phase: 'Flower Initiation', duration: '7-9 Months', description: 'Emergence of the flower bud (bell).', products: ['Boron', 'Zinc'] },
      { phase: 'Bunch Dev', duration: '9-12 Months', description: 'Fruit hands develop and increase in weight.', products: ['MOP (Potash)', 'SOP'] },
      { phase: 'Harvest', duration: '12-14 Months', description: 'Maturity reached when fingers are rounded.', products: ['Seaweed'] }
    ],
    commonMistakes: [
      'Allowing too many suckers to grow (competes for nutrition).',
      'Neglecting Sigatoka leaf spot during rainy season.',
      'Inadequate potassium during bunch development.'
    ]
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    heroImage: 'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&w=400&q=70',
    tagline: 'Advanced solutions for maximizing sugar recovery and tonnage.',
    seeds: [
      { name: 'Co 86032 Sets', price: 450, img: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&w=400&q=70' },
      { name: 'Power Plus Booster', price: 2150, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Urea', desc: 'High nitrogen for canopy', icon: 'Water' },
      { name: 'DAP', desc: 'Root establishment', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Sub-surface Drip', price: '₹25/m' },
        { name: 'Pressure Gauge', price: '₹450/pc' }
      ]
    },
    advisory: {
      title: 'Controlling Internode Borer',
      description: 'Release Trichogramma parasites. Avoid excessive nitrogen fertilizer in later stages.'
    },
    growthStages: [
      { phase: 'Germination', duration: '0-60 Days', description: 'Sets sprout and establish initial roots.', products: ['DAP', 'Bio-fertilizers'] },
      { phase: 'Tillering', duration: '60-120 Days', description: 'Production of multiple shoots from the base.', products: ['Urea', 'Zinc'] },
      { phase: 'Grand Growth', duration: '120-270 Days', description: 'Rapid stalk elongation and sugar storage.', products: ['Potash', 'Sulphur'] },
      { phase: 'Maturity', duration: '270-360 Days', description: 'Ripening and accumulation of sucrose.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Late harvesting leading to sugar inversion.',
      'Excessive nitrogen late in the season (reduces sugar %).',
      'Improper trash management after harvest.'
    ]
  },
  {
    id: 'cotton',
    name: 'Cotton',
    heroImage: 'https://images.unsplash.com/photo-1594904351111-a072f80b1a71?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAi13WleIFmuHicYHUY0W-rwufSddyMDo6kb2AcbrntT8BejZDYLjTxaKtV_Y7mnIsnnZJB27-jLhcDJJ-INGrThJKx-ezn-v1eICtCBg9KvmrOIjxCzqye2mi_tIn2fzO64bWu8QByBgH2JQTivKMjxsEsgphoj0fCIMsFB7enUvlyLg-6IkDTTWxfnEszM37GZrGUGaIDzJCwiztMcbaYmVPS8EIuSqQY0ewtQb8oZbCMTLeltwk9U7G9_lPwLTyFLt5WcDAd8f1r',
    tagline: 'High-performance seeds and protection for your cotton crop.',
    seeds: [
      { name: 'BG-II Hybrid', price: 850, img: 'https://images.unsplash.com/photo-1599307767316-776533bb941c?auto=format&fit=crop&w=400&q=70' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Magnesium Sulphate', desc: 'Prevents reddening of leaves', icon: 'Science' },
      { name: 'Urea', desc: 'Vegetative growth boost', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Rain Pipe', price: '₹18/m' },
        { name: 'Water Pump 5HP', price: '₹15000/pc' }
      ]
    },
    advisory: {
      title: 'Pink Bollworm Management',
      description: 'Use pheromone traps to monitor adult activity. Avoid late-season irrigation.'
    },
    growthStages: [
      { phase: 'Seedling', duration: '0-25 Days', description: 'Emergence and initial leaf development.', products: ['DAP', 'Insecticides'] },
      { phase: 'Squaring', duration: '25-50 Days', description: 'First flower buds (squares) appear.', products: ['Magnesium Sulphate'] },
      { phase: 'Flowering', duration: '50-80 Days', description: 'Opening of flowers and boll initiation.', products: ['Boron', 'Urea'] },
      { phase: 'Boll Dev', duration: '80-120 Days', description: 'Bolls increase in size and fiber develops.', products: ['Potassium Nitrate'] },
      { phase: 'Maturity', duration: '120-160 Days', description: 'Bolls open and lint is ready for picking.', products: ['Defoliants'] }
    ],
    commonMistakes: [
      'Delaying pest control for pink bollworm.',
      'Improper plant spacing leading to poor airflow.',
      'Excessive irrigation during boll opening stage.'
    ]
  },
  {
    id: 'onion',
    name: 'Onion',
    heroImage: 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&w=400&q=70',
    tagline: 'Scale your onion production with expert insights and high-yield varieties.',
    seeds: [
      { name: 'Bhima Super', price: 1200, img: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=400&q=70' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Sulphur 90%', desc: 'Improves pungency & shelf life', icon: 'Science' },
      { name: 'NPK 10:26:26', desc: 'Base dose for bulb development', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c18?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Drip Lateral (16mm)', price: '₹14/m' },
        { name: 'Venturi Injector', price: '₹1200/pc' }
      ]
    },
    advisory: {
      title: 'Managing Purple Blotch',
      description: 'Purple blotch is a common fungal disease. Avoid overhead irrigation and maintain spacing.'
    },
    growthStages: [
      { phase: 'Nursery', duration: '45-50 Days', description: 'Growing seedlings before transplanting.', products: ['Fungicides', 'DAP'] },
      { phase: 'Vegetative', duration: '30-40 Days', description: 'Leaf growth after transplanting.', products: ['Urea', 'Sulphur'] },
      { phase: 'Bulb Initiation', duration: '40-60 Days', description: 'The base begins to swell into a bulb.', products: ['NPK 10:26:26'] },
      { phase: 'Bulb Dev', duration: '60-100 Days', description: 'Maximum increase in bulb size and weight.', products: ['Potash', 'Micronutrients'] },
      { phase: 'Maturity', duration: '100-120 Days', description: 'Leaves begin to yellow and fall over.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Over-watering during the bulb maturity stage.',
      'Neglecting thrips control in early stages.',
      'High nitrogen application during bulb storage preparation.'
    ]
  },
  {
    id: 'orange',
    name: 'Orange',
    heroImage: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=400&q=70',
    iconImage: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=400&q=70',
    tagline: 'Advanced Citrus Management for Vibrant Color and High Brix Value.',
    idealClimate: 'Warm temperate to Tropical (15°C - 35°C)',
    soilType: 'Deep, well-drained loamy soil',
    waterNeeds: 'Moderate but Regular',
    bestSeason: 'Spring Flowering',
    seeds: [
      { name: 'Nagpur Mandarin', price: 120, img: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=400&q=70' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Zinc Sulphate', desc: 'Prevents interveinal chlorosis and mottling', icon: 'Science' },
      { name: 'Potassium Nitrate', desc: 'Improves fruit weight and rind quality', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&w=400&q=70',
      items: [
        { name: 'Micro-sprinklers', price: '₹85/pc' },
        { name: 'Filter Unit', price: '₹3500/pc' }
      ]
    },
    advisory: {
      title: 'Citrus Dieback Prevention Strategy',
      description: 'Dieback is often caused by root rot and micronutrient deficiency. Ensure your drainage is perfect. Use Bordeaux mixture as a protective spray after every pruning session.'
    },
    growthStages: [
      { phase: 'Dormancy', duration: 'Winter', description: 'The tree stores energy; ideal time for corrective pruning.', products: ['Bordeaux Mixture'] },
      { phase: 'Flowering', duration: 'Spring', description: 'Main bloom period; sensitive to sudden temperature shifts.', products: ['Zinc', 'Boron'] },
      { phase: 'Fruit Set', duration: 'Late Spring', description: 'Initial fruit drop is normal; maintain consistent moisture.', products: ['Potassium Nitrate'] },
      { phase: 'Color Break', duration: 'Autumn', description: 'Fruit turns from green to orange as temperatures drop.', products: ['Calcium Nitrate'] },
      { phase: 'Harvest', duration: 'Winter', description: 'Harvest once the Brix-Acid ratio is optimal for taste.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Neglecting the removal of "Water Sprouts" (vigorous non-fruiting stems).',
      'Over-irrigation leading to Phytophthora root rot.',
      'Late-season nitrogen application reducing cold hardiness.'
    ]
  }
];
