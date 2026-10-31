import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer/lib/react-pdf.browser";
import type { InvoiceData } from "@/app/schema";

const S = StyleSheet.create({
  page:{paddingTop:30,paddingBottom:35,paddingHorizontal:30,fontFamily:"Helvetica",fontSize:8,color:"#173967"},
  header:{flexDirection:"row",justifyContent:"space-between",minHeight:62},
  seller:{flexGrow:1}, letterhead:{width:"100%",height:70,objectFit:"contain",objectPosition:"left",marginBottom:4}, sellerName:{fontSize:10,fontWeight:"bold"}, logo:{width:58,maxHeight:42,objectFit:"contain",marginBottom:4},
  band:{backgroundColor:"#8fb7a7",color:"#fff",paddingVertical:11,textAlign:"center",fontSize:16,fontWeight:"bold",marginTop:5,marginBottom:7},
  grid:{borderWidth:0.7,borderColor:"#202020"}, gridRow:{flexDirection:"row",borderBottomWidth:0.5,borderColor:"#202020",minHeight:16},
  cellLabel:{width:"13%",padding:3,borderRightWidth:0.5,borderColor:"#202020"}, cellValue:{width:"20.33%",padding:3,borderRightWidth:0.5,borderColor:"#202020"},
  tableHeader:{flexDirection:"row",borderWidth:0.7,borderColor:"#202020",marginTop:8,minHeight:31},
  expense:{width:"39%",padding:4}, local:{width:"16%",padding:4,borderLeftWidth:0.5,borderColor:"#202020",textAlign:"right"},
  quoted:{width:"16%",padding:4,borderLeftWidth:0.5,borderColor:"#202020",textAlign:"right"}, comment:{width:"29%",padding:4,borderLeftWidth:0.5,borderColor:"#202020"},
  heading:{fontWeight:"bold",textAlign:"center"}, row:{flexDirection:"row",borderLeftWidth:0.7,borderRightWidth:0.7,borderBottomWidth:0.5,borderColor:"#202020",minHeight:20},
  group:{backgroundColor:"#fff100",color:"#173967",fontWeight:"bold",padding:4,borderLeftWidth:0.7,borderRightWidth:0.7,borderBottomWidth:0.5,borderColor:"#202020"},
  total:{flexDirection:"row",borderWidth:0.7,borderColor:"#202020",padding:5,justifyContent:"space-between",fontWeight:"bold"},
  sectionTitle:{fontWeight:"bold",marginTop:9,marginBottom:3}, text:{lineHeight:1.35}, footer:{position:"absolute",bottom:15,left:30,right:30,textAlign:"right",fontSize:7,color:"#737373"}
});
const number = (n: number) => Number.isFinite(n) ? n.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
export function PdaInvoicePdfTemplate({invoiceData:d}:{invoiceData:InvoiceData}) {
  const p=d.pda || {}; const rate=Number(p.exchangeRate); const hasRate=Boolean(p.exchangeRate) && Number.isFinite(rate) && rate>0;
  const local=p.localCurrency?.trim() || "Local"; const currency=d.currency; const showLocal=hasRate && Boolean(p.localCurrency?.trim()); const localTotal=d.items.reduce((sum,item)=>sum+Math.round((Number(item.preTaxAmount)*rate+Number.EPSILON)*100),0)/100; let previousGroup="";
  const rows: [string,string,string,string,string,string][] = [
    ["Company",d.buyer.name,"Charterer",p.charterer || "","Port",p.port || ""],
    ["Vessel",p.vessel || "","", "","Job No.",p.jobNo || ""],
    ["ETA",p.eta || "","Purpose of call",p.purpose || "","Rate",hasRate ? `${number(rate)} ${local} / ${currency}` : ""],
    ["ETD",p.etd || "","Local agent",p.localAgent || "","DWT",p.dwt || ""],
    ["LOA (FT)",p.loa || "","GRT",p.grt || "","NRT",p.nrt || ""],
    ["DRAFT (FT)",p.draft || "","D/A Date",d.dateOfIssue || "","Currency",currency]
  ];
  return <Document title="Estimated Proforma D/A"><Page size="A4" style={S.page} wrap>
    <View style={S.header}><View style={S.seller}>{d.logo ? <Image src={d.logo} style={S.logo} /> : <Image src="/job-quotation/gac-letterhead.png" style={S.letterhead} />}</View></View>
    <Text style={S.band}>Estimated Proforma D/A</Text>
    <View style={S.grid}>{rows.map((r,i)=><View key={i} style={[S.gridRow,i===rows.length-1?{borderBottomWidth:0}:{}]}>{r.map((value,j)=><Text key={j} style={[j%2===0?S.cellLabel:S.cellValue,j===5?{borderRightWidth:0}:{}]}>{value}</Text>)}</View>)}</View>
    <View style={S.tableHeader} wrap={false}><Text style={[S.expense,S.heading]}>HUSBANDRY EXPENSES</Text><Text style={[S.local,S.heading]}>D/A {local}{"\n"}TOTAL</Text><Text style={[S.quoted,S.heading]}>D/A {currency}{"\n"}PER UNIT</Text><Text style={[S.comment,S.heading]}>COMMENTS</Text></View>
    {d.items.map((item,index)=>{const group=(item.pdaGroup || "").trim();const show=Boolean(group)&&group!==previousGroup;previousGroup=group;return <View key={index} wrap={false}>{show?<Text style={S.group}>{group.toUpperCase()}</Text>:null}<View style={S.row}><Text style={S.expense}>{item.name}</Text><Text style={S.local}>{showLocal?number(Number(item.preTaxAmount)*rate):"—"}</Text><Text style={S.quoted}>{number(Number(item.netPrice))}</Text><Text style={S.comment}>{[item.pdaComment, `Qty: ${item.amount}${d.items[0].unitFieldIsVisible && item.unit ? ` ${item.unit}` : ""}`, d.items[0].vatFieldIsVisible ? `Tax: ${item.vat}` : ""].filter(Boolean).join(" · ")}</Text></View></View>})}
    <View style={S.total} wrap={false}><Text>Total Disbursement Account</Text><Text>{showLocal?`${local} ${number(localTotal)}  ·  `:""}{currency} {number(Number(d.total))}</Text></View>
    {d.notesFieldIsVisible && d.notes ? <View><Text style={S.sectionTitle}>Notes:</Text><Text style={S.text}>{d.notes}</Text></View>:null}
    {p.bankDetails ? <View><Text style={S.sectionTitle}>Bank Details:</Text><Text style={S.text}>{p.bankDetails}</Text></View>:null}
    <Text style={S.footer} fixed render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`} />
  </Page></Document>;
}
