
class UserModel {
  String phone;      // <-- Unique identifier (E.164: +91xxxx)
  String name;
  String email;
  String country;
  String currency;
  String avatar;

  UserModel({
    required this.phone,
    required this.name,
    required this.email,
    required this.country,
    required this.currency,
    required this.avatar,
  });

  Map<String, dynamic> toMap() => {
    'phone': phone,
    'name': name,
    'email': email,
    'country': country,
    'currency': currency,
    'avatar': avatar,
  };

  static UserModel fromMap(Map<String, dynamic> map) => UserModel(
    phone: map['phone'] ?? '',   // Defensive fallback for legacy data
    name: map['name'] ?? '',
    email: map['email'] ?? '',
    country: map['country'] ?? '',
    currency: map['currency'] ?? '',
    avatar: map['avatar'] ?? '',
  );
}
