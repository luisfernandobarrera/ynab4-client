/**
 * Import Service
 * Handles CSV and Excel parsing with extended fields
 */

import * as XLSX from 'xlsx';

export interface ImportTransaction {
  id: string;
  date: string;
  description: string; // Original description from source
  originalMemo: string; // Original memo from source (e.g., bank reference)
  payeeId: string | null;
  payeeName: string;
  suggestedPayee: string; // Suggested payee (can be edited)
  categoryId: string | null;
  categoryName: string;
  suggestedCategory: string; // Suggested category
  amount: number;
  outflow: number; // Explicit outflow (for split view)
  inflow: number; // Explicit inflow (for split view)
  memo: string; // Editable memo
  reference: string; // Bank reference number
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
 * Extended column mapping for CSV/Excel
 */
export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit?: number;
  credit?: number;
  balance?: number;
  memo?: number;
  originalMemo?: number;
  reference?: number;
  payee?: number;
  suggestedPayee?: number;
  category?: number;
  suggestedCategory?: number;
  flag?: number;
}

/**
 * Detect column mappings from headers
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const lowered = headers.map((h) => h.toLowerCase().trim());

  const findColumn = (patterns: string[]): number => {
    return lowered.findIndex((h) => patterns.some(p => h.includes(p) || h === p));
  };

  return {
    date: Math.max(0, findColumn(['date', 'fecha', 'transaction date', 'fecha operación', 'fecha op'])),
    description: Math.max(1, findColumn(['description', 'descripción', 'concepto', 'detail', 'detalle', 'movimiento'])),
    amount: findColumn(['amount', 'monto', 'importe', 'cantidad']),
    debit: findColumn(['debit', 'cargo', 'débito', 'withdrawal', 'retiro', 'egreso', 'outflow']) >= 0 
      ? findColumn(['debit', 'cargo', 'débito', 'withdrawal', 'retiro', 'egreso', 'outflow']) : undefined,
    credit: findColumn(['credit', 'abono', 'crédito', 'deposit', 'depósito', 'ingreso', 'inflow']) >= 0
      ? findColumn(['credit', 'abono', 'crédito', 'deposit', 'depósito', 'ingreso', 'inflow']) : undefined,
    memo: findColumn(['memo', 'nota', 'notas', 'observaciones']) >= 0
      ? findColumn(['memo', 'nota', 'notas', 'observaciones']) : undefined,
    originalMemo: findColumn(['original memo', 'memo original', 'referencia banco', 'bank memo']) >= 0
      ? findColumn(['original memo', 'memo original', 'referencia banco', 'bank memo']) : undefined,
    reference: findColumn(['reference', 'referencia', 'ref', 'folio', 'número']) >= 0
      ? findColumn(['reference', 'referencia', 'ref', 'folio', 'número']) : undefined,
    payee: findColumn(['payee', 'beneficiario', 'destinatario', 'proveedor']) >= 0
      ? findColumn(['payee', 'beneficiario', 'destinatario', 'proveedor']) : undefined,
    suggestedPayee: findColumn(['suggested payee', 'payee sugerido', 'beneficiario sugerido']) >= 0
      ? findColumn(['suggested payee', 'payee sugerido', 'beneficiario sugerido']) : undefined,
    category: findColumn(['category', 'categoría', 'categoria']) >= 0
      ? findColumn(['category', 'categoría', 'categoria']) : undefined,
    suggestedCategory: findColumn(['suggested category', 'categoría sugerida', 'categoria sugerida']) >= 0
      ? findColumn(['suggested category', 'categoría sugerida', 'categoria sugerida']) : undefined,
    flag: findColumn(['flag', 'bandera', 'marca', 'color']) >= 0
      ? findColumn(['flag', 'bandera', 'marca', 'color']) : undefined,
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
 * Convert rows to ImportTransactions (works for both CSV and Excel)
 */
export function rowsToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeader = true
): ImportTransaction[] {
  const dataRows = skipHeader ? rows.slice(1) : rows;
  const now = Date.now();

  return dataRows
    .filter(row => row.some(cell => cell && cell.trim())) // Skip empty rows
    .map((row, index) => {
      let amount = 0;
      let outflow = 0;
      let inflow = 0;

      if (mapping.amount >= 0 && row[mapping.amount]) {
        amount = parseAmount(row[mapping.amount] || '0');
        if (amount < 0) {
          outflow = Math.abs(amount);
        } else {
          inflow = amount;
        }
      } else {
        const debit = mapping.debit !== undefined ? parseAmount(row[mapping.debit] || '0') : 0;
        const credit = mapping.credit !== undefined ? parseAmount(row[mapping.credit] || '0') : 0;
        outflow = debit;
        inflow = credit;
        amount = credit - debit;
      }

      const description = row[mapping.description] || '';
      const payeeFromCol = mapping.payee !== undefined ? row[mapping.payee] || '' : '';
      const suggestedPayee = mapping.suggestedPayee !== undefined ? row[mapping.suggestedPayee] || '' : '';
      const categoryFromCol = mapping.category !== undefined ? row[mapping.category] || '' : '';
      const suggestedCategory = mapping.suggestedCategory !== undefined ? row[mapping.suggestedCategory] || '' : '';
      const memo = mapping.memo !== undefined ? row[mapping.memo] || '' : '';
      const originalMemo = mapping.originalMemo !== undefined ? row[mapping.originalMemo] || '' : '';
      const reference = mapping.reference !== undefined ? row[mapping.reference] || '' : '';
      const flag = mapping.flag !== undefined ? row[mapping.flag] || null : null;

      return {
        id: `import-${now}-${index}`,
        date: parseDate(row[mapping.date] || ''),
        description,
        originalMemo,
        payeeId: null,
        payeeName: payeeFromCol || suggestedPayee || '',
        suggestedPayee: suggestedPayee || payeeFromCol || description,
        categoryId: null,
        categoryName: categoryFromCol || '',
        suggestedCategory: suggestedCategory || categoryFromCol || '',
        amount,
        outflow,
        inflow,
        memo,
        reference,
        flag,
        cleared: false,
        isMSI: false,
        msiMonths: 0,
        msiOriginalAmount: 0,
        status: 'pending' as const,
      };
    });
}

/**
 * Legacy function name for backwards compatibility
 */
export function csvToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeader = true
): ImportTransaction[] {
  return rowsToTransactions(rows, mapping, skipHeader);
}

/**
 * Parse Excel file to rows
 */
export function parseExcel(data: ArrayBuffer, sheetIndex = 0): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[sheetIndex];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to array of arrays
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Convert all values to strings
  const rows: string[][] = rawData.map(row => 
    (row as unknown[]).map(cell => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) {
        return cell.toISOString().split('T')[0];
      }
      return String(cell).trim();
    })
  );

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  return {
    headers: rows[0],
    rows: rows,
  };
}

/**
 * Get sheet names from Excel file
 */
export function getExcelSheetNames(data: ArrayBuffer): string[] {
  const workbook = XLSX.read(data, { type: 'array' });
  return workbook.SheetNames;
}

/**
 * Parse Excel file directly to ImportTransactions
 */
export function excelToTransactions(
  data: ArrayBuffer,
  sheetIndex = 0,
  customMapping?: Partial<ColumnMapping>
): ImportTransaction[] {
  const { headers, rows } = parseExcel(data, sheetIndex);
  
  if (rows.length < 2) {
    return [];
  }

  const detectedMapping = detectColumns(headers);
  const mapping = { ...detectedMapping, ...customMapping };
  
  return rowsToTransactions(rows, mapping, true);
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

