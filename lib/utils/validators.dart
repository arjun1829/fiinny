class Validators {
  static String? validateAmount(String? value) {
    if (value == null || value.isEmpty) return "Enter amount";
    if (double.tryParse(value) == null) return "Enter valid number";
    return null;
  }

  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) return "Enter email";
    final regex = RegExp(r"^[^@]+@[^@]+\.[^@]+");
    if (!regex.hasMatch(value)) return "Invalid email";
    return null;
  }
}
