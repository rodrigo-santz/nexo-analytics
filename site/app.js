const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v) => new Intl.NumberFormat('pt-BR').format(Number(v)||0);
const dateBR = (v) => v ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)) : 'Não registrado';
const statusNames = {raid_nexo:'RAID NEXO',raid_externa:'RAID EXTERNA',sem_raid:'SEM RAID DETECTADA',inconclusiva:'INCONCLUSIVA',live:'AO VIVO',aguardando:'AGUARDANDO'};
const badge = (status) => `<span class="status-chip status-${esc(status)}">${statusNames[status] || esc(status)}</span>`;
const validLogin = (s) => /^[a-z0-9_]{3,25}$/.test(String(s||''));
let dashboard = null, shown = 10, isDemo = new URLSearchParams(location.search).get('demo') === '1';

function icon(symbol){return `<span aria-hidden="true">${symbol}</span>`}
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
}
function sortedStreamers(){
  const query=$('#searchStreamers').value.trim().toLowerCase();
  const field=$('#streamerSort').value;
  const items=[...(dashboard.streamers||[])].filter(s=>s.login.toLowerCase().includes(query));
  items.sort((a,b)=>field==='name'?a.login.localeCompare(b.login,'pt-BR'):(b[field]||0)-(a[field]||0)||a.login.localeCompare(b.login,'pt-BR'));
  return items;
}
function renderStreamers(){
  const s=sortedStreamers();$('#streamerCount').textContent=`${s.length} streamers`;
  $('#streamerGrid').innerHTML = s.length?s.map(p=>`<button class="streamer-card" data-profile="${esc(p.login)}"><span class="streamer-top"><span class="avatar">${esc(p.login.charAt(0).toUpperCase())}</span><span class="member-badge">NEXO MEMBER</span></span><div class="streamer-name">${esc(p.login)}</div><div class="streamer-link">twitch.tv/${esc(p.login)}</div><div class="streamer-div"></div><div class="streamer-stats"><div class="streamer-stat"><strong>${fmt(p.lives)}</strong><small>LIVES</small></div><div class="streamer-stat"><strong>${fmt(p.raids)}</strong><small>RAIDS</small></div><div class="streamer-stat"><strong style="color:#bd8efb">${fmt(p.nexo)}</strong><small>PARA NEXO</small></div></div><span class="streamer-footer">VER HISTÓRICO <span aria-hidden="true">↗</span></span></button>`).join(''):'<div class="empty-state">Nenhum streamer corresponde à sua busca.</div>';
}
function historySorted(){return [...(dashboard.recent||[])].filter(r=>$('#historyStatus').value==='all'||r.status===$('#historyStatus').value).sort((a,b)=>new Date(b.endedAt||b.startedAt||0)-new Date(a.endedAt||a.startedAt||0));}
function historyRow(r){const to=r.raid?.toLogin||'—';const audience=r.raid?.viewers;return `<tr><td><div class="td-user"><span class="mini-avatar">${esc(r.login?.charAt(0).toUpperCase()||'?')}</span>${esc(r.login)}</div></td><td>${esc(dateBR(r.startedAt))}</td><td>${badge(r.status)}</td><td>${esc(to)}</td><td>${audience==null?'—':fmt(audience)}</td><td>${r.coverageIssues?.length?`<span title="${esc(r.coverageIssues.join('; '))}" style="color:#ffc17a">⚠ Parcial</span>`:'<span style="color:#91d8b8">✓</span>'}</td></tr>`;}
function renderHistory(){const rows=historySorted();$('#historyBody').innerHTML=rows.length?rows.slice(0,shown).map(historyRow).join(''):'<tr><td class="table-empty" colspan="6">Nenhum histórico registrado para este filtro.</td></tr>';$('#historyCount').textContent=`Exibindo ${Math.min(shown,rows.length)} de ${fmt(rows.length)} registros`;$('#loadMore').classList.toggle('hidden',shown>=rows.length);}
function showProfile(login){
  const p=(dashboard?.streamers||[]).find(s=>s.login===login);if(!p)return;
  const sessions=(dashboard.recent||[]).filter(r=>r.login===login).slice(0,60);
  $('#drawerContent').innerHTML=`<span class="kicker">FICHA DO CRIADOR / NEXO SYNERGY</span><div class="profile-header"><span class="avatar">${esc(login.charAt(0).toUpperCase())}</span><div><h2 id="drawerTitle">${esc(login)}</h2>${validLogin(login)?`<a href="https://www.twitch.tv/${encodeURIComponent(login)}" target="_blank" rel="noopener noreferrer">Abrir Twitch ↗</a>`:''}</div></div><div class="profile-metrics">${[['Lives',p.lives],['Raids totais',p.raids],['Para NEXO',p.nexo],['Para fora',p.externas],['Sem raid detectada',p.semRaid],['Inconclusivas',p.inconclusivas]].map(([l,v])=>`<div class="profile-metric"><strong>${fmt(v)}</strong><span>${l}</span></div>`).join('')}</div><h3 class="profile-subhead">Histórico da comunidade</h3>${sessions.length?sessions.map(r=>`<div class="profile-session"><div><time>${esc(dateBR(r.startedAt||r.endedAt))}</time><p>${r.raid?.toLogin?`Destino: ${esc(r.raid.toLogin)}`:r.coverageIssues?.length?'Monitoramento parcial':'Transmissão registrada'}</p></div>${badge(r.status)}</div>`).join(''):'<p class="empty-small">Nenhuma live registrada ainda.</p>'}<div class="profile-issue">⚠ “Sem raid detectada” não significa prova de ausência. Lives com falhas identificadas são classificadas como inconclusivas.</div>`;
  $('#drawerLayer').classList.remove('hidden');document.body.style.overflow='hidden';$('#closeDrawer').focus();
}
function closeProfile(){ $('#drawerLayer').classList.add('hidden');document.body.style.overflow='';}
function render(){renderOverview();renderStreamers();renderHistory();$('#demoNotice').classList.toggle('hidden',!isDemo);$('#dataNotice').classList.toggle('hidden',true)}
async function loadData(){const b=$('#refreshBtn');b.disabled=true;try{if(window.__NEXO_EMBEDDED){dashboard=window.__NEXO_EMBEDDED;isDemo=true;}else{const file=isDemo?'./data/demo-dashboard.json':'./data/dashboard.json';const res=await fetch(`${file}?_=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);dashboard=await res.json();}render();if(!isDemo&&!(dashboard.recent||[]).length){const el=$('#dataNotice');el.classList.remove('hidden');el.innerHTML='Os registros reais ainda estão vazios. <a style="color:#dcb5ff;text-decoration:underline" href="?demo=1#visao-geral">Visualizar demonstração com dados fictícios</a>.';}}catch(e){$('#dataNotice').classList.remove('hidden');$('#dataNotice').textContent=`Não foi possível carregar os dados: ${e.message}. Verifique a publicação dos arquivos.`;console.error(e)}finally{b.disabled=false}}
function initConstellation(){const canvas=$('#constellation'),ctx=canvas.getContext('2d');if(!ctx)return;let w=0,h=0,pts=[];const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function resize(){w=canvas.width=window.innerWidth*devicePixelRatio;h=canvas.height=window.innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const count=Math.min(92,Math.floor(window.innerWidth/19));pts=Array.from({length:count},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.14,vy:(Math.random()-.5)*.14,r:Math.random()*1.6+.4}))}function paint(){ctx.clearRect(0,0,innerWidth,innerHeight);for(let i=0;i<pts.length;i++){const a=pts[i];if(!reduced){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>innerWidth)a.vx*=-1;if(a.y<0||a.y>innerHeight)a.vy*=-1;}ctx.beginPath();ctx.fillStyle='rgba(198,167,255,.72)';ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();for(let j=i+1;j<pts.length;j++){const b=pts[j];const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<116){ctx.strokeStyle=`rgba(163,112,240,${(1-d/116)*.22})`;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}if(!reduced)requestAnimationFrame(paint)}window.addEventListener('resize',resize);resize();paint()}
$('#year').textContent=new Date().getFullYear();
$('#refreshBtn').addEventListener('click',loadData);
$('#searchStreamers').addEventListener('input',renderStreamers);
$('#streamerSort').addEventListener('change',renderStreamers);
$('#historyStatus').addEventListener('change',()=>{shown=10;renderHistory()});
$('#loadMore').addEventListener('click',()=>{shown+=10;renderHistory()});
$('#streamerGrid').addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(b)showProfile(b.dataset.profile)});
$('#closeDrawer').addEventListener('click',closeProfile);$('#drawerShade').addEventListener('click',closeProfile);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile()});
$('#exitDemo').addEventListener('click',()=>{location.href='./#visao-geral'});
$('#menuToggle').addEventListener('click',()=>{const n=$('.top-nav');n.classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(n.classList.contains('open')))});
document.querySelectorAll('.top-nav a').forEach(a=>a.addEventListener('click',()=>$('.top-nav').classList.remove('open')));
initConstellation();loadData();
