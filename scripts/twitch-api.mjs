export async function twitchClient() {
  const clientId=process.env.TWITCH_CLIENT_ID;
  const clientSecret=process.env.TWITCH_CLIENT_SECRET;
  if(!clientId||!clientSecret) throw new Error('Configure TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET como GitHub Actions secrets.');
  const response=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})});
  const auth=await response.json();
  if(!response.ok) throw new Error(`Falha no OAuth Twitch (${response.status}): ${auth.message||'desconhecida'}`);
  const headers={'Client-Id':clientId,'Authorization':`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
  async function request(path, options={}){
    const res=await fetch(`https://api.twitch.tv/helix/${path}`,{...options,headers:{...headers,...options.headers}});
    if(res.status===204)return {};
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(`Twitch ${res.status} em ${path}: ${data.message||'falha na API'}`);
    return data;
  }
  return {request};
}
export async function getUsers(api, logins) {
  const found=[];
  for(let i=0;i<logins.length;i+=90){
    const params=new URLSearchParams();logins.slice(i,i+90).forEach(v=>params.append('login',v));
    const d=await api.request(`users?${params}`);found.push(...(d.data||[]));
  }
  return found;
}
export async function getSubscriptions(api){
  const all=[];let cursor;
  do{const p=new URLSearchParams({first:'100'});if(cursor)p.set('after',cursor);const d=await api.request(`eventsub/subscriptions?${p}`);all.push(...(d.data||[]));cursor=d.pagination?.cursor;}while(cursor);
  return all;
}
