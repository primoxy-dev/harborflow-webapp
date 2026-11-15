export const cashVoucherTypes = ['Cash to Master', 'CTM'];
export const voucherRowLimit = 20;
export const voucherFields = {
  number: ['Voucher No.', 28],
  payTo: ['Pay To', 100],
  date: ['Date', 10, 'date'],
  receivedBy: ['Received by', 50],
  receivedDate: ['Received date', 10, 'date'],
  preparedBy: ['Prepared by', 40],
  checkedBy: ['Checked by', 40],
  approvedBy: ['Approved by', 40]
};
export const voucherLineFields = {
  jobNo: ['Job No.', 80],
  description: ['Description', 120],
  amount: ['Amount', 13, 'decimal']
};

export function amountInCents(value) {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function validText(record, fields) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Object.keys(record).length === Object.keys(fields).length &&
    Object.entries(fields).every(([key, [, max, type]]) => {
      const value = record[key];
      if (typeof value !== 'string' || value.length > max || /[\r\n]/.test(value)) return false;
      if (!value || type !== 'date') return true;
      const date = new Date(value + 'T00:00:00Z');
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
    });
}

export function validateCashVoucher(voucher) {
  if (!voucher || typeof voucher !== 'object' || Object.keys(voucher).length !== 2 || !validText(voucher.header, voucherFields) ||
      !Array.isArray(voucher.lines) || voucher.lines.length > voucherRowLimit) return 'Invalid payment voucher.';
  for (const [index, line] of voucher.lines.entries()) {
    if (!validText(line, voucherLineFields)) return `Invalid voucher line ${index + 1}.`;
    if (line.amount && amountInCents(line.amount) === null) return `Line ${index + 1}: enter a non-negative amount with up to two decimal places, without commas.`;
  }
  return null;
}
