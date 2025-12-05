import 'package:flutter/material.dart';

// --- THEME COLORS ---
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen   = Color(0xFFb9f5d8);
const Color deepTeal    = Color(0xFF09857a);
const Color coral       = Color(0xFFFFD6A5);
const Color royalBlue   = Color(0xFF2E3192);
const Color royalGold   = Color(0xFFF8B500);
const Color sunnyLemon  = Color(0xFFFFF475);
const Color sunnyCoral  = Color(0xFFFF7F50);
const Color midnight    = Color(0xFF131E2A);
const Color midnightBlue= Color(0xFF2D4D5B);
const Color deepTealBackground = Color(0xFF00423D);
const Color tealPrimary = Color(0xFF006D64);

// --- THEME DATA VARIANTS ---

final ThemeData freshTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: tiffanyBlue,
  scaffoldBackgroundColor: Colors.white,        // <--- CLEAN WHITE
  fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
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
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: mintGreen,
    foregroundColor: deepTeal,
    elevation: 6,
  ),
  cardColor: Colors.white,
  dialogBackgroundColor: Colors.white,
  colorScheme: ColorScheme.light(
    primary: tiffanyBlue,
    secondary: mintGreen,
    onPrimary: deepTeal,
    onSurface: deepTeal,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: deepTeal, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: deepTeal),
  ),
);

final ThemeData royalTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: royalBlue,
  scaffoldBackgroundColor: Colors.white,        // <--- CLEAN WHITE
  fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
    backgroundColor: royalBlue,
    elevation: 0,
    iconTheme: IconThemeData(color: royalGold),
    titleTextStyle: TextStyle(
      color: royalGold,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
      letterSpacing: 0.6,
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: royalGold,
    foregroundColor: royalBlue,
    elevation: 6,
  ),
  cardColor: Colors.white,
  dialogBackgroundColor: Colors.white,
  colorScheme: ColorScheme.light(
    primary: royalBlue,
    secondary: royalGold,
    onPrimary: royalGold,
    onSurface: royalBlue,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: royalBlue, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: royalBlue),
  ),
);

final ThemeData sunnyTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: sunnyLemon,
  scaffoldBackgroundColor: Colors.white,        // <--- CLEAN WHITE
  fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
    backgroundColor: sunnyLemon,
    elevation: 0,
    iconTheme: IconThemeData(color: sunnyCoral),
    titleTextStyle: TextStyle(
      color: sunnyCoral,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
      letterSpacing: 0.6,
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: sunnyCoral,
    foregroundColor: sunnyLemon,
    elevation: 6,
  ),
  cardColor: Colors.white,
  dialogBackgroundColor: Colors.white,
  colorScheme: ColorScheme.light(
    primary: sunnyLemon,
    secondary: sunnyCoral,
    onPrimary: sunnyCoral,
    onSurface: sunnyLemon,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: sunnyCoral, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: sunnyCoral),
  ),
);

final ThemeData midnightTheme = ThemeData(
  brightness: Brightness.dark,
  primaryColor: midnight,
  scaffoldBackgroundColor: midnightBlue,
  fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
    backgroundColor: midnight,
    elevation: 0,
    iconTheme: IconThemeData(color: Colors.white),
    titleTextStyle: TextStyle(
      color: Colors.white,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
      letterSpacing: 0.6,
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: midnightBlue,
    foregroundColor: Colors.white,
    elevation: 6,
  ),
  cardColor: midnight,
  dialogBackgroundColor: midnightBlue.withOpacity(0.96),
  colorScheme: ColorScheme.dark(
    primary: midnight,
    secondary: midnightBlue,
    onPrimary: Colors.white,
    onSurface: Colors.white,
    surface: midnightBlue,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: Colors.white),
  ),
);

final ThemeData classicTheme = ThemeData(
  primarySwatch: Colors.deepPurple,
  scaffoldBackgroundColor: Colors.white,
  fontFamily: 'Montserrat',
);

final ThemeData pureDarkTheme = ThemeData.dark().copyWith(
  primaryColor: Colors.black,
  scaffoldBackgroundColor: Colors.black,
  //fontFamily: 'Montserrat',
);

final ThemeData lightMinimalTheme = ThemeData.light().copyWith(
  primaryColor: Colors.white,
  scaffoldBackgroundColor: Colors.white,
  //fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    iconTheme: IconThemeData(color: Colors.black),
    titleTextStyle: TextStyle(
      color: Colors.black,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: Colors.black,
    foregroundColor: Colors.white,
    elevation: 6,
  ),
  cardColor: Colors.white,
  colorScheme: ColorScheme.light(
    primary: Colors.white,
    secondary: Colors.black,
    onPrimary: Colors.black,
    onSurface: Colors.black,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: Colors.black),
  ),
  dialogTheme: DialogThemeData(backgroundColor: Colors.white),
);

final ThemeData tealTheme = ThemeData(
  brightness: Brightness.dark,
  primaryColor: tealPrimary,
  scaffoldBackgroundColor: deepTealBackground,
  fontFamily: 'Montserrat',
  appBarTheme: const AppBarTheme(
    backgroundColor: deepTealBackground,
    elevation: 0,
    iconTheme: IconThemeData(color: Colors.white),
    titleTextStyle: TextStyle(
      color: Colors.white,
      fontWeight: FontWeight.bold,
      fontSize: 22,
      fontFamily: 'Montserrat',
      letterSpacing: 0.6,
    ),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    backgroundColor: Colors.white,
    foregroundColor: tealPrimary,
    elevation: 6,
  ),
  cardColor: tealPrimary,
  dialogBackgroundColor: deepTealBackground,
  colorScheme: ColorScheme.dark(
    primary: tealPrimary,
    secondary: Colors.tealAccent,
    onPrimary: Colors.white,
    onSurface: Colors.white,
    surface: deepTealBackground,
  ),
  textTheme: const TextTheme(
    titleLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
    bodyMedium: TextStyle(color: Colors.white),
  ),
);
