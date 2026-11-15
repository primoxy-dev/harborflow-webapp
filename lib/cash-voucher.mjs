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
export const voucherDueDateField = ['Due date', 10, 'date'];
const voucherLineFieldsByKind = {
  remark: { ...voucherLineFields, kind: ['Kind', 7] },
  dueDate: { ...voucherLineFields, description: voucherDueDateField, kind: ['Kind', 7] }
};
export const ctmCurrencies = ['USD', 'EUR'];
export const ctmFeeLabels = ['Bank charge and administrative fee', 'Handling fee', 'Escort, security and insurance'];
export const banknoteDenominations = {
  USD: [100, 50, 20, 10, 5, 2, 1],
  EUR: [200, 100, 50, 20, 10, 5]
};

export function emptyBanknotes() {
  return Object.fromEntries(ctmCurrencies.map(currency => [currency, banknoteDenominations[currency].map(() => '')]));
}

export function banknoteQuantity(value) {
  return typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : 0;
}

export function banknoteRows(banknotes, currency) {
  return banknoteDenominations[currency].map((denomination, index) => {
    const quantity = banknoteQuantity(banknotes?.[currency]?.[index]);
    return { denomination, quantity, amount: denomination * quantity };
  });
}

function validateBanknotes(banknotes) {
  if (!banknotes || typeof banknotes !== 'object' || Object.keys(banknotes).length !== ctmCurrencies.length) return 'Invalid banknote breakdown.';
  for (const currency of ctmCurrencies) {
    const quantities = banknotes[currency];
    if (!Array.isArray(quantities) || quantities.length !== banknoteDenominations[currency].length ||
        quantities.some(value => value !== '' && (typeof value !== 'string' || !/^\d{1,7}$/.test(value)))) {
      return 'Enter whole numbers of banknotes, up to 9,999,999 per denomination.';
    }
  }
  return null;
}

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
  if (!voucher || typeof voucher !== 'object' ||
      Object.keys(voucher).some(key => !['header','lines','pricing','banknotes'].includes(key)) || !validText(voucher.header, voucherFields) ||
      !Array.isArray(voucher.lines) || voucher.lines.length > voucherRowLimit) return 'Invalid payment voucher.';
  for (const [index, line] of voucher.lines.entries()) {
    const fields = Object.hasOwn(voucherLineFieldsByKind, line?.kind) ? voucherLineFieldsByKind[line.kind] : voucherLineFields;
    if (!validText(line, fields)) return `Invalid voucher line ${index + 1}.`;
    if (line.amount && amountInCents(line.amount) === null) return `Line ${index + 1}: enter a non-negative amount with up to two decimal places, without commas.`;
  }
  const pricingError = voucher.pricing === undefined ? null : validateCtmPricing(voucher.pricing);
  return pricingError || (voucher.banknotes === undefined ? null : validateBanknotes(voucher.banknotes));
}
