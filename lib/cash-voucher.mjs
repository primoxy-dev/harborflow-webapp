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
export const ctmCurrencies = ['USD', 'EUR'];
export const ctmFeeLabels = ['Bank charge and administrative fee', 'Handling fee', 'Escort, security and insurance'];

export function defaultCtmPricing(details) {
  const amount = String(details.amount ?? '');
  const currency = String(details.currency ?? '').toUpperCase();
  return {
    amount: amountInCents(amount) === null ? '' : amount,
    currency: ctmCurrencies.includes(currency) ? currency : 'USD',
    rates: ['0.5', '1.5', '1.605'],
    minimums: { USD: ['', '150', '321'], EUR: ['', '', ''] }
  };
}

export function amountInCents(value) {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function percentUnits(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3})?$/.test(value) || Number(value) > 100) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export function validateCtmPricing(pricing) {
  if (!pricing || typeof pricing !== 'object' || Object.keys(pricing).length !== 4 ||
      !ctmCurrencies.includes(pricing.currency) || !Array.isArray(pricing.rates) || pricing.rates.length !== ctmFeeLabels.length ||
      !pricing.minimums || Object.keys(pricing.minimums).length !== ctmCurrencies.length) return 'Invalid CTM pricing.';
  if (pricing.amount !== '' && amountInCents(pricing.amount) === null) return 'Enter a CTM amount with up to two decimal places, without commas.';
  if (pricing.rates.some(rate => rate !== '' && percentUnits(rate) === null)) return 'Enter percentages from 0 to 100 with up to three decimal places.';
  for (const currency of ctmCurrencies) {
    const minimums = pricing.minimums[currency];
    if (!Array.isArray(minimums) || minimums.length !== ctmFeeLabels.length ||
        minimums.some(amount => amount !== '' && amountInCents(amount) === null)) return 'Enter minimum fees with up to two decimal places, without commas.';
  }
  return null;
}

export function calculateCtmPricing(pricing) {
  if (validateCtmPricing(pricing) || pricing.amount === '') return null;
  const principal = amountInCents(pricing.amount);
  const fees = pricing.rates.map((rate, index) => {
    if (principal === 0) return 0;
    const units = percentUnits(rate) ?? 0;
    const calculated = Number((BigInt(principal) * BigInt(units) + 50000n) / 100000n);
    return Math.max(calculated, amountInCents(pricing.minimums[pricing.currency][index]) ?? 0);
  });
  return { principal, fees, total: fees.reduce((sum, fee) => sum + fee, principal) };
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
  if (!voucher || typeof voucher !== 'object' || Object.keys(voucher).length !== (voucher.pricing === undefined ? 2 : 3) || !validText(voucher.header, voucherFields) ||
      !Array.isArray(voucher.lines) || voucher.lines.length > voucherRowLimit) return 'Invalid payment voucher.';
  for (const [index, line] of voucher.lines.entries()) {
    if (!validText(line, voucherLineFields)) return `Invalid voucher line ${index + 1}.`;
    if (line.amount && amountInCents(line.amount) === null) return `Line ${index + 1}: enter a non-negative amount with up to two decimal places, without commas.`;
  }
  return voucher.pricing === undefined ? null : validateCtmPricing(voucher.pricing);
}
