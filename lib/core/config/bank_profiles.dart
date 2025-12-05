class BankProfile {
  final String code;
  final String display;
  final List<String> domains; // For Email
  final List<String> headerHints; // For SMS/Email headers
  final bool isMajor;

  const BankProfile({
    required this.code,
    required this.display,
    this.domains = const [],
    this.headerHints = const [],
    this.isMajor = true,
  });
}

// ── India Bank Profiles ──────────────────────────────────────────────────────
const List<BankProfile> indiaMajorBanks = [
  // Public Sector
  BankProfile(
    code: 'SBI',
    display: 'State Bank of India',
    domains: ['sbi.co.in'],
    headerHints: ['sbi', 'state bank of india', 'sbiinb'],
  ),
  BankProfile(
    code: 'PNB',
    display: 'Punjab National Bank',
    domains: ['pnb.co.in'],
    headerHints: ['pnb', 'punjab national bank'],
  ),
  BankProfile(
    code: 'BOB',
    display: 'Bank of Baroda',
    domains: ['bankofbaroda.co.in'],
    headerHints: ['bob', 'bank of baroda'],
  ),
  BankProfile(
    code: 'UNION',
    display: 'Union Bank of India',
    domains: ['unionbankofindia.co.in'],
    headerHints: ['union bank', 'union bank of india', 'unionb'],
  ),
  BankProfile(
    code: 'BOI',
    display: 'Bank of India',
    domains: ['bankofindia.co.in'],
    headerHints: ['bank of india'],
  ),
  BankProfile(
    code: 'CANARA',
    display: 'Canara Bank',
    domains: ['canarabank.com'],
    headerHints: ['canara bank'],
  ),
  BankProfile(
    code: 'INDIAN',
    display: 'Indian Bank',
    domains: ['indianbank.in'],
    headerHints: ['indian bank'],
  ),
  BankProfile(
    code: 'IOB',
    display: 'Indian Overseas Bank',
    domains: ['iob.in'],
    headerHints: ['indian overseas bank', 'iob'],
  ),
  BankProfile(
    code: 'UCO',
    display: 'UCO Bank',
    domains: ['ucobank.com'],
    headerHints: ['uco bank'],
  ),
  BankProfile(
    code: 'MAHARASHTRA',
    display: 'Bank of Maharashtra',
    domains: ['bankofmaharashtra.in', 'mahabank.co.in'],
    headerHints: ['bank of maharashtra'],
  ),
  BankProfile(
    code: 'CBI',
    display: 'Central Bank of India',
    domains: ['centralbankofindia.co.in'],
    headerHints: ['central bank of india'],
  ),
  BankProfile(
    code: 'PSB',
    display: 'Punjab & Sind Bank',
    domains: ['psbindia.com'],
    headerHints: ['punjab and sind bank', 'punjab & sind bank'],
  ),

  // Private Sector
  BankProfile(
    code: 'HDFC',
    display: 'HDFC Bank',
    domains: ['hdfcbank.com'],
    headerHints: ['hdfc', 'hdfcbk'],
  ),
  BankProfile(
    code: 'ICICI',
    display: 'ICICI Bank',
    domains: ['icicibank.com'],
    headerHints: ['icici'],
  ),
  BankProfile(
    code: 'AXIS',
    display: 'Axis Bank',
    domains: ['axisbank.com'],
    headerHints: ['axis', 'axisbk'],
  ),
  BankProfile(
    code: 'KOTAK',
    display: 'Kotak Mahindra Bank',
    domains: ['kotak.com'],
    headerHints: ['kotak'],
  ),
  BankProfile(
    code: 'INDUSIND',
    display: 'IndusInd Bank',
    domains: ['indusind.com'],
    headerHints: ['indusind'],
  ),
  BankProfile(
    code: 'YES',
    display: 'Yes Bank',
    domains: ['yesbank.in'],
    headerHints: ['yesbnk', 'yes bank'],
  ),
  BankProfile(
    code: 'FEDERAL',
    display: 'Federal Bank',
    domains: ['federalbank.co.in'],
    headerHints: ['federal bank', 'fedbnk'],
  ),
  BankProfile(
    code: 'IDFCFIRST',
    display: 'IDFC First Bank',
    domains: ['idfcfirstbank.com', 'idfcbank.com'],
    headerHints: ['idfc', 'idfcfb'],
  ),
  BankProfile(
    code: 'IDBI',
    display: 'IDBI Bank',
    domains: ['idbibank.com'],
    headerHints: ['idbi'],
  ),
];
