export const CURRENCIES=['USD','THB','EUR'];
export function convert(amount,from,to,roe){
 if(!Number.isFinite(Number(amount))||Number(amount)<0||!CURRENCIES.includes(from)||!CURRENCIES.includes(to))return null;
 if(from===to)return Number(amount);
 const rate=currency=>currency==='USD'?1:Number(roe?.[currency]);
 const a=rate(from),b=rate(to);
 return Number.isFinite(a)&&a>0&&Number.isFinite(b)&&b>0?Number(amount)*b/a:null;
}
export function sellingPrice(item,to,roe){
 const a=convert(item.price,item.costCurrency||'USD',to,roe),b=convert(item.margin??0,item.marginCurrency||'USD',to,roe);
 return a===null||b===null?null:Math.round(a+b);
}
