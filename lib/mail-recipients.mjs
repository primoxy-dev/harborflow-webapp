const addressPattern=/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;

export function mailRecipientAddresses(value) {
  if(typeof value!=='string'||value.length>2000)throw Error('Check the To and CC email addresses.');
  const addresses=value.split(/[;\r\n]+/).flatMap(part=>{
    const text=part.trim();
    const named=text.match(/^[^@<>]+<([^<>]+)>$/);
    return named?[named[1].trim()]:text.split(',').map(address=>address.trim()).filter(Boolean);
  });
  if(addresses.some(address=>!addressPattern.test(address)))throw Error('Check the To and CC email addresses.');
  return addresses;
}
