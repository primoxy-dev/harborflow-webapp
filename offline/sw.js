// Public static templates only. Never cache authenticated pages, APIs or drafts.
const CACHE='harborflow-offline-documents-v1';
const paths=['./','./index.html','./app.mjs','./style.css','./draft-store.mjs','../documents.js','../documents.css','../oktb-pdf.js','../permit-draft.mjs','../lib/document-preview.mjs'];
const urls=paths.map(path=>new URL(path,self.location.href).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(urls))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('harborflow-offline-documents-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!urls.includes(event.request.url))return;event.respondWith((async()=>{const cached=await caches.match(event.request,{cacheName:CACHE});return cached||fetch(event.request);})());});
