import {readFile,writeFile,mkdir} from 'node:fs/promises';

const args=process.argv.slice(2),command=args[0],value=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:''};
const streamId=value('--stream-id'),reviewer=value('--reviewer'),reason=value('--reason'),conclusion=value('--status');
const allowed=['raid_nexo','raid_externa','sem_raid','inconclusiva'];
if(!['mark','complete'].includes(command)||!streamId||!reviewer||!reason||(command==='complete'&&!allowed.includes(conclusion))){
  console.error('Uso: node scripts/review.mjs mark|complete --stream-id ID --reviewer NOME --reason MOTIVO [--status raid_nexo|raid_externa|sem_raid|inconclusiva]');process.exit(1);
}
const path='data/health/manual-reviews.json';let reviews=[];try{reviews=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
reviews.push({id:`review-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,streamId,action:command,conclusion:command==='complete'?conclusion:null,reason,reviewer,changedAt:new Date().toISOString()});
await mkdir('data/health',{recursive:true});await writeFile(path,JSON.stringify(reviews,null,2)+'\n');console.log(`Revisão ${command} registrada para ${streamId} por ${reviewer}.`);
