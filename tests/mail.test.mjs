import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailRoute} from '../api/mail.mjs';

test('Outlook connection requires a HarborFlow login and protects the OAuth state', async () => {
 process.env.MICROSOFT_CLIENT_ID='client'; process.env.MICROSOFT_CLIENT_SECRET='secret'; process.env.HARBORFLOW_SESSION_SECRET='test-secret';
 const unauthorized=createMailRoute({loginFromRequest:()=>null});
 assert.equal((await unauthorized(new Request('https://example.test/api/mail?action=start'))).status,401);
 const route=createMailRoute({loginFromRequest:()=> 'alice'});
 const start=await route(new Request('https://example.test/api/mail?action=start'));
 assert.equal(start.status,302);const target=new URL(start.headers.get('location'));assert.equal(target.searchParams.get('code_challenge_method'),'S256');
 assert.equal(target.searchParams.get('scope'),'openid profile User.Read Mail.Read');
 const cookie=start.headers.get('set-cookie').split(';')[0];
 const invalid=await route(new Request('https://example.test/api/mail?action=callback&code=abc&state=wrong',{headers:{cookie}}));assert.equal(invalid.status,403);
 const other=createMailRoute({loginFromRequest:()=> 'bob'});
 const swapped=await other(new Request(`https://example.test/api/mail?action=callback&code=abc&state=${target.searchParams.get('state')}`,{headers:{cookie}}));assert.equal(swapped.status,403);
});

test('valid Outlook session reads only its signed-in user and whitelisted folders', async () => {
 process.env.MICROSOFT_CLIENT_ID='client'; process.env.MICROSOFT_CLIENT_SECRET='secret'; process.env.HARBORFLOW_SESSION_SECRET='test-secret';
 const calls=[];const fetcher=async (url,opts)=>{calls.push({url,opts});return url.includes('/token')?Response.json({access_token:'test-token',expires_in:3600}):Response.json({value:[]});};
 const route=createMailRoute({loginFromRequest:()=> 'alice',fetcher});const start=await route(new Request('https://example.test/api/mail?action=start'));
 const state=new URL(start.headers.get('location')).searchParams.get('state');const stateCookie=start.headers.get('set-cookie').split(';')[0];
 const callback=await route(new Request(`https://example.test/api/mail?action=callback&code=abc&state=${state}`,{headers:{cookie:stateCookie}}));assert.equal(callback.status,302);
 const mailCookie=callback.headers.get('set-cookie').split(';')[0];assert.match(mailCookie,/^hf_mail=/);assert.ok(!mailCookie.includes('test-token'));
 const messages=await route(new Request('https://example.test/api/mail?action=messages&folder=inbox',{headers:{cookie:mailCookie}}));assert.equal(messages.status,200);assert.match(calls.at(-1).url,/\/me\/mailFolders\/inbox\/messages/);
 const invalid=await route(new Request('https://example.test/api/mail?action=messages&folder=other',{headers:{cookie:mailCookie}}));assert.equal(invalid.status,400);
 const other=createMailRoute({loginFromRequest:()=> 'bob',fetcher});assert.equal((await other(new Request('https://example.test/api/mail?action=messages',{headers:{cookie:mailCookie}}))).status,401);
 assert.equal((await route(new Request('https://example.test/api/mail?action=disconnect',{method:'POST',headers:{origin:'https://evil.test',cookie:mailCookie}}))).status,403);
});
