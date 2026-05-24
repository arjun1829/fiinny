import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain: "krishidukan-e8315.firebaseapp.com",
  projectId: "krishidukan-e8315",
  storageBucket: "krishidukan-e8315.firebasestorage.app",
  messagingSenderId: "650303885415",
  appId: "1:650303885415:web:7db7619260aa478b2b84c2",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const hubs = [
  {
    id: 'mangoes',
    name: 'Mango',
    heroImage: 'https://images.unsplash.com/photo-1591073113125-e46713c829ed?auto=format&fit=crop&q=80',
    tagline: 'Expert Orchard Management for Export-Quality Mango Production.',
    idealClimate: 'Tropical & Sub-tropical (24°C - 30°C)',
    soilType: 'Well-drained Alluvial or Laterite Soil',
    waterNeeds: 'Moderate (High during fruit set)',
    bestSeason: 'Spring / Summer',
    seeds: [
      { name: 'Alphonso Sapling', price: 250, img: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&q=80' },
      { name: 'Kesar Sapling', price: 200, img: 'https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'NPK 10:26:26', desc: 'Crucial for pre-flowering energy', icon: 'Sprout' },
      { name: 'Zinc Sulphate', desc: 'Promotes healthy leaf and shoot development', icon: 'Science' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1463123081488-789f99829c44?auto=format&fit=crop&q=80',
      items: [
        { name: 'Ring Irrigation Hose', price: '₹22/m' },
        { name: 'Sprinkler Head', price: '₹60/pc' }
      ]
    },
    advisory: {
      title: 'Integrated Pest Management for Mango Hoppers',
      description: 'Mango Hoppers can devastate your yield during panicle emergence. Monitor orchards weekly. If more than 5 hoppers per panicle are found, apply neem-based sprays immediately. Ensure the canopy is pruned for light penetration.'
    },
    growthStages: [
      { phase: 'Juvenile Phase', duration: '1-3 Years', description: 'Focus on root establishment and structural pruning to create a strong canopy.', products: ['Urea', 'DAP', 'Micronutrients'] },
      { phase: 'Pre-Flowering', duration: 'Nov - Dec', description: 'Induce stress by reducing water to encourage flower bud differentiation.', products: ['NPK 10:26:26', 'Zinc'] },
      { phase: 'Flowering', duration: 'Jan - Feb', description: 'Pollination is critical. Protect from hoppers and powdery mildew.', products: ['Boron', 'Calcium Nitrate'] },
      { phase: 'Fruit Development', duration: 'Mar - May', description: 'Consistent moisture is key to prevent fruit drop and increase size.', products: ['Potassium Nitrate', 'Power Plus'] },
      { phase: 'Harvest', duration: 'May - July', description: 'Harvest at 80% maturity for better ripening and shelf life.', products: ['Ethrel (for controlled ripening)'] }
    ],
    commonMistakes: [
      'Over-irrigation during the pre-flowering stress period (stops flowering).',
      'Ignoring early signs of Anthracnose on young leaves.',
      'Applying high Nitrogen during fruit development (causes spongy tissue).'
    ]
  },
  {
    id: 'watermelon',
    name: 'Watermelon',
    heroImage: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&q=80',
    tagline: 'Precision Farming for Sweeter, High-Yield Watermelon Crops.',
    idealClimate: 'Hot & Dry (25°C - 35°C)',
    soilType: 'Sandy Loam with pH 6.0 - 7.0',
    waterNeeds: 'High (Frequent Drip Irrigation)',
    bestSeason: 'Summer / Pre-Monsoon',
    seeds: [
      { name: 'Sugar Baby', price: 250, img: 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&q=80' },
      { name: 'Power Plus Booster', price: 1350, img: '/product-images/Product_Images/Power Plus.png' }
    ],
    nutrition: [
      { name: 'Urea', desc: 'Rapid vegetative growth and vine expansion', icon: 'Water' },
      { name: 'NPK 19:19:19', desc: 'Balanced nutrition during early growth', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c18?auto=format&fit=crop&q=80',
      items: [
        { name: 'Drip Tape (16mm)', price: '₹12/m' },
        { name: 'Micro Sprinklers', price: '₹45/pc' }
      ]
    },
    advisory: {
      title: 'Mastering the Thumping Test for Harvest',
      description: 'To ensure maximum sweetness, only harvest when the bottom "belly" spot turns creamy yellow and the tendril near the fruit dries up. A dull hollow sound when tapped indicates a perfectly ripe watermelon.'
    },
    growthStages: [
      { phase: 'Germination', duration: '1-2 Weeks', description: 'Seeds sprout; keep soil warm and moist but not waterlogged.', products: ['DAP', 'Humic Acid'] },
      { phase: 'Vegetative Growth', duration: '3-5 Weeks', description: 'Vines spread rapidly; maintain high nitrogen levels.', products: ['Urea', 'Magnesium Sulphate'] },
      { phase: 'Flowering', duration: '6-8 Weeks', description: 'Bees are essential for pollination. Avoid pesticide sprays in the morning.', products: ['NPK 19:19:19', 'Boron'] },
      { phase: 'Fruit Expansion', duration: '9-12 Weeks', description: 'Critical water stage; reduce water slightly near harvest for sugar concentration.', products: ['Potassium Sulphate', 'Calcium'] },
      { phase: 'Maturity', duration: '12-14 Weeks', description: 'Fruit reach full size and develop internal sugar levels.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Inconsistent watering leading to fruit splitting (Bursting).',
      'Over-fertilizing with Nitrogen during fruit set (poor fruit quality).',
      'Harvesting too early based on size rather than skin indicators.'
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
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    heroImage: 'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&q=80',
    tagline: 'Export-Quality Pomegranate Cultivation with Integrated Pest Control.',
    idealClimate: 'Arid & Semi-arid (25°C - 38°C)',
    soilType: 'Light sandy to Medium Loamy',
    waterNeeds: 'Low to Moderate',
    bestSeason: 'Year-round (Specific Bahars)',
    seeds: [
      { name: 'Bhagwa Sapling', price: 150, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80' },
      { name: 'Ganesh Sapling', price: 120, img: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'Calcium Nitrate', desc: 'Strengthens cell walls to prevent fruit cracking', icon: 'Science' },
      { name: 'Boron', desc: 'Essential for flowering and uniform fruit set', icon: 'Sprout' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
      items: [
        { name: 'Inline Drip Tube', price: '₹18/m' },
        { name: 'Fertigation Pump', price: '₹2500/pc' }
      ]
    },
    advisory: {
      title: 'Managing Bacterial Blight (Oily Spot)',
      description: 'Avoid irrigation during high humidity periods. Prune and destroy infected branches immediately. Maintain strict orchard hygiene to prevent the spread of bacteria.'
    },
    growthStages: [
      { phase: 'New Flush', duration: 'Spring', description: 'New shoots emerge after Bahar treatment stress.', products: ['Urea', 'Micronutrients'] },
      { phase: 'Flowering', duration: '30-45 Days', description: 'Wait for maximum hermaphrodite flower emergence.', products: ['Boron', 'Potassium Nitrate'] },
      { phase: 'Fruit Set', duration: '15-20 Days', description: 'Flowers transform into tiny fruits; critical for protection.', products: ['Calcium Nitrate'] },
      { phase: 'Fruit Sizing', duration: '90-120 Days', description: 'Fruits gain weight and develop characteristic red color.', products: ['SOP (0:0:50)', 'Gibberellic Acid'] },
      { phase: 'Harvest', duration: 'Final Stage', description: 'Harvest when the fruit sounds metallic when tapped.', products: ['Power Plus'] }
    ],
    commonMistakes: [
      'Applying water during the Bahar stress period (breaks stress early).',
      'Ignoring the Pin-hole Borer signs on the main trunk.',
      'Delaying the harvest causing heavy fruit cracking in winter.'
    ]
  },
  {
    id: 'cherry',
    name: 'Cherry',
    heroImage: 'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&q=80',
    tagline: 'Premium Cherry Cultivation Guide for High-Altitude and Cool Climates.',
    idealClimate: 'Cool / Temperate (10°C - 22°C)',
    soilType: 'Deep, well-drained sandy loam',
    waterNeeds: 'Moderate (Precise during harvest)',
    bestSeason: 'Spring Bloom',
    seeds: [
      { name: 'Stella Cherry Sapling', price: 450, img: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?auto=format&fit=crop&q=80' },
      { name: 'Bing Cherry Sapling', price: 400, img: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&q=80' }
    ],
    nutrition: [
      { name: 'Boron Solubor', desc: 'Crucial for viable pollen and flower set', icon: 'Science' },
      { name: 'Potassium Nitrate', desc: 'Increases fruit size and skin firmness', icon: 'Water' }
    ],
    irrigation: {
      image: 'https://images.unsplash.com/photo-1598453472093-6e3e536102a3?auto=format&fit=crop&q=80',
      items: [
        { name: 'Drip Laterals', price: '₹20/m' },
        { name: 'Tensiometer', price: '₹1800/pc' }
      ]
    },
    advisory: {
      title: 'Rain Management during Harvest',
      description: 'Rain can cause "Cherry Cracking" within hours. Use protective covers or apply calcium-based foliar sprays before predicted rain to toughen the skin.'
    },
    growthStages: [
      { phase: 'Dormancy', duration: 'Winter', description: 'Requires 800-1000 chilling hours for uniform bud break.', products: ['Copper Oxychloride'] },
      { phase: 'Bud Break', duration: 'Early Spring', description: 'Green tip stage; protect from late-season frost.', products: ['Nitrogen', 'Zinc'] },
      { phase: 'Bloom', duration: 'Spring', description: 'Short pollination window; high bee activity required.', products: ['Boron', 'Bees'] },
      { phase: 'Fruit Development', duration: 'Late Spring', description: 'Rapid sizing; keep moisture levels very stable.', products: ['Calcium Nitrate', 'Potash'] },
      { phase: 'Harvest', duration: 'Summer', description: 'Fruit must be picked with stems attached for longer life.', products: ['Seaweed Extract'] }
    ],
    commonMistakes: [
      'Over-pruning which leads to excessive vegetative growth.',
      'Poor drainage causing Root Rot (very sensitive).',
      'Harvesting too early before the Brix levels hit 18%.'
    ]
  }
];

async function seed() {
  console.log('Starting enhanced seed process...');
  for (const hub of hubs) {
    const data = {
      ...hub,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'hubs', hub.id), data);
    console.log(`Seeded enhanced ${hub.id}`);
  }
  console.log('All enhanced hubs seeded successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
