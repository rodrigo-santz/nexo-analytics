/** Cloudflare Worker: recebe EventSub, verifica HMAC e grava eventos brutos no GitHub. */
function secureEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function validHmac(secret,message,signature){
  if(!signature?.startsWith('sha256='))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const out=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message));
  const hex=[...new Uint8Array(out)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return secureEqual(`sha256=${hex}`,signature);
}
function encodeBase64(text){const bytes=new TextEncoder().encode(text);let value='';for(const b of bytes)value+=String.fromCharCode(b);return btoa(value);}
function encodeBase64Url(text){return encodeBase64(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function persist(env,entry){
  const messageId=String(entry.messageId||'');
  if(!messageId||messageId.length>200)throw new Error('Invalid event message identifier');
  const id=encodeBase64Url(messageId);
  if(!id||id.length>100)throw new Error('Identificador de evento inválido');
  const day=entry.receivedAt.slice(0,10);
  const path=`data/events/${day}/${id}.json`;
  const endpoint=`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
  const payload=JSON.stringify({message:`eventsub: ${entry.subscriptionType} (${id})`,content:encodeBase64(JSON.stringify(entry,null,2)+'\n'),branch:'main'});
  for(let attempt=0;attempt<4;attempt++){
    const res=await fetch(endpoint,{method:'PUT',headers:{'Authorization':`Bearer ${env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-analytics-eventsub','Content-Type':'application/json'},body:payload});
    if(res.ok)return;
    if(res.status===409||res.status===422){
      // O mesmo ID já pode ter sido salvo numa entrega anterior da Twitch.
      const check=await fetch(endpoint,{headers:{'Authorization':`Bearer ${env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-analytics-eventsub'}});
      if(check.ok)return;
      if(res.status===409 && attempt<3){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;}
      throw new Error(`GitHub recusou criação do arquivo (${res.status})`);
    }
    if([409,429,500,502,503].includes(res.status)&&attempt<3){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;}
    throw new Error(`Falha de persistência GitHub (${res.status}): ${(await res.text()).slice(0,160)}`);
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/health')return Response.json({service:'nexo-eventsub',ok:true});
    if(request.method!=='POST'||url.pathname!=='/webhook')return new Response('Not found',{status:404});
    if(!env.TWITCH_EVENTSUB_SECRET||!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return new Response('Missing configuration',{status:503});
    const messageId=request.headers.get('Twitch-Eventsub-Message-Id');
    const stamp=request.headers.get('Twitch-Eventsub-Message-Timestamp');
    const signature=request.headers.get('Twitch-Eventsub-Message-Signature');
    const type=request.headers.get('Twitch-Eventsub-Message-Type');
    if(!messageId||!stamp||!Number.isFinite(Date.parse(stamp))||Math.abs(Date.now()-Date.parse(stamp))>10*60_000)return new Response('Invalid timestamp',{status:403});
    if(Number(request.headers.get('Content-Length')||0)>65536)return new Response('Payload too large',{status:413});
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>65536)return new Response('Payload too large',{status:413});
    if(!await validHmac(env.TWITCH_EVENTSUB_SECRET,messageId+stamp+raw,signature))return new Response('Signature mismatch',{status:403});
    let body;try{body=JSON.parse(raw)}catch{return new Response('Invalid JSON',{status:400})}
    if(type==='webhook_callback_verification'){const challenge=String(body.challenge||'');return new Response(challenge,{status:200,headers:{'Content-Type':'text/plain; charset=utf-8','Content-Length':String(new TextEncoder().encode(challenge).length)}});}
    if(type!=='notification'&&type!=='revocation')return new Response('Unknown EventSub message',{status:400});
    const entry={messageId,messageType:type,subscriptionType:body.subscription?.type||'unknown',subscriptionStatus:body.subscription?.status||null,receivedAt:stamp,source:'eventsub',event:body.event||{},subscriptionId:body.subscription?.id||null};
    try{await persist(env,entry);return new Response(null,{status:204})}
    catch(e){console.error('Não foi possível armazenar o evento:',e.message);return new Response('Persistence failed; retry delivery',{status:503})}
  }
};
