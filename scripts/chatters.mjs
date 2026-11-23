import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {twitchClient,getUsers} from './twitch-api.mjs';

const names=JSON.parse(await readFile('data/streamers.json','utf8'));
const now=new Date().toISOString();
const token=process.env.TWITCH_CHATTERS_TOKEN;
const moderatorId=process.env.TWITCH_CHATTERS_MODERATOR_ID;
if(!token||!moderatorId){console.log('Chatters: configuração ausente; coleta ignorada.');process.exit(0)}

try{
  const api=await twitchClient(),users=await getUsers(api,names),byId=new Map(users.map(u=>[u.id,u]));
  for(const u of users){
    const stream=(await api.request(`streams?user_id=${encodeURIComponent(u.id)}`)).data?.[0];
    if(!stream)continue;
    const query=new URLSearchParams({broadcaster_id:u.id,moderator_id:moderatorId,first:'100'});
    const chatters=[];let cursor;
    do{
      if(cursor)query.set('after',cursor);
      const data=await api.request(`chat/chatters?${query}`,{headers:{Authorization:`Bearer ${token}`}});
      chatters.push(...(data.data||[]));cursor=data.pagination?.cursor;
    }while(cursor);
    const members=chatters.filter(c=>byId.has(c.user_id)).map(c=>({user_id:c.user_id,user_login:byId.get(c.user_id).login}));
    const entry={messageId:`chatters-${stream.id}-${now.slice(0,13).replace(/[-:T]/g,'')}`,messageType:'snapshot',subscriptionType:'chatters.snapshot',receivedAt:now,source:'chatters',event:{stream_id:String(stream.id),broadcaster_user_id:u.id,broadcaster_user_login:u.login,started_at:stream.started_at,chatters:members}};
    const dir=`data/events/${now.slice(0,10)}`;await mkdir(dir,{recursive:true});
    await writeFile(`${dir}/${entry.messageId}.json`,JSON.stringify(entry,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e});
    console.log(`Chatters: ${u.login} / ${members.length} membros`);
  }
}catch(error){console.warn(`Chatters: coleta indisponível (${error.message})`)}
