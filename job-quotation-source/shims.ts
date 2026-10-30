// HarborFlow adaptation: no telemetry and no browser persistence of Job documents.
import React from 'react';
export const captureException=()=>{};
export const captureMessage=()=>{};
export const umamiTrackEvent=()=>{};
export const memory=new Map<string,string>();
export const safeLocalStorageGetItem=(key:string)=>memory.get(key)??null;
export const safeLocalStorageSetItem=({key,value}:{key:string,value:string})=>{memory.set(key,value);if(/SELLERS|BUYERS/.test(key))window.dispatchEvent(new Event('hf-profile-change'));return true;};
export const safeLocalStorageRemoveItem=(key:string)=>{memory.delete(key);return true;};
export const isLocalStorageAvailable=()=>true;
export const useIsLocalStorageAvailable=()=>true;
export const getAppStorageItem=safeLocalStorageGetItem;
export const setAppStorageItem=safeLocalStorageSetItem;
export default function Link({children,href,...props}:any){return <a href={href} {...props}>{children}</a>;}
