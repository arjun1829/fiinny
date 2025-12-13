const List<String> kExpenseCategories = [
  'Food & Drink',
  'Shopping',
  'Housing',
  'Transportation',
  'Vehicle',
  'Entertainment',
  'Health & Personal',
  'Education',
  'Bills & Utilities',
  'Investments',
  'Taxes & Fees',
  'Travel',
  'General',
];

const List<String> kIncomeCategories = [
  'Salary',
  'Business',
  'Freelance',
  'Gift',
  'Investment',
  'Rental',
  'Refund',
  'Other',
];


final Map<String, List<String>> kExpenseSubcategories = {
  'Food & Drink': ['Groceries', 'Restaurants', 'Food Delivery', 'Bars & Pubs', 'Coffee Shops', 'Alcohol'],
  'Shopping': ['Clothes', 'Electronics', 'Furniture', 'Home Garden', 'Health & Beauty', 'Kids', 'Pets', 'Gifts', 'Stationery'],
  'Housing': ['Rent', 'Mortgage', 'Maintenance', 'Services', 'Insurance'],
  'Transportation': ['Public Transit', 'Taxi / Cab', 'Parking', 'Tolls', 'Flights', 'Trains', 'Bus'],
  'Vehicle': ['Fuel', 'Maintenance', 'Insurance', 'Loan EMI', 'Accessories', 'Car Wash'],
  'Entertainment': ['Movies', 'Games', 'Music', 'Streaming Services', 'Events', 'Sports', 'Hobbies'],
  'Health & Personal': ['Doctor', 'Pharmacy', 'Gym / Fitness', 'Sports', 'Salon / Barber', 'Wellness'],
  'Education': ['Tuition', 'Books', 'Courses', 'School Fees', 'Supplies'],
  'Bills & Utilities': ['Mobile', 'Internet', 'Electricity', 'Water', 'Gas', 'Television', 'Software'],
  'Investments': ['Stocks', 'Mutual Funds', 'Crypto', 'Gold', 'Real Estate', 'Provident Fund'],
  'Taxes & Fees': ['Income Tax', 'Property Tax', 'Bank Fees', 'Service Charges', 'Fines', 'Legal Fees'],
  'Travel': ['Hotels', 'Flights', 'Car Rental', 'Vacation', 'Sightseeing'],
  'General': ['General', 'Charity', 'Donations', 'Lost', 'Other'],
};
