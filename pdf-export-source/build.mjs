import {build} from 'esbuild';
await build({entryPoints:[new URL('./renderer.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,platform:'browser',format:'iife',globalName:'HarborFlowVectorPdf',outfile:new URL('../pdf-vector.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),minify:true,legalComments:'eof'});
