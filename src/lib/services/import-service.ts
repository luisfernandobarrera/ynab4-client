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
  // Account fields (for multi-account import)
  accountId: string | null;
  accountName: string; // Detected or assigned account name
  // Payee fields
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
  account?: number; // For multi-account imports
  installments?: number; // Installments flag (TRUE/FALSE)
  numInstallments?: number; // Number of installments/months
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
    account: findColumn(['account', 'cuenta', 'tarjeta', 'card', 'bank']) >= 0
      ? findColumn(['account', 'cuenta', 'tarjeta', 'card', 'bank']) : undefined,
    installments: findColumn(['installments', 'msi', 'meses sin intereses']) >= 0
      ? findColumn(['installments', 'msi', 'meses sin intereses']) : undefined,
    numInstallments: findColumn(['numinstallments', 'num_installments', 'meses', 'months', 'plazo', 'cuotas']) >= 0
      ? findColumn(['numinstallments', 'num_installments', 'meses', 'months', 'plazo', 'cuotas']) : undefined,
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
      const accountName = mapping.account !== undefined ? row[mapping.account] || '' : '';
      const payeeFromCol = mapping.payee !== undefined ? row[mapping.payee] || '' : '';
      const suggestedPayee = mapping.suggestedPayee !== undefined ? row[mapping.suggestedPayee] || '' : '';
      const categoryFromCol = mapping.category !== undefined ? row[mapping.category] || '' : '';
      const suggestedCategory = mapping.suggestedCategory !== undefined ? row[mapping.suggestedCategory] || '' : '';
      const memo = mapping.memo !== undefined ? row[mapping.memo] || '' : '';
      const originalMemo = mapping.originalMemo !== undefined ? row[mapping.originalMemo] || '' : '';
      const reference = mapping.reference !== undefined ? row[mapping.reference] || '' : '';
      const flag = mapping.flag !== undefined ? row[mapping.flag] || null : null;
      
      // Installments (MSI) fields
      const installmentsRaw = mapping.installments !== undefined ? row[mapping.installments] || '' : '';
      const isMSI = installmentsRaw.toLowerCase() === 'true' || installmentsRaw === '1' || installmentsRaw.toLowerCase() === 'sí' || installmentsRaw.toLowerCase() === 'si' || installmentsRaw.toLowerCase() === 'yes';
      const numInstallmentsRaw = mapping.numInstallments !== undefined ? row[mapping.numInstallments] || '' : '';
      const msiMonths = parseInt(numInstallmentsRaw, 10) || 0;

      return {
        id: `import-${now}-${index}`,
        date: parseDate(row[mapping.date] || ''),
        description,
        originalMemo,
        accountId: null,
        accountName,
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
        isMSI,
        msiMonths,
        msiOriginalAmount: isMSI ? amount : 0,
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

/**
 * Template columns specification
 */
export const TEMPLATE_COLUMNS = [
  { header: 'Account', key: 'account', width: 20, description: 'YNAB account name (for multi-account import)' },
  { header: 'Date', key: 'date', width: 12, description: 'Transaction date (DD/MM/YYYY or YYYY-MM-DD)' },
  { header: 'Description', key: 'description', width: 40, description: 'Original description from bank statement' },
  { header: 'Outflow', key: 'debit', width: 15, description: 'Outflow amount (no negative sign)' },
  { header: 'Inflow', key: 'credit', width: 15, description: 'Inflow amount' },
  { header: 'Reference', key: 'reference', width: 20, description: 'Bank reference number' },
  { header: 'Original Memo', key: 'originalMemo', width: 30, description: 'Additional bank information' },
  { header: 'Payee', key: 'payee', width: 25, description: 'Payee (YNAB autocomplete)' },
  { header: 'Suggested Payee', key: 'suggestedPayee', width: 25, description: 'Suggested payee (editable)' },
  { header: 'Category', key: 'category', width: 30, description: 'YNAB category (Master: Subcategory)' },
  { header: 'Memo', key: 'memo', width: 30, description: 'Additional notes' },
  { header: 'Installments', key: 'installments', width: 12, description: 'Interest-free installments: TRUE or FALSE' },
  { header: 'numInstallments', key: 'numInstallments', width: 14, description: 'Number of months (3, 6, 9, 12, 18, 24)' },
  { header: 'Flag', key: 'flag', width: 10, description: 'Color: Red, Orange, Yellow, Green, Blue, Purple' },
] as const;

/**
 * Generate template Excel file with sample data
 */
export function generateTemplateExcel(): ArrayBuffer {
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Headers
  const headers = TEMPLATE_COLUMNS.map(col => col.header);
  
  // Sample data rows
  // Sample data with all columns including Installments
  // Account, Date, Description, Outflow, Inflow, Reference, Original Memo, Payee, Suggested Payee, Category, Memo, Installments, numInstallments, Flag
  const sampleData = [
    ['Cheques HSBC', '15/01/2025', 'PAGO TARJETA DE CREDITO', '5000.00', '', 'REF123456', 'PAGO TDC BANAMEX', '', 'Pago TDC', 'Deudas: Tarjeta Crédito', 'Pago mensual', '', '', ''],
    ['Cheques HSBC', '16/01/2025', 'TRANSFERENCIA SPEI', '', '25000.00', 'SPEI987654', 'NOMINA EMPRESA SA', '', 'Empresa SA', 'Ingreso: Salario', 'Quincena enero', '', '', 'Green'],
    ['2Now', '17/01/2025', 'COMPRA AMAZON', '1200.00', '', 'AMZ001234', 'AMAZON MEXICO', 'Amazon', 'Amazon', 'Hogar: Varios', 'Compra audífonos', '', '', 'Blue'],
    ['2Now', '18/01/2025', 'PAGO LUZ CFE', '850.50', '', 'CFE456789', 'CFE SUMINISTRADOR', 'CFE', 'CFE', 'Casa: Servicios', '', '', '', ''],
    ['Platinum', '19/01/2025', 'LIVERPOOL MSI 12', '12000.00', '', 'LIV789012', 'LIVERPOOL TIENDA', 'Liverpool', 'Liverpool', 'Ropa: Varios', 'Ropa invierno', 'TRUE', '12', 'Orange'],
    ['Platinum', '20/01/2025', 'SEARS MSI 6', '6000.00', '', 'SEARS001', 'SEARS TIENDA', 'Sears', 'Sears', 'Hogar: Electrodomésticos', 'Licuadora', 'TRUE', '6', 'Orange'],
  ];
  
  // Combine headers and data
  const wsData = [headers, ...sampleData];
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Set column widths
  ws['!cols'] = TEMPLATE_COLUMNS.map(col => ({ wch: col.width }));
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
  
  // Create instructions sheet
  const instructionsData = [
    ['INSTRUCTIONS'],
    [''],
    ['This is a template for importing transactions to YNAB4.'],
    [''],
    ['COLUMNS:'],
    ...TEMPLATE_COLUMNS.map(col => [`• ${col.header}: ${col.description}`]),
    [''],
    ['NOTES:'],
    ['• You can use separate Outflow/Inflow columns OR a single Amount column (positive=inflow, negative=outflow)'],
    ['• Dates can be in DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD format'],
    ['• Amounts can include commas as thousands separators'],
    ['• Categories must match your YNAB budget categories'],
    ['• For installments (MSI), set Installments=TRUE and numInstallments to the number of months'],
    [''],
    ['FLAG COLORS:'],
    ['Red, Orange, Yellow, Green, Blue, Purple (or empty)'],
    [''],
    ['MULTI-LANGUAGE SUPPORT:'],
    ['Column headers are also detected in Spanish: Cuenta, Fecha, Cargo, Abono, Categoría, Bandera, MSI, Meses'],
  ];
  
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');
  
  // Write to buffer
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buffer;
}

/**
 * Check if running in Tauri
 */
function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return '__TAURI__' in win || '__TAURI_INTERNALS__' in win;
}

/**
 * Download template Excel file
 * Works in both browser and Tauri
 */
export async function downloadTemplate(): Promise<void> {
  const buffer = generateTemplateExcel();
  const filename = 'plantilla-importacion-ynab.xlsx';

  if (isTauriRuntime()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      
      let filePath = await save({
        defaultPath: filename,
        filters: [{
          name: 'Excel',
          extensions: ['xlsx']
        }]
      });
      
      if (filePath) {
        // Ensure .xlsx extension is present
        if (!filePath.toLowerCase().endsWith('.xlsx')) {
          filePath = filePath + '.xlsx';
        }
        
        const uint8Array = new Uint8Array(buffer);
        console.log('[ImportService] Writing to:', filePath, 'Size:', uint8Array.length, 'bytes');
        
        // writeFile signature: (path, data, options?)
        await writeFile(filePath, uint8Array);
        
        console.log('[ImportService] Template saved successfully!');
        alert(`Plantilla guardada en: ${filePath}`);
      }
    } catch (error) {
      console.error('[ImportService] Error saving template in Tauri:', error);
      alert(`Error al guardar: ${error}`);
    }
  } else {
    downloadViaBrowser(buffer, filename);
  }
}

/**
 * Download via browser (fallback)
 */
function downloadViaBrowser(buffer: ArrayBuffer | string, filename: string, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): void {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate sample CSV content - matches TEMPLATE_COLUMNS
 */
export function generateSampleCSV(): string {
  // Use same headers as Excel template
  const headers = TEMPLATE_COLUMNS.map(col => col.header);
  
  // Sample data with all columns:
  // Account, Date, Description, Outflow, Inflow, Reference, Original Memo, Payee, Suggested Payee, Category, Memo, Installments, numInstallments, Flag
  const rows = [
    ['Cheques HSBC', '2025-01-15', 'PAGO TARJETA DE CREDITO', '5000.00', '', 'REF123456', 'PAGO TDC BANAMEX', '', 'Pago TDC', 'Deudas: Tarjeta Crédito', 'Pago mensual', '', '', ''],
    ['Cheques HSBC', '2025-01-16', 'TRANSFERENCIA SPEI', '', '25000.00', 'SPEI987654', 'NOMINA EMPRESA SA', '', 'Empresa SA', 'Ingreso: Salario', 'Quincena enero', '', '', 'Green'],
    ['2Now', '2025-01-17', 'COMPRA AMAZON', '1200.00', '', 'AMZ001234', 'AMAZON MEXICO', 'Amazon', 'Amazon', 'Hogar: Varios', 'Compra audífonos', '', '', 'Blue'],
    ['2Now', '2025-01-18', 'PAGO LUZ CFE', '850.50', '', 'CFE456789', 'CFE SUMINISTRADOR', 'CFE', 'CFE', 'Casa: Servicios', '', '', '', ''],
    ['2Now', '2025-01-19', 'RESTAURANTE SANBORNS', '450.00', '', 'SAN78901', 'SANBORNS REST', '', 'Sanborns', 'Comidas: Restaurantes', 'Comida con familia', '', '', ''],
    ['Platinum', '2025-01-20', 'LIVERPOOL MSI 12', '12000.00', '', 'LIV789012', 'LIVERPOOL TIENDA', 'Liverpool', 'Liverpool', 'Ropa: Varios', 'Ropa invierno', 'TRUE', '12', 'Orange'],
    ['Platinum', '2025-01-21', 'SEARS MSI 6', '6000.00', '', 'SEARS001', 'SEARS TIENDA', 'Sears', 'Sears', 'Hogar: Electrodomésticos', 'Licuadora', 'TRUE', '6', 'Orange'],
    ['Platinum', '2025-01-22', 'UBER VIAJES', '350.00', '', 'UBER12345', 'UBER TRIP', 'Uber', 'Uber', 'Transporte: Uber', '', '', '', ''],
    ['Platinum', '2025-01-23', 'NETFLIX', '199.00', '', 'NFLX001', 'NETFLIX.COM', 'Netflix', 'Netflix', 'Servicios: Streaming', '', '', '', ''],
    ['Nu Cuenta', '2025-01-24', 'TRANSFERENCIA RECIBIDA', '', '5000.00', 'NU98765', 'TRANSFERENCIA DE HSBC', '', 'Transferencia Interna', '', 'De cuenta cheques', '', '', ''],
    ['Nu Cuenta', '2025-01-25', 'INTERESES GANADOS', '', '125.50', 'INT001', 'INTERESES DEL MES', '', 'Intereses', 'Ahorro: Intereses', '', '', 'Green'],
  ];
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  
  return csvContent;
}

/**
 * Download sample CSV file
 */
export async function downloadSampleCSV(): Promise<void> {
  const csvContent = generateSampleCSV();
  const filename = 'ejemplo-importacion-ynab.csv';

  if (isTauriRuntime()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      
      let filePath = await save({
        defaultPath: filename,
        filters: [{
          name: 'CSV',
          extensions: ['csv']
        }]
      });
      
      if (filePath) {
        if (!filePath.toLowerCase().endsWith('.csv')) {
          filePath = filePath + '.csv';
        }
        
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(csvContent);
        await writeFile(filePath, uint8Array);
        
        alert(`CSV de ejemplo guardado en: ${filePath}`);
      }
    } catch (error) {
      console.error('[ImportService] Error saving CSV in Tauri:', error);
      alert(`Error al guardar: ${error}`);
    }
  } else {
    downloadViaBrowser(csvContent, filename, 'text/csv;charset=utf-8');
  }
}

