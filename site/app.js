const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v) => new Intl.NumberFormat('pt-BR').format(Number(v)||0);
const dateBR = (v) => v ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)) : 'Não registrado';
const statusNames = {raid_nexo:'RAID NEXO',raid_externa:'RAID EXTERNA',sem_raid:'SEM RAID DETECTADA',inconclusiva:'INCONCLUSIVA',live:'AO VIVO',aguardando:'AGUARDANDO'};
const badge = (status) => `<span class="status-chip status-${esc(status)}">${statusNames[status] || esc(status)}</span>`;
const validLogin = (s) => /^[a-z0-9_]{3,25}$/.test(String(s||''));
let dashboard = null, shown = 10;
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
function metric(label,value,symbol,note,variant='') {return `<article class="metric-card ${variant}"><div class="metric-top"><span class="metric-label">${label}</span><span class="metric-icon">${icon(symbol)}</span></div><div class="metric-value">${fmt(value)}</div><div class="metric-note">${note}</div></article>`;}
function renderOverview(){
  const o=dashboard.overview||{};
  $('#metrics').innerHTML = [
    metric('Lives monitoradas',o.lives,'◉','Transmissões com registro'),
    metric('Raids enviadas',o.raids,'↗','Total de raids identificadas','accent'),
    metric('Raids para NEXO',o.nexo,'✧','Fortalecimento interno','accent'),
    metric('Raids externas',o.externas,'↗','Para outros canais'),
    metric('Sem raid detectada',o.semRaid,'⊘','Monitoramento disponível'),
    metric('Inconclusivas',o.inconclusivas,'!','Não foi possível confirmar','warning')].join('');
  const last = dashboard.updatedAt ? dateBR(dashboard.updatedAt) : 'Sem sincronização';
  $('#lastSync').textContent = `Atualizado: ${last}`;
  const daily = dashboard.daily || [];
  const days = Array.from({length:14},(_,i)=>{const dt = new Date();dt.setUTCDate(dt.getUTCDate()-13+i);return dt.toISOString().slice(0,10)});
  const byDay = new Map(daily.map(d=>[d.date,d]));
  const points = days.map(d=>({date:d,...(byDay.get(d)||{lives:0,raids:0})}));
  const peak=Math.max(1,...points.flatMap(p=>[p.lives,p.raids]));
  $('#activityChart').innerHTML=points.map(p=>`<div class="activity-day" title="${p.date}: ${p.lives} lives, ${p.raids} raids"><div class="activity-bars"><span class="bar-live" style="height:${Math.max(2,p.lives/peak*100)}%"></span><span class="bar-raid" style="height:${Math.max(2,p.raids/peak*100)}%"></span></div><small>${p.date.slice(8)}</small></div>`).join('');
  const raids = (o.nexo||0)+(o.externas||0);
  const pct = raids>0 ? Math.round((o.nexo||0)/raids*100) : 0;
  $('#raidDonut').style.setProperty('--pct',`${pct}%`);
  $('#donutPct').textContent=`${pct}%`;
  $('#destinationLegend').innerHTML=`<span><i class="legend-dot purple"></i> NEXO <strong>${fmt(o.nexo)}</strong></span><span><i class="legend-dot cyan"></i> Externas <strong>${fmt(o.externas)}</strong></span>`;
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
  items.sort((a,b)=>field==='name'?a.login.localeCompare(b.login,'pt-BR'):(b[field]||0)-(a[field]||0)||a.login.localeCompare(b.login,'pt-BR'));
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
function historySorted(){const streamer=$('#historyStreamer').value,period=$('#historyPeriod').value,raidFilter=$('#historyRaid').value,coverage=$('#historyCoverage').value,status=$('#historyStatus').value;const cutoff=period==='all'?0:Date.now()-({24:86400000,7:604800000,30:2592000000}[period]||0);return [...(dashboard.recent||[])].filter(r=>(streamer==='all'||r.login===streamer)&&(status==='all'||r.status===status)&&(coverage==='all'||r.coverageStatus===coverage)&&(raidFilter==='all'||raidFilter==='confirmed'&&!!r.raid&&r.raid.destinationKnown||raidFilter==='none'&&!r.raid||raidFilter==='unknown'&&r.raid&&!r.raid.destinationKnown)&&new Date(r.endedAt||r.startedAt||0).getTime()>=cutoff).sort((a,b)=>new Date(b.endedAt||b.startedAt||0)-new Date(a.endedAt||a.startedAt||0));}
function duration(start,end){const a=new Date(start||0).getTime(),b=new Date(end||0).getTime();if(!start||!end||!Number.isFinite(a)||!Number.isFinite(b))return '—';const min=Math.max(0,Math.round((b-a)/60000));return min>=60?`${Math.floor(min/60)}h ${min%60}min`:`${min}min`;}
function historyRow(r){const monitored=r.monitoredDurationMs!=null?`${Math.round(r.monitoredDurationMs/60000)} min monitorados`:'';const coverage=r.coverageStatus==='failure'?`<span title="${esc((r.coverageIssues||[]).join('; '))}" style="color:#ff8d8d">✕ Falha</span>`:r.coverageStatus==='partial'?`<span title="${esc([...(r.coverageIssues||[]),...(r.coverageGaps||[]).map(g=>`${g.start} → ${g.end}`)].join('; '))}" style="color:#ffc17a">⚠ Parcial${monitored?` · ${monitored}`:''}</span>`:`<span style="color:#91d8b8">✓ Completa${monitored?` · ${monitored}`:''}</span>`;const raid=badge(r.status);return `<tr><td data-label="Streamer"><div class="td-user"><span class="mini-avatar">${esc(r.login?.charAt(0).toUpperCase()||'?')}</span>${esc(r.login)}</div></td><td data-label="Início / fim"><span class="date-stack">${esc(dateBR(r.startedAt))}<small>fim: ${esc(dateBR(r.endedAt))}</small></span></td><td data-label="Duração">${duration(r.startedAt,r.endedAt)}</td><td data-label="Raid">${raid}</td><td data-label="Cobertura">${coverage}${r.coverageGaps?.length?`<button class="gap-details" type="button" data-gaps="${esc(JSON.stringify(r.coverageGaps))}">ver intervalos</button>`:''}</td><td data-label="Atualizado">${esc(dateBR(r.manualReview?.changedAt||r.updatedAt||dashboard.updatedAt))}</td></tr>`;}
function renderHistory(){const rows=historySorted();$('#historyBody').innerHTML=rows.length?rows.slice(0,shown).map(historyRow).join(''):'<tr><td class="table-empty" colspan="6">Nenhum histórico registrado para este filtro.</td></tr>';$('#historyCount').textContent=`Exibindo ${Math.min(shown,rows.length)} de ${fmt(rows.length)} registros`;$('#loadMore').classList.toggle('hidden',shown>=rows.length);}
function showProfileLegacy(login){
  const p=(dashboard?.streamers||[]).find(s=>s.login===login);if(!p)return;
  const sessions=(dashboard.recent||[]).filter(r=>r.login===login).slice(0,60);
  $('#drawerContent').innerHTML=`<span class="kicker">FICHA DO CRIADOR / NEXO SYNERGY</span><div class="profile-header"><span class="avatar">${esc(login.charAt(0).toUpperCase())}</span><div><h2 id="drawerTitle">${esc(login)}</h2>${validLogin(login)?`<a href="https://www.twitch.tv/${encodeURIComponent(login)}" target="_blank" rel="noopener noreferrer">Abrir Twitch ↗</a>`:''}</div></div><div class="profile-metrics">${[['Lives',p.lives],['Raids totais',p.raids],['Para NEXO',p.nexo],['Para fora',p.externas],['Sem raid detectada',p.semRaid],['Inconclusivas',p.inconclusivas]].map(([l,v])=>`<div class="profile-metric"><strong>${fmt(v)}</strong><span>${l}</span></div>`).join('')}</div><h3 class="profile-subhead">Histórico da comunidade</h3>${sessions.length?sessions.map(r=>`<div class="profile-session"><div><time>${esc(dateBR(r.startedAt||r.endedAt))}</time><p>${r.raid?.toLogin?`Destino: ${esc(r.raid.toLogin)}`:r.coverageIssues?.length?'Monitoramento parcial':'Transmissão registrada'}</p></div>${badge(r.status)}</div>`).join(''):'<p class="empty-small">Nenhuma live registrada ainda.</p>'}<div class="profile-issue">⚠ “Sem raid detectada” não significa prova de ausência. Lives com falhas identificadas são classificadas como inconclusivas.</div>`;
  drawerModal?.show();
}
function showProfile(login){
  showProfileLegacy(login);
  const profile=(dashboard?.streamers||[]).find(s=>s.login===login);
  const avatar=document.querySelector('#drawerContent .profile-header .avatar');
  if(avatar&&profile)avatar.outerHTML=avatarMarkup(login,profile.profileImageUrl);
}
function closeProfile(){ drawerModal?.hide(); }
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
$('#searchStreamers').addEventListener('input',renderStreamers);
$('#streamerSort').addEventListener('change',renderStreamers);
$('#streamerLiveFilter').addEventListener('change',renderStreamers);
$('#historyStatus').addEventListener('change',()=>{shown=10;renderHistory()});
['historyStreamer','historyPeriod','historyRaid','historyCoverage'].forEach(id=>$('#'+id).addEventListener('change',()=>{shown=10;renderHistory()}));
$('#loadMore').addEventListener('click',()=>{shown+=10;renderHistory()});
$('#historyBody').addEventListener('click',e=>{const button=e.target.closest('.gap-details');if(!button)return;try{const gaps=JSON.parse(button.dataset.gaps||'[]');alert(gaps.map(g=>`${g.start} → ${g.end}: ${g.reason}`).join('\n'))}catch{alert('Não foi possível abrir os intervalos desta transmissão.')}});
$('#streamerGrid').addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(b)showProfile(b.dataset.profile)});
$('#closeDrawer').addEventListener('click',closeProfile);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile()});
$('#menuToggle').addEventListener('click',()=>{const n=$('.top-nav');n.classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(n.classList.contains('open')))});
document.querySelectorAll('.top-nav a').forEach(a=>a.addEventListener('click',()=>$('.top-nav').classList.remove('open')));
loadData();
