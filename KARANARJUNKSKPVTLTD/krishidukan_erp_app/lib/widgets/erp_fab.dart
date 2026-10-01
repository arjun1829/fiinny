import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/theme.dart';

const erpUrl = 'https://karanarjun-pvt-ltd.web.app/';

/// Persistent shortcut into the full web ERP, floating above the nav dock on
/// every screen — billing, inventory and settings live there, not in this
/// read-only app.
class ErpFab extends StatelessWidget {
  const ErpFab({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(28),
        onTap: () =>
            launchUrl(Uri.parse(erpUrl), mode: LaunchMode.externalApplication),
        child: Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.accent,
            shape: BoxShape.circle,
            boxShadow: const [
              BoxShadow(
                color: Color(0x99000000),
                blurRadius: 16,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Icon(Icons.open_in_new_rounded,
              size: 22, color: AppColors.accentInk),
        ),
      ),
    );
  }
}
