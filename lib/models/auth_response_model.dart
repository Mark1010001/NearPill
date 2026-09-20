import 'user_model.dart';

class AuthResponseModel {
  const AuthResponseModel({
    this.accessToken,
    this.refreshToken,
    this.user,
  });

  final String? accessToken;
  final String? refreshToken;
  final UserModel? user;

  factory AuthResponseModel.fromJson(Map<String, dynamic> json) {
    return AuthResponseModel(
      accessToken: json['accessToken']?.toString(),
      refreshToken: json['refreshToken']?.toString(),
      user: json['user'] != null
          ? UserModel.fromJson(Map<String, dynamic>.from(json['user'] as Map))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user?.toJson(),
      };
}
