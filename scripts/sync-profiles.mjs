import {readFile,writeFile} from 'node:fs/promises';
import {getUsers,twitchClient} from './twitch-api.mjs';

const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const names=await readJson('data/streamers.json',[]);
const existing=await readJson('data/streamer-profiles.json',{});

if(!process.env.TWITCH_CLIENT_ID||!process.env.TWITCH_CLIENT_SECRET){
  console.warn('Perfis Twitch: credenciais ausentes; mantendo URLs já sincronizadas.');
}else{
  try{
    const users=await getUsers(await twitchClient(),names);
    const profiles={...existing};
    for(const user of users)profiles[user.login.toLowerCase()]={profileImageUrl:user.profile_image_url,displayName:user.display_name};
    await writeFile('data/streamer-profiles.json',JSON.stringify(profiles,null,2)+'\n');
    console.log(`Perfis Twitch sincronizados: ${users.length}/${names.length}.`);
  }catch(error){
    console.warn(`Perfis Twitch não sincronizados: ${error.message}`);
  }
}
