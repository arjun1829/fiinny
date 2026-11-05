import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/utils/web_links.dart';

/// The message a shared reel carries: title, caption, a buy link for the
/// linked product, and the reel's own link (opens the app or the website).
String reelShareText(ReelModel reel) {
  final hasProduct = reel.linkedProductId != null && reel.linkedProductId!.isNotEmpty;
  return <String>[
    if (reel.title.isNotEmpty) '🎬 ${reel.title}',
    if (reel.caption.isNotEmpty) reel.caption,
    if (hasProduct) ...[
      '',
      '🛒 Buy ${reel.linkedProductName ?? 'this product'}:',
      WebLinks.product(reel.linkedProductName ?? '', reel.linkedProductId!),
    ],
    '',
    'Watch on KrishiDukan AgriReels — by ${reel.shopName}:',
    WebLinks.reel(reel.title, reel.id),
  ].join('\n');
}

/// Share sheet for one reel: WhatsApp first (where most buyers are), then
/// the system share sheet. Used by the Reels feed and by a seller's own
/// reels (Dashboard > Reels and their shop profile).
Future<void> showReelShareSheet(BuildContext context, ReelModel reel) {
  final text = reelShareText(reel);
  final subject = reel.title.isNotEmpty ? reel.title : '${reel.shopName} on AgriReels';
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 4),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF25D366),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.chat, color: Colors.white),
            ),
            title: const Text(
              'Share on WhatsApp',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(subject, maxLines: 1, overflow: TextOverflow.ellipsis),
            onTap: () async {
              Navigator.pop(sheetContext);
              final url = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
              if (await canLaunchUrl(url)) {
                await launchUrl(url, mode: LaunchMode.externalApplication);
              } else {
                await SharePlus.instance.share(ShareParams(text: text));
              }
            },
          ),
          ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.share_rounded, color: AppColors.primary),
            ),
            title: const Text(
              'More options',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: const Text('SMS, Telegram, email…'),
            onTap: () {
              Navigator.pop(sheetContext);
              SharePlus.instance.share(ShareParams(text: text, subject: subject));
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}
