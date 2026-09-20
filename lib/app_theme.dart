import 'package:flutter/material.dart';

const _primaryGreen = Color(0xFF4CAF50);
const _secondaryGrey = Color(0xFF6E6E6E);

final appThemeData = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: _primaryGreen,
    primary: _primaryGreen,
    secondary: _secondaryGrey,
  ),
  scaffoldBackgroundColor: const Color(0xFFF7F9F8),
  textTheme: const TextTheme(bodyMedium: TextStyle(color: _secondaryGrey)),
  cardTheme: CardThemeData(
    color: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    elevation: 1,
    shadowColor: Colors.black12,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: _primaryGreen,
      foregroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
      textStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: _primaryGreen,
      foregroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
      textStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(24),
      borderSide: BorderSide(color: Colors.grey.shade300),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(24),
      borderSide: BorderSide(color: Colors.grey.shade300),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(24),
      borderSide: BorderSide(color: _primaryGreen),
    ),
    hintStyle: const TextStyle(color: Color(0xFF757575)),
  ),
  chipTheme: ChipThemeData(
    backgroundColor: Colors.white,
    selectedColor: const Color.fromRGBO(76, 175, 80, 0.15),
    surfaceTintColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
    labelStyle: const TextStyle(color: _secondaryGrey),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
  ),
  iconTheme: const IconThemeData(color: _primaryGreen),
);
