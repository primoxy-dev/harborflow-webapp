import { GripVertical, Plus, Trash2 } from "lucide-react";
import { memo, useRef, useState } from "react";
import {
  type Control,
  Controller,
  type FieldArrayWithId,
  type FieldErrors,
  type UseFieldArrayAppend,
} from "react-hook-form";

import { inputErrorClassName } from "@/app/(app)/components/invoice-form/common";
import {
  type InvoiceData,
  type SupportedCurrencies,
  type SupportedLanguages,
  MAX_INVOICE_ITEMS,
} from "@/app/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { CustomTooltip } from "@/components/ui/tooltip";
import { umamiTrackEvent } from "@/lib/umami-analytics-track-event";

const ErrorMessage = ({ children }: { children: React.ReactNode }) => {
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
};

interface InvoiceItemsSettingsProps {
  control: Control<InvoiceData>;
  fields: FieldArrayWithId<InvoiceData, "items">[];
  handleRemoveInvoiceItem: (index: number) => void;
  handleMoveInvoiceItem: (from: number, to: number) => void;
  append: UseFieldArrayAppend<InvoiceData, "items">;
  errors: FieldErrors<InvoiceData>;
  currency: SupportedCurrencies;
  language: SupportedLanguages;
  template: InvoiceData["template"];
  taxLabelText: string;
  invoiceData: InvoiceData;
}

export const InvoiceItems = memo(function InvoiceItems({
  control,
  fields,
  handleRemoveInvoiceItem,
  handleMoveInvoiceItem,
  errors,
  currency,
  append,
  template,
  taxLabelText,
  invoiceData,
}: InvoiceItemsSettingsProps) {
  const [deleteItemIndex, setDeleteItemIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const hasReachedItemLimit = fields.length >= MAX_INVOICE_ITEMS;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-medium">Invoice Items</h3>
      <CustomTooltip
        trigger={
          <Button
            onClick={() => {
              append({
                invoiceItemNumberIsVisible: true,
                name: "",
                nameFieldIsVisible: true,
                amount: 1,
                amountFieldIsVisible: true,
                unit: "",
                unitFieldIsVisible: true,
                netPrice: 0,
                netPriceFieldIsVisible: true,
                vat: "NP",
                vatFieldIsVisible: true,
                netAmount: 0,
                netAmountFieldIsVisible: true,
                vatAmount: 0,
                vatAmountFieldIsVisible: true,
                preTaxAmount: 0,
                preTaxAmountFieldIsVisible: true,
                typeOfGTU: "",
                typeOfGTUFieldIsVisible: true,
              });

              umamiTrackEvent("add_invoice_item");
            }}
            variant="default"
            disabled={hasReachedItemLimit}
            className="gap-2"
          >
            <Plus className="size-4" />
            Add Item
          </Button>
        }
        content={
          hasReachedItemLimit
            ? `Invoices support at most ${MAX_INVOICE_ITEMS} line items`
            : "Add a new line item with name, quantity, price and tax details"
        }
        side="bottom"
        showArrow
      />

      </div>
      <div className="mb-3 flex items-center gap-2">
        <Controller name="items.0.unitFieldIsVisible" control={control} render={({field: {value, onChange, ...field}}) => (
          <Switch {...field} id="itemUnitFieldIsVisible0" checked={value} onCheckedChange={onChange} aria-label="Show Unit in PDF" />
        )} />
        <Label htmlFor="itemUnitFieldIsVisible0">Show Unit in PDF</Label>
      </div>
      {template !== "pda" && <div className="mb-3 flex items-center gap-2">
        <Controller name="items.0.vatFieldIsVisible" control={control} render={({field: {value, onChange, ...field}}) => (
          <Switch {...field} id="itemTaxFieldIsVisible0" checked={value} onCheckedChange={onChange} aria-label="Show Tax in PDF" />
        )} />
        <Label htmlFor="itemTaxFieldIsVisible0">Show Tax in PDF</Label>
      </div>}
      {template === "pda" && invoiceData.items.some(item => Number(item.vatAmount) > 0) && <p role="status" className="mb-3 text-sm text-amber-800">Existing tax is included in the total. Switch to another invoice template to review or edit tax.</p>}
      <div className="mb-4 overflow-x-auto rounded-lg border">
        <table className={`w-full min-w-[760px] border-collapse text-sm ${template === "pda" ? "pda-items" : ""}`}>
          <thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-2 font-medium">Description</th><th className="p-2 font-medium">Quantity</th>
            <th className="p-2 font-medium">Unit</th><th className="p-2 font-medium">Unit cost</th><th className="p-2 font-medium">{template === "pda" ? "Category" : "Tax"}</th>
            <th className="p-2 text-right font-medium">Line total</th><th className="p-2"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{fields.map((item, index) => (
            <tr key={item.id} data-invoice-item-index={index} data-pda-category={template === "pda" ? (invoiceData.items?.[index]?.pdaGroup || "").trim().toUpperCase() : undefined} className="border-b last:border-0 align-top">
              <td className="min-w-[200px] p-2"><div className="invoice-item-name"><button type="button" className="invoice-item-grip" aria-label={`Move item ${index + 1}: drag or use arrow keys`} title="Drag to reorder; use arrow keys for keyboard" onPointerDown={event => { if (event.button !== 0) return; dragIndex.current = index; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={event => { const from = dragIndex.current; dragIndex.current = null; const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-invoice-item-index]'); const to = Number(row?.getAttribute('data-invoice-item-index')); if (from !== null && row && Number.isInteger(to)) handleMoveInvoiceItem(from, to); }} onPointerCancel={() => { dragIndex.current = null; }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); handleMoveInvoiceItem(index, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><GripVertical size={18} aria-hidden="true" /></button><Controller control={control} name={`items.${index}.name`} render={({field}) => <Input {...field} aria-label={`Description ${index + 1}`} placeholder="Description" className={inputErrorClassName(!!errors.items?.[index]?.name)} />} /></div>{errors.items?.[index]?.name && <ErrorMessage>{errors.items[index]?.name?.message}</ErrorMessage>}</td>
              <td className="w-24 p-2"><Controller control={control} name={`items.${index}.amount`} render={({field}) => <Input {...field} aria-label={`Quantity ${index + 1}`} type="number" min="0" step={template === "pda" ? "1" : "0.01"} inputMode={template === "pda" ? "numeric" : "decimal"} onChange={event => { if (template !== "pda" || event.target.value === "" || /^\d+$/.test(event.target.value)) field.onChange(event); }} className={inputErrorClassName(!!errors.items?.[index]?.amount)} />} />{errors.items?.[index]?.amount && <ErrorMessage>{errors.items[index]?.amount?.message}</ErrorMessage>}{template === "pda" && !Number.isInteger(Number(invoiceData.items?.[index]?.amount)) && <ErrorMessage>Use a whole number for CREW quantities.</ErrorMessage>}</td>
              <td className="w-32 p-2"><Controller control={control} name={`items.${index}.unit`} render={({field}) => <Input {...field} aria-label={`Unit ${index + 1}`} placeholder="Unit" className={inputErrorClassName(!!errors.items?.[index]?.unit)} />} />{errors.items?.[index]?.unit && <ErrorMessage>{errors.items[index]?.unit?.message}</ErrorMessage>}</td>
              <td className="w-40 p-2"><Controller control={control} name={`items.${index}.netPrice`} render={({field}) => <MoneyInput {...field} aria-label={`Unit cost ${index + 1}`} currency={currency} type="number" min="0" step="0.01" className={inputErrorClassName(!!errors.items?.[index]?.netPrice)} />} />{errors.items?.[index]?.netPrice && <ErrorMessage>{errors.items[index]?.netPrice?.message}</ErrorMessage>}</td>
              {template === "pda" ? <td className="w-40 p-2"><Controller control={control} name={`items.${index}.pdaGroup`} render={({field}) => <Input {...field} value={field.value ?? ""} aria-label={`Category ${index + 1}`} placeholder="Category" />} /></td> : <td className="w-24 p-2"><Controller control={control} name={`items.${index}.vat`} render={({field}) => <Input {...field} aria-label={`Tax ${index + 1}`} placeholder="Tax" className={inputErrorClassName(!!errors.items?.[index]?.vat)} />} />{errors.items?.[index]?.vat && <ErrorMessage>{errors.items[index]?.vat?.message}</ErrorMessage>}</td>}
              <td className="whitespace-nowrap p-2 pt-4 text-right font-medium">{(Number(invoiceData.items?.[index]?.netAmount) || 0).toLocaleString("en-US", {style: "currency", currency})}</td>
              <td className="p-2">{index > 0 && <Button type="button" variant="ghost" size="icon" aria-label={`Delete item ${index + 1}`} onClick={() => setDeleteItemIndex(index)}><Trash2 className="size-4" /></Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {/** we only want to show "Show Number Column" and "Show Tax Table Summary" settings for default template */}
      {template === "default" ? (
        <div className="mt-6 space-y-4 rounded-md border p-4">
          {/* Show Number column on PDF switch */}
          <div className="relative flex items-center justify-between gap-2">
            <Label
              htmlFor={`itemInvoiceItemNumberIsVisible0`}
              className="text-balance font-medium"
            >
              Show &quot;Number&quot; Column in the Items and pricing table
            </Label>

            <Controller
              name={`items.0.invoiceItemNumberIsVisible`}
              control={control}
              render={({ field: { value, onChange, ...field } }) => {
                return (
                  <Switch
                    {...field}
                    id={`itemInvoiceItemNumberIsVisible0`}
                    checked={value}
                    onCheckedChange={onChange}
                    className="h-5 w-8 [&_span]:size-4 [&_span]:data-[state=checked]:translate-x-3 rtl:[&_span]:data-[state=checked]:-translate-x-3"
                  />
                );
              }}
            />
          </div>

          {/* Show Tax Table Summary in PDF switch */}
          <div className="relative flex items-center justify-between gap-2">
            <Label
              htmlFor={`vatTableSummaryIsVisible`}
              className="text-balance"
            >
              Show &quot;{taxLabelText} Table Summary&quot; in the PDF
            </Label>

            <Controller
              name={`vatTableSummaryIsVisible`}
              control={control}
              render={({ field: { value, onChange, ...field } }) => {
                return (
                  <Switch
                    {...field}
                    id={`vatTableSummaryIsVisible`}
                    checked={value}
                    onCheckedChange={onChange}
                    className="h-5 w-8 [&_span]:size-4 [&_span]:data-[state=checked]:translate-x-3 rtl:[&_span]:data-[state=checked]:-translate-x-3"
                  />
                );
              }}
            />
          </div>
        </div>
      ) : null}

      <DeleteInvoiceItemConfirmationDialog
        deleteItemIndex={deleteItemIndex}
        setDeleteItemIndex={setDeleteItemIndex}
        handleRemoveInvoiceItem={handleRemoveInvoiceItem}
        invoiceData={invoiceData}
      />
    </>
  );
});

interface DeleteInvoiceItemConfirmationDialogProps {
  deleteItemIndex: number | null;
  setDeleteItemIndex: (index: number | null) => void;
  handleRemoveInvoiceItem: (index: number) => void;
  invoiceData: InvoiceData;
}

/**
 * A confirmation dialog for deleting an invoice item.
 */
function DeleteInvoiceItemConfirmationDialog({
  deleteItemIndex = 0,
  setDeleteItemIndex,
  handleRemoveInvoiceItem,
  invoiceData,
}: DeleteInvoiceItemConfirmationDialogProps) {
  const itemNumber = deleteItemIndex ?? 0;

  const itemName =
    invoiceData?.items?.[itemNumber]?.name || `#${itemNumber + 1}`;

  return (
    <AlertDialog
      open={deleteItemIndex !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteItemIndex(null);
      }}
    >
      <AlertDialogContent data-testid="delete-invoice-item-confirmation-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Invoice Item</AlertDialogTitle>
          <AlertDialogDescription className="text-balance">
            Are you sure you want to delete the invoice item{" "}
            <strong>&quot;{itemName}&quot;</strong>? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (deleteItemIndex !== null) {
                handleRemoveInvoiceItem(deleteItemIndex);
                setDeleteItemIndex(null);
              }
            }}
            className="bg-red-500 text-red-50 hover:bg-red-500/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
