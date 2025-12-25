/**
 * Import Service
 * Handles CSV parsing and custom import format
 */

export interface ImportTransaction {
  id: string;
  date: string;
  description: string; // Original from CSV
  payeeId: string | null;
  payeeName: string;
  categoryId: string | null;
  categoryName: string;
  amount: number;
  memo: string;
  flag: string | null;
  cleared: boolean;
  // MSI fields
  isMSI: boolean;
  msiMonths: number;
  msiOriginalAmount: number;
  // Status
  status: 'pending' | 'ready' | 'imported' | 'skipped';
}

export interface ImportFile {
  id: string;
  name: string;
  sourceFile: string;
  accountId: string;
  accountName: string;
  createdAt: string;
  updatedAt: string;
  transactions: ImportTransaction[];
}

/**
 * Parse CSV string into rows
 */
export function parseCSV(content: string, delimiter = ','): string[][] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Detect CSV column mappings
 */
export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit?: number;
  credit?: number;
  balance?: number;
}

export function detectColumns(headers: string[]): ColumnMapping {
  const lowered = headers.map((h) => h.toLowerCase());

  const dateIndex = lowered.findIndex((h) =>
    ['date', 'fecha', 'transaction date', 'fecha operación'].includes(h)
  );

  const descIndex = lowered.findIndex((h) =>
    ['description', 'descripción', 'concepto', 'detail', 'detalle'].includes(h)
  );

  const amountIndex = lowered.findIndex((h) =>
    ['amount', 'monto', 'importe', 'cantidad'].includes(h)
  );

  const debitIndex = lowered.findIndex((h) =>
    ['debit', 'cargo', 'débito', 'withdrawal'].includes(h)
  );

  const creditIndex = lowered.findIndex((h) =>
    ['credit', 'abono', 'crédito', 'deposit'].includes(h)
  );

  return {
    date: dateIndex >= 0 ? dateIndex : 0,
    description: descIndex >= 0 ? descIndex : 1,
    amount: amountIndex >= 0 ? amountIndex : -1,
    debit: debitIndex >= 0 ? debitIndex : undefined,
    credit: creditIndex >= 0 ? creditIndex : undefined,
  };
}

/**
 * Parse amount string to number
 */
export function parseAmount(value: string): number {
  // Remove currency symbols and thousands separators
  let cleaned = value.replace(/[$€£¥,\s]/g, '');
  // Handle Mexican format (1,234.56 or 1.234,56)
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.indexOf('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse date string to YYYY-MM-DD
 */
export function parseDate(value: string): string {
  // Try various formats
  const formats = [
    // ISO
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];

  for (const format of formats) {
    const match = value.match(format);
    if (match) {
      let year: string, month: string, day: string;

      if (format === formats[0]) {
        [, year, month, day] = match;
      } else {
        // Assume DD/MM/YYYY for non-ISO formats
        [, day, month, year] = match;
        // Swap if day > 12 (likely MM/DD/YYYY)
        if (parseInt(day) > 12 && parseInt(month) <= 12) {
          [day, month] = [month, day];
        }
      }

      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Fallback: try JavaScript Date parsing
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Convert CSV to ImportTransactions
 */
export function csvToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeader = true
): ImportTransaction[] {
  const dataRows = skipHeader ? rows.slice(1) : rows;

  return dataRows.map((row, index) => {
    let amount = 0;

    if (mapping.amount >= 0) {
      amount = parseAmount(row[mapping.amount] || '0');
    } else if (mapping.debit !== undefined || mapping.credit !== undefined) {
      const debit = mapping.debit !== undefined ? parseAmount(row[mapping.debit] || '0') : 0;
      const credit = mapping.credit !== undefined ? parseAmount(row[mapping.credit] || '0') : 0;
      amount = credit - debit;
    }

    return {
      id: `import-${Date.now()}-${index}`,
      date: parseDate(row[mapping.date] || ''),
      description: row[mapping.description] || '',
      payeeId: null,
      payeeName: '',
      categoryId: null,
      categoryName: '',
      amount,
      memo: '',
      flag: null,
      cleared: false,
      isMSI: false,
      msiMonths: 0,
      msiOriginalAmount: 0,
      status: 'pending' as const,
    };
  });
}

/**
 * Serialize ImportFile to JSON
 */
export function serializeImportFile(file: ImportFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Deserialize ImportFile from JSON
 */
export function deserializeImportFile(json: string): ImportFile {
  return JSON.parse(json);
}

/**
 * Generate filename for import file
 */
export function generateImportFilename(accountName: string): string {
  const date = new Date().toISOString().split('T')[0];
  const safeName = accountName.replace(/[^a-zA-Z0-9]/g, '-');
  return `import-${safeName}-${date}.ynab-import.json`;
}

