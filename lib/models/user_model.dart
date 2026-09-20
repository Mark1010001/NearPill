class UserModel {
  const UserModel({
    this.id,
    required this.fullName,
    required this.email,
    this.phone,
    this.birthDate,
  });

  final int? id;
  final String fullName;
  final String email;
  final String? phone;
  final String? birthDate;

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] != null ? int.tryParse(json['id'].toString()) : null,
      fullName: json['fullName']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      phone: json['phone']?.toString(),
      birthDate: json['birthDate']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'email': email,
        if (phone != null) 'phone': phone,
        if (birthDate != null) 'birthDate': birthDate,
      };
}
