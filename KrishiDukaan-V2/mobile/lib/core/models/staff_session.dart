/// A shop helper's access to someone else's shop — the app side of
/// app/lib/shop-team.ts on the website. Returned by POST /api/team/me.
class StaffSession {
  final String ownerPhone;
  final String ownerUid;
  final String ownerName;
  final String ownerRole;
  final bool ownerIsPaid;
  final String staffName;
  final Set<String> permissions;
  /// 'active' or 'paused'.
  final String status;

  const StaffSession({
    required this.ownerPhone,
    required this.ownerUid,
    required this.ownerName,
    required this.ownerRole,
    required this.ownerIsPaid,
    required this.staffName,
    required this.permissions,
    required this.status,
  });

  factory StaffSession.fromJson(Map<String, dynamic> j) => StaffSession(
        ownerPhone: (j['ownerPhone'] ?? '').toString(),
        ownerUid: (j['ownerUid'] ?? '').toString(),
        ownerName: (j['ownerName'] ?? '').toString(),
        ownerRole: (j['ownerRole'] ?? '').toString(),
        ownerIsPaid: j['ownerIsPaid'] == true,
        staffName: (j['staffName'] ?? '').toString(),
        permissions: {
          for (final p in (j['permissions'] as List? ?? const [])) p.toString(),
        },
        status: j['status'] == 'paused' ? 'paused' : 'active',
      );

  bool get isPaused => status == 'paused';

  /// The helper may manage the shop right now.
  bool get isActive => !isPaused && ownerIsPaid;

  bool can(String permission) => permissions.contains(permission);
}

/// Labels for the five permissions, same wording as the website.
const staffPermissionLabels = <String, String>{
  'products': 'Products & stock',
  'orders': 'Orders',
  'reels': 'Agri Reels',
  'shopPage': 'Shop page',
  'analytics': 'Sales & analytics',
};

const staffPermissionHints = <String, String>{
  'products': 'Add and edit products, prices, offers and stock',
  'orders': 'See orders, accept, reject and dispatch them',
  'reels': 'Upload and delete reels for the shop',
  'shopPage': "Edit the shop's public page: photos, tagline, highlights",
  'analytics': 'See views, sales and reports',
};

/// Same presets as the website's Team page.
const staffPresets = <(String, List<String>)>[
  ('Store helper', ['products', 'reels']),
  ('Order manager', ['orders']),
  ('Manager', ['products', 'orders', 'reels', 'shopPage', 'analytics']),
];

/// Dashboard routes a helper may open, by the permission each needs
/// (mirrors STAFF_PAGE_PERMISSIONS in app/lib/shop-team.ts). Anything not
/// listed is owner-only. The Profile tab (the shop overview) is open to all.
const _staffRoutePermissions = <String, String>{
  '/dashboard/inventory': 'products',
  '/dashboard/manufacturer/catalog': 'products',
  '/dashboard/orders': 'orders',
  '/dashboard/enquiry': 'orders',
  '/dashboard/reels': 'reels',
  '/reels/upload': 'reels',
  '/dashboard/brand-page': 'shopPage',
  '/dashboard/manufacturer/brand': 'shopPage',
  '/dashboard/reviews': 'shopPage',
  '/dashboard/analytics': 'analytics',
};

bool staffMayOpen(String path, Set<String> permissions) {
  if (path == '/profile') return true;
  for (final e in _staffRoutePermissions.entries) {
    if (path == e.key || path.startsWith('${e.key}/')) {
      return permissions.contains(e.value);
    }
  }
  return false;
}
