export function formatPdaDate(value: string | undefined) {
  const raw = (value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
  if (!match) return raw;
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const month = months[Number(match[2])-1]; if (!month) return raw;
  return match[3]+"-"+month+"-"+match[1].slice(2)+(match[4] ? " @ "+match[4]+match[5]+"LT" : "");
}
