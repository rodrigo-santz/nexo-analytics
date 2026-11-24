import {readFile,writeFile} from 'node:fs/promises';
import {twitchClient,getUsers,getSubscriptions} from './twitch-api.mjs';

const names=JSON.parse(await readFile('data/streamers.json','utf8'));
let archivedNames=[];try{archivedNames=JSON.parse(await readFile('data/streamers-archived.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const url=process.env.TWITCH_WEBHOOK_URL,secret=process.env.TWITCH_EVENTSUB_SECRET;
if(!url?.startsWith('https://')||!(secret?.length>=10&&secret?.length<=100))throw new Error('Configure TWITCH_WEBHOOK_URL (https) e TWITCH_EVENTSUB_SECRET (10 a 100 caracteres).');
const api=await twitchClient();
const users=await getUsers(api,names);const byLogin=new Map(users.map(u=>[u.login.toLowerCase(),u]));
const existing=await getSubscriptions(api);let created=0,deleted=0,skipped=0;
const types=['stream.online','stream.offline','channel.raid'];
const archivedUsers=await getUsers(api,archivedNames);
for(const user of archivedUsers)for(const type of types){
  const condition=type==='channel.raid'?{from_broadcaster_user_id:user.id}:{broadcaster_user_id:user.id};
  const matches=existing.filter(s=>s.type===type&&s.transport?.callback===url&&Object.entries(condition).every(([k,v])=>s.condition?.[k]===v));
  for(const subscription of matches){await api.request(`eventsub/subscriptions?id=${encodeURIComponent(subscription.id)}`,{method:'DELETE'});deleted++}
}
for(const user of users)for(const type of types){
  const condition=type==='channel.raid'?{from_broadcaster_user_id:user.id}:{broadcaster_user_id:user.id};
  const matches=existing.filter(s=>s.type===type&&s.transport?.callback===url&&Object.entries(condition).every(([k,v])=>s.condition?.[k]===v));
  const healthy=matches.filter(s=>['enabled','webhook_callback_verification_pending'].includes(s.status));
  for(const duplicate of matches.slice(1)){
    await api.request(`eventsub/subscriptions?id=${encodeURIComponent(duplicate.id)}`,{method:'DELETE'});deleted++;
  }
  if(healthy.length){skipped++;continue}
  const body={type,version:'1',condition,transport:{method:'webhook',callback:url,secret}};
  const response=await api.request('eventsub/subscriptions',{method:'POST',body:JSON.stringify(body)});created++;
  console.log(`Inscrição restaurada: ${type} / ${user.login} -> ${response.data?.[0]?.status||'pendente'}`);
}
const missing=names.filter(l=>!byLogin.has(l.toLowerCase()));
const health={status:missing.length?'degraded':'healthy',lastReconciledAt:new Date().toISOString(),issues:missing.map(l=>`Streamer não encontrado: ${l}`),subscriptionHealth:{checkedAt:new Date().toISOString(),configuredUsers:users.length,expected:users.length*3,active:created+skipped,created,deleted,missing:missing.length}};
await writeFile('data/health/subscriptions.json',JSON.stringify(health,null,2)+'\n');
console.log(`EventSub: ${skipped} mantidas; ${created} criadas/restauradas; ${deleted} duplicadas removidas; ${users.length} logins válidos.`);
