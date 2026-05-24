import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Hero carousel slides — mirrors `app/views/HomeView.tsx > slides`.
class HeroSlide {
  const HeroSlide({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.ctaLabel,
    required this.bgImg,
    required this.gradient,
    required this.cta,
    this.overlayImg,
  });
  final String eyebrow;
  final String title;
  final String subtitle;
  final String ctaLabel;
  final String bgImg;
  final List<Color> gradient;
  final HeroCta cta;
  final String? overlayImg;
}

enum HeroCta { hub, powerPlus, retailer, market }

const heroSlides = <HeroSlide>[
  HeroSlide(
    eyebrow: 'Modern Produce, Rooted Locally',
    title: 'Modern Produce,\nRooted Locally.',
    subtitle:
        'Find the freshest harvest and agricultural supplies directly from local stores in your area.',
    ctaLabel: 'Explore Products',
    bgImg:
        'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1400&q=80',
    gradient: [Color(0xFF052E16), Color(0xCC064E3B)],
    cta: HeroCta.market,
  ),
  HeroSlide(
    eyebrow: 'Genuine inputs',
    title: 'Genuine inputs,\ngrown for your soil.',
    subtitle:
        'Fresh agri supplies from trusted local stores — no middlemen, no fakes.',
    ctaLabel: 'Explore products',
    bgImg:
        'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1400&q=80',
    gradient: [Color(0xFF052E16), Color(0xCC065F46)],
    cta: HeroCta.market,
  ),
  HeroSlide(
    eyebrow: 'Direct from Manufacturer',
    title: 'KaranArjun\nPower Plus™',
    subtitle:
        'Trusted by 75,800+ farmers. Stimulates root growth, improves fruit colour & weight.',
    ctaLabel: 'Shop Power Plus',
    bgImg:
        'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1400&q=80',
    gradient: [Color(0xFF052E16), Color(0xCC064E3B)],
    cta: HeroCta.powerPlus,
    overlayImg:
        'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png',
  ),
  HeroSlide(
    eyebrow: 'Become a Retailer',
    title: 'Run your shop,\nreach more farmers.',
    subtitle:
        'Join 50+ dealers stocking trusted agri products. Manage inventory, get listed nearby.',
    ctaLabel: 'Join the network',
    bgImg:
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=80',
    gradient: [Color(0xFF451A03), Color(0xCC9A3412)],
    cta: HeroCta.retailer,
  ),
];

/// Category tiles — image URLs lifted from `app/views/HomeView.tsx > categoryTiles`.
class CategoryChip {
  const CategoryChip(this.id, this.label, this.tint, this.imgUrl);
  final String id;
  final String label;
  final Color tint;
  final String imgUrl;
}

const homeCategories = <CategoryChip>[
  CategoryChip(
    'pesticides',
    'Pesticides',
    AppColors.tintEmerald,
    'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'fertilizers',
    'Fertilizers',
    AppColors.tintAmber,
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'herbicides',
    'Herbicides',
    AppColors.tintRose,
    'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'bio',
    'Bio-Stimulants',
    AppColors.tintTeal,
    'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'sprayers',
    'Sprayers',
    AppColors.tintSky,
    'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'seeds',
    'Seeds',
    AppColors.tintYellow,
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'tools',
    'Tools',
    AppColors.tintSlate,
    'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=200&h=200&q=80',
  ),
  CategoryChip(
    'all',
    'View All',
    AppColors.tintEmerald,
    'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=200&h=200&q=80',
  ),
];

class CropChip {
  const CropChip(this.id, this.name, this.emoji, this.imageUrl);
  final String id;
  final String name;
  final String emoji;
  final String imageUrl;
}

// Image URLs lifted from `app/constants.ts > CROPS`.
const homeCrops = <CropChip>[
  CropChip(
    'watermelon',
    'Watermelon',
    '🍉',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDSGbELbnV8HdsslJ8hy2mq0a_hvzZrr4cwUKHrze-GEeDpv0Z0VAvA62LryAUopIvuvGVeMWJJbVbRbtq1vKgcoaC4k3njelp3OPJb4_vjrijsdG-_1eEve_PojVdVNedf02IxptPKFjsUkGRH1oiP1H0007UHuQJ18mVTW7N6Vr0wdS7106fBV-qwwwXtBDWxaYcfvkouSyItxhdz24OL3GaUYJVj1YAyxMbObWYCQ7RpC1_QTpxN-wK8fDzDpx5JjUPaRwkLJq3m',
  ),
  CropChip(
    'wheat',
    'Wheat',
    '🌾',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAGRxeg57dLoYXGSyDjQg4KIlhXhDoSLcH2TL8JTunYEXVl92RlHqTVRxoaRdOAkh3zaNzYyWA_A6fqz_nGVpYX89iPffRc3YZiMWnP3sK_95HetWGqVfdRImiWjILpEm4QSjNlbAjMj-OUvIStUKdMz3rJIgBpfZfwS_bvvqnp4MW5nmL3clqHayheyeb4JjIMAQ-gLUSD5MwF4wfv6V6n8zzhE4j4TuAAZTe6ghT4RN968zaDf-5pElvcbSJgD-qRjSWhoK-bxv2E',
  ),
  CropChip(
    'tomato',
    'Tomato',
    '🍅',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAqKjRa6JNKk1ATRrRh-34rnzxN5NuF1db88XkLpgwid9VCayDeG7-CfYbyq33aukNBgreqb0c5M1Int2-qanv5_m-SOu2lBMifHXZZH-RkGgsKGAFKGT4r5Nog_CeGGEI5cwu7us5a6k3pdYmXKuO71MT-e41ku3KL7OkdDlJTeQtkq8qzokwhrXf4vzscnmQVRktLp-RhAVdgE10R9kSDmAf-j8yl9-6ONkKTzkj3c4RrUIIUYJjM2l3q8EFdtQT0CPWTr3JIG98a',
  ),
  CropChip(
    'cotton',
    'Cotton',
    '🌱',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAi13WleIFmuHicYHUY0W-rwufSddyMDo6kb2AcbrntT8BejZDYLjTxaKtV_Y7mnIsnnZJB27-jLhcDJJ-INGrThJKx-ezn-v1eICtCBg9KvmrOIjxCzqye2mi_tIn2fzO64bWu8QByBgH2JQTivKMjxsEsgphoj0fCIMsFB7enUvlyLg-6IkDTTWxfnEszM37GZrGUGaIDzJCwiztMcbaYmVPS8EIuSqQY0ewtQb8oZbCMTLeltwk9U7G9_lPwLTyFLt5WcDAd8f1r',
  ),
];

/// Power Plus pack sizes.
class PowerPlusPack {
  const PowerPlusPack(this.size, this.priceInr, this.mrpInr, this.imageUrl);
  final String size;
  final int priceInr;
  final int mrpInr;
  final String imageUrl;
}

const powerPlusPacks = <PowerPlusPack>[
  PowerPlusPack(
    '1 L',
    500,
    600,
    'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=200&q=80',
  ),
  PowerPlusPack(
    '3000 ML',
    1350,
    1500,
    'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=200&q=80',
  ),
  PowerPlusPack(
    '5000 ML',
    2150,
    2400,
    'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=200&q=80',
  ),
];

class FeatureCard {
  const FeatureCard(
    this.title,
    this.body,
    this.cta,
    this.bg,
    this.fg,
    this.icon,
  );
  final String title;
  final String body;
  final String cta;
  final List<Color> bg;
  final Color fg;
  final IconData icon;
}

const homeFeatureCards = <FeatureCard>[
  FeatureCard(
    'Order Power Plus',
    'Pick your pack — 1 L, 3 L, or 5 L — straight from the manufacturer.',
    'Shop now',
    [Color(0xFF10B981), Color(0xFF047857)],
    Colors.white,
    Icons.eco_outlined,
  ),
  FeatureCard(
    'Become a Retailer',
    'Join 50+ shops stocking trusted agri products. List your store, manage inventory.',
    'Join the network',
    [Color(0xFFF59E0B), Color(0xFFEA580C)],
    Colors.white,
    Icons.storefront_outlined,
  ),
  FeatureCard(
    'Free Crop Advisory',
    'Crop-specific hubs with expert dosage, spray schedules & soil-care guidance.',
    'Explore hubs',
    [Color(0xFF0EA5E9), Color(0xFF4F46E5)],
    Colors.white,
    Icons.biotech_outlined,
  ),
];
