import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {access,readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app='/var/www/vhosts/goldengeek.org/flywindow-app';
const publicUrl='https://www.goldengeek.org/tools/flywindow/';
const release=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+randomBytes(3).toString('hex');
const args=process.argv.slice(2);
if(args.includes('--help')){
  console.log('Usage: npm run deploy [-- --target user@host] [--dry-run] [--with-ui-tests]');
  console.log('Uses the ignored .vscode/sftp.json by default; --target selects SSH key mode.');
  process.exit(0);
}
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const dryRun=args.includes('--dry-run'),withUiTests=args.includes('--with-ui-tests');
const config=await readFile(join(root,'.deploy.local.json'),'utf8').then(JSON.parse).catch(error=>{
  if(error.code==='ENOENT')return {};
  throw error;
});
const target=option('--target')??process.env.FLYWINDOW_SSH_TARGET??config.target;
const sftpSettings=join(root,'.vscode','sftp.json');
const useSftp=!target&&await access(sftpSettings).then(()=>true).catch(()=>false);
const port=Number(option('--port')??process.env.FLYWINDOW_SSH_PORT??config.port??22);
const identity=option('--identity')??process.env.FLYWINDOW_SSH_IDENTITY??config.identityFile;
if(!dryRun&&!useSftp&&!/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$/.test(target??''))throw new Error('Restore .vscode/sftp.json or set a valid SSH target (user@host) in .deploy.local.json, FLYWINDOW_SSH_TARGET, or --target.');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SSH port must be an integer from 1 to 65535.');
const sshOptions=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12','-p',String(port),...(identity?['-i',resolve(identity)]:[])];
const scpOptions=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12','-P',String(port),...(identity?['-i',resolve(identity)]:[])];

function run(command,commandArgs,{input,cwd=root}={}){
  return new Promise((done,reject)=>{
    const child=spawn(command,commandArgs,{cwd,stdio:[input===undefined?'inherit':'pipe','inherit','inherit'],windowsHide:true});
    child.on('error',reject);
    child.on('exit',(code,signal)=>code===0?done():reject(new Error(`${command} failed (${signal??code})`)));
    if(input!==undefined)child.stdin.end(input);
  });
}
const runNpm=script=>process.platform==='win32'?run('cmd.exe',['/d','/s','/c',`npm run ${script}`]):run('npm',['run',script]);
const ssh=script=>run('ssh',[...sshOptions,target,'sh','-s'],{input:script});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

const preflight=`set -eu
app='${app}'
test -d "$app" && test -w "$app" && test -f "$app/.env"
test -f "$app/ensure-running.sh" && test -f "$app/run.pid"
for name in public server scripts package.json package-lock.json; do test -e "$app/$name"; done
command -v tar >/dev/null && command -v curl >/dev/null && command -v flock >/dev/null
test -x /opt/plesk/node/22/bin/node
pid=$(cat "$app/run.pid")
if curl -fsS --max-time 5 http://127.0.0.1:38321/api/health >/dev/null; then
  test -n "$pid" && kill -0 "$pid"
  ps -p "$pid" -o args= | grep -F "$app/server/index.mjs" >/dev/null
fi
echo 'Plesk app and tracked Node process are ready.'
`;

const install=`set -eu
app='${app}'
id='${release}'
archive="$app/.deploy-$id.tgz"
stage="$app/.deploy-stage-$id"
backup="$app/.deploy-backups/$id"
parts='public server scripts package.json package-lock.json'
changed=0
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$changed" -eq 1 ]; then
    echo 'Deployment failed; restoring the previous release.' >&2
    pid=$(cat "$app/run.pid" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o args= | grep -F "$app/server/index.mjs" >/dev/null; then kill "$pid" || true; fi
    for part in $parts; do
      if [ -e "$backup/$part" ]; then rm -rf "$app/$part"; mv "$backup/$part" "$app/$part"; fi
    done
    exec 9>&- || true
    sh "$app/ensure-running.sh" || true
  fi
  rm -rf "$stage"
  rm -f "$archive"
  exit "$code"
}
trap rollback EXIT
mkdir -p "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
for part in $parts; do test -e "$stage/$part"; done
pid=$(cat "$app/run.pid")
test -n "$pid" && kill -0 "$pid"
ps -p "$pid" -o args= | grep -F "$app/server/index.mjs" >/dev/null
exec 9>"$app/run.lock"
flock -x 9
for part in $parts; do
  mv "$app/$part" "$backup/$part"
  changed=1
  mv "$stage/$part" "$app/$part"
done
kill "$pid"
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 12 ]; do sleep 1; i=$((i+1)); done
if kill -0 "$pid" 2>/dev/null; then echo 'Old Node process did not stop.' >&2; exit 1; fi
exec 9>&-
sh "$app/ensure-running.sh"
curl -fsS --max-time 8 http://127.0.0.1:38321/api/health >/dev/null
echo "Release $id installed; previous files saved in $backup"
`;

async function verifyPublic(){
  const health=await fetch(new URL('api/health',publicUrl),{signal:AbortSignal.timeout(15000)});
  if(!health.ok||(await health.json()).ok!==true)throw new Error('Public HTTPS health check failed.');
  for(const name of ['index.html','app.mjs','ui.mjs','day-view.mjs','shared/core.mjs','styles.css','theme.css','layout.css','day-view.css']){
    const response=await fetch(new URL(name,publicUrl),{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Public ${name} returned HTTP ${response.status}.`);
    const local=await readFile(join(root,'public',name)),remote=Buffer.from(await response.arrayBuffer());
    if(hash(local)!==hash(remote))throw new Error(`Public ${name} does not match the uploaded release.`);
  }
  console.log(`Verified live HTTPS app: ${publicUrl}`);
}

let temporary;
try{
  console.log('Checking local source...');
  await runNpm('check');
  if(withUiTests)await runNpm('test:ui');
  temporary=await mkdtemp(join(tmpdir(),'flywindow-deploy-'));
  const archive=join(temporary,'release.tgz');
  await run('tar',['-czf',archive,'-C',root,'public','server','scripts','package.json','package-lock.json']);
  if(dryRun){console.log('Dry run passed: release packaged locally; no server changes.');}
  else{
    if(useSftp){
      console.log('Connecting with the existing VS Code SFTP settings...');
      await run('python',['scripts/deploy-plesk-transport.py'],{input:JSON.stringify({archive,remoteArchive:`${app}/.deploy-${release}.tgz`,preflight,install})});
    }else{
      console.log(`Checking SSH access to ${target}...`);
      await ssh(preflight);
      console.log('Uploading release...');
      await run('scp',[...scpOptions,archive,`${target}:${app}/.deploy-${release}.tgz`]);
      console.log('Installing and restarting Node...');
      await ssh(install);
    }
    console.log('Checking public HTTPS assets...');
    await verifyPublic();
  }
}catch(error){
  console.error(`Deployment stopped: ${error.message}`);
  process.exitCode=1;
}finally{
  if(temporary){
    const parent=resolve(tmpdir()),candidate=resolve(temporary);
    if(candidate.startsWith(parent+sep)&&basename(candidate).startsWith('flywindow-deploy-'))await rm(candidate,{recursive:true,force:true});
  }
}
