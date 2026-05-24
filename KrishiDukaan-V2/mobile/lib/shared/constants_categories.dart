import 'package:flutter/material.dart';

class Category {
  const Category(this.name, this.icon);
  final String name;
  final IconData icon;
}

const productCategories = <Category>[
  Category('Seeds', Icons.grass),
  Category('Fertilizer', Icons.science_outlined),
  Category('Pesticide', Icons.bug_report_outlined),
  Category('Tools', Icons.build_outlined),
  Category('Irrigation', Icons.water_drop_outlined),
  Category('Animal Feed', Icons.pets_outlined),
];
