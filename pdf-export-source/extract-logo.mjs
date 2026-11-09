import fs from 'node:fs';
const src=fs.readFileSync('job-quotation-source/vendor/src/app/(app)/components/invoice-templates/invoice-pdf-pda-template/gac-logo.tsx','utf8');
const paths=[...src.matchAll(/<Path d="([^"]+)" fill="([^"]+)"/g)].map(m=>({d:m[1],fill:m[2]}));
fs.writeFileSync('pdf-export-source/gac-logo.mjs','// Vector paths from the user-supplied GAC logo.\nexport const logo = '+JSON.stringify({viewBox:[-2.01847503,-2.01847503,83.04445006,71.31945106],paths})+';\n');
