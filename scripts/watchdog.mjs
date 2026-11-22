import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {twitchClient,getUsers,getSubscriptions} from './twitch-api.mjs';
const healthPath='data/health/status.json';
const now=new Date().toISOString();
const names=JSON.parse(await readFile('data/streamers.json','utf8'));
let prev;try{prev=JSON.parse(await readFile(healthPath,'utf8'))}catch{prev={}}
const health={...prev,lastCheckedAt:now,issues:[],gaps:prev.gaps||[],activeStreams:{}};
const configured=!!(process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET&&process.env.TWITCH_WEBHOOK_URL);
if(!configured){
  health.status='unconfigured';health.lastCheckedAt=null;health.issues=['Configure as credenciais da Twitch e a URL do webhook'];
  await writeFile(healthPath,JSON.stringify(health,null,2)+'\n');
  console.log('Monitor ainda não configurado.');
  process.exit(0);
}
const safe = (v) => String(v||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,90);
async function eventExists(type,streamId){
  const base='data/events';
  const months=await readdir(base,{withFileTypes:true}).catch(()=>[]);
  for(const d of months){if(!d.isDirectory())continue;
    for(const file of await readdir(join(base,d.name)).catch(()=>[])){
      if(!file.endsWith('.json'))continue;
      try{const data=JSON.parse(await readFile(join(base,d.name,file),'utf8'));
        if(data.subscriptionType===type&&String(data.event?.id)===String(streamId))return true;
      }catch{}
    }
  }
  return false;
}
async function synthetic(type, event, at, key){
  const day=at.slice(0,10);const dir=`data/events/${day}`;
  await mkdir(dir,{recursive:true});
  const file=`${dir}/watchdog-${safe(key)}-${type.replace('.','-')}.json`;
  const value={messageId:`watchdog-${key}-${type}`,messageType:'notification',subscriptionType:type,receivedAt:at,source:'watchdog',event};
  await writeFile(file,JSON.stringify(value,null,2)+'\n');
  console.warn(`Evento inferido: ${type} / ${event.broadcaster_user_login}`);
}
const gapThreshold=20*60_000;
const last=Date.parse(prev.lastCheckedAt||'');
if(Number.isFinite(last) && Date.parse(now)-last>gapThreshold){
  health.gaps.push({start:prev.lastCheckedAt,end:now,reason:'Verificação periódica interrompida por mais de 20 minutos'});
  health.issues.push('Houve intervalo prolongado sem verificações automáticas');
}
try{
  const api=await twitchClient();
  const users=await getUsers(api,names);const byLogin=new Map(users.map(u=>[u.login.toLowerCase(),u]));
  for(const name of names){if(!byLogin.has(name.toLowerCase()))health.issues.push(`Streamer não encontrado: ${name}`)}
  const subscriptions=await getSubscriptions(api);
  for(const user of users){
    for(const type of ['stream.online','stream.offline','channel.raid']){
      const ok=subscriptions.some(s=>s.type===type&&s.status==='enabled'&&s.transport?.callback===process.env.TWITCH_WEBHOOK_URL && (s.condition?.broadcaster_user_id===user.id||s.condition?.from_broadcaster_user_id===user.id));
      if(!ok)health.issues.push(`Assinatura indisponível: ${type} / ${user.login}`);
    }
  }
  const ids=users.map(u=>u.id);
  const live=[];
  for(let i=0;i<ids.length;i+=95){const query=new URLSearchParams();ids.slice(i,i+95).forEach(id=>query.append('user_id',id));const d=await api.request(`streams?${query}`);live.push(...(d.data||[]));}
  for(const stream of live){
    const u=byLogin.get(stream.user_login.toLowerCase());if(!u)continue;
    health.activeStreams[u.id]={streamId:stream.id,startedAt:stream.started_at,login:u.login};
    if(!await eventExists('stream.online',stream.id))await synthetic('stream.online',{id:stream.id,broadcaster_user_id:u.id,broadcaster_user_login:u.login,started_at:stream.started_at},stream.started_at||now,stream.id);
  }
  for(const [uid,older] of Object.entries(prev.activeStreams||{})){
    if(health.activeStreams[uid] || !byLogin.has((older.login||'').toLowerCase()))continue;
    if(!await eventExists('stream.offline',older.streamId))await synthetic('stream.offline',{id:older.streamId,broadcaster_user_id:uid,broadcaster_user_login:older.login},now,older.streamId);
  }
}catch(e){health.activeStreams=prev.activeStreams||{};health.issues.push(`Falha na verificação da Twitch: ${e.message}`);console.error(e.message)}
if(health.issues.length){
  health.status='degraded';
  if(!health.gaps.some(g=>!g.end))health.gaps.push({start:prev.lastCheckedAt||now,end:null,reason:'Assinaturas ou verificações do monitor indisponíveis'});
}else{
  health.status='healthy';
  for(const g of health.gaps){if(!g.end)g.end=now;}
}
health.gaps=health.gaps.slice(-200);
await writeFile(healthPath,JSON.stringify(health,null,2)+'\n');
console.log(`Monitor: ${health.status}; ${health.issues.length} avisos; ${Object.keys(health.activeStreams).length} canais ao vivo.`);
