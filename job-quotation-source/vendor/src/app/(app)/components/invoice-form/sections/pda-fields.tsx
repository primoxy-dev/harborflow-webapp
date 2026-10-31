import { Controller, type Control } from "react-hook-form";
import type { InvoiceData } from "@/app/schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fields = [
  ["vessel", "Vessel"], ["jobNo", "Job No."], ["port", "Port"],
  ["eta", "ETA"], ["etd", "ETD"], ["charterer", "Charterer"],
  ["purpose", "Purpose of call"], ["localAgent", "Local agent"],
  ["loa", "LOA (FT)"], ["draft", "Draft (FT)"], ["grt", "GRT"],
  ["dwt", "DWT"], ["nrt", "NRT"], ["localCurrency", "Local currency (e.g. THB)"],
  ["exchangeRate", "Local currency per 1 quoted currency unit"]
] as const;

export function PdaFields({ control }: { control: Control<InvoiceData> }) {
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Proforma D/A details">
    <h3 className="font-medium">Proforma D/A details</h3>
    <p className="text-sm text-slate-600">The quoted currency is selected above. Enter an exchange rate to show estimated local amounts.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(([key,label]) =>
      <label key={key} className="text-sm">{label}<Controller control={control} name={`pda.${key}`} render={({field}) => <Input {...field} value={field.value ?? ""} aria-label={label} inputMode={key === "exchangeRate" ? "decimal" : undefined} />} /></label>
    )}</div>
    <label className="block text-sm">Bank details (optional)<Controller control={control} name="pda.bankDetails" render={({field}) => <Textarea {...field} value={field.value ?? ""} aria-label="Bank details" rows={3} />} /></label>
  </section>;
}
