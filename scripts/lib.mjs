const GRACE_MS=10*60_000;
const iso=(s)=>{const n=Date.parse(s||'');return Number.isFinite(n)?n:NaN};
const login=(s)=>String(s||'').trim().toLowerCase();
const unique=(a)=>[...new Set(a.filter(Boolean))];
const overlaps=(a,b,c,d)=>Number.isFinite(a)&&Number.isFinite(b)&&a<=d&&b>=c;

// The result and the quality of the observation are deliberately separate.
// A partial observation is not automatically an inconclusive result.
export function buildDashboard(events,names,health,now=new Date().toISOString(),profiles={},manualReviews=[]){
  const members=new Set(names.map(login)),sessions=[],nowMs=iso(now),seenMessages=new Set(),seenRaids=new Set();
  const sorted=[...events].filter(x=>x&&x.event&&x.subscriptionType).filter(x=>{
    if(x.messageId){if(seenMessages.has(x.messageId))return false;seenMessages.add(x.messageId)}
    if(x.subscriptionType==='channel.raid'){
      const e=x.event,key=String(e.id||[e.from_broadcaster_user_id,e.to_broadcaster_user_id,e.raided_broadcaster_user_id,x.receivedAt,e.viewers].join('|'));
      if(seenRaids.has(key))return false;seenRaids.add(key);
    } return true;
  }).sort((a,b)=>iso(a.receivedAt)-iso(b.receivedAt));
  const find=(uid,log,id,when)=>{
    const c=sessions.filter(s=>(uid&&s.userId===uid)||(log&&s.login===log));
    if(id){const exact=c.find(s=>s.streamId===id);if(exact)return exact}
    return c.filter(s=>!s.endedAt||(iso(when)-iso(s.endedAt)<20*60_000&&iso(when)-iso(s.endedAt)>-10*60_000)).sort((a,b)=>iso(b.startedAt||b.endedAt)-iso(a.startedAt||a.endedAt))[0]||null;
  };
  const fresh=(uid,log,id,reason)=>{const s={id:id||`inferred-${uid}-${log}-${sessions.length}`,streamId:id||null,userId:uid,login:log,startedAt:null,endedAt:null,raid:null,coverageIssues:reason?[reason]:[],sourceStart:null,sourceEnd:null,startTimeKnown:false};sessions.push(s);return s};
  for(const msg of sorted){
    const e=msg.event,t=msg.subscriptionType,when=msg.receivedAt||now;if(!Number.isFinite(iso(when)))continue;
    if(t==='stream.online'){
      const uid=String(e.broadcaster_user_id||''),log=login(e.broadcaster_user_login);if(!members.has(log))continue;const id=String(e.id||'');
      let s=sessions.find(v=>v.streamId&&v.streamId===id)||sessions.find(v=>v.login===log&&!v.streamId&&!v.startedAt&&!v.endedAt&&Math.abs(iso(when)-iso(v.raid?.at||when))<30*60_000);
      if(s){s.id=id||s.id;s.streamId=id||s.streamId;s.coverageIssues=s.coverageIssues.filter(v=>v!=='Início da transmissão não capturado')}
      if(!s){for(const p of sessions.filter(v=>v.login===log&&!v.endedAt)){p.endedAt=when;p.coverageIssues.push('Novo início sem confirmação de fim da live anterior')}s=fresh(uid,log,id)}
      s.startedAt=e.started_at||when;s.startTimeKnown=Boolean(e.started_at);if(!e.started_at)s.coverageIssues.push('Horário de início não informado pelo evento');
      if(msg.source==='watchdog'&&s.sourceStart!=='eventsub')s.coverageIssues.push('Início inferido pelo verificador');
      if(msg.source!=='watchdog'){s.sourceStart='eventsub';s.coverageIssues=s.coverageIssues.filter(v=>v!=='Início inferido pelo verificador')}
    }else if(t==='stream.offline'){
      const uid=String(e.broadcaster_user_id||''),log=login(e.broadcaster_user_login);if(!members.has(log))continue;let s=find(uid,log,e.id,when);if(!s)s=fresh(uid,log,String(e.id||''),'Início da transmissão não capturado');
      if(!s.endedAt||msg.source!=='watchdog')s.endedAt=when;if(msg.source==='watchdog'&&s.sourceEnd!=='eventsub')s.coverageIssues.push('Encerramento inferido pelo verificador');
      if(msg.source!=='watchdog'){s.sourceEnd='eventsub';s.coverageIssues=s.coverageIssues.filter(v=>v!=='Encerramento inferido pelo verificador')}
    }else if(t==='channel.raid'){
      const uid=String(e.from_broadcaster_user_id||''),log=login(e.from_broadcaster_user_login);if(!members.has(log))continue;let s=find(uid,log,null,when);if(!s)s=fresh(uid,log,null,'Início da transmissão não capturado');
      const target=login(e.to_broadcaster_user_login),targetId=String(e.to_broadcaster_user_id||''),known=Boolean(target&&targetId),viewers=Number.isFinite(Number(e.viewers))?Number(e.viewers):null;if(!s.raid)s.raid={toLogin:target||'desconhecido',viewers,toId:targetId,at:when,destinationKnown:known,isNexo:known&&members.has(target)};
    }
  }
  const gaps=(health?.gaps||[]).filter(g=>g.start).map(g=>({start:iso(g.start),end:iso(g.end||now),reason:g.reason||'Indisponibilidade detectada',kind:g.kind||'monitoring'})).filter(g=>Number.isFinite(g.start));
  for(const s of sessions){
    const start=iso(s.startedAt),end=iso(s.endedAt||now),effectiveEnd=s.endedAt?end:nowMs,affected=gaps.filter(g=>overlaps(Number.isFinite(start)?start:end,effectiveEnd,g.start,g.end));
    const endedSample=health?.endedStreams?.[s.streamId];if(!s.raid&&endedSample&&Number.isFinite(Number(endedSample.viewers)))s.viewersAtEnd=Number(endedSample.viewers);
    const liveGaps=affected.filter(g=>!s.endedAt||g.start<end-10*60_000),closingGaps=affected.filter(g=>s.endedAt&&g.end>=end-10*60_000);
    s.updatedAt=new Date(Math.max(...[start,end,iso(s.raid?.at)].filter(Number.isFinite),nowMs)).toISOString();
    s.coverageGaps=affected.map(g=>({start:new Date(g.start).toISOString(),end:new Date(g.end).toISOString(),reason:g.reason,kind:g.kind}));s.coverageStatus=affected.some(g=>g.kind==='failure')?'failure':affected.length?'partial':'complete';
    s.monitoredDurationMs=Math.max(0,(Number.isFinite(start)?effectiveEnd-start:0)-affected.reduce((n,g)=>n+Math.max(0,Math.min(effectiveEnd,g.end)-Math.max(Number.isFinite(start)?start:0,g.start)),0));
    s.coverageIssues=unique([...s.coverageIssues,...affected.map(g=>g.reason)]);
    const uncertain=!s.startTimeKnown||(!s.endedAt&&nowMs-end>=GRACE_MS)||liveGaps.length>0||closingGaps.length>0||(!Number.isFinite(iso(health?.lastCheckedAt))&&Boolean(s.endedAt));
    if(s.raid&&!s.raid.destinationKnown)s.status='inconclusiva';else if(s.raid)s.status=s.raid.isNexo?'raid_nexo':'raid_externa';else if(!s.endedAt)s.status='live';else if(uncertain)s.status='inconclusiva';else if(nowMs-end>=GRACE_MS)s.status='sem_raid';else s.status='aguardando';
    s.automaticStatus=s.status;
    const review=manualReviews.filter(r=>r&&String(r.streamId||r.id)===String(s.streamId||s.id)).sort((a,b)=>iso(a.changedAt)-iso(b.changedAt)).at(-1);
    if(review){s.manualReview={...review};if(review.conclusion)s.status=review.conclusion;if(review.action==='review')s.reviewRequired=true}
    s.inconclusiveReason=s.status==='inconclusiva'?(s.raid&&!s.raid.destinationKnown?'Destino da raid não foi identificado':!s.startTimeKnown?'Horário de início da transmissão não foi informado':!s.endedAt?'Encerramento não foi confirmado':liveGaps[0]?.reason||closingGaps[0]?.reason||'Não há verificação válida após o encerramento'):null;
    s.reassessmentAt=s.endedAt?new Date(end+GRACE_MS).toISOString():null;
  }
  const confirmedRaids=sessions.filter(s=>s.status==='raid_nexo'||s.status==='raid_externa');
  const confirmedNoRaids=sessions.filter(s=>s.status==='sem_raid');
  const audienceValue=(value)=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
  const sumAudience=(items,read)=>items.every(s=>audienceValue(read(s))!=null)?items.reduce((total,s)=>total+audienceValue(read(s)),0):null;
  const viewsAproveitadas=sumAudience(confirmedRaids,s=>s.raid?.viewers);
  const viewsDesperdicadas=sumAudience(confirmedNoRaids,s=>s.viewersAtEnd);
  const confirmedAudience=[...confirmedRaids,...confirmedNoRaids];
  const viewsTotais=confirmedAudience.length&&viewsAproveitadas!=null&&viewsDesperdicadas!=null?viewsAproveitadas+viewsDesperdicadas:null;
  const overview={lives:sessions.length,raids:sessions.filter(s=>s.raid).length,nexo:sessions.filter(s=>s.status==='raid_nexo').length,externas:sessions.filter(s=>s.status==='raid_externa').length,semRaid:sessions.filter(s=>s.status==='sem_raid').length,inconclusivas:sessions.filter(s=>s.status==='inconclusiva').length,liveAgora:sessions.filter(s=>s.status==='live').length,coverageComplete:sessions.filter(s=>s.coverageStatus==='complete').length,coveragePartial:sessions.filter(s=>s.coverageStatus==='partial').length,coverageFailure:sessions.filter(s=>s.coverageStatus==='failure').length,viewsTotais,viewsAproveitadas,viewsDesperdicadas};
  const streamers=names.map(n=>{const l=login(n),a=sessions.filter(s=>s.login===l);return {login:l,profileImageUrl:profiles[l]?.profileImageUrl||null,live:a.some(s=>s.status==='live'),lives:a.length,raids:a.filter(s=>s.raid).length,nexo:a.filter(s=>s.status==='raid_nexo').length,externas:a.filter(s=>s.status==='raid_externa').length,semRaid:a.filter(s=>s.status==='sem_raid').length,inconclusivas:a.filter(s=>s.status==='inconclusiva').length}});
  const daily=new Map();for(const s of sessions){const d=(s.startedAt||s.endedAt||now).slice(0,10);if(!daily.has(d))daily.set(d,{date:d,lives:0,raids:0});daily.get(d).lives++;if(s.raid)daily.get(d).raids++}
  const recent=sessions.map(({userId,sourceStart,sourceEnd,streamId,...s})=>s).sort((a,b)=>iso(b.endedAt||b.startedAt||now)-iso(a.endedAt||a.startedAt||now));
  return {updatedAt:now,monitor:{status:health?.status||'unconfigured',connection:health?.connection||'unknown',lastCheckedAt:health?.lastCheckedAt||null,lastSuccessfulAt:health?.lastSuccessfulAt||null,issues:health?.issues||[],failures:health?.failures||[],gaps:health?.gaps||[],subscriptionHealth:health?.subscriptionHealth||null},overview,streamers,recent,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
