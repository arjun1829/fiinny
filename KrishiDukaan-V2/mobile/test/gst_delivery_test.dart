import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/constants/indian_states.dart';
import 'package:krishidukaan_app/core/utils/delivery_utils.dart';
import 'package:krishidukaan_app/core/utils/gst_utils.dart';

/// Same cases as the web's scripts/tests/cart-pricing.test.ts. The app must
/// show the customer exactly the figure the server will charge.
List<WeightSlab> slabs(List<List<num>> x) => x
    .map((s) => WeightSlab(
        minKg: s[0].toDouble(), maxKg: s[1].toDouble(), charge: s[2].toDouble()))
    .toList();

final inSlabs = slabs([
  [0, 1, 40],
  [1, 5, 60],
  [5, 1000, 100]
]);
final outSlabs = slabs([
  [0, 1, 90],
  [1, 5, 140],
  [5, 1000, 220]
]);

Map<String, dynamic> panIndia() => {
      'coverageType': 'pan_india',
      'sellerState': 'Maharashtra',
      'weightSlabs': inSlabs.map((s) => s.toMap()).toList(),
      'inStateSlabs': inSlabs.map((s) => s.toMap()).toList(),
      'outStateSlabs': outSlabs.map((s) => s.toMap()).toList(),
    };

CartPricingLine line({
  double unitPrice = 100,
  int qty = 1,
  double weightKg = 2,
  bool gst = false,
  double rate = 0,
  bool included = true,
  double extra = 0,
  bool free = false,
}) =>
    CartPricingLine(
      sellerKey: 'S1',
      unitPrice: unitPrice,
      qty: qty,
      weightKg: weightKg,
      gstApplicable: gst,
      gstRate: rate,
      gstIncluded: included,
      extraDeliveryCharge: extra,
      freeDelivery: free,
    );

void main() {
  group('GST — values produced by the web code (computeLinePricing)', () {
    // Each row: [gstPerUnit, gstTotal, net, gstAdded, lineTotal] as printed by
    // running app/utils/gst.ts in Node, so JS rounding is what is pinned.
    void check(String name, LinePricing p, List<num> want,
        {bool applicable = true, bool included = true}) {
      expect(p.gstPerUnit, want[0], reason: '$name gstPerUnit');
      expect(p.gstTotal, want[1], reason: '$name gstTotal');
      expect(p.net, want[2], reason: '$name net');
      expect(p.gstAdded, want[3], reason: '$name gstAdded');
      expect(p.lineTotal, want[4], reason: '$name lineTotal');
      expect(p.applicable, applicable, reason: '$name applicable');
      expect(p.included, included, reason: '$name included');
    }

    test('inclusive: backed out, never added', () {
      check(
          'a',
          computeLinePricing(
              unitPrice: 600, qty: 2, gstApplicable: true, gstRate: 18),
          [91.53, 183.06, 1200, 0, 1200]);
      check(
          'b',
          computeLinePricing(
              unitPrice: 299.99, qty: 3, gstApplicable: true, gstRate: 12),
          [32.14, 96.42, 899.97, 0, 899.97]);
      check(
          'e (custom 12.5%)',
          computeLinePricing(
              unitPrice: 19.99, qty: 13, gstApplicable: true, gstRate: 12.5),
          [2.22, 28.86, 259.87, 0, 259.87]);
    });

    test('exclusive: added on top', () {
      check(
          'c',
          computeLinePricing(
              unitPrice: 1311,
              qty: 1,
              gstApplicable: true,
              gstRate: 5,
              gstIncluded: false),
          [65.55, 65.55, 1311, 65.55, 1376.55],
          included: false);
      check(
          'd',
          computeLinePricing(
              unitPrice: 425.5,
              qty: 7,
              gstApplicable: true,
              gstRate: 28,
              gstIncluded: false),
          [119.14, 833.98, 2978.5, 833.98, 3812.48],
          included: false);
      check(
          'f (tiny price)',
          computeLinePricing(
              unitPrice: 0.5,
              qty: 3,
              gstApplicable: true,
              gstRate: 18,
              gstIncluded: false),
          [0.09, 0.27, 1.5, 0.27, 1.77],
          included: false);
    });

    test('not applicable / zero rate → no GST at all', () {
      check('g', computeLinePricing(unitPrice: 100, qty: 2, gstRate: 18),
          [0, 0, 200, 0, 200],
          applicable: false, included: false);
      check(
          'h',
          computeLinePricing(unitPrice: 100, qty: 2, gstApplicable: true),
          [0, 0, 200, 0, 200],
          applicable: false,
          included: false);
    });

    test('default is INCLUDED when nothing says otherwise', () {
      final p =
          computeLinePricing(unitPrice: 118, gstApplicable: true, gstRate: 18);
      expect(p.included, isTrue);
      expect(p.gstAdded, 0);
    });

    test('normalizeGstRate', () {
      expect(normalizeGstRate(18), 18);
      expect(normalizeGstRate(-4), 0);
      expect(normalizeGstRate('abc'), 0);
      expect(normalizeGstRate(500), 100);
      expect(normalizeGstRate(12.5), 12.5);
    });
  });

  group('seller pricing', () {
    test('mixed lines: only exclusive GST reaches the total', () {
      final sp = computeSellerPricing(
        'S1',
        [
          line(unitPrice: 118, weightKg: 0, gst: true, rate: 18),
          line(unitPrice: 100, weightKg: 0, gst: true, rate: 5, included: false),
        ],
        null,
        '',
      );
      expect(sp.subtotal, 218);
      expect(sp.gstTotal, 23);
      expect(sp.gstAdded, 5);
      expect(sp.total, 223);
    });

    test('total = items + added GST + delivery', () {
      final sp = computeSellerPricing(
        'S1',
        [
          line(
              unitPrice: 100,
              qty: 2,
              weightKg: 2,
              gst: true,
              rate: 18,
              included: false,
              extra: 10)
        ],
        panIndia(),
        'Gujarat',
      );
      expect(sp.subtotal, 200);
      expect(sp.gstAdded, 36);
      expect(sp.deliveryCharge, 150); // 140 out-of-state slab (2 kg) + 10 extra
      expect(sp.total, 386);
    });
  });

  group('delivery slabs by customer state', () {
    test('pan-India: same state → in-state slab', () {
      final d = computeSellerDelivery([line()], panIndia(), 'Maharashtra');
      expect([d.slab, d.type], [60, DeliveryType.inState]);
    });
    test('pan-India: other state → out-of-state slab', () {
      final d = computeSellerDelivery([line()], panIndia(), 'Gujarat');
      expect([d.slab, d.type], [140, DeliveryType.outState]);
    });
    test('state compare ignores case and spaces', () {
      expect(computeSellerDelivery([line()], panIndia(), '  maharashtra ').type,
          DeliveryType.inState);
    });
    test('unknown customer state → legacy single slab set', () {
      final d = computeSellerDelivery([line()], panIndia(), '');
      expect([d.slab, d.type], [60, DeliveryType.defaultSlabs]);
      final n = computeSellerDelivery([line()], panIndia(), null);
      expect([n.slab, n.type], [60, DeliveryType.defaultSlabs]);
    });
    test('legacy seller (no in/out slabs) keeps working', () {
      final legacy = {
        'coverageType': 'pan_india',
        'weightSlabs': inSlabs.map((s) => s.toMap()).toList(),
      };
      expect(computeSellerDelivery([line()], legacy, 'Gujarat').slab, 60);
    });
    test('states coverage uses the single slab set', () {
      final d = computeSellerDelivery(
        [line(weightKg: 6)],
        {
          'coverageType': 'states',
          'weightSlabs': inSlabs.map((s) => s.toMap()).toList()
        },
        'Gujarat',
      );
      expect([d.slab, d.type], [100, DeliveryType.defaultSlabs]);
    });
    test('weight above every slab → top slab', () {
      expect(
          computeSellerDelivery([line(weightKg: 5000)], panIndia(), 'Gujarat')
              .slab,
          220);
    });
    test('malformed slab entries are ignored, not fatal', () {
      final d = computeSellerDelivery(
        [line()],
        {
          'coverageType': 'states',
          'weightSlabs': [
            {'minKg': 'x'},
            {'minKg': 0, 'maxKg': 5, 'charge': 30},
            null
          ]
        },
        '',
      );
      expect(d.slab, 30);
    });
  });

  group('state names — spelling must not decide the slab', () {
    test('aliases and formatting match, as on the server', () {
      expect(isSameState('Jammu & Kashmir', 'Jammu and Kashmir'), isTrue);
      expect(isSameState('Delhi', 'NCT of Delhi'), isTrue);
      expect(isSameState('Delhi', 'New Delhi'), isTrue);
      expect(isSameState('Odisha', 'Orissa'), isTrue);
      expect(isSameState('Andaman & Nicobar Islands',
          'Andaman and Nicobar Islands'), isTrue);
      expect(
          isSameState('Dadra & Nagar Haveli and Daman & Diu',
              'Dadra and Nagar Haveli and Daman and Diu'),
          isTrue);
      expect(isSameState('Daman and Diu',
          'Dadra & Nagar Haveli and Daman & Diu'), isTrue);
      expect(isSameState('  TAMIL   NADU ', 'tamil nadu'), isTrue);
      expect(isSameState('Puducherry', 'Pondicherry'), isTrue);
    });
    test('different states never merge; empty never matches', () {
      expect(isSameState('Maharashtra', 'Gujarat'), isFalse);
      expect(isSameState('Uttar Pradesh', 'Uttarakhand'), isFalse);
      expect(isSameState('Madhya Pradesh', 'Maharashtra'), isFalse);
      expect(isSameState('', ''), isFalse);
      expect(isSameState('Goa', ''), isFalse);
      expect(canonicalState(null), '');
    });
    test('every state in the seller coverage list canonicalises uniquely', () {
      final seen = <String, String>{};
      for (final st in kIndianStates) {
        final c = canonicalState(st);
        expect(seen.containsKey(c), isFalse, reason: '$st collides with ${seen[c]}');
        seen[c] = st;
      }
    });
    test('an in-state customer spelled differently gets the in-state slab', () {
      final seller = {...panIndia(), 'sellerState': 'Jammu & Kashmir'};
      final d =
          computeSellerDelivery([line()], seller, 'Jammu and Kashmir');
      expect([d.slab, d.type], [60, DeliveryType.inState]);
    });
  });

  group('extra + free delivery', () {
    test('extra is added on top of the slab', () {
      final d = computeSellerDelivery(
          [line(extra: 25)], panIndia(), 'Maharashtra');
      expect([d.slab, d.extra], [60, 25]);
    });
    test('a free item contributes no weight and no extra', () {
      final d = computeSellerDelivery(
        [line(weightKg: 0.5), line(weightKg: 10, free: true, extra: 99)],
        panIndia(),
        'Maharashtra',
      );
      expect([d.slab, d.extra, d.free], [40, 0, false]);
    });
    test('all free → ships free; waived keeps what it would have cost', () {
      final lines = [
        line(weightKg: 2, free: true, extra: 10),
        line(weightKg: 1, free: true),
      ];
      final d = computeSellerDelivery(lines, panIndia(), 'Maharashtra');
      expect([d.free, d.slab, d.extra, d.waived], [true, 0, 0, 70]);
      final sp = computeSellerPricing(
          'S1', [line(free: true)], panIndia(), 'Maharashtra');
      expect([sp.deliveryCharge, sp.total], [0, 100]);
    });
    test('zero chargeable weight → only the per-product extra', () {
      final d = computeSellerDelivery(
          [line(weightKg: 0, extra: 15)], panIndia(), 'Maharashtra');
      expect([d.slab, d.extra], [0, 15]);
    });
    test('no readable settings → only extra, never a slab', () {
      final d = computeSellerDelivery([line(extra: 15)], null, 'Maharashtra');
      expect([d.slab, d.extra], [0, 15]);
    });
  });

  group('server breakdown round trip', () {
    test('DeliveryBreakdown survives toMap / fromMap (order record)', () {
      final d = computeSellerDelivery(
          [line(extra: 10)], panIndia(), 'Gujarat');
      final back = DeliveryBreakdown.fromMap(d.toMap());
      expect([back.slab, back.extra, back.free, back.type],
          [d.slab, d.extra, d.free, d.type]);
      expect(d.toMap()['deliveryType'], 'out_state');
    });
    test('SellerPricing.fromMap reads the server JSON', () {
      final sp = SellerPricing.fromMap({
        'sellerKey': '+919000000002',
        'subtotal': 1500,
        'gstTotal': 198.06,
        'gstAdded': 15,
        'deliveryCharge': 60,
        'delivery': {
          'slab': 50,
          'extra': 10,
          'free': false,
          'waived': 0,
          'deliveryType': 'in_state'
        },
        'total': 1575,
      });
      expect(sp.total, 1575);
      expect(sp.delivery.type, DeliveryType.inState);
      expect(sp.delivery.charge, 60);
    });
  });
}
