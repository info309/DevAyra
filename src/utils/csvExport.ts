import { format, parseISO } from 'date-fns';

export interface InvoiceExportData {
  id: string;
  invoice_number: string | null;
  type: string;
  customer_name: string;
  customer_email: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  status: string;
  notes: string | null;
  line_items?: any;
}

/**
 * Escapes special characters in CSV fields (commas, quotes, newlines)
 */
const escapeCSVField = (field: string | number | null | undefined): string => {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Formats a date string to YYYY-MM-DD format for accounting software compatibility
 */
const formatDateForCSV = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return format(date, 'yyyy-MM-dd');
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Formats currency amount from cents to decimal with 2 decimal places
 */
const formatAmount = (cents: number): string => {
  return (cents / 100).toFixed(2);
};

/**
 * Exports paid invoices to CSV format compatible with accounting software
 * Standard format: QuickBooks, Xero, FreshBooks, Wave compatible
 */
export const exportInvoicesToCSV = (invoices: InvoiceExportData[], filename?: string): void => {
  if (invoices.length === 0) {
    throw new Error('No invoices to export');
  }

  // Standard accounting software headers
  const headers = [
    'Transaction Date',    // issue_date
    'Due Date',           // due_date
    'Invoice Number',     // invoice_number
    'Reference',          // type (Invoice/Quote)
    'Customer Name',      // customer_name
    'Customer Email',     // customer_email
    'Description',        // notes
    'Subtotal',          // subtotal_cents
    'Tax Amount',        // tax_cents
    'Total Amount',      // total_cents
    'Currency',          // currency
    'Status',            // status
    'Payment Date',      // paid_at
  ];

  const rows = invoices.map(invoice => [
    formatDateForCSV(invoice.issue_date),
    formatDateForCSV(invoice.due_date),
    escapeCSVField(invoice.invoice_number || invoice.id.slice(0, 8)),
    escapeCSVField(invoice.type === 'quote' ? 'Quote' : 'Invoice'),
    escapeCSVField(invoice.customer_name),
    escapeCSVField(invoice.customer_email),
    escapeCSVField(invoice.notes || ''),
    formatAmount(invoice.subtotal_cents),
    formatAmount(invoice.tax_cents),
    formatAmount(invoice.total_cents),
    escapeCSVField(invoice.currency.toUpperCase()),
    escapeCSVField(invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)),
    formatDateForCSV(invoice.paid_at),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  downloadCSV(csvContent, filename || `invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

/**
 * Exports receipts to CSV format compatible with accounting software
 * Uses same structure as invoices for consistency
 */
export const exportReceiptsToCSV = (receipts: InvoiceExportData[], filename?: string): void => {
  if (receipts.length === 0) {
    throw new Error('No receipts to export');
  }

  // Standard accounting software headers (aligned with invoice export)
  const headers = [
    'Transaction Date',    // issue_date (NOT created_at)
    'Receipt Number',     // invoice_number or ID
    'Vendor/Supplier',    // customer_name (renamed for receipts context)
    'Vendor Email',       // customer_email
    'Description',        // notes
    'Category',           // Could be added later
    'Subtotal',          // subtotal_cents
    'Tax Amount',        // tax_cents
    'Total Amount',      // total_cents
    'Currency',          // currency
    'Payment Method',    // Could be added later
  ];

  const rows = receipts.map(receipt => [
    formatDateForCSV(receipt.issue_date), // Use issue_date, not created_at
    escapeCSVField(receipt.invoice_number || `R-${receipt.id.slice(0, 8)}`),
    escapeCSVField(receipt.customer_name),
    escapeCSVField(receipt.customer_email),
    escapeCSVField(receipt.notes || ''),
    '', // Category placeholder
    formatAmount(receipt.subtotal_cents),
    formatAmount(receipt.tax_cents),
    formatAmount(receipt.total_cents),
    escapeCSVField(receipt.currency.toUpperCase()),
    '', // Payment method placeholder
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  downloadCSV(csvContent, filename || `receipts-${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

/**
 * Exports detailed invoice data with line items (one row per line item)
 * Useful for detailed reconciliation and item-level tracking
 */
export const exportInvoicesDetailedCSV = (invoices: InvoiceExportData[], filename?: string): void => {
  if (invoices.length === 0) {
    throw new Error('No invoices to export');
  }

  const headers = [
    'Transaction Date',
    'Invoice Number',
    'Customer Name',
    'Item Description',
    'Quantity',
    'Unit Price',
    'Line Total',
    'Tax Rate %',
    'Tax Amount',
    'Currency',
  ];

  const rows: string[][] = [];

  invoices.forEach(invoice => {
    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    
    if (lineItems.length === 0) {
      // If no line items, export as single row
      rows.push([
        formatDateForCSV(invoice.issue_date),
        escapeCSVField(invoice.invoice_number || invoice.id.slice(0, 8)),
        escapeCSVField(invoice.customer_name),
        escapeCSVField(invoice.notes || 'No description'),
        '1',
        formatAmount(invoice.subtotal_cents),
        formatAmount(invoice.subtotal_cents),
        formatAmount((invoice.tax_cents / invoice.subtotal_cents) * 100 || 0),
        formatAmount(invoice.tax_cents),
        escapeCSVField(invoice.currency.toUpperCase()),
      ]);
    } else {
      // Export one row per line item
      lineItems.forEach((item: any) => {
        rows.push([
          formatDateForCSV(invoice.issue_date),
          escapeCSVField(invoice.invoice_number || invoice.id.slice(0, 8)),
          escapeCSVField(invoice.customer_name),
          escapeCSVField(item.description || ''),
          String(item.quantity || 1),
          formatAmount(item.unit_price_cents || 0),
          formatAmount(item.amount_cents || 0),
          String(item.tax_rate_percent || 0),
          formatAmount((item.amount_cents * (item.tax_rate_percent || 0)) / 100),
          escapeCSVField(invoice.currency.toUpperCase()),
        ]);
      });
    }
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  downloadCSV(csvContent, filename || `invoices-detailed-${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

/**
 * Helper function to trigger CSV file download
 */
const downloadCSV = (csvContent: string, filename: string): void => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
};
