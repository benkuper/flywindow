import {mkdir,readFile,writeFile,rename,readdir,unlink,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
/** Bounded cache + in-flight deduplication. Stale values remain explicitly marked. */
export class Cache {
  constructor(dir,{maxEntries=2500,maxDiskEntries=5000}={}){this.dir=dir;this.maxEntries=maxEntries;this.maxDiskEntries=maxDiskEntries;this.memory=new Map();this.inflight=new Map();this.writes=0;}
  path(key){return join(this.dir,createHash('sha256').update(key).digest('hex')+'.json');}
  async get(key){
    if(this.memory.has(key)) return this.memory.get(key);
    try {const value=JSON.parse(await readFile(this.path(key),'utf8'));if(!value || !Number.isFinite(value.fetchedAt)) return null;this.remember(key,value);return value;}catch{return null;}
  }
  remember(key,value){this.memory.delete(key);this.memory.set(key,value);while(this.memory.size>this.maxEntries)this.memory.delete(this.memory.keys().next().value);}
  async put(key,data){
    const entry={data,fetchedAt:Date.now()};this.remember(key,entry);
    try{await mkdir(this.dir,{recursive:true});const tmp=this.path(key)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(entry));await rename(tmp,this.path(key));if(++this.writes%100===0)await this.prune();}catch(e){console.warn('Cache write unavailable:',e.code||e.message);}
    return entry;
  }
  async prune(){
    try {const names=(await readdir(this.dir)).filter(n=>n.endsWith('.json'));if(names.length<=this.maxDiskEntries)return;const files=await Promise.all(names.map(async n=>({n,t:(await stat(join(this.dir,n))).mtimeMs})));files.sort((a,b)=>a.t-b.t);await Promise.all(files.slice(0,names.length-this.maxDiskEntries).map(f=>unlink(join(this.dir,f.n))));}catch{}
  }
  async load(key,ttl,fn,{staleMax=0}={}){
    const old=await this.get(key);
    if(old && Date.now()-old.fetchedAt<ttl)return {...old,cached:true,stale:false};
    if(this.inflight.has(key))return this.inflight.get(key);
    const promise=(async()=>{try {const entry=await this.put(key,await fn());return {...entry,cached:false,stale:false};}catch(e){if(old && staleMax && Date.now()-old.fetchedAt<staleMax)return {...old,cached:true,stale:true,warning:e.message};throw e;}finally{this.inflight.delete(key);}})();
    this.inflight.set(key,promise);return promise;
  }
}
