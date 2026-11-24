import { supabase } from './supabase.js';
const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.replace('./'); throw new Error('Sessão não autenticada'); }
document.documentElement.classList.remove('auth-pending');
supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') window.location.replace('./'); });
setInterval(async () => { const { data: { session: activeSession } } = await supabase.auth.getSession(); if (!activeSession) window.location.replace('./'); }, 60000);
const $ = (s) => document.querySelector(s);
const menuToggle = $('#menuToggle');
const topNav = $('.top-nav');
menuToggle?.addEventListener('click', () => {
  if (!topNav) return;
  const isOpen = topNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
});
$('#accountEmail')?.append(document.createTextNode(session.user.email || ''));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v) => new Intl.NumberFormat('pt-BR').format(Number(v)||0);
const metricFmt = (v) => v == null ? 'Indisponível' : fmt(v);
const dateBR = (v) => v ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)) : 'Não registrado';
const statusNames = {raid_nexo:'RAID NEXO',raid_externa:'RAID EXTERNA',sem_raid:'SEM RAID DETECTADA',inconclusiva:'INCONCLUSIVA',live:'AO VIVO',aguardando:'AGUARDANDO'};
const badge = (status) => `<span class="status-chip status-${esc(status)}">${statusNames[status] || esc(status)}</span>`;
const validLogin = (s) => /^[a-z0-9_]{3,25}$/.test(String(s||''));
let dashboard = null, shown = 10;
const dateFilter = { preset: 'all', start: '', end: '' };
const drawerElement = $('#drawerLayer');
let drawerModal = null;
let revealObserver = null;

function initScrollReveal(){
  const targets = document.querySelectorAll('.section-head, .metrics-grid .metric-card, .analytics-grid > *, .streamer-card, .history-panel, .monitor-card');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    targets.forEach((el)=>el.classList.add('reveal-item','is-visible'));
    return;
  }
  document.documentElement.classList.add('reveal-ready');
  revealObserver ||= new IntersectionObserver((entries)=>entries.forEach((entry)=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }),{threshold:.12,rootMargin:'0px 0px -8% 0px'});
  targets.forEach((el,index)=>{
    if(el.dataset.revealBound)return;
    el.dataset.revealBound='true';
    el.classList.add('reveal-item');
    el.style.setProperty('--reveal-delay',`${Math.min(index*35,240)}ms`);
    revealObserver.observe(el);
  });
}

function initProfileModal(){
  if(!drawerElement || !window.bootstrap?.Modal)return;
  drawerElement.classList.add('modal','fade');
  drawerElement.classList.remove('hidden');
  drawerElement.setAttribute('tabindex','-1');
  drawerElement.setAttribute('aria-hidden','true');
  $('#drawerShade')?.remove();
  const profile = drawerElement.querySelector('.profile-drawer');
  if(profile && !profile.closest('.modal-dialog')){
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-dialog-scrollable';
    profile.parentNode.insertBefore(dialog,profile);
    dialog.appendChild(profile);
    profile.classList.add('modal-content');
  }
  drawerModal = window.bootstrap.Modal.getOrCreateInstance(drawerElement,{backdrop:true,keyboard:true,focus:true});
  drawerElement.addEventListener('show.bs.modal', () => {
    document.documentElement.classList.add('modal-page-lock');
  });
  drawerElement.addEventListener('hidden.bs.modal', () => {
    document.documentElement.classList.remove('modal-page-lock');
  });
}

function icon(symbol){return `<span aria-hidden="true">${symbol}</span>`}
function avatarMarkup(login, profileImageUrl, className='avatar'){
  const initial=esc(String(login||'?').charAt(0).toUpperCase());
  const image=profileImageUrl?`<img src="${esc(profileImageUrl)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:'';
  return `<span class="${className}"><span class="avatar-fallback">${initial}</span>${image}</span>`;
}
function liveStatusMarkup(isLive){return `<span class="live-status ${isLive?'is-live':'is-offline'}" title="${isLive?'AO VIVO':'OFFLINE'}" aria-label="${isLive?'Ao vivo':'Offline'}"><i class="live-dot" aria-hidden="true"></i><span>${isLive?'AO VIVO':'OFFLINE'}</span></span>`;}
function historyStreamerAvatar(login){const profile=(dashboard.streamers||[]).find(s=>s.login===login);return avatarMarkup(login,profile?.profileImageUrl,'mini-avatar');}
function metric(label,value,symbol,note,variant='') {return `<article class="metric-card ${variant}"><div class="metric-top"><span class="metric-label">${label}</span><span class="metric-icon">${icon(symbol)}</span></div><div class="metric-value">${metricFmt(value)}</div><div class="metric-note">${note}</div></article>`;}
function dateRange(){
  if(dateFilter.preset==='all')return null;
  const now=new Date(),startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(dateFilter.preset==='custom'){
    if(!dateFilter.start||!dateFilter.end)return null;
    const start=new Date(`${dateFilter.start}T00:00:00`),end=new Date(`${dateFilter.end}T00:00:00`);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return null;
    end.setDate(end.getDate()+1);return {start:start.getTime(),end:end.getTime()};
  }
  const days={today:1,'7d':7,'14d':14,'30d':30}[dateFilter.preset]||1;
  const start=new Date(startOfToday);start.setDate(start.getDate()-days+1);
  return {start:start.getTime(),end:now.getTime()};
}
function filteredRecords(){
  const range=dateRange();
  return (dashboard?.recent||[]).filter(record=>{
    if(!range)return true;
    const start=new Date(record.startedAt||record.endedAt||0).getTime(),end=new Date(record.endedAt||record.startedAt||0).getTime();
    return Number.isFinite(start)&&Number.isFinite(end)&&end>=range.start&&start<range.end;
  });
}
function periodLabel(){
  if(dateFilter.preset==='all')return 'Todo o período';
  if(dateFilter.preset==='today')return 'Hoje';
  if(dateFilter.preset==='custom')return dateFilter.start&&dateFilter.end?`${dateFilter.start} até ${dateFilter.end}`:'Data personalizada';
  return `Últimos ${dateFilter.preset.replace('d','')} dias`;
}
function audienceMetrics(records=filteredRecords()){
  const confirmedRaids=records.filter(r=>r.status==='raid_nexo'||r.status==='raid_externa'),confirmedNoRaids=records.filter(r=>r.status==='sem_raid');
  const audienceValue=(value)=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
  const sum=(items,read)=>items.every(r=>audienceValue(read(r))!=null)?items.reduce((total,r)=>total+audienceValue(read(r)),0):null;
  const used=sum(confirmedRaids,r=>r.raid?.viewers),wasted=sum(confirmedNoRaids,r=>r.viewersAtEnd),total=confirmedRaids.length+confirmedNoRaids.length&&used!=null&&wasted!=null?used+wasted:null;
  return {total,used,wasted};
}
function overviewForFilter(){
  if(dateFilter.preset==='all')return dashboard.overview||{};
  const records=filteredRecords(),audience=audienceMetrics(records);
  const raids=records.filter(r=>r.status==='raid_nexo'||r.status==='raid_externa');
  return {lives:records.length,raids:raids.length,nexo:records.filter(r=>r.status==='raid_nexo').length,externas:records.filter(r=>r.status==='raid_externa').length,semRaid:records.filter(r=>r.status==='sem_raid').length,inconclusivas:records.filter(r=>r.status==='inconclusiva').length,viewsTotais:audience.total,viewsAproveitadas:audience.used,viewsDesperdicadas:audience.wasted};
}
function renderOverview(){
  const o=overviewForFilter();
  const audience=audienceMetrics();
  $('#metrics').innerHTML = [
    metric('Lives monitoradas',o.lives,'◉','Transmissões com registro'),
    metric('Raids enviadas',o.raids,'↗','Total de raids identificadas','accent'),
    metric('Raids para NEXO',o.nexo,'✧','Fortalecimento interno','accent'),
    metric('Raids externas',o.externas,'↗','Para outros canais'),
    metric('Sem raid detectada',o.semRaid,'⊘','Monitoramento disponível'),
    metric('Inconclusivas',o.inconclusivas,'!','Não foi possível confirmar','warning')].join('');
  const last = dashboard.updatedAt ? dateBR(dashboard.updatedAt) : 'Sem sincronização';
  $('#lastSync').textContent = `Atualizado: ${last}`;
  $('#metrics').innerHTML += [
    metric('Views totais',o.viewsTotais??audience.total,'◉','Público em resultados confirmados'),
    metric('Views efetivas',o.viewsAproveitadas??audience.used,'↗','Espectadores enviados em raids','accent'),
    metric('Views perdidas',o.viewsDesperdicadas??audience.wasted,'⊘','Público em lives sem raid confirmada','warning')].join('');
  const range=dateRange(),records=filteredRecords();
  let days;
  if(!range){days=Array.from({length:14},(_,i)=>{const dt = new Date();dt.setUTCDate(dt.getUTCDate()-13+i);return dt.toISOString().slice(0,10)});}else{const first=new Date(range.start),last=new Date(range.end);last.setDate(last.getDate()-1);const allDays=[];for(const dt=new Date(first);dt<=last;dt.setDate(dt.getDate()+1))allDays.push(dt.toISOString().slice(0,10));days=allDays.slice(-30);}
  const byDay = !range?new Map((dashboard.daily||[]).map(d=>[d.date,d])):new Map();
  if(range)records.forEach(record=>{const date=new Date(record.endedAt||record.startedAt).toISOString().slice(0,10),current=byDay.get(date)||{date,lives:0,raids:0};current.lives+=1;if(record.status==='raid_nexo'||record.status==='raid_externa')current.raids+=1;byDay.set(date,current);});
  const points = days.map(d=>({date:d,...(byDay.get(d)||{lives:0,raids:0})}));
  const peak=Math.max(1,...points.flatMap(p=>[p.lives,p.raids]));
  $('#activityChart').innerHTML=points.map(p=>`<div class="activity-day" title="${p.date}: ${p.lives} lives, ${p.raids} raids"><div class="activity-bars"><span class="bar-live" style="height:${Math.max(2,p.lives/peak*100)}%"></span><span class="bar-raid" style="height:${Math.max(2,p.raids/peak*100)}%"></span></div><small>${p.date.slice(8)}</small></div>`).join('');
  const activityRangeLabel=$('#activityRangeLabel')||document.querySelector('.panel-tag');if(activityRangeLabel)activityRangeLabel.textContent=periodLabel();
  const raids = (o.nexo||0)+(o.externas||0);
  const pct = raids>0 ? Math.round((o.nexo||0)/raids*100) : 0;
  $('#raidDonut').style.setProperty('--pct',`${pct}%`);
  $('#donutPct').textContent=`${pct}%`;
  $('#destinationLegend').innerHTML=`<span><i class="legend-dot purple"></i> NEXO <strong>${fmt(o.nexo)}</strong></span><span><i class="legend-dot cyan"></i> Externas <strong>${fmt(o.externas)}</strong></span>`;
  const used=o.viewsAproveitadas??audience.used,wasted=o.viewsDesperdicadas??audience.wasted,total=o.viewsTotais??audience.total,hasImpact=Number.isFinite(Number(total))&&Number(total)>0&&Number.isFinite(Number(used))&&Number.isFinite(Number(wasted));
  const impactPct=hasImpact?Math.round(Number(used)/Number(total)*100):null;
  const impactDonut=$('#viewsImpactDonut');impactDonut.classList.toggle('no-data',!hasImpact);impactDonut.style.setProperty('--pct',hasImpact?`${impactPct}%`:'0%');
  $('#viewsImpactPct').textContent=hasImpact?`${impactPct}%`:'—';$('#viewsImpactCaption').textContent=hasImpact?'efetivas':'sem dados';
  $('#viewsImpactLegend').innerHTML=hasImpact?`<span><i class="legend-dot purple"></i> Efetivas: <strong>${fmt(used)} · ${impactPct}%</strong></span><span><i class="legend-dot cyan"></i> Perdidas: <strong>${fmt(wasted)} · ${100-impactPct}%</strong></span>`:'<span>Sem dados suficientes</span>';
  const health=dashboard.monitor||{};
  const el=$('#monitorStatus');el.classList.toggle('healthy',health.status==='healthy');
  el.innerHTML = `<span class="status-light"></span> ${health.status==='healthy'?'Assinaturas ativas e verificadas':health.status==='degraded'?'Atenção: cobertura parcialmente comprometida':'Monitoramento não configurado ou sem verificação recente'}`;
  const sub=health.subscriptionHealth||{};const failures=health.failures||[];const details=$('#healthDetails');
  if(details)details.innerHTML=`<div class="health-grid"><span><strong>${esc(health.connection||health.status||'—')}</strong><small>CONEXÃO TWITCH</small></span><span><strong>${fmt(sub.active||0)} / ${fmt(sub.expected||0)}</strong><small>SUBSCRIPTIONS ATIVAS</small></span><span><strong>${esc(dateBR(health.lastSuccessfulAt||health.lastCheckedAt))}</strong><small>ÚLTIMA EXECUÇÃO BEM-SUCEDIDA</small></span><span><strong>${fmt(dashboard.overview?.lives||0)} / ${fmt(dashboard.overview?.inconclusivas||0)}</strong><small>LIVES / INCONCLUSIVAS</small></span></div>${failures.length?`<div class="health-failures">${failures.slice(-3).reverse().map(f=>`<div><b>${esc(f.provider||'sistema')}</b> · ${esc(f.type||'falha')} · ${esc(f.message||'')}<small>${esc(dateBR(f.at))}</small></div>`).join('')}</div>`:''}`;
}
function sortedStreamers(){
  const query=$('#searchStreamers').value.trim().toLowerCase();
  const field=$('#streamerSort').value;
  const liveFilter=$('#streamerLiveFilter').value;
  const items=[...(dashboard.streamers||[])].filter(s=>s.login.toLowerCase().includes(query)&& (liveFilter==='all'||liveFilter==='live'&&s.live===true||liveFilter==='offline'&&s.live!==true));
  items.sort((a,b)=>field==='name'?a.login.localeCompare(b.login,'pt-BR'):field==='live'?Number(Boolean(b.live))-Number(Boolean(a.live))||(b.lives||0)-(a.lives||0)||a.login.localeCompare(b.login,'pt-BR'):(b[field]||0)-(a[field]||0)||a.login.localeCompare(b.login,'pt-BR'));
  return items;
}
function renderStreamersLegacy(){
  const s=sortedStreamers();$('#streamerCount').textContent=`${s.length} streamers`;
  $('#streamerGrid').innerHTML = s.length?s.map(p=>`<button class="streamer-card" data-profile="${esc(p.login)}"><span class="streamer-top"><span class="avatar">${esc(p.login.charAt(0).toUpperCase())}</span><span class="member-badge">NEXO MEMBER</span></span><div class="streamer-name">${esc(p.login)}</div><div class="streamer-link">twitch.tv/${esc(p.login)}</div><div class="streamer-div"></div><div class="streamer-stats"><div class="streamer-stat"><strong>${fmt(p.lives)}</strong><small>LIVES</small></div><div class="streamer-stat"><strong>${fmt(p.raids)}</strong><small>RAIDS</small></div><div class="streamer-stat"><strong style="color:#bd8efb">${fmt(p.nexo)}</strong><small>PARA NEXO</small></div></div><span class="streamer-footer">VER HISTÓRICO <span aria-hidden="true">↗</span></span></button>`).join(''):'<div class="empty-state">Nenhum streamer corresponde à sua busca.</div>';
}
function renderStreamers(){
  const s=sortedStreamers();$('#streamerCount').textContent=`${s.length} streamers`;
  $('#streamerGrid').innerHTML=s.length?s.map(p=>`<button class="streamer-card" data-profile="${esc(p.login)}"><span class="streamer-top">${avatarMarkup(p.login,p.profileImageUrl)}<span class="streamer-meta">${liveStatusMarkup(p.live)}<span class="member-badge">NEXO MEMBER</span></span></span><div class="streamer-name">${esc(p.login)}</div><div class="streamer-link">twitch.tv/${esc(p.login)}</div><div class="streamer-div"></div><div class="streamer-stats"><div class="streamer-stat"><strong>${fmt(p.lives)}</strong><small>LIVES</small></div><div class="streamer-stat"><strong>${fmt(p.raids)}</strong><small>RAIDS</small></div><div class="streamer-stat"><strong style="color:#bd8efb">${fmt(p.nexo)}</strong><small>PARA NEXO</small></div></div><span class="streamer-footer">VER HISTORICO <span aria-hidden="true">↗</span></span></button>`).join(''):'<div class="empty-state">Nenhum streamer encontrado.</div>';
}
function historySorted(){const streamer=$('#historyStreamer').value,period=$('#historyPeriod').value,raidFilter=$('#historyRaid').value,coverage=$('#historyCoverage').value,status=$('#historyStatus').value;const cutoff=period==='all'?0:Date.now()-({24:86400000,7:604800000,30:2592000000}[period]||0);return [...filteredRecords()].filter(r=>(streamer==='all'||r.login===streamer)&&(status==='all'||r.status===status)&&(coverage==='all'||r.coverageStatus===coverage)&&(raidFilter==='all'||raidFilter==='confirmed'&&!!r.raid&&r.raid.destinationKnown||raidFilter==='none'&&!r.raid||raidFilter==='unknown'&&r.raid&&!r.raid.destinationKnown)&&new Date(r.endedAt||r.startedAt||0).getTime()>=cutoff).sort((a,b)=>new Date(b.endedAt||b.startedAt||0)-new Date(a.endedAt||a.startedAt||0));}
function duration(start,end){const a=new Date(start||0).getTime(),b=new Date(end||0).getTime();if(!start||!end||!Number.isFinite(a)||!Number.isFinite(b))return '<span class="history-empty">—</span>';const min=Math.max(0,Math.round((b-a)/60000));return min>=60?`${Math.floor(min/60)}h ${min%60}min`:`${min}min`;}
function historyRow(r){const monitored=r.monitoredDurationMs!=null?`${Math.round(r.monitoredDurationMs/60000)} min monitorados`:'';const coverage=r.coverageStatus==='failure'?`<span title="${esc((r.coverageIssues||[]).join('; '))}" style="color:#ff8d8d">✕ Falha</span>`:r.coverageStatus==='partial'?`<span title="${esc([...(r.coverageIssues||[]),...(r.coverageGaps||[]).map(g=>`${g.start} → ${g.end}`)].join('; '))}" style="color:#ffc17a">⚠ Parcial${monitored?` · ${monitored}`:''}</span>`:`<span style="color:#91d8b8">✓ Completa${monitored?` · ${monitored}`:''}</span>`;const raid=badge(r.status),views=r.raid?.viewers!=null?`${fmt(r.raid.viewers)} enviados${r.raid.toLogin?` para ${esc(r.raid.toLogin)}`:''}`:!r.raid&&r.viewersAtEnd!=null?`${fmt(r.viewersAtEnd)} no encerramento`:'<span class="history-empty">—</span>';return `<tr><td data-label="Streamer"><div class="td-user">${historyStreamerAvatar(r.login)}${esc(r.login)}</div></td><td data-label="Início / fim"><span class="date-stack">${esc(dateBR(r.startedAt))}<small>fim: ${esc(dateBR(r.endedAt))}</small></span></td><td data-label="Duração">${duration(r.startedAt,r.endedAt)}</td><td data-label="Raid">${raid}</td><td data-label="Views">${views}</td><td data-label="Cobertura">${coverage}${r.coverageGaps?.length?`<button class="gap-details" type="button" data-gaps="${esc(JSON.stringify(r.coverageGaps))}">ver intervalos</button>`:''}</td><td data-label="Atualizado">${esc(dateBR(r.manualReview?.changedAt||r.updatedAt||dashboard.updatedAt))}</td></tr>`;}
function renderHistory(){const rows=historySorted();$('#historyBody').innerHTML=rows.length?rows.slice(0,shown).map(historyRow).join(''):'<tr><td class="table-empty" colspan="7">Nenhum histórico registrado para este filtro.</td></tr>';$('#historyCount').textContent=`Exibindo ${Math.min(shown,rows.length)} de ${fmt(rows.length)} registros`;$('#loadMore').classList.toggle('hidden',shown>=rows.length);}
function historyDescription(r){
  if(r.reconnections?.length)return 'Reconectou';
  if(r.status==='aguardando')return 'Pendente';
  if(r.raid?.toLogin)return `Destino: ${esc(r.raid.toLogin)}`;
  if(r.coverageIssues?.length)return 'Monitoramento parcial';
  return r.endedAt?'Live finalizada':'Live iniciada';
}
function showProfileLegacy(login){
  const p=(dashboard?.streamers||[]).find(s=>s.login===login);if(!p)return;
  const sessions=(dashboard.recent||[]).filter(r=>r.login===login).slice(0,60);
  $('#drawerContent').innerHTML=`<span class="kicker">FICHA DO CRIADOR / NEXO SYNERGY</span><div class="profile-header"><span class="avatar">${esc(login.charAt(0).toUpperCase())}</span><div><h2 id="drawerTitle">${esc(login)}</h2>${validLogin(login)?`<a href="https://www.twitch.tv/${encodeURIComponent(login)}" target="_blank" rel="noopener noreferrer">Abrir Twitch ↗</a>`:''}</div></div><div class="profile-metrics">${[['Lives',p.lives],['Raids totais',p.raids],['Para NEXO',p.nexo],['Para fora',p.externas],['Sem raid detectada',p.semRaid],['Inconclusivas',p.inconclusivas]].map(([l,v])=>`<div class="profile-metric"><strong>${fmt(v)}</strong><span>${l}</span></div>`).join('')}</div><h3 class="profile-subhead">Histórico da comunidade</h3>${sessions.length?sessions.map(r=>`<div class="profile-session"><div><time>${esc(dateBR(r.startedAt||r.endedAt))}</time><p>${historyDescription(r)}</p></div>${badge(r.status)}</div>`).join(''):'<p class="empty-small">Nenhuma live registrada ainda.</p>'}<div class="profile-issue">⚠ “Sem raid detectada” não significa prova de ausência. Lives com falhas identificadas são classificadas como inconclusivas.</div>`;
  drawerModal?.show();
}
function showProfileBase(login){
  showProfileLegacy(login);
  const profile=(dashboard?.streamers||[]).find(s=>s.login===login);
  const avatar=document.querySelector('#drawerContent .profile-header .avatar');
  if(avatar&&profile)avatar.outerHTML=avatarMarkup(login,profile.profileImageUrl);
}
function closeProfile(){ drawerModal?.hide(); }
const coverageModal=$('#coverageModal');
const coverageModalContent=$('#coverageModalContent');
const coverageDateBR=(value)=>value?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'Não registrado';
const coverageDuration=(start,end)=>{const a=new Date(start||0).getTime(),b=new Date(end||0).getTime();if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return 'Não calculada';const min=Math.round((b-a)/60000);return min>=60?`${Math.floor(min/60)}h ${min%60}min`:`${min} min`};
function setCoverageModalLock(locked){document.documentElement.classList.toggle('coverage-modal-open',locked);document.body.classList.toggle('coverage-modal-open',locked)}
function closeCoverageModal(){coverageModal?.classList.add('hidden');setCoverageModalLock(false);}
function showCoverageModal(button){
  if(!coverageModal||!coverageModalContent)return;
  try{
    const gaps=JSON.parse(button.dataset.gaps||'[]');
    const login=button.closest('tr')?.querySelector('[data-label="Streamer"]')?.textContent.trim()||'Streamer não identificado';
    coverageModalContent.innerHTML=gaps.length?`<p class="coverage-modal-streamer">Streamer afetado: <strong>${esc(login)}</strong></p><div class="coverage-gap-list">${gaps.map((gap,index)=>`<article class="coverage-gap"><div class="coverage-gap-heading"><span>Interrupção ${index+1}</span><span class="coverage-gap-badge">Falha registrada</span></div><dl><div><dt>Início da falha</dt><dd>${esc(coverageDateBR(gap.start))}</dd></div><div><dt>Fim da falha</dt><dd>${esc(coverageDateBR(gap.end))}</dd></div><div><dt>Duração</dt><dd>${esc(coverageDuration(gap.start,gap.end))}</dd></div><div class="coverage-gap-reason"><dt>Motivo do erro</dt><dd>${esc(gap.reason||'Motivo não informado no registro')}</dd></div></dl></article>`).join('')}</div>`:'<p class="coverage-modal-empty">Nenhum intervalo de falha foi registrado.</p>';
    coverageModal.classList.remove('hidden');setCoverageModalLock(true);$('#coverageModalClose')?.focus();
  }catch{coverageModalContent.innerHTML='<p class="coverage-modal-empty">Não foi possível carregar os detalhes registrados desta falha.</p>';coverageModal.classList.remove('hidden');document.body.classList.add('coverage-modal-open');$('#coverageModalClose')?.focus();}
}
function populateHistoryFilters(){const select=$('#historyStreamer');if(!select||select.options.length>1)return;[...(dashboard.streamers||[])].map(s=>s.login).sort().forEach(login=>{const option=document.createElement('option');option.value=login;option.textContent=login;select.appendChild(option)})}
function render(){renderOverview();renderStreamers();populateHistoryFilters();renderHistory();$('#dataNotice').classList.toggle('hidden',true);initScrollReveal()}
async function loadData(){const b=$('#refreshBtn');b.disabled=true;try{const res=await fetch(`./data/dashboard.json?_=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);dashboard=await res.json();render();if(!(dashboard.recent||[]).length){const el=$('#dataNotice');el.classList.remove('hidden');el.textContent='Os registros reais ainda estão vazios. O painel será atualizado após os primeiros eventos monitorados.';}}catch(e){$('#dataNotice').classList.remove('hidden');$('#dataNotice').textContent=`Não foi possível carregar os dados: ${e.message}. Verifique a publicação dos arquivos.`;console.error(e)}finally{b.disabled=false}}
function initConstellation(){const canvas=$('#constellation'),ctx=canvas.getContext('2d');if(!ctx)return;let w=0,h=0,pts=[],mouse=null;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function resize(){w=canvas.width=window.innerWidth*devicePixelRatio;h=canvas.height=window.innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const count=Math.min(92,Math.floor(window.innerWidth/19));pts=Array.from({length:count},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.14,vy:(Math.random()-.5)*.14,r:Math.random()*1.6+.4}))}function paint(){ctx.clearRect(0,0,innerWidth,innerHeight);for(let i=0;i<pts.length;i++){const a=pts[i];if(!reduced){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>innerWidth)a.vx*=-1;if(a.y<0||a.y>innerHeight)a.vy*=-1;}ctx.beginPath();ctx.fillStyle='rgba(198,167,255,.72)';ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();for(let j=i+1;j<pts.length;j++){const b=pts[j];const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<116){ctx.strokeStyle=`rgba(163,112,240,${(1-d/116)*.22})`;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}if(mouse){const d=Math.hypot(a.x-mouse.x,a.y-mouse.y);if(d<155){ctx.strokeStyle=`rgba(194,126,255,${(1-d/155)*.42})`;ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(mouse.x,mouse.y);ctx.stroke()}}}if(mouse){ctx.beginPath();ctx.fillStyle='rgba(218,174,255,.8)';ctx.arc(mouse.x,mouse.y,1.8,0,Math.PI*2);ctx.fill()}if(!reduced)requestAnimationFrame(paint)}window.addEventListener('resize',resize);window.addEventListener('pointermove',e=>{mouse={x:e.clientX,y:e.clientY};if(reduced)paint()});window.addEventListener('pointerleave',()=>{mouse=null;if(reduced)paint()});resize();paint()}
{ // Safari/iOS: cap the expensive decorative layer without removing it.
function initConstellation(){const canvas=$('#constellation'),ctx=canvas?.getContext('2d',{alpha:true});if(!ctx)return;let w=0,h=0,pts=[],mouse=null,lastPaint=0,raf=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,coarse=matchMedia('(pointer:coarse)').matches;function resize(){const dpr=Math.min(window.devicePixelRatio||1,coarse?1.25:1.75);w=innerWidth;h=innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(dpr,0,0,dpr,0,0);const count=coarse?Math.min(38,Math.floor(w/10)):Math.min(72,Math.floor(w/19));pts=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.14,vy:(Math.random()-.5)*.14,r:Math.random()*1.4+.35}))}function paint(time=0){raf=0;if(document.hidden)return;if(!reduced&&time-lastPaint<32){raf=requestAnimationFrame(paint);return}lastPaint=time;ctx.clearRect(0,0,w,h);const linkDistance=coarse?92:116;for(let i=0;i<pts.length;i++){const a=pts[i];if(!reduced){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>w)a.vx*=-1;if(a.y<0||a.y>h)a.vy*=-1}ctx.beginPath();ctx.fillStyle='rgba(198,167,255,.72)';ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();if(coarse)continue;for(let j=i+1;j<pts.length;j++){const b=pts[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<linkDistance){ctx.strokeStyle=`rgba(163,112,240,${(1-d/linkDistance)*.22})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}if(!reduced)raf=requestAnimationFrame(paint)}function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(paint)}window.addEventListener('resize',()=>{resize();schedule()},{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastPaint=0;schedule()}});if(!coarse){window.addEventListener('pointermove',e=>{mouse={x:e.clientX,y:e.clientY}},{passive:true});window.addEventListener('pointerleave',()=>{mouse=null},{passive:true})}resize();paint()}
initConstellation();
}
$('#year').textContent=new Date().getFullYear();
initProfileModal();
$('#refreshBtn').addEventListener('click',loadData);
const dateRangeFilter=$('#dateRangeFilter'),customDateRange=$('#customDateRange'),dateRangeStart=$('#dateRangeStart'),dateRangeEnd=$('#dateRangeEnd');
function refreshDateFilter(){customDateRange?.classList.toggle('hidden',dateFilter.preset!=='custom');if(dashboard){renderOverview();shown=10;renderHistory();}}
dateRangeFilter?.addEventListener('change',()=>{dateFilter.preset=dateRangeFilter.value;refreshDateFilter();});
dateRangeStart?.addEventListener('change',()=>{dateFilter.start=dateRangeStart.value;refreshDateFilter();});
dateRangeEnd?.addEventListener('change',()=>{dateFilter.end=dateRangeEnd.value;refreshDateFilter();});
$('#searchStreamers').addEventListener('input',renderStreamers);
$('#streamerSort').addEventListener('change',renderStreamers);
$('#streamerLiveFilter').addEventListener('change',renderStreamers);
$('#historyStatus').addEventListener('change',()=>{shown=10;renderHistory()});
['historyStreamer','historyPeriod','historyRaid','historyCoverage'].forEach(id=>$('#'+id).addEventListener('change',()=>{shown=10;renderHistory()}));
$('#loadMore').addEventListener('click',()=>{shown+=10;renderHistory()});
$('#historyBody').addEventListener('click',e=>{const button=e.target.closest('.gap-details');if(button)showCoverageModal(button)});
$('#coverageModalClose')?.addEventListener('click',closeCoverageModal);
coverageModal?.addEventListener('click',e=>{if(e.target===coverageModal||e.target.matches('[data-coverage-close]'))closeCoverageModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!coverageModal?.classList.contains('hidden'))closeCoverageModal()});
$('#streamerGrid').addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(b)showProfile(b.dataset.profile)});
$('#closeDrawer').addEventListener('click',closeProfile);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile()});
$('#logoutButton')?.addEventListener('click',async()=>{const button=$('#logoutButton');button.disabled=true;button.textContent='SAINDO...';await supabase.auth.signOut();window.location.replace('./')});
document.querySelectorAll('.top-nav a').forEach(a=>a.addEventListener('click',()=>{
  topNav?.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded','false');
  menuToggle?.setAttribute('aria-label','Abrir menu');
}));
function showProfile(login){
  showProfileLegacy(login);
  const profile=(dashboard?.streamers||[]).find(s=>s.login===login);
  const content=$('#drawerContent');
  if(!profile||!content)return;
  const avatar=content.querySelector('.profile-header .avatar');
  if(avatar)avatar.outerHTML=avatarMarkup(login,profile.profileImageUrl);
  const watched=(profile.watchedLives||[]).filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i);
  if(!watched.length)return;
  const section=document.createElement('section');
  section.className='profile-watched-lives';
  section.innerHTML=`<h3 class="profile-subhead">Lives assistidas</h3>${watched.map(r=>`<div class="profile-session"><div><time>${esc(dateBR(r.startedAt||r.endedAt))}</time><p>${esc(r.login)}</p></div>${badge(r.status)}</div>`).join('')}`;
  content.appendChild(section);
}
loadData();

function splitViewDestination(){document.querySelectorAll('#historyBody td[data-label="Views"]').forEach(cell=>{const match=cell.textContent.trim().match(/^(.+?) enviados para (.+)$/);if(!match)return;cell.innerHTML=`<span class="views-stack"><span>${esc(match[1])} enviados</span><small class="views-destination">${esc(match[2])}</small></span>`})}
const renderHistoryOriginal=renderHistory;
renderHistory=()=>{renderHistoryOriginal();splitViewDestination()};
const viewDestinationObserver=new MutationObserver(splitViewDestination);
viewDestinationObserver.observe($('#historyBody'),{childList:true,subtree:true});
splitViewDestination();

function splitCoverageDetails(){document.querySelectorAll('#historyBody td[data-label="Cobertura"]>span:not(.coverage-stack)').forEach(cell=>{const match=cell.textContent.trim().match(/^(.+?) · (.+)$/);if(!match)return;cell.classList.add('coverage-stack');cell.innerHTML=`<span>${esc(match[1])}</span><small class="coverage-detail">${esc(match[2])}</small>`})}
const coverageObserver=new MutationObserver(splitCoverageDetails);
coverageObserver.observe($('#historyBody'),{childList:true,subtree:true});
splitCoverageDetails();
