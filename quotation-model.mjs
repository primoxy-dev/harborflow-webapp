// Shared quotation calculations. Values are displayed and exported in the quotation currency.
export const PORTS = ['Bang Saphan','Bangkok','Koh Si Chang','Laem Chabang','Map Ta Phut Anchorage','Sattahip','Sriracha / SBM Anchorage'];
export const CURRENCIES = ['THB','USD','EUR'];
export const roundMoney = n => { const value=Number(n); return Math.round((value + Math.abs(value)*Number.EPSILON*2) * 100) / 100; };
export const numeric = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0;

// A trip's base covers the confirmed minimum; extra hours are priced separately.
export function timeCostPerTrip(base, minimumHours, hours, additionalHourlyRate) {
  if (![base,minimumHours,hours,additionalHourlyRate].every(numeric)) return null;
  return roundMoney(Number(base)+Math.max(0,Number(hours)-Number(minimumHours))*Number(additionalHourlyRate));
}

export function saleFromCost(cost, markupType, markup, currency, rate) {
  if (!numeric(cost) || !numeric(markup) || !CURRENCIES.includes(currency) || (currency !== 'THB' && (!numeric(rate) || Number(rate) <= 0))) return null;
  const base = Number(cost), addition = markupType === 'percent' ? base * Number(markup) / 100 : Number(markup);
  return roundMoney((base + addition) / (currency === 'THB' ? 1 : Number(rate)));
}

export function quoteTotals(data) {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  let subtotal = 0, tax = 0, total = 0;
  const results = lines.map(line => {
    if (!line.description?.trim() || !line.unit?.trim() || !numeric(line.saleQuantity) || !numeric(line.salePrice) || !['excluded','included','none'].includes(line.vatMode) || (line.vatMode !== 'none' && !numeric(line.vatRate))) return null;
    const amount = roundMoney(Number(line.saleQuantity) * Number(line.salePrice));
    const rate = line.vatMode === 'none' ? 0 : Number(line.vatRate) / 100;
    const base = line.vatMode === 'included' ? roundMoney(amount / (1 + rate)) : amount;
    const lineTax = line.vatMode === 'included' ? roundMoney(amount - base) : roundMoney(base * rate);
    const gross = line.vatMode === 'included' ? amount : roundMoney(base + lineTax);
    subtotal += base; tax += lineTax; total += gross;
    return {base, tax:lineTax, total:gross};
  });
  return {complete:lines.length > 0 && results.every(Boolean), lines:results, subtotal:roundMoney(subtotal), tax:roundMoney(tax), total:roundMoney(total)};
}

// Whitelist the customer projection so internal costs cannot leak into downloads or API responses.
export function customerProjection(data) {
  const fields = ['number','date','customer','vessel','jobNo','port','category','currency','exchangeRate','exchangeDate','notes'];
  const lineFields = ['id','description','unit','saleQuantity','salePrice','vatMode','vatRate','customerNote'];
  const out = Object.fromEntries(fields.map(key => [key, data?.[key] ?? '']));
  out.lines = (Array.isArray(data?.lines) ? data.lines : []).map(line => Object.fromEntries(lineFields.map(key => [key,line?.[key] ?? ''])));
  return out;
}
