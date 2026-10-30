import fs from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';import postcss from 'postcss';import tailwind from 'tailwindcss';
const here=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
process.chdir(here);const out=path.resolve('../job-quotation');await fs.mkdir(out,{recursive:true});
const adapters={name:'harborflow-adapters',setup(b){
 b.onResolve({filter:/^(@sentry\/nextjs|next\/link|@\/lib\/(umami-analytics-track-event|safe-local-storage|use-is-local-storage-available)|@\/app\/\(app\)\/utils\/app-local-storage)$/},()=>({path:path.resolve('shims.ts')}));
 b.onLoad({filter:/shims\.ts$/},async args=>({contents:await fs.readFile(args.path,'utf8'),loader:'tsx'}));
 b.onLoad({filter:/(seller-management|buyer-management)\.tsx$/},async args=>({contents:(await fs.readFile(args.path,'utf8')).replaceAll('All data is saved locally in your browser.','Use Save quotation to save profiles privately inside this Job.'),loader:'tsx'}));
}};
const common={bundle:true,jsx:'automatic',alias:{'@':path.resolve('vendor/src'),'buffer':path.resolve('vendor-buffer/buffer/index.js'),'base64-js':path.resolve('vendor-buffer/base64-js/index.js'),'ieee754':path.resolve('vendor-buffer/ieee754/index.js')},plugins:[adapters],inject:[path.resolve('buffer-polyfill.ts')],define:{'process.env.NODE_ENV':'"production"','process.env.VERCEL_PROJECT_PRODUCTION_URL':'""','process.env':'{}','process.browser':'true'},logLevel:'info'};
const result=await build({...common,entryPoints:['entry.tsx'],outfile:path.join(out,'editor.js'),format:'esm',platform:'browser',minify:true,metafile:true,banner:{js:'/* EasyInvoicePDF © 2024-present ULADZISLAU SAZONAU. Modified for HarborFlow. AGPL-3.0; source: /job-quotation-source/README.md */'}});
await fs.writeFile('build-meta.json',JSON.stringify(result.metafile));
await build({...common,entryPoints:['server-schema.ts'],outfile:path.resolve('../lib/job-quotation-schema.mjs'),format:'esm',platform:'node',minify:true});
const css=await postcss([tailwind({content:['./entry.tsx','./vendor/src/**/*.{ts,tsx}'],theme:{extend:{colors:{background:'var(--background)',foreground:'var(--foreground)'},borderRadius:{lg:'var(--radius)',md:'calc(var(--radius) - 2px)',sm:'calc(var(--radius) - 4px)'}}},plugins:[]})]).process(await fs.readFile('style.css','utf8'),{from:'style.css'});
await fs.writeFile(path.join(out,'editor.css'),css.css);
await fs.copyFile('index.html',path.join(out,'index.html'));
await fs.copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs',path.join(out,'pdf.worker.min.mjs'));
await fs.mkdir(path.join(out,'fonts'),{recursive:true});
for(const name of ['open-sans-regular.ttf','open-sans-700.ttf','Inter-Regular.ttf','Inter-Medium.ttf','Inter-SemiBold.ttf']){
 const target=path.join(out,'fonts',name);try{await fs.access(target);}catch{const response=await fetch('https://static.easyinvoicepdf.com/'+name);if(!response.ok)throw Error('Font download failed: '+name);await fs.writeFile(target,Buffer.from(await response.arrayBuffer()));}
}
console.log('Built original EasyInvoicePDF editor and vector PDF templates.');
for(const file of await fs.readdir('font-licenses'))await fs.copyFile(path.join('font-licenses',file),path.join(out,'fonts',file));
