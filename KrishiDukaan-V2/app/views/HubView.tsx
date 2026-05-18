'use client';

import { useState, useEffect, useMemo } from 'react';
import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchHubs, Hub } from '../firebase';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';
import { generateHubPDF } from '../utils/pdf-generator';

const FALLBACK_HUBS: Hub[] = [
  {
    id: 'mangoes',
    name: 'Mango',
    heroImage: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&q=80',
    tagline: 'Orchard management essentials for the King of Fruits.',
    seeds: [
      { name: 'Alphonso Sapling', price: 250, img: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&q=80' },
      { name: 'Kesar Sapling', price: 200, img: 'https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'NPK 10:26:26', desc: 'Pre-flowering boost', icon: 'Sprout' },
      { name: 'Zinc Sulphate', desc: 'Healthy leaf growth', icon: 'Science' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&q=80',
    tagline: 'Expert guidance for growing premium sweet and tart cherries.',
    seeds: [
      { name: 'Stella Cherry Sapling', price: 450, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80' },
      { name: 'Bing Cherry Sapling', price: 400, img: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'Boron Solubor', desc: 'Crucial for flower set', icon: 'Science' },
      { name: 'Potassium Nitrate', desc: 'Fruit size & sweetness', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80',
    tagline: 'Expert guidance and tools for growing premium export-quality pomegranates.',
    seeds: [
      { name: 'Bhagwa Sapling', price: 150, img: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80' },
      { name: 'Ganesh Sapling', price: 120, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'Calcium Nitrate', desc: 'Prevents fruit cracking', icon: 'Science' },
      { name: 'Boron', desc: 'Improves fruit set', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&q=80',
    tagline: 'Complete viticulture solutions for table and wine grape varieties.',
    seeds: [
      { name: 'Thompson Seedless', price: 80, img: 'https://images.unsplash.com/photo-1537248174116-24f6fc1edff0?auto=format&fit=crop&q=80' },
      { name: 'Sharad Seedless', price: 90, img: 'https://images.unsplash.com/photo-1616142718109-c16fbeae5604?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'Potassium Sulphate', desc: 'Enhances fruit size & sugar', icon: 'Science' },
      { name: 'Magnesium', desc: 'Prevents yellowing', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&q=80',
    tagline: 'Scale your plantation with tissue culture and expert management.',
    seeds: [
      { name: 'G-9 Tissue Culture', price: 18, img: 'https://images.unsplash.com/photo-1571141380069-521a19e0576c?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Potassium (MOP)', desc: 'Crucial for bunch weight', icon: 'Science' },
      { name: 'Boron', desc: 'Prevents fruit cracking', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&q=80',
    tagline: 'Advanced solutions for maximizing sugar recovery and tonnage.',
    seeds: [
      { name: 'Co 86032 Sets', price: 450, img: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 2150, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Urea', desc: 'High nitrogen for canopy', icon: 'Water' },
      { name: 'DAP', desc: 'Root establishment', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1594904351111-a072f80b1a71?auto=format&fit=crop&q=80',
    tagline: 'High-performance seeds and protection for your cotton crop.',
    seeds: [
      { name: 'BG-II Hybrid', price: 850, img: 'https://images.unsplash.com/photo-1599307767316-776533bb941c?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Magnesium Sulphate', desc: 'Prevents reddening of leaves', icon: 'Science' },
      { name: 'Urea', desc: 'Vegetative growth boost', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1582260656094-1a966774e1d1?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&q=80',
    tagline: 'Scale your onion production with expert insights and high-yield varieties.',
    seeds: [
      { name: 'Bhima Super', price: 1200, img: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Sulphur 90%', desc: 'Improves pungency & shelf life', icon: 'Science' },
      { name: 'NPK 10:26:26', desc: 'Base dose for bulb development', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c18?auto=format&fit=crop&q=80',
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
    heroImage: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&q=80',
    tagline: 'Advanced Citrus Management for Vibrant Color and High Brix Value.',
    idealClimate: 'Warm temperate to Tropical (15°C - 35°C)',
    soilType: 'Deep, well-drained loamy soil',
    waterNeeds: 'Moderate but Regular',
    bestSeason: 'Spring Flowering',
    seeds: [
      { name: 'Nagpur Mandarin', price: 120, img: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Zinc Sulphate', desc: 'Prevents interveinal chlorosis and mottling', icon: 'Science' },
      { name: 'Potassium Nitrate', desc: 'Improves fruit weight and rind quality', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1533728646964-b5b6329fc5f4?auto=format&fit=crop&q=80',
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

interface HubViewProps {
  searchQuery?: string;
  initialHubId?: string | null;
}

export default function HubView({ searchQuery = '', initialHubId = null }: HubViewProps) {
  const { t } = useI18n();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHubs = async () => {
      try {
        const fetchedHubs = await fetchHubs();
        let finalHubs = [];
        if (fetchedHubs && fetchedHubs.length > 0) {
          finalHubs = fetchedHubs;
        } else {
          finalHubs = FALLBACK_HUBS;
        }
        setHubs(finalHubs);

        if (initialHubId) {
          const found = finalHubs.find(h => h.id === initialHubId);
          if (found) {
            setSelectedHub(found);
          } else {
            setSelectedHub(finalHubs[0]);
          }
        } else if (finalHubs.length > 0) {
          setSelectedHub(finalHubs[0]);
        }
      } catch (err) {
        console.warn('Could not load hubs from Firestore, using fallback:', err);
        setHubs(FALLBACK_HUBS);
        setSelectedHub(FALLBACK_HUBS[0]);
      } finally {
        setLoading(false);
      }
    };

    loadHubs();
  }, [initialHubId]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredHubs = useMemo(() => {
    if (!normalizedQuery) return hubs;

    return hubs.filter((hub) => {
      const searchable = [
        hub.name,
        hub.tagline,
        ...hub.seeds.map((seed) => seed.name),
        ...hub.nutrition.map((item) => item.name),
        hub.advisory.title
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [hubs, normalizedQuery]);

  useEffect(() => {
    if (!filteredHubs.length) {
      setSelectedHub(null);
      return;
    }

    if (!selectedHub || !filteredHubs.some((hub) => hub.id === selectedHub.id)) {
      setSelectedHub(filteredHubs[0]);
    }
  }, [filteredHubs, selectedHub]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!selectedHub) {
    return (
      <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-10">
        <div className="rounded-3xl border border-dashed border-surface-container bg-surface-container-low p-10 text-center">
          <h2 className="text-xl font-bold text-on-surface mb-2">{t('noHubResults')}</h2>
          <p className="text-on-surface-variant">{t('noHubResultsHint')}</p>
        </div>
      </div>
    );
  }

  const getIcon = (iconName: string) => {
    return ICONS[iconName as keyof typeof ICONS] || ICONS.Sprout;
  };

  return (
    <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 flex flex-col gap-12">
      
      {/* Hub Selector */}
      <div className="flex items-center gap-3 sticky top-[72px] z-30 py-4 bg-surface/80 backdrop-blur-md -mx-4 px-4 md:-mx-10 md:px-10 border-b border-surface-container" data-tour="hub-tabs">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 hide-scrollbar scroll-smooth whitespace-nowrap">
        {filteredHubs.map((hub) => (
          <button
            key={hub.id}
            onClick={() => setSelectedHub(hub)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              selectedHub.id === hub.id 
                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' 
                : 'bg-white text-on-surface border-surface-container hover:border-primary/50'
            }`}
          >
            {hub.name}
          </button>
        ))}
        </div>
        <div className="shrink-0">
          <HelperIcon
            size="sm"
            side="left"
            textKey="hubTabs"
            ariaLabel="Hub tabs help"
          />
        </div>
      </div>

      {/* Hero */}
      <section className="relative rounded-[40px] overflow-hidden shadow-ambient h-[300px] md:h-[450px] flex flex-col justify-end p-8 md:p-12 bg-surface-container-highest group">
        <div className="absolute inset-0">
          <img 
            src={selectedHub.heroImage} 
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
            alt={`${selectedHub.name} plantation and farming`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90" />
        </div>
        <div className="relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 mb-4"
          >
            <span className="bg-primary text-white text-[10px] font-black uppercase px-4 py-1.5 rounded-full inline-block shadow-lg border border-white/20">{t('featuredCrop')}</span>
            <HelperIcon
              size="xs"
              variant="onDark"
              side="right"
              textKey="hubFeatured"
              ariaLabel="Featured crop help"
            />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tight leading-tight"
          >
            {selectedHub.name} <span className="text-primary-container">{t('hubSuffix')}</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-surface-container-low mt-4 max-w-2xl text-base md:text-xl font-medium leading-relaxed"
          >
            {selectedHub.tagline}
          </motion.p>
        </div>
      </section>

      {/* Crop Profile & Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: t('idealClimate'), value: selectedHub.idealClimate || 'Tropical', icon: ICONS.Efficiency, color: 'text-orange-500 bg-orange-50' },
          { label: t('soilType'), value: selectedHub.soilType || 'Loamy', icon: ICONS.Sprout, color: 'text-brown-500 bg-amber-50' },
          { label: t('waterNeeds'), value: selectedHub.waterNeeds || 'Moderate', icon: ICONS.Water, color: 'text-blue-500 bg-blue-50' },
          { label: t('bestSeason'), value: selectedHub.bestSeason || 'Spring', icon: ICONS.Home, color: 'text-green-500 bg-green-50' }
        ].map((stat, i) => (
          <HelperTooltip key={i} side="bottom" textKey="hubCropProfile">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-[32px] border border-surface-container shadow-sm flex flex-col items-center text-center group hover:border-primary transition-all cursor-default"
            >
              <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">{stat.label}</span>
              <span className="text-sm font-bold text-on-surface line-clamp-1">{stat.value}</span>
            </motion.div>
          </HelperTooltip>
        ))}
      </section>

      {/* Growth Journey Diagram */}
      {selectedHub.growthStages && selectedHub.growthStages.length > 0 && (
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <div>
                <h2 className="text-3xl font-black text-on-surface tracking-tight">{t('growthJourney')}</h2>
                <p className="text-on-surface-variant text-sm font-bold uppercase tracking-widest mt-1">{t('fromSeedToHarvest')}</p>
              </div>
              <HelperIcon
                size="sm"
                variant="ghost"
                side="right"
                textKey="hubGrowthJourney"
                ariaLabel="Growth journey help"
              />
            </div>
            <div className="hidden md:flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-2 rounded-2xl border border-secondary/20">
              <ICONS.Sprout className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">{t('completeCycle')}</span>
            </div>
          </div>

          <div className="relative pt-10 pb-6 px-4 md:px-0">
            {/* Horizontal Line (Desktop) */}
            <div className="hidden md:block absolute top-[52px] left-0 right-0 h-1 bg-surface-container rounded-full" />
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative z-10">
              {selectedHub.growthStages.map((stage, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex flex-col items-center md:items-start text-center md:text-left group"
                >
                  <div className="relative mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-black text-xs shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform relative z-10 border-4 border-white">
                      {i + 1}
                    </div>
                    {/* Vertical connector for mobile */}
                    {i < selectedHub.growthStages!.length - 1 && (
                      <div className="md:hidden absolute top-10 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-surface-container" />
                    )}
                  </div>
                  
                  <HelperTooltip side="top" textKey="hubGrowthStage">
                    <div className="bg-white p-5 rounded-3xl border border-surface-container shadow-sm group-hover:shadow-ambient transition-shadow w-full flex-grow cursor-help">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-on-surface text-base">{stage.phase}</h3>
                        <span className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-0.5 rounded-full">{stage.duration}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed mb-4">{stage.description}</p>

                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary">{t('recommendedProducts')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {stage.products.map((p, pi) => (
                            <span key={pi} className="text-[10px] bg-surface-container px-2 py-1 rounded-lg font-bold text-on-surface">{p}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </HelperTooltip>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Grid: Seeds, Nutrition, Irrigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Seeds */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('premiumSeeds')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubSeeds"
                ariaLabel="Premium seeds help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Sprout className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-grow">
            {selectedHub.seeds.map((seed, i) => (
              <div key={i} className="flex flex-col group cursor-pointer">
                <div className="aspect-square rounded-2xl bg-surface-container overflow-hidden mb-3">
                  <img src={seed.img} alt={seed.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <span className="font-bold text-on-surface text-sm line-clamp-1 group-hover:text-primary transition-colors">{seed.name}</span>
                <span className="text-secondary font-black text-xs mt-1">₹{seed.price}/{t('perUnit')}</span>
              </div>
            ))}
          </div>
          <button className="mt-8 py-4 border-2 border-surface-container hover:border-primary text-on-surface font-bold rounded-2xl transition-all uppercase text-xs tracking-widest">{t('viewAllSeeds')}</button>
        </div>

        {/* Nutrition */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('targetedNutrition')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubNutrition"
                ariaLabel="Nutrition help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Science className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="flex flex-col gap-3 flex-grow">
            {selectedHub.nutrition.map((item, i) => {
              const IconComp = getIcon(item.icon);
              return (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container transition-colors cursor-pointer group border border-transparent hover:border-surface-container-highest">
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-surface-container flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all">
                    <IconComp className="w-6 h-6" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <h3 className="font-bold text-on-surface text-sm uppercase tracking-tight line-clamp-1">{item.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-bold opacity-70 line-clamp-1">{item.desc}</p>
                  </div>
                  <ICONS.ChevronRight className="w-4 h-4 text-outline" />
                </div>
              );
            })}
          </div>
          <button className="mt-8 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary-container transition-all uppercase text-xs tracking-widest">{t('exploreFertilizers')}</button>
        </div>

        {/* Irrigation */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('irrigationTools')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubIrrigation"
                ariaLabel="Irrigation help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Water className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="rounded-2xl bg-surface-container-high h-40 overflow-hidden mb-6 relative group">
            <img src={selectedHub.irrigation.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Irrigation" />
            <div className="absolute inset-0 bg-primary/20 mix-blend-overlay" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <span className="text-white text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/30">{t('systemSetup')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-4 flex-grow">
            {selectedHub.irrigation.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center border-b border-surface-container pb-3">
                <span className="text-sm font-bold text-on-surface-variant">{item.name}</span>
                <span className="text-sm font-black text-secondary">{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Common Mistakes Section */}
      {selectedHub.commonMistakes && selectedHub.commonMistakes.length > 0 && (
        <section className="bg-on-surface rounded-[40px] p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
          <div className="absolute -left-20 -top-20 w-80 h-80 bg-secondary/10 rounded-full blur-[100px]" />
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 mb-6">
                <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-300 px-4 py-2 rounded-2xl border border-red-500/30">
                  <ICONS.X className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-widest">{t('proTipAvoid')}</span>
                </div>
                <HelperIcon
                  size="xs"
                  variant="onDark"
                  side="right"
                  textKey="hubMistakes"
                  ariaLabel="Mistakes to avoid help"
                />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tight">{t('mistakesToAvoid')}</h2>
              <p className="text-surface-container-low/70 leading-relaxed mb-8">
                {t('agronomyMistakesIntro').replace('{crop}', selectedHub.name.toLowerCase())}
              </p>
              
              <div className="space-y-4">
                {selectedHub.commonMistakes.map((mistake, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                  >
                    <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                      <ICONS.X className="w-3 h-3" />
                    </div>
                    <p className="text-sm font-medium text-surface-container-low">{mistake}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl rotate-3 scale-95 md:scale-100">
                <img 
                  src={selectedHub.heroImage} 
                  alt="Mistakes to avoid" 
                  className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white text-on-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl">
                      <ICONS.Check className="w-8 h-8" />
                    </div>
                    <p className="font-black text-xl">{t('growLikeAPro')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Advisory */}
      <section className="bg-primary/5 border border-primary/20 rounded-[40px] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row gap-10 items-center">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center shadow-lg relative z-10 flex-shrink-0 border border-surface-container">
          <ICONS.Check className="w-12 h-12 text-primary" />
        </div>
        <div className="relative z-10 flex-grow">
          <div className="flex items-center gap-2 mb-3">
            <HelperTooltip side="bottom" textKey="hubAdvisory">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full cursor-help">{t('agronomyAlert')}</span>
            </HelperTooltip>
            <div className="w-2 h-2 rounded-full bg-harvest animate-pulse" />
          </div>
          <h2 className="text-3xl font-black text-on-surface mb-3 tracking-tight">{selectedHub.advisory.title}</h2>
          <p className="text-on-surface-variant max-w-3xl leading-relaxed text-base">
            {selectedHub.advisory.description}
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <HelperTooltip side="top" textKey="hubConsult">
              <button className="flex items-center gap-3 bg-primary text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-primary/30 hover:bg-primary-container hover:scale-105 transition-all uppercase text-xs tracking-widest">
                <ICONS.Chat className="w-4 h-4" /> {t('consultSpecialist')}
              </button>
            </HelperTooltip>
            <HelperTooltip side="top" textKey="hubDownloadGuide">
              <button
                onClick={() => selectedHub && generateHubPDF(selectedHub)}
                className="flex items-center gap-3 bg-white text-on-surface font-black px-8 py-4 rounded-2xl border border-surface-container hover:bg-surface-container transition-all uppercase text-xs tracking-widest"
              >
                {t('downloadGuide')}
              </button>
            </HelperTooltip>
          </div>
        </div>
      </section>

      {/* Expert Wisdom / FAQ */}
      <section className="bg-white rounded-[40px] border border-surface-container p-8 md:p-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2">
            <h2 className="text-3xl font-black text-on-surface tracking-tight mb-2">{t('farmersWisdom')}</h2>
            <HelperIcon
              size="sm"
              variant="ghost"
              side="right"
              textKey="hubFaq"
              ariaLabel="Farmer's wisdom help"
            />
          </div>
          <p className="text-on-surface-variant text-sm font-bold uppercase tracking-widest">{t('essentialKnowledge').replace('{crop}', selectedHub.name)}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { q: t('faqPlantingTime').replace('{crop}', selectedHub.name), a: t('faqPlantingTimeAns').replace('{crop}', selectedHub.name).replace('{season}', selectedHub.bestSeason?.toLowerCase() || 'early spring') },
            { q: t('faqWateringFreq').replace('{crop}', selectedHub.name), a: t('faqWateringFreqAns').replace('{crop}', selectedHub.name).replace('{needs}', selectedHub.waterNeeds?.toLowerCase() || 'moderate') },
            { q: t('faqSoilPh').replace('{crop}', selectedHub.name), a: t('faqSoilPhAns').replace('{crop}', selectedHub.name).replace('{type}', selectedHub.soilType?.toLowerCase() || 'well-drained') },
            { q: t('faqGreenhouse').replace('{crop}', selectedHub.name), a: t('faqGreenhouseAns').replace('{crop}', selectedHub.name) }
          ].map((faq, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-6 rounded-3xl bg-surface-container-low border border-surface-container hover:border-primary/30 transition-all cursor-default group"
            >
              <h3 className="font-black text-on-surface mb-3 flex items-start gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs">Q</span>
                {faq.q}
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed pl-9 group-hover:text-on-surface transition-colors">
                {faq.a}
              </p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
