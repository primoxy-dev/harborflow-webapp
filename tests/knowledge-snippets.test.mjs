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
