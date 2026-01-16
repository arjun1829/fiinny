import 'package:flutter/material.dart';

class Fx {
  // spacing
  static const s2 = 2.0, s4 = 4.0, s6 = 6.0, s8 = 8.0, s10 = 10.0, s12 = 12.0;
  static const s14 = 14.0, s16 = 16.0, s18 = 18.0, s20 = 20.0, s24 = 24.0, s32 = 32.0;

  // radii
  static const r10 = 10.0, r12 = 12.0, r16 = 16.0, r20 = 20.0, r24 = 24.0, r28 = 28.0, r36 = 36.0;

  // colors
  static const mint = Color(0xFF10B981);
  static const mintDark = Color(0xFF09857A);
  static const bg = Color(0xFFF5FAF8);
  static const card = Colors.white;
  static const textStrong = Color(0xFF0F172A);
  static const text = Color(0xFF334155);
  static const good = Color(0xFF16A34A);
  static const warn = Color(0xFFF59E0B);
  static const bad = Color(0xFFEF4444);

  // shadows
  static List<BoxShadow> soft = [
    BoxShadow(color: Colors.black12, blurRadius: 18, offset: Offset(0, 7)),
  ];

  // text styles
  static const title = TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: textStrong);
  static const label = TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: text);
  static const h6 = TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: textStrong);
  static const number = TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: textStrong);
}
