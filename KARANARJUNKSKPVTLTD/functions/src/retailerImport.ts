import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

interface RetailerRow {
  name: string;
  number: string;
  location?: string;
  portfolioSize?: string;
  outstandingAmount?: string | number;
  email?: string;
  bookName?: string;
  billBookPageNo?: string;
  alternateNumber?: string;
}

export interface RowValidation {
  rowIndex: number;
  name: string;
  status: 'imported' | 'skipped' | 'duplicate';
  issues: string[];
  warnings: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  ordersCreated: number;
  rows: RowValidation[];
}

function cleanPhone(raw: string): {
  number: string | null;
  alternate: string | null;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!raw || !raw.trim()) {
    return { number: null, alternate: null, issues: ['Missing phone number'], warnings };
  }

  const parts = raw.trim().split(/[\s,;]+/).filter(Boolean);
  const validNumbers: string[] = [];

  for (const part of parts) {
    let stripped = part.replace(/[^\d]/g, '');

    if (stripped.length === 12 && stripped.startsWith('91')) {
      stripped = stripped.slice(2);
      warnings.push(`Stripped country code from "${part}"`);
    }
    if (stripped.length === 11 && stripped.startsWith('0')) {
      stripped = stripped.slice(1);
    }

    if (/^\d{10}$/.test(stripped)) {
      validNumbers.push(stripped);
    }
  }

  if (validNumbers.length === 0) {
    issues.push(`"${raw}" is not a valid 10-digit phone number`);
  } else if (validNumbers.length > 1) {
    warnings.push(`Multiple numbers found — using ${validNumbers[0]} as primary`);
  }

  return {
    number: validNumbers[0] ?? null,
    alternate: validNumbers[1] ?? null,
    issues,
    warnings,
  };
}

export const importRetailersCSV = functions
  .region('asia-south1')
  .https.onCall(async (data: any, context: any) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { tenantId, rows } = data as { tenantId: string; rows: RetailerRow[] };
    if (!tenantId) throw new functions.https.HttpsError('invalid-argument', 'Missing tenantId');
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No rows provided');
    }

    const db = admin.firestore();
    const BATCH_LIMIT = 496;

    const existingSnap = await db.collection(`tenants/${tenantId}/retailers`).get();
    const existingNames = new Set(
      existingSnap.docs.map(d => ((d.data().name as string) || '').toLowerCase().trim())
    );

    let batch = db.batch();
    let batchOps = 0;

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      duplicates: 0,
      ordersCreated: 0,
      rows: [],
    };

    const VALID_PORTFOLIO = new Set(['Big', 'Medium', 'Small']);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.name || '').trim();

      const rowResult: RowValidation = {
        rowIndex: i + 1,
        name: name || `Row ${i + 1}`,
        status: 'skipped',
        issues: [],
        warnings: [],
      };

      if (!name) {
        rowResult.issues.push('Missing retailer name');
        result.rows.push(rowResult);
        result.skipped++;
        continue;
      }

      // Detect test data: name contains "test" AND phone is not numeric
      if (
        name.toLowerCase().includes('test') &&
        (row.number || '').toLowerCase().replace(/\s/g, '').match(/[a-z]/)
      ) {
        rowResult.issues.push('Detected as test data — skipping');
        result.rows.push(rowResult);
        result.skipped++;
        continue;
      }

      const phoneResult = cleanPhone(row.number || '');
      rowResult.issues.push(...phoneResult.issues);
      rowResult.warnings.push(...phoneResult.warnings);

      if (phoneResult.issues.length > 0) {
        result.rows.push(rowResult);
        result.skipped++;
        continue;
      }

      const nameKey = name.toLowerCase();
      if (existingNames.has(nameKey)) {
        rowResult.status = 'duplicate';
        rowResult.warnings.push(`"${name}" already exists — skipping duplicate`);
        result.rows.push(rowResult);
        result.duplicates++;
        continue;
      }

      const portfolioSize = VALID_PORTFOLIO.has(row.portfolioSize || '')
        ? row.portfolioSize!
        : 'Small';
      if (row.portfolioSize && !VALID_PORTFOLIO.has(row.portfolioSize)) {
        rowResult.warnings.push(`Unknown portfolio size "${row.portfolioSize}" — defaulted to Small`);
      }

      const outstandingAmount =
        parseFloat(String(row.outstandingAmount || '0').replace(/,/g, '')) || 0;

      const retailerRef = db.collection(`tenants/${tenantId}/retailers`).doc();
      batch.set(retailerRef, {
        name,
        number: phoneResult.number,
        alternateNumber: phoneResult.alternate || (row.alternateNumber || '').trim(),
        location: (row.location || '').trim(),
        email: (row.email || '').trim(),
        portfolioSize,
        bookName: (row.bookName || '').trim(),
        billBookPageNo: (row.billBookPageNo || '').trim(),
        outstandingAmount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchOps++;

      if (outstandingAmount > 0) {
        const orderRef = db.collection(`tenants/${tenantId}/orders`).doc();
        batch.set(orderRef, {
          retailerId: retailerRef.id,
          retailerName: name,
          productId: 'UDHARI_IMPORT',
          productName: 'Imported Opening Balance',
          quantity: 1,
          unit: 'N/A',
          amount: outstandingAmount,
          paymentStatus: 'Unpaid',
          isDelivered: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          notes: 'Imported via backend CSV function',
        });
        batchOps++;
        result.ordersCreated++;
      }

      existingNames.add(nameKey);
      rowResult.status = 'imported';
      result.rows.push(rowResult);
      result.imported++;

      if (batchOps >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    return result;
  });
