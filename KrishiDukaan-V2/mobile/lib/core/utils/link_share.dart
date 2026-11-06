import 'package:flutter/widgets.dart';
import 'package:share_plus/share_plus.dart';

import 'web_links.dart';

/// Opens the system share sheet (WhatsApp, Instagram, SMS…) for a seller's
/// shop or brand link. The link opens in the app for anyone who has it, and
/// on the website for everyone else (see [WebLinks.shop]).
class LinkShare {
  LinkShare._();

  static Future<void> shop(BuildContext context, {required String phone, required String name}) =>
      _share(context, WebLinks.shop(phone), name,
          '$name on KrishiDukan: see our products and prices');

  static Future<void> brand(BuildContext context, {required String phone, required String name}) =>
      _share(context, WebLinks.brand(phone), name,
          '$name on KrishiDukan: our products and stores near you');

  static Future<void> _share(BuildContext context, String? url, String title, String text) async {
    if (url == null) return;
    // iPad needs an anchor for the share popover.
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(ShareParams(
      text: '$text\n$url',
      subject: title,
      sharePositionOrigin:
          box != null && box.hasSize ? box.localToGlobal(Offset.zero) & box.size : null,
    ));
  }
}
