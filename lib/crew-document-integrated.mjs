import {extractVisibleFields,normalizeDocumentDate} from './crew-document-field-labels.mjs';

// The existing OCR recognises the page and its MRZ. The newer printed-label
// parser supplements missing values only where the recognised fields agree;
// a disagreement is surfaced rather than replacing an existing value.
export function reconcilePrintedFields(result,text,type,normalizeNationality=value=>value){
 if(!['passport','seamanBook'].includes(type))return result;
 const visible=extractVisibleFields(text,type),fields={...(result.fields||{})};
 const warnings=[...(result.extractionWarnings||[])];
 const same=(a,b)=>String(a||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(b||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 for(const key of type==='passport'?['passport','dob','passportExpiry','nationality']:['seamanBook','dob','seamanBookExpiry']){
  if(visible.conflicts.includes(key)||!visible.fields[key])continue;
  let value=visible.fields[key];
  if(['dob','passportExpiry','seamanBookExpiry'].includes(key))value=normalizeDocumentDate(value);
  if(key==='nationality')value=normalizeNationality(value);
  if(!value)continue;
  if(fields[key]&&!same(fields[key],value)){warnings.push(`Printed ${key} differs from the extracted value; review the original.`);continue;}
  // The visible-only parser proposes candidates. Only add a date to a book
  // after its document number independently agrees with the established OCR.
  if(!fields[key]&&type==='seamanBook'&&key==='dob'&&fields.seamanBook&&same(fields.seamanBook,visible.fields.seamanBook))fields[key]=value;
 }
 return {...result,fields,extractionWarnings:warnings,visibleFieldsOnly:true};
}
