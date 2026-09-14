import {readdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');let count=0,failed=false;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','cache','.git'].includes(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status){console.error(r.stderr);failed=true;}count++;}}}
await walk(root);console.log(`Syntax checked ${count} JavaScript modules.`);if(failed)process.exitCode=1;
