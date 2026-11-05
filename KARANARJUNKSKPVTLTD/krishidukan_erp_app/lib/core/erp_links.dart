import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// The live web ERP. Every "open in ERP" action in the app goes through here,
/// so moving domains again is a one-line change.
const erpBaseUrl = 'https://karanarjunerp.com';

Uri erpUri([String path = '/']) => Uri.parse('$erpBaseUrl$path');

/// Opens [path] on the web ERP in the browser. Shows a snackbar instead of
/// failing silently when no browser can take the link.
Future<void> openErp(BuildContext context, [String path = '/']) async {
  final uri = erpUri(path);
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not open ${uri.host}${uri.path}')),
    );
  }
}

/// Which business tiers a web feature belongs to. Mirrors the plan screens in
/// the web's subscriptionPlans.ts loosely — a manufacturer has no POS counter
/// or storefront, so those shortcuts are hidden for them.
enum ErpAudience { all, shop, b2b }

class ErpFeature {
  const ErpFeature(
    this.label,
    this.icon,
    this.path, {
    this.audience = ErpAudience.all,
  });

  final String label;
  final IconData icon;
  final String path;
  final ErpAudience audience;
}

class ErpFeatureGroup {
  const ErpFeatureGroup(this.title, this.features);
  final String title;
  final List<ErpFeature> features;
}

/// Paths are the web ERP routes in src/App.tsx — never change a path here
/// without checking that route still exists.
const erpFeatureGroups = [
  ErpFeatureGroup('Billing', [
    ErpFeature('New Bill', Icons.point_of_sale_rounded, '/pos',
        audience: ErpAudience.shop),
    ErpFeature('GST Invoice', Icons.request_quote_outlined, '/b2b-invoice'),
    ErpFeature('Quotation', Icons.description_outlined, '/quotations'),
    ErpFeature('Sales Return', Icons.assignment_return_outlined, '/returns',
        audience: ErpAudience.shop),
    ErpFeature('Delivery Challan', Icons.local_shipping_outlined,
        '/delivery-challans'),
    ErpFeature('Order History', Icons.history_rounded, '/order-history'),
  ]),
  ErpFeatureGroup('Money', [
    ErpFeature('Khata', Icons.menu_book_outlined, '/digital-khata'),
    ErpFeature('Payment Links', Icons.link_rounded, '/payment-links'),
    ErpFeature(
        'Reminders', Icons.notifications_active_outlined, '/payment-reminders'),
    ErpFeature('Expenses', Icons.receipt_outlined, '/expenses'),
    ErpFeature('Supplier Ledger', Icons.account_balance_wallet_outlined,
        '/supplier-ledger'),
    ErpFeature('Supplier Bill', Icons.post_add_rounded, '/supplier-invoice'),
  ]),
  ErpFeatureGroup('Stock', [
    ErpFeature('Items & Rates', Icons.inventory_2_outlined, '/rates'),
    ErpFeature('Batches', Icons.layers_outlined, '/inventory-batches'),
    ErpFeature('Godowns', Icons.warehouse_outlined, '/warehouses'),
    ErpFeature('Barcodes', Icons.qr_code_2_rounded, '/barcode'),
  ]),
  ErpFeatureGroup('Parties & Orders', [
    ErpFeature('Customers', Icons.people_alt_outlined, '/customers'),
    ErpFeature('Add Party', Icons.person_add_alt_1_outlined, '/onboarding',
        audience: ErpAudience.b2b),
    ErpFeature('Worklist', Icons.checklist_rounded, '/worklist'),
    ErpFeature('Dispatch', Icons.local_shipping_rounded, '/dispatch',
        audience: ErpAudience.b2b),
    ErpFeature('Online Orders', Icons.shopping_bag_outlined, '/online-orders',
        audience: ErpAudience.shop),
  ]),
  ErpFeatureGroup('Reports', [
    ErpFeature('Reports', Icons.bar_chart_rounded, '/reports'),
    ErpFeature('Analytics', Icons.insights_rounded, '/analytics'),
    ErpFeature('Settings', Icons.settings_outlined, '/settings'),
  ]),
];

/// The four create-actions pinned on the home screen.
const homeShortcutPaths = ['/pos', '/b2b-invoice', '/digital-khata', '/rates'];
