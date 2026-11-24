import {normalizeDocumentDate} from './crew-document-field-labels.mjs';

const clean=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// An existing record is safe to update only when it is uniquely identified
// and any birth dates or passport numbers present in both records agree.
export function assessExistingMatch(matches,fields={}){
 if(!Array.isArray(matches)||matches.length!==1)return {safe:false,reason:matches?.length?'Multiple people match':'No unique match'};
 const existing=matches[0]?.data||matches[0]||{};
 const a=normalizeDocumentDate(fields.dob||''),b=normalizeDocumentDate(existing.dob||'');
 if(fields.dob&&existing.dob&&(!a||!b||a!==b))return {safe:false,reason:'Birth date differs or could not be checked'};
 const passport=clean(fields.passport),savedPassport=clean(existing.passport);
 if(passport&&savedPassport&&passport!==savedPassport)return {safe:false,reason:'Passport number differs'};
 if(!(a&&b&&a===b)&&!(passport&&savedPassport&&passport===savedPassport))return {safe:false,reason:'No matching birth date or passport number to confirm identity'};
 return {safe:true,person:matches[0]};
}
