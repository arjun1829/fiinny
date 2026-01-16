import 'package:flutter/material.dart';

// ---- Your Classic Themes (unchanged) ----
final appTheme = ThemeData(
  primarySwatch: Colors.deepPurple,
  scaffoldBackgroundColor: Colors.white,
  fontFamily: 'Montserrat',
);

final darkTheme = ThemeData.dark().copyWith(
  primaryColor: Colors.deepPurple,
  scaffoldBackgroundColor: Colors.black,
);

final glassTheme = appTheme.copyWith(
  scaffoldBackgroundColor: Colors.white.withValues(alpha: 0.7),
  cardColor: Colors.white.withValues(alpha: 0.7),
  dialogTheme: DialogThemeData(backgroundColor: Colors.white.withValues(alpha: 0.8)),
  // You can enhance glass effect here as needed.
);

// ---- NEW: Tiffany Blue / Mint “Fresh” Theme ----
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);
const Color lightMint = Color(0xFFF2FFFA);
const Color coral = Color(0xFFFFD6A5);

final ThemeData freshTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: tiffanyBlue,
  scaffoldBackgroundColor: lightMint,
  fontFamily: 'Montserrat',
  appBarTheme: AppBarTheme(
    backgroundColor: tiffanyBlue,
    elevation: 0,
    iconTheme: IconThemeData(color: deepTeal),
    titleTextStyle: TextStyle(
      color: deepTeal,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
      letterSpacing: 0.5,
    ),
  ),
  floatingActionButtonTheme: FloatingActionButtonThemeData(
    backgroundColor: mintGreen,
    foregroundColor: deepTeal,
    elevation: 6,
  ),
  cardColor: Colors.white.withValues(alpha: 0.85),
  textTheme: TextTheme(
    titleLarge: TextStyle(color: deepTeal, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: deepTeal),
  ),
  buttonTheme: ButtonThemeData(
    buttonColor: deepTeal,
    textTheme: ButtonTextTheme.primary,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
  ),
  colorScheme: ColorScheme.fromSwatch().copyWith(
    secondary: mintGreen,
    primary: tiffanyBlue,
    surface: Colors.white,
    onPrimary: deepTeal,
    onSurface: deepTeal,
    brightness: Brightness.light,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Colors.white.withValues(alpha: 0.92),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: tiffanyBlue, width: 1.2),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: deepTeal, width: 2),
    ),
    labelStyle: TextStyle(color: deepTeal),
  ),
  dialogTheme: DialogThemeData(backgroundColor: mintGreen.withValues(alpha: 0.92)),
);
