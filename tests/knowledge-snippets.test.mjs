import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnippetsRoute} from '../lib/knowledge-snippets.mjs';

test('text library requires named access and restricts editing to Knowledge editors',async()=>{
 let login=null,grants={};let writes=0;
 const route=createSnippetsRoute({ready:()=>true,getLogin:()=>login,getGrants:async()=>grants,read:async()=>null,write:async()=>{writes++;return {content:{sha:'new'}};}});
 assert.equal((await route(new Request('https://example.com/api/knowledge-snippets'))).status,401);
 login='viewer';assert.equal((await route(new Request('https://example.com/api/knowledge-snippets'))).status,403);
 grants={contactView:true};assert.equal((await route(new Request('https://example.com/api/knowledge-snippets'))).status,200);
 const req=()=>new Request('https://example.com/api/knowledge-snippets',{method:'PUT',headers:{origin:'https://example.com'},body:JSON.stringify({revision:null,items:[{id:'one',title:'Hello',text:'Line 1\nLine 2'}]})});
 assert.equal((await route(req())).status,403);grants={restrictionEdit:true};assert.equal((await route(req())).status,200);assert.equal(writes,1);
});
test('text library prevents cross-origin writes and overwriting a newer revision',async()=>{
 let writes=0;const route=createSnippetsRoute({ready:()=>true,getLogin:()=> 'editor',getGrants:async()=>({restrictionEdit:true}),read:async()=>({sha:'newer',data:{items:[]}}),write:async()=>{writes++;}});
 const req=(origin,revision)=>new Request('https://example.com/api/knowledge-snippets',{method:'PUT',headers:{origin},body:JSON.stringify({revision,items:[]})});
 assert.equal((await route(req('https://evil.com','newer'))).status,403);
 assert.equal((await route(req('https://example.com','old'))).status,409);
 assert.equal(writes,0);
});

test('images are private, validated, and stored separately from the topic list',async()=>{
 let login='editor',grants={restrictionEdit:true},storedPath='',storedBody;
 const route=createSnippetsRoute({ready:()=>true,getLogin:()=>login,getGrants:async()=>grants,read:async()=>null,write:async(method,path,body)=>{if(method==='PUT'){storedPath=path;storedBody=body;return {};}return {content:storedBody.content};}});
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const upload=(origin,image)=>new Request('https://example.com/api/knowledge?mode=text-library',{method:'POST',headers:{origin},body:JSON.stringify({image})});
 assert.equal((await route(upload('https://evil.com','data:image/png;base64,'+png))).status,403);
 assert.equal((await route(upload('https://example.com','data:image/png;base64,SGVsbG8gd29ybGQh'))).status,400);
 const result=await route(upload('https://example.com','data:image/png;base64,'+png));assert.equal(result.status,200);const {id}=await result.json();assert.match(storedPath,/^Knowledge\/text-images\//);
 const image=()=>new Request('https://example.com/api/knowledge?mode=text-library&image='+id);
 assert.equal((await route(image())).headers.get('content-type'),'image/png');login=null;assert.equal((await route(image())).status,401);
 login='viewer';grants={contactView:true};assert.equal((await route(image())).status,200);assert.equal((await route(upload('https://example.com','data:image/png;base64,'+png))).status,403);
});

test('formatted tables and existing image references survive saving',async()=>{
 let stored;const route=createSnippetsRoute({ready:()=>true,getLogin:()=> 'editor',getGrants:async()=>({restrictionEdit:true}),read:async()=>null,write:async(method,path,body)=>{stored=JSON.parse(Buffer.from(body.content,'base64').toString());return {content:{sha:'new'}};}});
 const html='<p>Visa</p><table><tbody><tr><td>Thai</td><td>Yes</td></tr></tbody></table><img src="/api/knowledge?mode=text-library&image=11111111-1111-4111-8111-111111111111.png">';
 const response=await route(new Request('https://example.com/api/knowledge?mode=text-library',{method:'PUT',headers:{origin:'https://example.com'},body:JSON.stringify({revision:null,items:[{id:'one',title:'Test',text:'Visa',html}]})}));
 assert.equal(response.status,200);assert.equal(stored.items[0].html,html);
});
