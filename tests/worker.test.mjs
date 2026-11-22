import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const env={TWITCH_EVENTSUB_SECRET:'123456789abcdef',GITHUB_OWNER:'example',GITHUB_REPO:'nexo-analytics',GITHUB_TOKEN:'test-token'};
async function signed(body,type='notification'){
  const raw=JSON.stringify(body),id='f3ce0c59-0d03-4a4e-b123-abcdefgh5678',stamp=new Date().toISOString();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TWITCH_EVENTSUB_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+stamp+raw));
  return new Request('https://example.workers.dev/webhook',{method:'POST',headers:{'Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':stamp,'Twitch-Eventsub-Message-Signature':'sha256='+Buffer.from(sig).toString('hex'),'Twitch-Eventsub-Message-Type':type},body:raw});
}
test('Webhook rejeita mensagens sem assinatura',async()=>{
  const res=await worker.fetch(new Request('https://example.workers.dev/webhook',{method:'POST',body:'{}'}),env);
  assert.equal(res.status,403);
});
test('Webhook responde desafio de verificação sem gravar dados',async()=>{
  const req=await signed({challenge:'prova-da-twitch',subscription:{type:'stream.online'}},'webhook_callback_verification');
  const res=await worker.fetch(req,env);
  assert.equal(res.status,200);assert.equal(await res.text(),'prova-da-twitch');
});
test('Webhook grava evento via API GitHub e responde 204',async()=>{
  const previous=globalThis.fetch;let called=false;
  try{
    globalThis.fetch=async(url,opts)=>{
      called=true;assert.match(url,/api\.github\.com\/repos\/example\/nexo-analytics\/contents\/data\/events/);
      assert.equal(opts.method,'PUT');
      const payload=JSON.parse(opts.body);
      const data=JSON.parse(Buffer.from(payload.content,'base64').toString('utf8'));
      assert.equal(data.subscriptionType,'channel.raid');
      return new Response('{}',{status:201});
    };
    const req=await signed({subscription:{type:'channel.raid',status:'enabled'},event:{from_broadcaster_user_login:'santz_rj',to_broadcaster_user_login:'dree_sp',viewers:10}});
    const res=await worker.fetch(req,env);
    assert.equal(res.status,204);assert.equal(called,true);
  }finally{globalThis.fetch=previous;}
});
