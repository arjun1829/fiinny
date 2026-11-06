import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukan_erp/features/billing/invoice_pdf.dart';

/// Builds real PDFs from the exact salesOrders shapes the app writes (taken
/// from an emulator run). Set INVOICE_PDF_OUT to a folder to keep the files
/// for a visual check.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const branding = InvoiceBranding(
    businessName: 'KaranArjun Test Agro',
    address: 'Nandgaon, Nashik 423106',
    gstin: '27AAPFU0939F1ZV',
    licenses: ['Fert. Lic: FL-123', 'Pest. Lic: PL-456'],
    contact: '9876500000',
    bankDetails: 'SBI A/c 1234567890 IFSC SBIN0000001',
    upiId: 'ka@upi',
    terms: 'Goods once sold will not be taken back.',
  );

  final pos = <String, dynamic>{
    'orderNumber': 'KA-0042', 'retailerName': 'रमेश पाटील (Ramesh Patil)', 'phoneNumber': '9876543210',
    'address': 'Nandgaon', 'pin': '', 'taluka': '', 'district': '',
    'lineItems': [
      {'productId': 'p1', 'productName': 'Urea 45kg', 'batchNo': 'U-OLD', 'expDate': '2026-12',
        'quantity': 15, 'unit': 'bag', 'mrp': 266.5, 'amount': 3997.5, 'gstPct': 5},
      {'productId': 'p2', 'productName': 'Faster 100ML', 'batchNo': '', 'expDate': '',
        'quantity': 1, 'unit': 'btl', 'mrp': 120, 'amount': 120, 'gstPct': 18},
    ],
    'subtotal': 4117.5, 'transportCharges': 50, 'laborCharges': 0, 'discount': 0,
    'grandTotal': 4167.5, 'paymentMethod': 'Cash', 'amountPaid': 4167.5,
    'previousBalance': 500, 'invoiceDate': '2026-10-31',
  };

  final b2b = <String, dynamic>{
    'orderNumber': 'SIPL/26-27/010', 'invoiceType': 'B2B_GST', 'retailerName': 'Shree Agro Traders',
    'buyerAddress': 'Malegaon, Tal. Malegaon, Dist. Nashik', 'buyerGstin': '27ABCDE1234F1Z5',
    'buyerContact': '9822001122', 'modeOfPayment': '15 Days', 'salesmanName': 'Vishal Sales',
    'lineItems': [
      {'productId': 'p1', 'itemDescription': 'Urea 45kg', 'batchNo': 'U-NEW', 'expDate': '2027-06',
        'gstPct': 5, 'per': 'bag', 'quantity': 3, 'rate': 249.9, 'grossAmount': 749.7},
    ],
    'taxableValue': 714, 'cgst': 17.85, 'sgst': 17.85, 'totalTax': 35.7, 'discountAmount': 0,
    'roundOff': 0.3, 'netAmount': 750, 'grandTotal': 750, 'previousBalance': 3000, 'amountPaid': 0,
    'invoiceDate': '2026-10-31',
  };

  for (final (name, order) in [('pos', pos), ('b2b', b2b)]) {
    test('$name invoice renders a valid PDF', () async {
      final bytes = await buildInvoicePdf(order, branding);
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      expect(bytes.length, greaterThan(2000));
      final out = Platform.environment['INVOICE_PDF_OUT'];
      if (out != null) File('$out/invoice_$name.pdf').writeAsBytesSync(bytes);
    });
  }

  test('legacy bill with missing / odd fields still renders', () async {
    final bytes = await buildInvoicePdf({
      'orderNumber': 4040, 'retailerName': null, 'phoneNumber': 9876543210,
      'lineItems': [{'productName': 'X', 'quantity': '2', 'mrp': '10', 'amount': 20}],
      'grandTotal': '20',
    }, const InvoiceBranding(businessName: 'Shop'));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });
}
