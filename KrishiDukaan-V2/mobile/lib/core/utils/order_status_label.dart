/// Customer-facing label for an order status. Mirrors the web's
/// MyOrdersView badges, so the app and the site say the same thing.
String orderStatusLabel(String status) => switch (status) {
      'out_for_delivery' => 'Out for delivery',
      // Rejected by the original seller and offered to others for 24h.
      'reassigning' => 'Finding seller',
      '' => 'Unknown',
      _ => status[0].toUpperCase() + status.substring(1),
    };
