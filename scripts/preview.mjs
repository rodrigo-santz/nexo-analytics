import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const site='site';
const server=http.createServer(async (req,res)=>{
  const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const rel=requestPath.replace(/^\/+/, '').replace(/\\/g,'/');
  if(rel.includes('..')){res.writeHead(403).end();return;}
  let path=rel.startsWith('data/dashboard.json')?'data/dashboard.json':join(site,rel||'index.html');
  try{const data=await readFile(path);res.writeHead(200,{'content-type':contentTypes[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(data)}
  catch{res.writeHead(404).end('Arquivo não encontrado')}
});
server.listen(4173,'0.0.0.0',()=>console.log('NEXO Analytics: http://localhost:4173/\nPrévia com dados fictícios: http://localhost:4173/?demo=1'));
