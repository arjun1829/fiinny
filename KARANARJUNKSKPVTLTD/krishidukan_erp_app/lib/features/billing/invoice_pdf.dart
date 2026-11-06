import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import 'billing_math.dart';

/// settings/invoice — InvoiceTemplateBranding in src/types/invoiceTemplate.ts.
class InvoiceBranding {
  const InvoiceBranding({
    required this.businessName,
    this.address = '',
    this.gstin = '',
    this.licenses = const [],
    this.contact = '',
    this.email = '',
    this.bankDetails = '',
    this.upiId = '',
    this.terms = '',
    this.signatureName = '',
  });

  final String businessName;
  final String address;
  final String gstin;
  final List<String> licenses;
  final String contact;
  final String email;
  final String bankDetails;
  final String upiId;
  final String terms;
  final String signatureName;

  static Future<InvoiceBranding> load(
      FirebaseFirestore db, String tenantId, String fallbackName) async {
    Map<String, dynamic> d = const {};
    try {
      final s = await tenantCollection(db, tenantId, 'settings').doc('invoice').get();
      d = s.data() ?? const {};
    } catch (_) {/* branding is cosmetic; never block an invoice on it */}
    // getAllConfiguredLicenses: the three typed fields, else the legacy one.
    final lic = <String>[
      if (str(d['fertilizerLicense']).isNotEmpty) 'Fert. Lic: ${str(d['fertilizerLicense'])}',
      if (str(d['pesticideLicense']).isNotEmpty) 'Pest. Lic: ${str(d['pesticideLicense'])}',
      if (str(d['seedsLicense']).isNotEmpty) 'Seeds Lic: ${str(d['seedsLicense'])}',
    ];
    if (lic.isEmpty && str(d['licenseNumbers']).isNotEmpty) {
      lic.add('Lic: ${str(d['licenseNumbers'])}');
    }
    return InvoiceBranding(
      businessName: str(d['businessName']).isNotEmpty ? str(d['businessName']) : fallbackName,
      address: str(d['address']),
      gstin: str(d['gstin']),
      licenses: lic,
      contact: str(d['contact']),
      email: str(d['email']),
      bankDetails: str(d['bankDetails']),
      upiId: str(d['upiId']),
      terms: str(d['terms']),
      signatureName: str(d['signatureName']),
    );
  }
}

final _inr = NumberFormat('#,##,##0.00', 'en_IN');

/// Hind (OFL, assets/fonts) covers Latin, Devanagari and ₹ — the PDF
/// built-in Helvetica has none of the last two, so Marathi names printed as
/// blanks. Loaded once; null falls back to Helvetica with "Rs.".
pw.ThemeData? _theme;
bool _themeTried = false;
Future<pw.ThemeData?> _loadTheme() async {
  if (_themeTried) return _theme;
  _themeTried = true;
  try {
    final regular = await rootBundle.load('assets/fonts/Hind-Regular.ttf');
    final bold = await rootBundle.load('assets/fonts/Hind-Bold.ttf');
    _theme = pw.ThemeData.withFont(base: pw.Font.ttf(regular), bold: pw.Font.ttf(bold));
  } catch (_) {
    _theme = null;
  }
  return _theme;
}

/// Builds an A4 invoice PDF from a saved salesOrders document — the stored
/// numbers, never recomputed ones, so a reprint always matches the ledger.
/// Handles both shapes: B2B (itemDescription/rate/grossAmount) and POS
/// (productName/mrp/amount).
Future<Uint8List> buildInvoicePdf(
    Map<String, dynamic> o, InvoiceBranding b) async {
  final theme = await _loadTheme();
  String rs(num v) => '${theme != null ? '₹' : 'Rs. '}${_inr.format(v)}';
  final isB2b = str(o['invoiceType']) == 'B2B_GST';
  final items = (o['lineItems'] is List ? o['lineItems'] as List : const [])
      .whereType<Map>()
      .map((m) => m.cast<String, dynamic>())
      .toList();

  final rows = <List<String>>[];
  var taxable = 0.0, tax = 0.0, gross = 0.0;
  for (var i = 0; i < items.length; i++) {
    final li = items[i];
    final qty = dbl(li['quantity']);
    final rate = isB2b ? dbl(li['rate']) : dbl(li['mrp']);
    final amt = isB2b ? dbl(li['grossAmount']) : dbl(li['amount']);
    // POS stores 0 for "not configured" and displays 5 (invLineGst).
    final g = isB2b ? dbl(li['gstPct']) : (li['gstPct'] is num && dbl(li['gstPct']) > 0 ? dbl(li['gstPct']) : 5.0);
    final t = amt / (1 + g / 100);
    taxable += t;
    tax += amt - t;
    gross += amt;
    rows.add([
      '${i + 1}',
      str(isB2b ? li['itemDescription'] : li['productName']),
      str(li['batchNo']),
      str(li['expDate']),
      '${_q(qty)} ${str(isB2b ? li['per'] : li['unit'])}'.trim(),
      _inr.format(rate),
      '${_q(g)}%',
      _inr.format(amt),
    ]);
  }

  // Prefer the stored tax split (B2B saves it); POS is derived the same way
  // the web preview derives it.
  if (isB2b) {
    taxable = dbl(o['taxableValue']);
    tax = dbl(o['totalTax']);
  }
  final net = dbl(o['grandTotal'] ?? o['netAmount']);
  final prev = dbl(o['previousBalance']);
  final paid = dbl(o['amountPaid']);
  final buyerName = str(o['retailerName']).isEmpty ? 'Walk-in Customer' : str(o['retailerName']);
  final buyerAddr = isB2b
      ? str(o['buyerAddress'])
      : [str(o['address']), str(o['taluka']), str(o['district']), str(o['pin'])]
          .where((s) => s.trim().isNotEmpty)
          .join(', ');
  final buyerPhone = str(isB2b ? o['buyerContact'] : o['phoneNumber']);
  final mode = str(isB2b ? o['modeOfPayment'] : o['paymentMethod']);

  final small = const pw.TextStyle(fontSize: 8.5);
  final bold = pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold);

  pw.Widget kv(String k, String v, {bool strong = false}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 1.5),
        child: pw.Row(children: [
          pw.Expanded(child: pw.Text(k, style: strong ? bold : small)),
          pw.Text(v, style: strong ? bold : small),
        ]),
      );

  final doc = pw.Document(title: str(o['orderNumber']), author: b.businessName, theme: theme);
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(28),
    build: (_) => [
      pw.Center(
        child: pw.Column(children: [
          pw.Text(b.businessName.toUpperCase(),
              style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
          if (b.address.isNotEmpty) pw.Text(b.address, style: small, textAlign: pw.TextAlign.center),
          pw.Text(
              [
                if (b.gstin.isNotEmpty) 'GSTIN: ${b.gstin}',
                if (b.contact.isNotEmpty) 'Contact: ${b.contact}',
                if (b.email.isNotEmpty) b.email,
              ].join('   '),
              style: small),
          if (b.licenses.isNotEmpty) pw.Text(b.licenses.join('   '), style: small),
          pw.SizedBox(height: 6),
          pw.Text('TAX INVOICE', style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
        ]),
      ),
      pw.SizedBox(height: 10),
      pw.Container(
        padding: const pw.EdgeInsets.all(8),
        decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.6)),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text('BILL TO', style: bold),
              pw.Text(buyerName, style: bold),
              if (buyerAddr.isNotEmpty) pw.Text(buyerAddr, style: small),
              if (buyerPhone.isNotEmpty) pw.Text('Ph: $buyerPhone', style: small),
              if (str(o['buyerGstin']).isNotEmpty) pw.Text('GSTIN: ${str(o['buyerGstin'])}', style: small),
            ]),
          ),
          pw.SizedBox(width: 12),
          pw.SizedBox(
            width: 190,
            child: pw.Column(children: [
              kv('Invoice No.', str(o['orderNumber']), strong: true),
              kv('Date', str(o['invoiceDate'])),
              if (mode.isNotEmpty) kv('Payment', mode),
              if (str(o['salesmanName']).isNotEmpty) kv('Salesperson', str(o['salesmanName'])),
              if (str(o['transporterName']).isNotEmpty) kv('Transport', str(o['transporterName'])),
              if (str(o['termsOfDelivery']).isNotEmpty) kv('Terms', str(o['termsOfDelivery'])),
            ]),
          ),
        ]),
      ),
      pw.SizedBox(height: 8),
      pw.TableHelper.fromTextArray(
        headers: ['#', 'Item', 'Batch', 'Exp', 'Qty', 'Rate', 'GST', 'Amount'],
        data: rows,
        headerStyle: bold,
        cellStyle: small,
        headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
        border: pw.TableBorder.all(width: 0.5),
        columnWidths: {
          0: const pw.FixedColumnWidth(18),
          1: const pw.FlexColumnWidth(4),
          2: const pw.FlexColumnWidth(1.4),
          3: const pw.FlexColumnWidth(1.2),
          4: const pw.FlexColumnWidth(1.3),
          5: const pw.FlexColumnWidth(1.4),
          6: const pw.FixedColumnWidth(30),
          7: const pw.FlexColumnWidth(1.6),
        },
        cellAlignments: {
          4: pw.Alignment.centerRight,
          5: pw.Alignment.centerRight,
          6: pw.Alignment.centerRight,
          7: pw.Alignment.centerRight,
        },
      ),
      pw.SizedBox(height: 8),
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('Amount in words', style: bold),
            pw.Text('Rupees ${amountInWords(net)}', style: small),
            if (str(o['notes']).isNotEmpty) ...[
              pw.SizedBox(height: 6),
              pw.Text('Note: ${str(o['notes'])}', style: small),
            ],
            if (b.bankDetails.isNotEmpty) ...[
              pw.SizedBox(height: 6),
              pw.Text('Bank details', style: bold),
              pw.Text(b.bankDetails, style: small),
            ],
            if (b.upiId.isNotEmpty) pw.Text('UPI: ${b.upiId}', style: small),
          ]),
        ),
        pw.SizedBox(width: 12),
        pw.SizedBox(
          width: 210,
          child: pw.Column(children: [
            kv('Taxable value', rs(taxable)),
            kv('CGST', rs(tax / 2)),
            kv('SGST', rs(tax / 2)),
            if (!isB2b) kv('Bill total', rs(gross)),
            if (dbl(o['transportCharges']) > 0) kv('Transport', rs(dbl(o['transportCharges']))),
            if (dbl(o['laborCharges']) > 0) kv('Labour', rs(dbl(o['laborCharges']))),
            if (dbl(isB2b ? o['discountAmount'] : o['discount']) > 0)
              kv('Discount', '− ${rs(dbl(isB2b ? o['discountAmount'] : o['discount']))}'),
            if (isB2b && dbl(o['roundOff']) != 0) kv('Round off', rs(dbl(o['roundOff']))),
            pw.Divider(thickness: 0.6),
            kv('NET AMOUNT', rs(net), strong: true),
            if (prev > 0) kv('Previous balance', rs(prev)),
            if (prev > 0) kv('Total payable', rs(net + prev), strong: true),
            if (!isB2b && paid < net) kv('Paid now', rs(paid)),
          ]),
        ),
      ]),
      pw.SizedBox(height: 26),
      pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
        pw.Expanded(
          child: b.terms.isNotEmpty
              ? pw.Text('Terms: ${b.terms}', style: const pw.TextStyle(fontSize: 7.5))
              : pw.SizedBox(),
        ),
        pw.Column(children: [
          pw.Text('For ${b.businessName}', style: bold),
          pw.SizedBox(height: 24),
          pw.Text(b.signatureName.isNotEmpty ? b.signatureName : 'Authorised Signatory', style: small),
        ]),
      ]),
    ],
  ));
  return doc.save();
}

String _q(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
