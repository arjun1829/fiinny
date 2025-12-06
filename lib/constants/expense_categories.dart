const List<String> kExpenseCategories = [
  'General',
  'Food',
  'Groceries',
  'Travel',
  'Shopping',
  'Bills',
  'Entertainment',
  'Health',
  'Fuel',
  'Subscriptions',
  'Education',
  'Recharge',
  'Loan EMI',
  'Fees/Charges',
  'Rent',
  'Utilities',
  'Other',
];

const List<String> kIncomeCategories = [
  'General',
  'Salary',
  'Freelance',
  'Gift',
  'Investment',
  'Other',
];


final Map<String, List<String>> kExpenseSubcategories = {
  'Fund Transfers': ['Fund Transfers - Others', 'Cash Withdrawals', 'Remittance'],
  'Payments': ['Loans/EMIs', 'Fuel', 'Mobile bill', 'Auto Service', 'Bills / Utility', 'Credit card', 'Logistics', 'Payment others', 'Rental and realestate', 'Wallet payment'],
  'Shopping': ['Groceries and consumables', 'Electronics', 'Apparel', 'Books and stationery', 'Ecommerce', 'Fitness', 'Gift', 'Home furnishing and gaming', 'Jewellery and accessories', 'Personal care', 'Shopping others'],
  'Travel': ['Car rental', 'Travel and tours', 'Travel others', 'Accommodation', 'Airlines', 'Cab/Bike services', 'Forex', 'Railways'],
  'Food': ['Restaurants', 'Alcohol', 'Food delivery', 'Food others'],
  'Entertainment': ['OTT services', 'Gaming', 'Movies', 'Music', 'Entertainment others'],
  'Others': ['Others', 'Business services', 'Bank charges', 'Cheque reject', 'Government services', 'Tax payments'],
  'Healthcare': ['Medicine/Pharma', 'Healthcare others', 'Hospital'],
  'Education': ['Education'],
  'Investments': ['Mutual Fund – SIP', 'Mutual Fund – Lumpsum', 'Stocks / Brokerage', 'Investments – Others'],
};
