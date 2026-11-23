const GRACE_MS=10*60_000;
const iso = (s) => {const n=Date.parse(s||'');return Number.isFinite(n)?n:NaN};
const login = (s) => String(s||'').trim().toLowerCase();
export function buildDashboard(events, names, health, now=new Date().toISOString(), profiles={}) {
  const memberSet=new Set(names.map(login));
  const sessions=[];
  const nowMs=iso(now);
  const sorted=[...events].filter(x=>x && x.event && x.subscriptionType).sort((a,b)=>iso(a.receivedAt)-iso(b.receivedAt));
  const sessionFor = (uid, log, streamId, when) => {
    const candidates=sessions.filter(s=>s.userId===uid || (log && s.login===log));
    if(streamId){const exact=candidates.find(s=>s.streamId===streamId);if(exact)return exact;}
    return candidates.filter(s=>!s.endedAt || (iso(when)-iso(s.endedAt)<20*60_000 && iso(when)-iso(s.endedAt)>-10*60_000)).sort((a,b)=>iso(b.startedAt||b.endedAt)-iso(a.startedAt||a.endedAt))[0] || null;
  };
  const fresh = (uid,log,streamId,when,reason) => {
    const s={id:streamId||`inferred-${uid}-${when}`,streamId:streamId||null,userId:uid,login:log,startedAt:null,endedAt:null,raid:null,coverageIssues:reason?[reason]:[],sourceStart:null,sourceEnd:null};
    sessions.push(s);return s;
  };
  for (const msg of sorted){
    const e=msg.event, t=msg.subscriptionType, when=msg.receivedAt || now;
    if(!Number.isFinite(iso(when)))continue;
    if(t==='stream.online'){
      const uid=String(e.broadcaster_user_id||''), log=login(e.broadcaster_user_login);
      if(!memberSet.has(log))continue;
      const streamId=String(e.id||'');
      let s=sessions.find(s=>s.streamId&&s.streamId===streamId);
      if(!s){
        const inferred=sessions.find(s=>s.login===log&&!s.streamId&&!s.startedAt&&!s.endedAt && Math.abs(iso(when)-iso(s.raid?.at||when))<30*60_000);
        if(inferred){s=inferred;s.id=streamId;s.streamId=streamId;s.coverageIssues=s.coverageIssues.filter(v=>v!=='Início da transmissão não capturado');}
      }
      if(!s){
        for(const prev of sessions.filter(s=>s.login===log&&!s.endedAt)){
          prev.endedAt=when;prev.coverageIssues.push('Novo início sem confirmação de fim da live anterior');
        }
        s=fresh(uid,log,streamId,when,null);
      }
      s.startedAt=e.started_at||when;
      if(!e.started_at&&!s.coverageIssues.includes('Horário de início não informado pelo evento'))s.coverageIssues.push('Horário de início não informado pelo evento');
      if(msg.source==='watchdog' && s.sourceStart!=='eventsub' && !s.coverageIssues.includes('Início inferido pelo verificador'))s.coverageIssues.push('Início inferido pelo verificador');
      if(msg.source!=='watchdog'){s.sourceStart='eventsub';s.coverageIssues=s.coverageIssues.filter(v=>v!=='Início inferido pelo verificador');}
    }else if(t==='stream.offline'){
      const uid=String(e.broadcaster_user_id||''),log=login(e.broadcaster_user_login);
      if(!memberSet.has(log))continue;
      let s=sessionFor(uid,log,e.id,when);
      if(!s)s=fresh(uid,log,String(e.id||''),when,'Início da transmissão não capturado');
      if(!s.endedAt || msg.source!=='watchdog')s.endedAt=when;
      if(msg.source==='watchdog' && s.sourceEnd!=='eventsub'&&!s.coverageIssues.includes('Encerramento inferido pelo verificador'))s.coverageIssues.push('Encerramento inferido pelo verificador');
      if(msg.source!=='watchdog'){s.sourceEnd='eventsub';s.coverageIssues=s.coverageIssues.filter(v=>v!=='Encerramento inferido pelo verificador');}
    }else if(t==='channel.raid'){
      const uid=String(e.from_broadcaster_user_id||''),log=login(e.from_broadcaster_user_login);
      if(!memberSet.has(log))continue;
      let s=sessionFor(uid,log,null,when);
      if(!s)s=fresh(uid,log,null,when,'Início da transmissão não capturado');
      const target=login(e.to_broadcaster_user_login);
      const targetId=String(e.to_broadcaster_user_id||'');
      const destinationKnown=Boolean(target&&targetId);
      if(!s.raid)s.raid={toLogin:target||'desconhecido',viewers:Number(e.viewers)||0,toId:targetId,at:when,destinationKnown,isNexo:destinationKnown&&memberSet.has(target)};
    }else if(msg.messageType==='revocation'){
      // Revogações são registradas no histórico bruto; o watchdog marca lacunas de cobertura.
    }
  }
  const gaps=(health?.gaps||[]).filter(g=>g.start).map(g=>({start:iso(g.start),end:iso(g.end||now),reason:g.reason||'Indisponibilidade detectada'}));
  for (const s of sessions){
    const start=iso(s.startedAt), end=iso(s.endedAt||now);
    for(const gap of gaps){
      if((Number.isFinite(start)?start:end)<=gap.end && end>=gap.start && !s.coverageIssues.includes(gap.reason))s.coverageIssues.push(gap.reason);
    }
    if(s.raid&&!s.raid.destinationKnown)s.status='inconclusiva';
    else if(s.raid)s.status=s.raid.isNexo?'raid_nexo':'raid_externa';
    else if(!s.endedAt)s.status='live';
    else if(s.coverageIssues.length || !Number.isFinite(iso(health?.lastCheckedAt)) || iso(health.lastCheckedAt)<end)s.status='inconclusiva';
    else if(nowMs-end>=GRACE_MS)s.status='sem_raid';
    else s.status='aguardando';
  }
  const obj={lives:sessions.length,raids:sessions.filter(s=>!!s.raid).length,nexo:sessions.filter(s=>s.status==='raid_nexo').length,externas:sessions.filter(s=>s.status==='raid_externa').length,semRaid:sessions.filter(s=>s.status==='sem_raid').length,inconclusivas:sessions.filter(s=>s.status==='inconclusiva').length,liveAgora:sessions.filter(s=>s.status==='live').length};
  const people=names.map(n=>{
    const log=login(n), sub=sessions.filter(s=>s.login===log);
    return {login:log,profileImageUrl:profiles[log]?.profileImageUrl||null,lives:sub.length,raids:sub.filter(s=>s.raid).length,nexo:sub.filter(s=>s.status==='raid_nexo').length,externas:sub.filter(s=>s.status==='raid_externa').length,semRaid:sub.filter(s=>s.status==='sem_raid').length,inconclusivas:sub.filter(s=>s.status==='inconclusiva').length};
  });
  const dailyMap=new Map();
  for(const s of sessions){
    const day=(s.startedAt||s.endedAt||now).slice(0,10);
    if(!dailyMap.has(day))dailyMap.set(day,{date:day,lives:0,raids:0});
    const row=dailyMap.get(day);row.lives++;if(s.raid)row.raids++;
  }
  const recent=sessions.map(({userId,sourceStart,sourceEnd,streamId,...s})=>s).sort((a,b)=>iso(b.endedAt||b.startedAt||now)-iso(a.endedAt||a.startedAt||now));
  return {updatedAt:now,monitor:{status:health?.status||'unconfigured',lastCheckedAt:health?.lastCheckedAt||null,issues:health?.issues||[],gaps:health?.gaps||[]},overview:obj,streamers:people,recent,daily:[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
