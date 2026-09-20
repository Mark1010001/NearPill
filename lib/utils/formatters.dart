import 'package:flutter/services.dart';

class DateTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    String text = newValue.text.replaceAll('/', '');
    if (text.length > 8) return oldValue;
    
    // Deleting character
    if (newValue.text.length < oldValue.text.length) {
      return newValue;
    }
    
    // Month validation
    if (text.isNotEmpty) {
      if (int.parse(text[0]) > 1) text = '0${text[0]}';
    }
    if (text.length >= 2) {
      int month = int.parse(text.substring(0, 2));
      if (month > 12) text = text[0];
      if (month == 0) text = '01';
    }
    
    // Day validation
    if (text.length >= 3) {
      if (int.parse(text[2]) > 3) text = '${text.substring(0, 2)}0${text[2]}';
    }
    if (text.length >= 4) {
      int day = int.parse(text.substring(2, 4));
      if (day > 31) text = text.substring(0, 3);
      if (day == 0) text = '${text.substring(0, 2)}01';
    }
    
    // Formatting
    String newString = '';
    for (int i = 0; i < text.length; i++) {
      if (i == 2 || i == 4) newString += '/';
      newString += text[i];
    }
    
    return TextEditingValue(
      text: newString,
      selection: TextSelection.collapsed(offset: newString.length),
    );
  }
}

String? validateBirthdate(String? val) {
  if (val == null || val.trim().isEmpty) return 'Enter birthdate';
  if (val.length != 10) return 'Invalid date format';
  
  final parts = val.split('/');
  if (parts.length == 3) {
    final month = int.tryParse(parts[0]);
    final day = int.tryParse(parts[1]);
    final year = int.tryParse(parts[2]);
    
    if (year != null && month != null && day != null) {
      if (year < 1955) return 'Year must be 1955 or later';
      
      final inputDate = DateTime(year, month, day);
      final now = DateTime.now();
      
      final adultDate = DateTime(now.year - 18, now.month, now.day);
      if (inputDate.isAfter(adultDate)) return 'You must be at least 18 years old';
      final today = DateTime(now.year, now.month, now.day);
      
      if (inputDate.isAfter(today)) return 'Invalid birthdate';
      if (inputDate.month != month || inputDate.day != day) return 'Invalid birthdate';
    } else {
      return 'Invalid date format';
    }
  }
  return null;
}
