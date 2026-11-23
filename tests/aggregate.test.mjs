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
test('Última audiência observada é preservada para live encerrada sem raid',()=>{
  const health={...good,endedStreams:{a:{endedAt:'2026-11-22T20:00:00Z',viewers:137}}};
  const data=buildDashboard([online('a','2026-11-22T18:00:00Z'),offline('a','2026-11-22T20:00:00Z')],members,health,now);
  assert.equal(data.recent[0].viewersAtEnd,137);
});
test('Última audiência também é preservada quando o resultado é inconclusivo',()=>{
  const health={...good,gaps:[{start:'2026-11-22T19:00:00Z',end:'2026-11-22T19:15:00Z',reason:'Falha no receptor'}],endedStreams:{a:{endedAt:'2026-11-22T20:00:00Z',viewers:137}}};
  const data=buildDashboard([online('a','2026-11-22T18:00:00Z'),offline('a','2026-11-22T20:00:00Z')],members,health,now);
  assert.equal(data.recent[0].status,'inconclusiva');assert.equal(data.recent[0].viewersAtEnd,137);
});
test('Live em andamento aparece como ativa no streamer',()=>{
  const data=buildDashboard([online('active','2026-11-22T22:00:00Z')],members,good,now);
  assert.equal(data.overview.liveAgora,1);assert.equal(data.streamers.find(s=>s.login==='santz_rj').live,true);
});
test('Queda seguida de retorno em até dez minutos unifica a live e preserva a reconexão',()=>{
  const data=buildDashboard([online('first','2026-11-22T18:00:00Z'),offline('first','2026-11-22T20:00:00Z'),online('second','2026-11-22T20:09:00Z'),offline('second','2026-11-22T22:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,1);assert.equal(data.recent[0].startedAt,'2026-11-22T18:00:00Z');assert.equal(data.recent[0].reconnections.length,1);assert.equal(data.recent[0].reconnections[0].onlineAt,'2026-11-22T20:09:00Z');
});
test('RAID confirmada antes do retorno mantém as sessões separadas',()=>{
  const data=buildDashboard([online('first','2026-11-22T18:00:00Z'),offline('first','2026-11-22T20:00:00Z'),raid('2026-11-22T20:05:00Z','dree_sp'),online('second','2026-11-22T20:09:00Z'),offline('second','2026-11-22T22:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,2);assert.equal(data.overview.raids,1);assert.equal(data.recent.filter(r=>r.reconnections?.length).length,0);
});
test('Retorno após mais de dez minutos cria uma nova live',()=>{
  const data=buildDashboard([online('first','2026-11-22T18:00:00Z'),offline('first','2026-11-22T20:00:00Z'),online('second','2026-11-22T20:11:00Z'),offline('second','2026-11-22T22:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,2);
});
test('Raid para NEXO classificada como interna',()=>{
  const data=buildDashboard([online('b','2026-11-22T18:00:00Z'),raid('2026-11-22T19:59:00Z','dree_sp'),offline('b','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.nexo,1);assert.equal(data.overview.externas,0);assert.equal(data.recent[0].raid.viewers,42);
});
test('Raid externa classificada corretamente',()=>{
  const data=buildDashboard([online('c','2026-11-22T18:00:00Z'),offline('c','2026-11-22T20:00:00Z'),raid('2026-11-22T20:01:00Z','foradogrupo')],members,good,now);
  assert.equal(data.overview.externas,1);
});
test('Métricas de audiência usam somente resultados confirmados',()=>{
  const health={...good,endedStreams:{sem:{endedAt:'2026-11-22T20:00:00Z',viewers:137}}};
  const data=buildDashboard([online('sem','2026-11-22T16:00:00Z'),offline('sem','2026-11-22T18:00:00Z'),online('raid-live','2026-11-22T20:00:00Z'),raid('2026-11-22T21:59:00Z','dree_sp'),offline('raid-live','2026-11-22T22:00:00Z')],members,health,'2026-11-22T23:00:00Z');
  assert.equal(data.overview.viewsAproveitadas,42);assert.equal(data.overview.viewsDesperdicadas,137);assert.equal(data.overview.viewsTotais,179);
});
test('Audiência fica indisponível quando falta dado confirmado',()=>{
  const data=buildDashboard([online('sem','2026-11-22T18:00:00Z'),offline('sem','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.viewsDesperdicadas,null);assert.equal(data.overview.viewsTotais,null);
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
test('Duplicação de mensagens e raids não duplica a estatística',()=>{
  const a=online('dedupe','2026-11-22T18:00:00Z');a.messageId='same';
  const b={...a};const r=raid('2026-11-22T19:00:00Z','dree_sp');r.messageId='raid-1';
  const duplicate={...r};const data=buildDashboard([a,b,r,duplicate,offline('dedupe','2026-11-22T20:00:00Z')],members,good,now);
  assert.equal(data.overview.lives,1);assert.equal(data.overview.raids,1);
});
test('Revisão manual preserva o resultado automático',()=>{
  const data=buildDashboard([msg('stream.online','2026-11-22T18:00:00Z',{id:'manual',broadcaster_user_id:'100',broadcaster_user_login:'manual'}),offline('manual','2026-11-22T20:00:00Z','manual')],['manual'],good,now,{},[{streamId:'manual',action:'complete',conclusion:'sem_raid',reason:'Evidência revisada no VOD',reviewer:'adm',changedAt:now}]);
  assert.equal(data.recent[0].status,'sem_raid');assert.equal(data.recent[0].automaticStatus,'inconclusiva');assert.equal(data.recent[0].manualReview.reviewer,'adm');
});
