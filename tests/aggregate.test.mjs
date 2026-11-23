import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboard} from '../scripts/lib.mjs';
const now='2026-11-22T23:00:00.000Z';
const good={status:'healthy',lastCheckedAt:now,issues:[],gaps:[]};
const msg=(type,at,ev,source='eventsub')=>({subscriptionType:type,messageType:'notification',receivedAt:at,event:ev,source});
const online=(id,at,who='santz_rj')=>msg('stream.online',at,{id,broadcaster_user_id:'100',broadcaster_user_login:who,started_at:at});
const offline=(id,at,who='santz_rj')=>msg('stream.offline',at,{id,broadcaster_user_id:'100',broadcaster_user_login:who});
const raid=(at,to)=>msg('channel.raid',at,{from_broadcaster_user_id:'100',from_broadcaster_user_login:'santz_rj',to_broadcaster_user_id:'200',to_broadcaster_user_login:to,viewers:42});
const members=['santz_rj','dree_sp'];

test('Live terminou sem raid: sem_raid apenas com cobertura posterior ao encerramento',()=>{
  const data=buildDashboard([online('a','2026-11-22T18:00:00Z'),offline('a','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,1);assert.equal(data.overview.semRaid,1);assert.equal(data.recent[0].status,'sem_raid');
});
test('Live em andamento aparece como ativa no streamer',()=>{
  const data=buildDashboard([online('active','2026-11-22T22:00:00Z')],members,good,now);
  assert.equal(data.overview.liveAgora,1);assert.equal(data.streamers.find(s=>s.login==='santz_rj').live,true);
});
test('Raid para NEXO classificada como interna',()=>{
  const data=buildDashboard([online('b','2026-11-22T18:00:00Z'),raid('2026-11-22T19:59:00Z','dree_sp'),offline('b','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.nexo,1);assert.equal(data.overview.externas,0);assert.equal(data.recent[0].raid.viewers,42);
});
test('Raid externa classificada corretamente',()=>{
  const data=buildDashboard([online('c','2026-11-22T18:00:00Z'),offline('c','2026-11-22T20:00:00Z'),raid('2026-11-22T20:01:00Z','foradogrupo')],members,good,now);
  assert.equal(data.overview.externas,1);
});
test('Lacuna durante live impede sem_raid',()=>{
  const health={...good,gaps:[{start:'2026-11-22T19:00:00Z',end:'2026-11-22T19:15:00Z',reason:'Falha no receptor'}]};
  const data=buildDashboard([online('d','2026-11-22T18:00:00Z'),offline('d','2026-11-22T20:00:00Z')],members,health,now);
  assert.equal(data.overview.inconclusivas,1);assert.equal(data.overview.semRaid,0);
});
test('Se faltou início da live, não classifica como sem raid',()=>{
  const data=buildDashboard([offline('e','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.inconclusivas,1);
});
test('Sem verificação válida, encerramento não é tido como confirmado',()=>{
  const data=buildDashboard([online('f','2026-11-22T18:00:00Z'),offline('f','2026-11-22T20:00:00Z')],members,{...good,lastCheckedAt:null},now);
  assert.equal(data.overview.inconclusivas,1);
});
test('Notificação de raid anterior ao online não cria live duplicada',()=>{
  const data=buildDashboard([raid('2026-11-22T18:01:00Z','dree_sp'),online('g','2026-11-22T18:02:00Z'),offline('g','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,1);assert.equal(data.overview.raids,1);
});
test('Verificação inferida pode ser substituída por evento real',()=>{
  const synth=msg('stream.online','2026-11-22T18:00:00Z',{id:'h',broadcaster_user_id:'100',broadcaster_user_login:'santz_rj',started_at:'2026-11-22T18:00:00Z'},'watchdog');
  const data=buildDashboard([synth,online('h','2026-11-22T18:02:00Z'),offline('h','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.semRaid,1);
});
test('Raid sem destino conhecido nao e classificada como externa',()=>{
  const data=buildDashboard([online('i','2026-11-22T18:00:00Z'),raid('2026-11-22T19:59:00Z',''),offline('i','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.externas,0);assert.equal(data.overview.inconclusivas,1);assert.equal(data.recent[0].raid.destinationKnown,false);
});
test('Inicio sem horario da Twitch fica inconclusivo',()=>{
  const data=buildDashboard([msg('stream.online','2026-11-22T18:00:00Z',{id:'j',broadcaster_user_id:'100',broadcaster_user_login:'santz_rj'}),offline('j','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.inconclusivas,1);assert.equal(data.overview.semRaid,0);
});
