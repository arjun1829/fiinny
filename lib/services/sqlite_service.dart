import 'package:sqflite/sqflite.dart'
    if (dart.library.html) '../stubs/sqflite_stub.dart';
import 'package:path/path.dart';
import '../models/transaction_item.dart';
import '../models/goal_model.dart';

class SQLiteService {
  static final SQLiteService _instance = SQLiteService._internal();
  factory SQLiteService() => _instance;
  static Database? _db;
  SQLiteService._internal();

  Future<Database> get db async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  Future<Database> _initDb() async {
    final path = join(await getDatabasesPath(), 'fiinny.db');
    return openDatabase(
      path,
      version: 2,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE transactions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL,
            type TEXT,
            category TEXT,
            date TEXT,
            note TEXT,
            source TEXT
          )
        ''');
        
        // Create Indexes for transactions
        await db.execute('CREATE INDEX idx_transactions_amount ON transactions(amount)');
        await db.execute('CREATE INDEX idx_transactions_type ON transactions(type)');
        await db.execute('CREATE INDEX idx_transactions_category ON transactions(category)');
        await db.execute('CREATE INDEX idx_transactions_date ON transactions(date)');
        await db.execute('CREATE INDEX idx_transactions_source ON transactions(source)');

        await db.execute('''
          CREATE TABLE goals(
            id TEXT PRIMARY KEY,
            title TEXT,
            targetAmount REAL,
            savedAmount REAL,
            targetDate TEXT,
            emoji TEXT
          )
        ''');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('CREATE INDEX idx_transactions_amount ON transactions(amount)');
          await db.execute('CREATE INDEX idx_transactions_type ON transactions(type)');
          await db.execute('CREATE INDEX idx_transactions_category ON transactions(category)');
          await db.execute('CREATE INDEX idx_transactions_date ON transactions(date)');
          await db.execute('CREATE INDEX idx_transactions_source ON transactions(source)');
        }
      },
    );
  }

  // ---- TRANSACTIONS ----
  Future<int> addTransaction(TransactionItem t) async {
    final dbClient = await db;
    return await dbClient.insert('transactions', t.toMap());
  }

  Future<List<TransactionItem>> getTransactions() async {
    final dbClient = await db;
    final List<Map<String, dynamic>> maps =
        await dbClient.query('transactions', orderBy: 'date DESC');
    return maps.map((e) => TransactionItem.fromMap(e)).toList();
  }

  Future<bool> transactionExists(TransactionItem t) async {
    final dbClient = await db;
    final maps = await dbClient.query(
      'transactions',
      where: 'amount = ? AND type = ? AND date = ?',
      whereArgs: [
        t.amount,
        t.type == TransactionType.credit ? 'credit' : 'debit',
        t.date.toIso8601String()
      ],
      limit: 1,
    );
    return maps.isNotEmpty;
  }
}
