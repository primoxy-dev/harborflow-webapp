import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../oktb-pdf.js', import.meta.url), 'utf8');
const pixelJpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
function setup() {
  let downloaded = '', pdfBlob;
  const paint = { scale(){}, setTransform(){}, fillRect(){}, drawImage(){}, fillText(){},
    strokeRect(){}, save(){}, restore(){}, translate(){}, rotate(){},
    measureText(value){ return { width: String(value).length * 5 }; } };
  const document = {
    createElement(tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => paint,
        toDataURL: () => 'data:image/jpeg;base64,' + pixelJpeg };
      return { click(){}, remove(){}, set href(_) {}, set download(value) { downloaded = value; } };
    },
    body: { appendChild() {} }
  };
  const window = {};
  const URL = { createObjectURL(blob) { pdfBlob = blob; return 'blob:test'; }, revokeObjectURL() {} };
  vm.runInNewContext(source, { window, document, URL, Blob, TextEncoder, Uint8Array, atob,
    setTimeout() {}, getComputedStyle() { return { backgroundImage: 'none' }; } });
  return { api: window.HarborFlowOktbPdf, getDownload: () => ({ downloaded, pdfBlob }) };
}

test('OKTB filenames use the person or group nationalities and vessel in uppercase', () => {
  const { api } = setup();
  const single = [{ name: 'Mr. Yayak', nationality: 'Indian' }];
  assert.equal(api.fileName(single, 'MT Ocean Pride'), 'OKTB - MR. YAYAK (MT OCEAN PRIDE).PDF');
  assert.equal(api.fileName([...single, { name: 'A', nationality: 'Filipino' }], 'MT Ocean Pride'),
    'OKTB - INDIAN & FILIPINO (MT OCEAN PRIDE).PDF');
});

test('download produces a PDF file for selected crew', async () => {
  const { api, getDownload } = setup();
  const person = { name: 'Mr. Yayak', nationality: 'Indian', rank: 'Engineer',
    dob: '1990-01-01', seamanBook: 'SB1', passport: 'P1', passportExpiry: '2030-01-01',
    flights: [{ airline: '8B', number: '381', date: '26SEP', from: 'CGK',
      to: 'BKK', departure: '0820', arrival: '1145', booking: 'PNR1' }] };
  await api.download({ preview: { job: { vessel: 'MT Ocean Pride', port: 'Map Ta Phut' } },
    people: [person], ctx: { issueDate: '2026-10-02', arrivalDate: '2026-10-03', airline: 'BUSINESSAIR' },
    profile: { contact: 'Test', phone: '000', signer: 'Test Signer' }, logo: null });
  const { downloaded, pdfBlob } = getDownload();
  assert.equal(downloaded, 'OKTB - MR. YAYAK (MT OCEAN PRIDE).PDF');
  const bytes = Buffer.from(await pdfBlob.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(bytes.toString('latin1'), /\/Type \/Page /);
  assert.ok(bytes.length > 1000);
});


test('five crew and two flights fit on one PDF page', async () => {
  const { api, getDownload } = setup();
  const people = Array.from({length:5},(_,i)=>({name:'MR. CREW MEMBER '+i,nationality:'INDONESIAN',rank:'MASTER',dob:'1990-10-14',seamanBook:'ABC12345',passport:'DEF12345',passportExpiry:'2030-01-01',flights:i<2?[{airline:'8B',number:'381',date:'26SEP',from:'CGK',to:'BKK',departure:'0820',arrival:'1145',booking:''}]:[]}));
  people[4].flights=[{airline:'T',number:'',date:'',from:'',to:'',departure:'0900',arrival:'0800+1',booking:''}];
  await api.download({preview:{job:{vessel:'TASCO TARA',port:'MAP TA PHUT / IRPC'}},people,ctx:{issueDate:'2026-10-02',arrivalDate:'2026-09-25',airline:'BUSINESSAIR / T'},profile:{contact:'[contact not set]',phone:'[phone not set]',signer:'[signatory not set]'},logo:null});
  const bytes=Buffer.from(await getDownload().pdfBlob.arrayBuffer()).toString('latin1');
  const pages=(bytes.match(/\/Type \/Page /g)||[]).length;
  assert.equal(pages,1);
});
