import 'package:flutter/material.dart';
import '../widgets/partner_chat_tab.dart';

class PartnerChatFullScreen extends StatelessWidget {
  final String partnerName;
  final String partnerUserId;
  final String currentUserId;
  final String? partnerAvatar;

  const PartnerChatFullScreen({
    Key? key,
    required this.partnerName,
    required this.partnerUserId,
    required this.currentUserId,
    this.partnerAvatar,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final avatar = (partnerAvatar != null && partnerAvatar!.isNotEmpty)
        ? partnerAvatar!
        : "assets/images/profile_default.png";
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundImage: avatar.startsWith('http')
                  ? NetworkImage(avatar)
                  : AssetImage(avatar) as ImageProvider,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                partnerName,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: PartnerChatTab(
          partnerUserId: partnerUserId,
          currentUserId: currentUserId,
        ),
      ),
    );
  }
}
