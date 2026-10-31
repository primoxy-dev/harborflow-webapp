import { useEffect, useState } from "react";
import { Controller, type Control, type UseFormGetValues, type UseFormSetValue } from "react-hook-form";
import type { InvoiceData } from "@/app/schema";
import { Input } from "@/components/ui/input";
import { formatPdaDate } from "@/app/(app)/utils/format-pda-date";

const fields = [
  ["vessel", "Vessel"], ["jobNo", "Job No."], ["port", "Port"],
  ["eta", "ETA"], ["etd", "ETD"], ["charterer", "Charterer"],
  ["purpose", "Purpose of call"], ["localAgent", "Local agent"],
  ["loa", "LOA (FT)"], ["draft", "Draft (FT)"], ["grt", "GRT"],
  ["dwt", "DWT"], ["nrt", "NRT"], ["localCurrency", "Local currency (e.g. THB)"],
  ["exchangeRate", "Local currency per 1 quoted currency unit"]
] as const;

export function PdaFields({ control, getValues, setValue, vesselLookup }: { control: Control<InvoiceData>; getValues: UseFormGetValues<InvoiceData>; setValue: UseFormSetValue<InvoiceData>; vesselLookup?: {vessel?:string; imo?:string; jobNo?:string; port?:string} }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const vessel = vesselLookup?.vessel, imo = vesselLookup?.imo;
    if (!vessel || !imo) return;
    let active = true;
    void fetch("/api/vessel?mode=specs&name=" + encodeURIComponent(vessel) + "&imo=" + encodeURIComponent(imo), {credentials:"same-origin"})
      .then(r => r.ok ? r.json() : null).then(result => {
        if (!active || !result?.matched || getValues("pda.vessel") !== vessel) return;
        for (const key of ["loa", "draft", "grt", "nrt"] as const) {
          const path = ("pda." + key) as "pda.loa" | "pda.draft" | "pda.grt" | "pda.nrt";
          if (!getValues(path) && typeof result.specs?.[key] === "string" && result.specs[key]) setValue(path, result.specs[key], {shouldDirty:true, shouldValidate:true});
        }
        if (result.url) setSource(result.url);
      }).catch(() => {});
    return () => { active = false; };
  }, [vesselLookup?.vessel, vesselLookup?.imo, getValues, setValue]);
  useEffect(() => {
    let active=true;
    const jobId=new URLSearchParams(location.search).get('jobId') || '';
    const originalNotes = 'Vessel: '+(vesselLookup?.vessel || '')+'\nJob No.: '+(vesselLookup?.jobNo || '')+'\nPort: '+(vesselLookup?.port || '');
    const currentNotes=getValues('notes') || '';
    if (currentNotes.trim() && currentNotes !== originalNotes) return;
    void fetch('/api/job-quotation?jobId='+encodeURIComponent(jobId)+'&mode=crew-catalog',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(result=>{
      if(!active || !result?.defaultNotes)return;
      const latest=getValues('notes') || '';
      if(!latest.trim() || latest===originalNotes){setValue('notes',result.defaultNotes,{shouldDirty:true,shouldValidate:true});setValue('notesFieldIsVisible',true,{shouldDirty:true});}
    }).catch(()=>{});
    return ()=>{active=false;};
  }, [getValues,setValue,vesselLookup?.vessel,vesselLookup?.jobNo,vesselLookup?.port]);
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Proforma D/A details">
    <h3 className="font-medium">Proforma D/A details</h3>
    <p className="text-sm text-slate-600">Vessel specifications are looked up using the Job IMO when available. Verify reference draft and any missing values. {source && <a href={source} target="_blank" rel="noreferrer">Wikidata source</a>}</p>
    <p className="text-sm text-slate-600">The quoted currency is selected above. Enter an exchange rate to show estimated local amounts.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(([key,label]) =>
      <label key={key} className="text-sm">{label}<Controller control={control} name={`pda.${key}`} render={({field}) => <Input {...field} value={field.value ?? ""} aria-label={label} placeholder={key === "eta" || key === "etd" ? "20-OCT-26 @ 0800LT" : undefined} onBlur={() => { if (key === "eta" || key === "etd") field.onChange(formatPdaDate(field.value)); field.onBlur(); }} inputMode={key === "exchangeRate" ? "decimal" : undefined} />} /></label>
    )}</div>

  </section>;
}

export function PdaLayout({control}:{control:Control<InvoiceData>}) { return <fieldset className="rounded-md border p-3 space-y-2"><legend className="font-medium">PDF Live layout</legend><label className="block text-sm">Font size <Controller control={control} name="pda.pdfFontSize" render={({field}) => <select {...field} value={field.value ?? 8} onChange={e => field.onChange(Number(e.target.value))} className="ml-2 rounded border p-1" aria-label="PDF font size">{[6,7,8,9,10,11,12].map(size=><option key={size} value={size}>{size} pt</option>)}</select>} /></label><p className="text-xs text-slate-600">Adjust the relative width of each PDF column.</p>{([['description','Description',39],['cost','Cost',13],['unit','Unit',23],['quantity','Quantity',9],['total','Line Total',16]] as const).map(([key,label,initial])=><label className="flex items-center gap-2 text-sm" key={key}><span className="w-24">{label}</span><Controller control={control} name={('pda.pdfWidths.'+key) as 'pda.pdfWidths.description'} render={({field})=><input type="range" min="5" max="60" value={field.value ?? initial} onChange={e=>field.onChange(Number(e.target.value))} aria-label={label+' PDF width'} />} /></label>)}</fieldset>; }
