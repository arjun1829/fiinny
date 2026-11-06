import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/utils/kyc_rules.dart';

/// Same cases as the website's app/lib/kyc.ts tests.
void main() {
  test('GST number check character', () {
    expect(isValidGstin('27AAPFU0939F1ZV'), isTrue);
    expect(isValidGstin('29AAGCB7383J1Z4'), isTrue);
    expect(isValidGstin('27AAPFU0939F1ZW'), isFalse);
    expect(isValidGstin('27AAPFU0939F1Z'), isFalse);
  });

  test('PAN comes from the GST number', () {
    expect(panFromGstin(' 27aapfu0939f1zv '), 'AAPFU0939F');
    expect(panFromGstin('27AAPFU0939F1ZW'), isNull);
    expect(isValidPan('abcpk1234l'), isTrue);
    expect(isValidPan('ABCXK1234L'), isFalse);
  });

  test('what is missing', () {
    expect(kycMissing(), [KycItem.bank, KycItem.pan, KycItem.licence]);
    List<KycItem> m({
      String gstin = '27AAPFU0939F1ZV',
      String? pan,
      List<String> docs = const ['trade_license'],
      bool acct = true,
    }) => kycMissing(
      accountHolderName: 'Ram',
      hasAccountNumber: acct,
      ifsc: 'SBIN0001234',
      gstin: gstin,
      pan: pan,
      documents: docs,
    );
    expect(m(), isEmpty);
    expect(m(gstin: '', pan: 'ABCPK1234L'), isEmpty);
    expect(m(gstin: ''), [KycItem.pan]);
    expect(m(docs: ['pan_card']), [KycItem.licence]);
    expect(m(acct: false), [KycItem.bank]);
  });

  test('account holder name: letters only, at least two', () {
    expect(isValidHolderName('Ramesh Patil'), isTrue);
    expect(isValidHolderName('M/s Sai Agro'), isTrue);
    expect(isValidHolderName("D'Souza & Sons"), isTrue);
    expect(isValidHolderName('रमेश पाटील'), isTrue);
    expect(isValidHolderName('Ramesh 123'), isFalse);
    expect(isValidHolderName(' R '), isFalse);
    expect(isValidHolderName(''), isFalse);
  });
}
