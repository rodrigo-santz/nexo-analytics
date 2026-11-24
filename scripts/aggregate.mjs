import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildDashboard} from './lib.mjs';
async function readJson(path, fallback){try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
async function allFiles(dir){let names=[];for(const d of await readdir(dir,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))){const p=join(dir,d.name);if(d.isDirectory())names.push(...await allFiles(p));else if(d.name.endsWith('.json'))names.push(p)}return names}
const files=await allFiles('data/events');
const events=[];for(const f of files){try{events.push(JSON.parse(await readFile(f,'utf8')))}catch(e){console.warn('Evento inválido:',f,e.message)}}
const names=await readJson('data/streamers.json',[]);
const archivedNames=await readJson('data/streamers-archived.json',[]);
const archivedAt=await readJson('data/streamers-archived-at.json',{});
const allNames=[...new Set([...names,...archivedNames].map(name=>String(typeof name==='object'?name.login:name).trim().toLowerCase()).filter(Boolean))];
const health=await readJson('data/health/status.json',{});
const profiles=await readJson('data/streamer-profiles.json',{});
const reviews=await readJson('data/health/manual-reviews.json',[]);
const data=buildDashboard(events,allNames,health,new Date().toISOString(),profiles,reviews,names,archivedAt);
await writeFile('data/dashboard.json',JSON.stringify(data,null,2)+'\n');
console.log(`Gerado dashboard: ${data.overview.lives} lives, ${data.overview.raids} raids, ${files.length} eventos brutos.`);
