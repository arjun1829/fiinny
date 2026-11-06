import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/catalog_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../providers/marketplace_provider.dart';
import '../screens/product_detail_screen.dart' show ensureSignedInForCart;
import '../widgets/store_selector_sheet.dart';

/// True when the card can offer a one-tap Buy Now: the product is sold online
/// at all (the per-store check happens when the buyer taps).
bool canQuickBuy(CatalogModel p) =>
    !(p.sellMode == 'offline_store_only' || p.isOnline == false);

/// True when the product comes in several sizes, so a size has to be chosen on
/// the product page first rather than guessing one for the buyer.
bool needsSizeChoice(CatalogModel p) => (p.variants?.length ?? 0) > 1;

/// Buy Now from a product card: the same thing the product page's Buy Now does,
/// without opening the page. Picks the cheapest online store for the product's
/// single size (nearest breaks ties), adds one to the cart and goes straight to
/// checkout.
///
/// A product with several sizes opens its page instead, so the buyer picks the
/// size; guessing one would price and ship the wrong thing.
Future<void> quickBuyNow(
  BuildContext context,
  WidgetRef ref,
  CatalogModel product,
) async {
  if (needsSizeChoice(product)) {
    context.push('/product/${product.id}');
    return;
  }
  if (!ensureSignedInForCart(context, ref)) return;

  final messenger = ScaffoldMessenger.of(context);
  void say(String text) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), persist: false));

  try {
    final listings = await ref.read(
      listingsForCatalogProvider(product.id).future,
    );
    final options = buildStoreOptions(product, listings);
    if (options.isEmpty) {
      say('${product.name} is not available for online order right now.');
      return;
    }
    final chosen = bestStoreOption(options);
    final label = product.variants?.isNotEmpty == true
        ? product.variants!.first.label
        : product.unit;
    final item = cartItemForOption(product, chosen, label);
    final notifier = ref.read(cartProvider.notifier);
    notifier.addItem(item);
    // This store's own GST and delivery settings replace the product-level
    // guess; the cart re-prices itself when they arrive.
    unawaited(notifier.resolveCommercial(item));
    if (context.mounted) context.push('/checkout');
  } catch (_) {
    say('Could not start the order. Please try again.');
  }
}
