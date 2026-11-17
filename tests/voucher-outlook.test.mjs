import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { beginVoucherOutlook, createVoucherOutlookDraft, finishVoucherOutlook, voucherOutlookConfig } from '../lib/voucher-outlook.mjs';

const previousSecret=process.env.HARBORFLOW_SESSION_SECRET;
process.env.HARBORFLOW_SESSION_SECRET='test-only-key';
after(()=>{
  if(previousSecret===undefined)delete process.env.HARBORFLOW_SESSION_SECRET;
  else process.env.HARBORFLOW_SESSION_SECRET=previousSecret;
});

const origin='https://harborflow.test';
const path='/api/operations';
const config=voucherOutlookConfig({
  HARBORFLOW_SESSION_SECRET:'test-only-key',
  HARBORFLOW_OUTLOOK_TENANT_ID:'11111111-1111-4111-8111-111111111111',
  HARBORFLOW_OUTLOOK_CLIENT_ID:'22222222-2222-4222-8222-222222222222',
  HARBORFLOW_OUTLOOK_CLIENT_SECRET:'test-client-secret',
  HARBORFLOW_OUTLOOK_REDIRECT_URI:origin+path+'?action=voucherOutlookCallback'
});

const request=(query,extraCookies='',session='app-account-session')=>new Request(origin+path+'?'+query,{
  headers:{cookie:'hf_session='+session+(extraCookies?'; '+extraCookies:'')}
});
const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>!value.endsWith('=')).join('; ');

test('Outlook draft uses account-bound OAuth and sends CC and sanitized HTML to the draft endpoint',async()=>{
  let verifier;
  const makeClient=()=>({
    async getAuthCodeUrl(options){
      assert.deepEqual(options.scopes,['https://graph.microsoft.com/Mail.ReadWrite']);
      assert.equal(options.codeChallengeMethod,'S256');
      assert.ok(options.codeChallenge);
      return 'https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?state='+options.state;
    },
    async acquireTokenByCode(options){
      verifier=options.codeVerifier;
      assert.equal(options.code,'fixture-code');
      return {accessToken:'fixture-token'.repeat(400),tenantId:config.tenantId,expiresOn:new Date(Date.now()+3600000)};
    }
  });
  const start=await beginVoucherOutlook(request('action=voucherOutlookConnect'),config,{makeClient});
  assert.equal(start.status,302);
  const state=new URL(start.headers.get('Location')).searchParams.get('state');
  const code='action=voucherOutlookCallback&code=fixture-code&state=';
  assert.equal((await finishVoucherOutlook(request(code+'modified',cookies(start)),config,{makeClient})).status,403);
  assert.equal((await finishVoucherOutlook(request(code+state,cookies(start),'other-session'),config,{makeClient})).status,403);
  const completed=await finishVoucherOutlook(request(code+state,cookies(start)),config,{makeClient});
  assert.equal(completed.status,200);
  assert.match(verifier,/^[A-Za-z0-9_-]{43}$/);
  assert.ok(completed.headers.getSetCookie().length>2);
  assert.ok(!cookies(completed).includes('fixture-token'));
  const input={to:'approver@example.com',cc:'Accounts <accounts@example.com>; ops@example.com',subject:'CTM',
    body:'<table style="border-collapse:collapse"><tr><td style="border:1px solid rgb(100, 116, 139);padding:4px 8px">340</td></tr></table><script>alert(1)</script>'};
  const saved=cookies(completed);
  let created=0;
  const sendRequest=async(url,options)=>{
    created++;
    assert.equal(url,'https://graph.microsoft.com/v1.0/me/messages');
    assert.equal(options.method,'POST');
    assert.match(options.headers.Authorization,/^Bearer fixture-token/);
    const payload=JSON.parse(options.body);
    assert.deepEqual(payload.ccRecipients.map(entry=>entry.emailAddress.address),['accounts@example.com','ops@example.com']);
    assert.equal(payload.body.contentType,'HTML');
    assert.match(payload.body.content,/<table/);
    assert.match(payload.body.content,/border:1px solid/);
    assert.doesNotMatch(payload.body.content,/script|alert/);
    return Response.json({webLink:'https://outlook.office.com/mail/deeplink/compose/test-draft'},{status:201});
  };
  assert.equal((await createVoucherOutlookDraft(request('draft',saved,'other-session'),config,input,{sendRequest})).status,428);
  assert.equal((await createVoucherOutlookDraft(request('draft'),config,input,{sendRequest})).status,428);
  const response=await createVoucherOutlookDraft(request('draft',saved),config,input,{sendRequest});
  assert.equal(response.status,201);
  assert.equal((await response.json()).url,'https://outlook.office.com/mail/deeplink/compose/test-draft');
  assert.equal(created,1);
});
