export type HelpRole = 'accountant' | 'sales' | 'admin' | 'all';
export type HelpSection = 'getting-started' | 'accountant' | 'sales' | 'admin' | 'faq' | 'release-notes';

export interface HelpArticle {
  id: string;
  title: string;
  module: string;
  keywords: string[];
  roles: HelpRole[];
  section: HelpSection;
  summary: string;
  purpose: string;
  whenToUse: string;
  steps: string[];
  commonMistakes: string[];
  relatedModules: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Getting Started ──────────────────────────────────────────────────────────
  {
    id: 'gs-welcome',
    title: 'Welcome to KaranArjun ERP',
    module: 'General',
    keywords: ['welcome', 'overview', 'introduction', 'start', 'karanarjun'],
    roles: ['all'],
    section: 'getting-started',
    summary: 'An overview of KaranArjun ERP and what it can do for your business.',
    purpose: 'Understand what KaranArjun ERP is and how it helps agri-input retailers manage billing, inventory, payments, and analytics in one place.',
    whenToUse: 'Read this first when you log in for the first time or want a quick reminder of what the platform offers.',
    steps: [
      'Log in using your registered mobile number or email.',
      'Complete the onboarding wizard to enter your business details.',
      'Explore the top navigation bar for quick access to key modules.',
      'Use the hamburger menu on the top-right to find all available modules.',
    ],
    commonMistakes: [
      'Skipping the onboarding step — the system cannot create invoices without business details.',
    ],
    relatedModules: ['POS Billing', 'B2B GST Invoice', 'Dashboard'],
  },
  {
    id: 'gs-account-setup',
    title: 'Setting Up Your Account',
    module: 'General',
    keywords: ['setup', 'account', 'profile', 'business', 'gstin', 'onboarding'],
    roles: ['all'],
    section: 'getting-started',
    summary: 'Configure your business profile, GSTIN, and branding before raising your first invoice.',
    purpose: 'Ensure your business information is complete so invoices, reports, and GST filings are accurate.',
    whenToUse: 'Complete this before creating any invoices or adding products.',
    steps: [
      'Go to Settings from the hamburger menu.',
      'Enter your business name, address, and GSTIN.',
      'Upload your logo under Invoice Branding.',
      'Save changes and verify the invoice preview looks correct.',
    ],
    commonMistakes: [
      'Entering an incorrect GSTIN — use the built-in GSTIN validator.',
      'Forgetting to save after updating settings.',
    ],
    relatedModules: ['Settings', 'Invoice Branding', 'B2B GST Invoice'],
  },
  {
    id: 'gs-navigation',
    title: 'Navigating the ERP',
    module: 'General',
    keywords: ['navigation', 'menu', 'sidebar', 'navbar', 'shortcuts'],
    roles: ['all'],
    section: 'getting-started',
    summary: 'Learn how to use the horizontal navigation bar and the full menu drawer.',
    purpose: 'Navigate quickly between modules without losing your place.',
    whenToUse: 'Whenever you want to switch between modules or find a feature.',
    steps: [
      'Use the horizontal bar below the header for the most-used modules.',
      'Click the menu icon (top-right) to open the full navigation drawer.',
      'The Administration section in the drawer is visible only to Admins.',
      'Use the search bar on the Help Center page to find features by name.',
    ],
    commonMistakes: [
      'Looking for a module in the top bar that is only in the full menu.',
    ],
    relatedModules: ['Dashboard', 'Settings'],
  },

  // ── Accountant Guide ─────────────────────────────────────────────────────────
  {
    id: 'acc-pos',
    title: 'POS Billing',
    module: 'POS',
    keywords: ['pos', 'billing', 'bill', 'retail', 'b2c', 'cash', 'receipt', 'barcode'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Create fast retail bills at the counter using the POS module.',
    purpose: 'Generate itemised B2C bills with automatic GST calculation, print receipts, and track daily sales.',
    whenToUse: 'Use POS for walk-in customers who pay on the spot. For credit sales or GST-registered buyers, use B2B GST Invoice.',
    steps: [
      'Open POS Billing from the navigation bar.',
      'Scan a barcode or type a product name in the search box.',
      'Adjust quantities as needed.',
      'Select the payment method (Cash / UPI / Card).',
      'Click "Generate Bill" to save and print the receipt.',
    ],
    commonMistakes: [
      'Using POS for GST-registered customers — use B2B GST Invoice instead.',
      'Not verifying stock levels before billing if inventory tracking is enabled.',
    ],
    relatedModules: ['B2B GST Invoice', 'Inventory', 'Reports'],
  },
  {
    id: 'acc-supplier-ledger',
    title: 'Supplier Ledger',
    module: 'Supplier Ledger',
    keywords: ['supplier', 'vendor', 'ledger', 'purchase', 'payable', 'payment'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Track amounts owed to suppliers and record payments against purchases.',
    purpose: 'Maintain an accurate record of supplier balances, purchase invoices, and payment history.',
    whenToUse: 'Use whenever you receive goods from a supplier and need to record the transaction or make a payment.',
    steps: [
      'Go to Supplier Ledger from the navigation bar.',
      'Select an existing supplier or add a new one.',
      'Record a purchase invoice by entering amount, date, and reference number.',
      'When paying a supplier, click "Record Payment" and enter the amount.',
      'View the ledger statement to verify outstanding balances.',
    ],
    commonMistakes: [
      'Recording the same invoice twice — check for duplicate reference numbers.',
      'Not linking a payment to a specific invoice, which skews the outstanding balance.',
    ],
    relatedModules: ['Expenses', 'Reports', 'Digital Khata'],
  },
  {
    id: 'acc-inventory',
    title: 'Inventory Management',
    module: 'Inventory',
    keywords: ['inventory', 'stock', 'products', 'batches', 'warehouse', 'godown', 'rate sheet'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Manage your product catalogue, stock levels, and warehouse locations.',
    purpose: 'Keep your product list, pricing, and stock quantities accurate so billing and reports reflect real data.',
    whenToUse: 'Use Inventory when adding new products, updating prices, or adjusting stock after a purchase or physical count.',
    steps: [
      'Open Inventory from the navigation bar.',
      'Click "Add Product" to create a new item with name, unit, HSN code, and price.',
      'Use Inventory Batches to track batch-wise stock and expiry dates.',
      'Use Warehouses / Godowns to organise stock by physical location.',
      'Generate barcode labels from the Barcode Labels page.',
    ],
    commonMistakes: [
      'Leaving the HSN code blank — required for GST compliance.',
      'Forgetting to update the rate sheet after a price change.',
    ],
    relatedModules: ['POS Billing', 'B2B GST Invoice', 'Barcode Labels', 'Reports'],
  },
  {
    id: 'acc-reports',
    title: 'Reports & Analytics',
    module: 'Reports',
    keywords: ['reports', 'analytics', 'gst', 'sales report', 'financial', 'revenue', 'dashboard'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Generate GST reports, financial summaries, and sales analytics.',
    purpose: 'Get accurate data for GST filing, financial audits, and business decision-making.',
    whenToUse: 'Use at the end of the month for GST filing, or any time you need a sales or financial summary.',
    steps: [
      'Open Reports from the navigation bar.',
      'Choose the report type: GST Reports, Financial Reports, or Sales Analytics.',
      'Select the date range.',
      'Export to PDF or Excel for sharing with your CA.',
    ],
    commonMistakes: [
      'Not selecting the correct date range — GST reports should match the billing period.',
      'Exporting before all invoices for the period are finalised.',
    ],
    relatedModules: ['GST Reports', 'Financial Reports', 'Dashboard'],
  },
  {
    id: 'acc-expenses',
    title: 'Expenses',
    module: 'Expenses',
    keywords: ['expenses', 'cost', 'spend', 'petty cash', 'overhead', 'operational'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Record and categorise business expenses for accurate profit & loss tracking.',
    purpose: 'Capture all business costs so your financial reports show true profitability.',
    whenToUse: 'Whenever you incur a business expense — rent, utilities, salaries, transport, etc.',
    steps: [
      'Go to Expenses from the navigation bar.',
      'Click "Add Expense".',
      'Enter the amount, category, date, and description.',
      'Attach a receipt image (optional).',
      'Save to add it to the expense log.',
    ],
    commonMistakes: [
      'Mixing personal and business expenses — only record business-related costs.',
      'Not categorising expenses, which makes reports less useful.',
    ],
    relatedModules: ['Reports', 'Financial Reports', 'Supplier Ledger'],
  },
  {
    id: 'acc-khata',
    title: 'Digital Khata (Udhari)',
    module: 'Digital Khata',
    keywords: ['khata', 'udhari', 'credit', 'ledger', 'customer credit', 'receivable'],
    roles: ['accountant', 'admin'],
    section: 'accountant',
    summary: 'Manage customer credit accounts and track outstanding balances.',
    purpose: 'Replace the physical khata book with a digital ledger that sends automatic payment reminders.',
    whenToUse: 'Use for customers who buy on credit and pay later. Record every sale and payment to keep the balance accurate.',
    steps: [
      'Go to Digital Khata (Udhari) from the navigation bar.',
      'Add a customer or select an existing one.',
      'Record a credit transaction (sale on credit) by entering amount and date.',
      'When the customer pays, record the payment against their account.',
      'Send a payment reminder via WhatsApp directly from the ledger.',
    ],
    commonMistakes: [
      'Forgetting to record a payment — the outstanding balance will be wrong.',
      'Creating duplicate customer entries — search before adding a new customer.',
    ],
    relatedModules: ['Payment Reminders', 'Reports', 'Digital Receipt'],
  },

  // ── Sales Executive Guide ─────────────────────────────────────────────────────
  {
    id: 'sales-worklist',
    title: 'Using the Worklist',
    module: 'Worklist',
    keywords: ['worklist', 'orders', 'sales order', 'quotation', 'delivery challan', 'invoice'],
    roles: ['sales', 'admin'],
    section: 'sales',
    summary: 'Manage the full sales cycle from quotation to invoice in one place.',
    purpose: 'Track every customer order from quotation through delivery and invoicing without losing context.',
    whenToUse: 'Use the Worklist for any B2B sale that goes through the full quotation → order → delivery → invoice cycle.',
    steps: [
      'Go to Worklist from the navigation bar.',
      'Click "New" to create a quotation for the customer.',
      'Once the customer approves, convert the quotation to a Sales Order.',
      'When goods are dispatched, generate a Delivery Challan from the Sales Order.',
      'After delivery, convert to a GST Invoice and send it to the customer.',
    ],
    commonMistakes: [
      'Creating an invoice directly without a Sales Order — this skips the delivery tracking step.',
      'Not attaching the correct products or quantities — always double-check before converting.',
    ],
    relatedModules: ['B2B GST Invoice', 'Delivery Challans', 'Quotations', 'Dispatch Board'],
  },
  {
    id: 'sales-b2b-invoice',
    title: 'Creating a B2B GST Invoice',
    module: 'B2B Invoice',
    keywords: ['b2b', 'gst', 'invoice', 'tax', 'gstin', 'commercial invoice'],
    roles: ['sales', 'admin'],
    section: 'sales',
    summary: 'Raise a GST-compliant invoice for registered business customers.',
    purpose: 'Generate a legally valid GST invoice that can be used for the customer\'s ITC (Input Tax Credit) claim.',
    whenToUse: 'Use B2B GST Invoice when selling to a GST-registered business. For retail / walk-in customers, use POS Billing.',
    steps: [
      'Go to B2B GST Invoice from the navigation bar.',
      'Select the customer (must have a valid GSTIN).',
      'Add line items — the system automatically calculates CGST/SGST or IGST based on the supply type.',
      'Verify the totals and click "Save & Generate".',
      'Share the invoice via WhatsApp or download the PDF.',
    ],
    commonMistakes: [
      'Entering an incorrect GSTIN for the customer — the system validates it, but double-check.',
      'Mixing intra-state and inter-state tax rates — the system handles this, but verify the billing state.',
    ],
    relatedModules: ['Worklist', 'Quotations', 'Delivery Challans', 'Payment Reminders'],
  },
  {
    id: 'sales-payment',
    title: 'Payment Collection',
    module: 'Payment Links',
    keywords: ['payment', 'collect', 'razorpay', 'upi', 'payment link', 'reminder'],
    roles: ['sales', 'admin'],
    section: 'sales',
    summary: 'Send payment links to customers and track payment status.',
    purpose: 'Collect payments digitally without needing the customer to visit the shop, and automatically reconcile outstanding invoices.',
    whenToUse: 'Use when a customer\'s invoice is pending and you want to send a digital payment request.',
    steps: [
      'Go to Payment Links from the menu.',
      'Click "Create Payment Link" and enter the customer name and amount.',
      'Copy the link and share it via WhatsApp or SMS.',
      'The system marks the invoice as paid once the customer completes the payment.',
      'Check Payment Reminders for overdue invoices and send follow-ups.',
    ],
    commonMistakes: [
      'Creating a payment link for the wrong amount — verify against the invoice before sending.',
      'Not following up — use Payment Reminders to schedule automated follow-ups.',
    ],
    relatedModules: ['Payment Reminders', 'B2B GST Invoice', 'Digital Khata'],
  },
  {
    id: 'sales-tracking',
    title: 'Tracking Information',
    module: 'Dispatch Board',
    keywords: ['tracking', 'dispatch', 'delivery', 'transport', 'logistics', 'challan'],
    roles: ['sales', 'admin'],
    section: 'sales',
    summary: 'Track dispatch status and delivery of customer orders.',
    purpose: 'Know exactly where each order is in the dispatch process so you can update customers proactively.',
    whenToUse: 'Use after a Sales Order is confirmed and goods are being packed or dispatched.',
    steps: [
      'Open the Dispatch Board from the menu.',
      'Find the order you want to track.',
      'View the delivery challan linked to the order.',
      'Update the dispatch status as goods are shipped.',
      'Share the challan with the transporter as a reference document.',
    ],
    commonMistakes: [
      'Marking an order as dispatched before the challan is generated.',
    ],
    relatedModules: ['Worklist', 'Delivery Challans', 'Manage Transport'],
  },
  {
    id: 'sales-targets',
    title: 'Sales Target Monitoring',
    module: 'Sales Targets',
    keywords: ['target', 'sales target', 'performance', 'goal', 'quota', 'achievement'],
    roles: ['sales', 'admin'],
    section: 'sales',
    summary: 'View your assigned sales targets and track progress.',
    purpose: 'Stay on top of your individual sales goals and see how much of the target you have achieved this month.',
    whenToUse: 'Check this at the beginning of each day or week to plan which customers to visit or follow up with.',
    steps: [
      'Go to Sales Targets from the navigation bar.',
      'View your current month\'s target and achieved amount.',
      'Drill down to see which products or regions contribute most.',
      'Contact your Admin if your targets seem incorrect.',
    ],
    commonMistakes: [
      'Ignoring the target page — regular check-ins help you course-correct early.',
    ],
    relatedModules: ['Worklist', 'B2B GST Invoice', 'Team Performance'],
  },

  // ── Administrator Guide ───────────────────────────────────────────────────────
  {
    id: 'admin-users',
    title: 'Managing Users',
    module: 'Admin',
    keywords: ['users', 'staff', 'employees', 'access', 'login', 'invite', 'team'],
    roles: ['admin'],
    section: 'admin',
    summary: 'Add, edit, and remove user accounts for your business.',
    purpose: 'Control who has access to the ERP and ensure each employee only sees what they need.',
    whenToUse: 'Use when onboarding a new employee, changing someone\'s role, or removing access for an ex-employee.',
    steps: [
      'Go to Admin → Manage Users from the menu.',
      'Click "Add User" and enter the employee\'s name, mobile number, and role.',
      'The employee receives a login link on their registered mobile number.',
      'To edit a user\'s role, click their name and update the role field.',
      'To remove access, set the user status to Inactive or delete the account.',
    ],
    commonMistakes: [
      'Giving Admin access to too many users — use the Analyst role for read-only access.',
      'Forgetting to deactivate accounts when staff leave.',
    ],
    relatedModules: ['Role Matrix', 'Team Performance', 'Data Security'],
  },
  {
    id: 'admin-team-performance',
    title: 'Team Performance',
    module: 'Team Performance',
    keywords: ['team', 'performance', 'sales', 'leaderboard', 'kpi', 'metrics', 'staff'],
    roles: ['admin'],
    section: 'admin',
    summary: 'View sales and activity metrics for each team member.',
    purpose: 'Identify top performers, spot underperformers early, and make data-driven staffing decisions.',
    whenToUse: 'Review weekly or monthly as part of team meetings or performance reviews.',
    steps: [
      'Go to Admin → Team Performance.',
      'Select the date range you want to analyse.',
      'View invoice counts, revenue, and conversion rates per user.',
      'Export the data to share with management.',
    ],
    commonMistakes: [
      'Comparing sales staff on raw revenue when territories differ — use percentage achievement instead.',
    ],
    relatedModules: ['Sales Targets', 'Reports', 'Manage Users'],
  },
  {
    id: 'admin-role-matrix',
    title: 'Role Matrix',
    module: 'Role Matrix',
    keywords: ['role', 'permissions', 'access control', 'matrix', 'restrict', 'admin', 'analyst'],
    roles: ['admin'],
    section: 'admin',
    summary: 'Configure what each role (Admin, Analyst, Sales, Retailer) can see and do.',
    purpose: 'Protect sensitive data and reduce errors by limiting each role to only the modules they need.',
    whenToUse: 'Use when setting up the system initially or when adding a new module to control who can access it.',
    steps: [
      'Go to Admin → Role Matrix.',
      'Select the role you want to configure (e.g., Analyst).',
      'Toggle each module permission on or off.',
      'Save the configuration — changes take effect on the user\'s next login.',
    ],
    commonMistakes: [
      'Removing a permission that a role actively uses without informing the affected users.',
      'Leaving all permissions on for the Analyst role — Analysts should typically not access financial settings.',
    ],
    relatedModules: ['Manage Users', 'Data Security'],
  },
  {
    id: 'admin-inventory-mgmt',
    title: 'Inventory Management (Admin)',
    module: 'Inventory',
    keywords: ['inventory', 'products', 'stock', 'rate sheet', 'pricing', 'batches', 'godown'],
    roles: ['admin'],
    section: 'admin',
    summary: 'Set up and maintain the product catalogue, pricing, and warehouse structure.',
    purpose: 'Ensure the product master is accurate so all billing, inventory, and reporting is consistent.',
    whenToUse: 'Use when launching new products, adjusting prices for a season, or restructuring warehouse locations.',
    steps: [
      'Go to Inventory to manage the product catalogue and rate sheet.',
      'Use Inventory Batches to track batch numbers, expiry, and purchase price.',
      'Use Warehouses / Godowns to organise stock locations.',
      'Run the Barcode Labels page to print labels for new stock.',
      'Review the rate sheet periodically to ensure prices are current.',
    ],
    commonMistakes: [
      'Deleting a product that is referenced in existing invoices — deactivate instead of deleting.',
      'Not updating the rate sheet after a supplier price increase.',
    ],
    relatedModules: ['POS Billing', 'B2B GST Invoice', 'Reports', 'Barcode Labels'],
  },
  {
    id: 'admin-reports',
    title: 'Reports (Admin)',
    module: 'Reports',
    keywords: ['reports', 'gst reports', 'financial', 'analytics', 'export', 'filing', 'ca'],
    roles: ['admin'],
    section: 'admin',
    summary: 'Access all business reports including GST, financial, and master analytics.',
    purpose: 'Have full visibility into business performance, GST compliance, and financial health.',
    whenToUse: 'Use at month-end for GST filing, at quarter-end for financial reviews, and anytime for business decisions.',
    steps: [
      'Go to Master Analytics for a top-level view.',
      'Go to Reports → GST Reports for GSTR-ready summaries.',
      'Go to Reports → Financial Reports for P&L and balance data.',
      'Export any report to Excel or PDF to share with your CA.',
    ],
    commonMistakes: [
      'Sharing raw database exports instead of the formatted report — use the built-in export buttons.',
    ],
    relatedModules: ['GST Reports', 'Financial Reports', 'Analytics', 'Dashboard'],
  },
  {
    id: 'admin-settings',
    title: 'Settings',
    module: 'Settings',
    keywords: ['settings', 'branding', 'invoice', 'business profile', 'gstin', 'logo', 'template'],
    roles: ['admin'],
    section: 'admin',
    summary: 'Configure business profile, invoice branding, and system preferences.',
    purpose: 'Ensure all invoices, receipts, and reports carry your business identity and correct tax details.',
    whenToUse: 'Review settings when you change your business address, GSTIN, logo, or bank account details.',
    steps: [
      'Go to Settings from the menu.',
      'Update your business name, address, GSTIN, and contact details.',
      'Go to Invoice Branding to upload your logo and configure the invoice footer.',
      'Go to Invoice Templates to choose or customise a print template.',
      'Save all sections before exiting.',
    ],
    commonMistakes: [
      'Not saving each section separately — Settings has multiple tabs, each saved independently.',
      'Using an incorrect state code in the address — this affects IGST vs CGST/SGST calculation.',
    ],
    relatedModules: ['Invoice Templates', 'Invoice Branding', 'B2B GST Invoice'],
  },

  // ── FAQs ──────────────────────────────────────────────────────────────────────
  {
    id: 'faq-gst-types',
    title: 'When should I use CGST/SGST vs IGST?',
    module: 'GST',
    keywords: ['gst', 'cgst', 'sgst', 'igst', 'interstate', 'intrastate', 'tax'],
    roles: ['all'],
    section: 'faq',
    summary: 'Understand which GST type applies to each sale.',
    purpose: 'Apply the correct GST type to avoid compliance errors.',
    whenToUse: 'When creating any GST invoice.',
    steps: [
      'If the buyer is in the SAME state as your business → apply CGST + SGST.',
      'If the buyer is in a DIFFERENT state → apply IGST.',
      'KaranArjun ERP detects this automatically from the billing state field on the invoice.',
      'Always verify the customer\'s state when billing for the first time.',
    ],
    commonMistakes: [
      'Leaving the customer state blank — the system defaults to intra-state, which may be wrong.',
    ],
    relatedModules: ['B2B GST Invoice', 'GST Reports'],
  },
  {
    id: 'faq-invoice-sharing',
    title: 'How do I share an invoice with a customer?',
    module: 'General',
    keywords: ['share', 'whatsapp', 'pdf', 'invoice', 'send', 'email', 'download'],
    roles: ['all'],
    section: 'faq',
    summary: 'Options for delivering invoices to customers.',
    purpose: 'Ensure customers receive their invoices promptly in their preferred format.',
    whenToUse: 'After generating any invoice.',
    steps: [
      'Open the invoice from the Worklist or invoice history.',
      'Click "Share on WhatsApp" to send a PDF link directly to the customer.',
      'Click "Download PDF" to save a copy for email or printing.',
      'Use "Digital Receipt" to send a lightweight mobile-friendly receipt link.',
    ],
    commonMistakes: [
      'Sharing the PDF before the invoice is saved — always generate first, then share.',
    ],
    relatedModules: ['B2B GST Invoice', 'POS Billing', 'Digital Receipt'],
  },
  {
    id: 'faq-cancel-invoice',
    title: 'Can I cancel or edit an invoice after it is generated?',
    module: 'General',
    keywords: ['cancel', 'edit', 'delete', 'invoice', 'correction', 'mistake'],
    roles: ['all'],
    section: 'faq',
    summary: 'Understand the options for correcting a generated invoice.',
    purpose: 'Handle billing errors without violating GST compliance rules.',
    whenToUse: 'When a customer disputes an invoice or you notice an error after generation.',
    steps: [
      'Minor errors (e.g. contact info) can be corrected by editing the invoice directly.',
      'For amount errors, issue a Credit Note referencing the original invoice number.',
      'Only Admins can delete draft invoices — finalised invoices should be cancelled via Credit Note.',
      'Contact your CA before cancelling a GST invoice that has already been filed.',
    ],
    commonMistakes: [
      'Deleting a GST invoice instead of issuing a Credit Note — this breaks your GST audit trail.',
    ],
    relatedModules: ['B2B GST Invoice', 'GST Reports'],
  },
  {
    id: 'faq-user-permissions',
    title: 'Why can\'t I see a module?',
    module: 'General',
    keywords: ['permission', 'access', 'role', 'module', 'missing', 'locked', 'hidden'],
    roles: ['all'],
    section: 'faq',
    summary: 'Understand why a module may not appear in your navigation.',
    purpose: 'Resolve access issues without needing IT support.',
    whenToUse: 'When you cannot find a feature that should be available to you.',
    steps: [
      'Check your user role (shown in the profile section of Settings).',
      'Some modules require Admin or Analyst role — Sales users have restricted access by design.',
      'Ask your Administrator to grant permission via the Role Matrix.',
      'If you believe your role is correct but the module is still missing, contact KaranArjun ERP support.',
    ],
    commonMistakes: [
      'Assuming a module has been removed when it is just permission-restricted.',
    ],
    relatedModules: ['Role Matrix', 'Manage Users', 'Settings'],
  },
];

export const SECTIONS: { id: HelpSection; label: string; description: string }[] = [
  { id: 'getting-started', label: 'Getting Started', description: 'New to KaranArjun ERP? Start here.' },
  { id: 'accountant',      label: 'Accountant Guide', description: 'Billing, ledgers, inventory, and reports.' },
  { id: 'sales',           label: 'Sales Executive Guide', description: 'Orders, invoicing, and customer payments.' },
  { id: 'admin',           label: 'Administrator Guide', description: 'Users, roles, settings, and configuration.' },
  { id: 'faq',             label: 'FAQs', description: 'Answers to the most common questions.' },
  { id: 'release-notes',   label: 'Release Notes', description: 'What\'s new in each version.' },
];

export function searchArticles(query: string): HelpArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return HELP_ARTICLES.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.module.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.keywords.some(k => k.includes(q))
  );
}
