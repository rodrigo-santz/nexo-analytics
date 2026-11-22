import {readFile} from 'node:fs/promises';
import {twitchClient,getUsers,getSubscriptions} from './twitch-api.mjs';
const logins=JSON.parse(await readFile('data/streamers.json','utf8'));
const url=process.env.TWITCH_WEBHOOK_URL;
const secret=process.env.TWITCH_EVENTSUB_SECRET;
if(!url?.startsWith('https://')||!(secret?.length>=10&&secret?.length<=100))throw new Error('Configure TWITCH_WEBHOOK_URL (https) e TWITCH_EVENTSUB_SECRET (10 a 100 caracteres).');
const api=await twitchClient();const users=await getUsers(api,logins);
const byLogin=new Map(users.map(u=>[u.login.toLowerCase(),u]));
const missing=logins.filter(l=>!byLogin.has(l.toLowerCase()));
if(missing.length)console.warn('Streamers não encontrados na Twitch:',missing.join(', '));
const existing=await getSubscriptions(api);
let created=0,skipped=0;
for(const user of users){
  for(const type of ['stream.online','stream.offline','channel.raid']){
    const condition=type==='channel.raid'?{from_broadcaster_user_id:user.id}:{broadcaster_user_id:user.id};
    const match=existing.find(s=>s.type===type && (s.condition?.from_broadcaster_user_id===user.id||s.condition?.broadcaster_user_id===user.id)&&s.transport?.callback===url && ['enabled','webhook_callback_verification_pending'].includes(s.status));
    if(match){skipped++;continue;}
    const body={type,version:'1',condition,transport:{method:'webhook',callback:url,secret}};
    const response=await api.request('eventsub/subscriptions',{method:'POST',body:JSON.stringify(body)});
    created++;
    console.log(`Inscrição solicitada: ${type} / ${user.login} -> ${response.data?.[0]?.status||'pendente'}`);
  }
}
console.log(`Inscrições existentes: ${skipped}; criadas: ${created}; logins válidos: ${users.length}.`);
