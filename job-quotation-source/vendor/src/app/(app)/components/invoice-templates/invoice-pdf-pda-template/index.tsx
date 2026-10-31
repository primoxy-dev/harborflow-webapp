import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer/lib/react-pdf.browser";
import type { InvoiceData } from "@/app/schema";
import { formatPdaDate } from "@/app/(app)/utils/format-pda-date";

const S = StyleSheet.create({
  page:{paddingTop:30,paddingBottom:35,paddingHorizontal:30,fontFamily:"Helvetica",fontSize:8,color:"#173967"},
  header:{flexDirection:"row",justifyContent:"space-between",minHeight:62},
  seller:{flexGrow:1}, letterhead:{width:"100%",height:70,objectFit:"contain",objectPosition:"left",marginBottom:4}, sellerName:{fontSize:10,fontWeight:"bold"}, logo:{width:58,maxHeight:42,objectFit:"contain",marginBottom:4},
  band:{backgroundColor:"#8fb7a7",color:"#fff",paddingVertical:11,textAlign:"center",fontSize:10,fontWeight:"bold",marginTop:5,marginBottom:7},
  grid:{borderWidth:0.7,borderColor:"#202020"}, gridRow:{flexDirection:"row",borderBottomWidth:0.5,borderColor:"#202020",minHeight:16},
  cellLabel:{width:"15%",padding:3,borderRightWidth:0.5,borderColor:"#202020"}, cellValue:{width:"18.33%",padding:3,borderRightWidth:0.5,borderColor:"#202020"},
  tableHeader:{flexDirection:"row",borderWidth:0.7,borderColor:"#202020",marginTop:8,minHeight:31},
  expense:{width:"39%",padding:4}, unitCost:{width:"13%",padding:4,borderLeftWidth:0.5,borderColor:"#202020",textAlign:"right"}, unit:{width:"23%",padding:4,borderLeftWidth:0.5,borderColor:"#202020"}, local:{width:"9%",padding:4,borderLeftWidth:0.5,borderColor:"#202020",textAlign:"right"},
  quoted:{width:"16%",padding:4,borderLeftWidth:0.5,borderColor:"#202020",textAlign:"right"}, comment:{width:"29%",padding:4,borderLeftWidth:0.5,borderColor:"#202020"},
  heading:{fontWeight:"bold",textAlign:"center"}, row:{flexDirection:"row",borderLeftWidth:0.7,borderRightWidth:0.7,borderBottomWidth:0.5,borderColor:"#202020",minHeight:20},
  group:{backgroundColor:"#fff100",color:"#173967",fontWeight:"bold",padding:4,borderLeftWidth:0.7,borderRightWidth:0.7,borderBottomWidth:0.5,borderColor:"#202020"},
  total:{flexDirection:"row",borderWidth:0.7,borderColor:"#202020",padding:5,justifyContent:"space-between",fontWeight:"bold"},
  sectionTitle:{fontWeight:"bold",marginTop:9,marginBottom:3}, text:{lineHeight:1.35}, footer:{position:"absolute",bottom:15,left:30,right:30,textAlign:"right",fontSize:10,color:"#737373"}
});
const number = (n: number) => Number.isFinite(n) ? n.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
const money = (n: number) => Number.isFinite(n) ? n.toLocaleString("en-US", {minimumFractionDigits:0,maximumFractionDigits:2}) : "—";
export function PdaInvoicePdfTemplate({invoiceData:d}:{invoiceData:InvoiceData}) {
  const p=d.pda || {}; const compact=d.items.length>12; const docFont=p.pdfFontSize ?? (compact ? 7 : 8); const cellPad=compact ? {padding:1} : {}; const widths={description:39,cost:13,unit:23,quantity:9,total:16,...p.pdfWidths}; const widthSum=Object.values(widths).reduce((a,b)=>a+b,0); const col=(v:number)=>({width:(100*v/widthSum)+"%"} as const); const rate=Number(p.exchangeRate); const hasRate=Boolean(p.exchangeRate) && Number.isFinite(rate) && rate>0;
  const local=p.localCurrency?.trim() || "Local"; const currency=d.currency; const showLocal=hasRate && Boolean(p.localCurrency?.trim()); const localTotal=d.items.reduce((sum,item)=>sum+Math.round((Number(item.preTaxAmount)*rate+Number.EPSILON)*100),0)/100; let previousGroup="";
  const rows: [string,string,string,string,string,string][] = [
    ["Company",d.buyer.name,"Charterer",p.charterer || "","Port",p.port || ""],
    ["Vessel",p.vessel || "","", "","Job No.",p.jobNo || ""],
    ["ETA",formatPdaDate(p.eta),"Purpose of call",p.purpose || "","Rate",hasRate ? `${number(rate)} ${local} / ${currency}` : ""],
    ["ETD",formatPdaDate(p.etd),"Local agent",p.localAgent || "","DWT",p.dwt || ""],
    ["LOA (FT)",p.loa || "","GRT",p.grt || "","NRT",p.nrt || ""],
    ["DRAFT (FT)",p.draft || "","D/A Date",d.dateOfIssue || "","Currency",currency]
  ];
  return <Document title="Estimated Proforma D/A"><Page size="A4" style={[S.page,{fontSize:docFont},compact ? {paddingTop:15,paddingBottom:22,paddingHorizontal:22} : {}] } wrap>
    <View style={[S.header,compact ? {minHeight:45} : {}]}><View style={S.seller}>{d.logo ? <Image src={d.logo} style={S.logo} /> : <Image src="/job-quotation/gac-letterhead.png" style={[S.letterhead,compact ? {height:43} : {}]} />}</View></View>
    <Text style={[S.band,compact ? {paddingVertical:4,marginTop:2,marginBottom:3} : {}]}>Estimated Proforma D/A</Text>
    <View style={S.grid}>{rows.map((r,i)=><View key={i} style={[S.gridRow,compact ? {minHeight:10} : {},i===rows.length-1?{borderBottomWidth:0}:{}]}>{r.map((value,j)=><Text key={j} style={[j%2===0?S.cellLabel:S.cellValue,cellPad,j===5?{borderRightWidth:0}:{}]}>{value}</Text>)}</View>)}</View>
    <View style={[S.tableHeader,compact ? {marginTop:3,minHeight:15} : {}]} wrap={false}><Text style={[S.expense,cellPad,col(widths.description),S.heading]}>HUSBANDRY EXPENSES</Text><Text style={[S.unitCost,cellPad,col(widths.cost),S.heading]}>COST</Text><Text style={[S.unit,cellPad,col(widths.unit),S.heading]}>UNIT</Text><Text style={[S.local,cellPad,col(widths.quantity),S.heading]}>QTY</Text><Text style={[S.quoted,cellPad,col(widths.total),S.heading]}>LINE TOTAL</Text></View>
    {d.items.map((item,index)=>{const group=(item.pdaGroup || "").trim();const show=Boolean(group)&&group!==previousGroup;previousGroup=group;return <View key={index} wrap={false}>{show?<Text style={[S.group,cellPad]}>{group.toUpperCase()}</Text>:null}<View style={[S.row,compact ? {minHeight:9} : {}]}><Text style={[S.expense,cellPad,col(widths.description)]}>{item.name}{Number(item.vatAmount) > 0 ? `  ·  Tax: ${item.vat}` : ""}</Text><Text style={[S.unitCost,cellPad,col(widths.cost)]}>{money(Number(item.netPrice))}</Text><Text style={[S.unit,cellPad,col(widths.unit)]}>{d.items[0].unitFieldIsVisible ? item.unit : ""}</Text><Text style={[S.local,cellPad,col(widths.quantity)]}>{item.amount}</Text><Text style={[S.quoted,cellPad,col(widths.total)]}>{money(Number(item.preTaxAmount))}</Text></View></View>})}
    <View style={[S.total,compact ? {padding:2} : {}]} wrap={false}><Text>Total Disbursement Account</Text><Text>{showLocal?`${local} ${money(localTotal)}  ·  `:""}{currency} {money(Number(d.total))}</Text></View>
    {d.notesFieldIsVisible && d.notes ? <View style={{borderWidth:0.7,borderColor:"#202020",padding:compact?2:4,marginTop:compact?3:8}}><Text style={{fontWeight:"bold"}}>Notes :</Text><Text style={{lineHeight:1.15}}>{d.notes.split(/(Bank Details:|Remark:)/i).map((part,index)=>/^(Bank Details:|Remark:)$/i.test(part)?<Text key={index} style={{fontWeight:"bold"}}>{part}</Text>:<Text key={index}>{part}</Text>)}</Text></View>:null}
    {p.bankDetails ? <View><Text style={S.sectionTitle}>Bank Details:</Text><Text style={S.text}>{p.bankDetails}</Text></View>:null}
    <Text style={S.footer} fixed render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`} />
  </Page></Document>;
}
