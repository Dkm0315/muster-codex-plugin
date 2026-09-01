import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { CdpClient, findCodexTarget } from "./cdp.mjs";
import { readThreadActivity } from "./activity.mjs";
import { createTaskObserver } from "./observer.mjs";
import { loadBoard, readFullFileSnapshot } from "../server/core.mjs";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const valueAfter = (name, fallback) => { const index=args.indexOf(name); return index>=0?args[index+1]:fallback; };
const port = Number(valueAfter("--port", "9223"));
const demo = args.includes("--demo");
const codexHome = resolve(process.env.CODEX_HOME || resolve(homedir(), ".codex"));
const rendererSource = readFileSync(fileURLToPath(new URL("./renderer.js", import.meta.url)), "utf8");
const dbPaths = [resolve(codexHome,"state_5.sqlite"),resolve(codexHome,"sqlite/state_5.sqlite")];
const dbPath = dbPaths.find(existsSync);
const database = dbPath ? new DatabaseSync(dbPath,{readOnly:true}) : null;

async function gitChanged(cwd) { const commands=[["diff","HEAD","--name-only","--"],["ls-files","--others","--exclude-standard"]]; const paths=new Set(); for(const command of commands){try{const {stdout}=await execFileAsync("git",command,{cwd,encoding:"utf8",timeout:3000});stdout.split("\n").filter(Boolean).forEach(path=>paths.add(path));}catch{}} return [...paths]; }
async function gitTree(cwd) { try{const {stdout}=await execFileAsync("git",["ls-files","--cached","--others","--exclude-standard"],{cwd,encoding:"utf8",timeout:3000,maxBuffer:2*1024*1024});return stdout.split("\n").map(path=>path.trim()).filter(Boolean).filter(path=>!/(^|\/)(?:\.env(?:\..*)?|credentials?|secrets?|id_[^/]+|[^/]+\.(?:pem|key|p12|pfx))$/i.test(path)).slice(0,1000).sort();}catch{return [];} }
async function changedState(cwd) { const paths=await gitChanged(cwd); const ranked=[]; for(const path of paths){try{const info=await stat(resolve(cwd,path));if(info.isFile())ranked.push({path,mtime:info.mtimeMs,signature:`${info.mtimeMs}:${info.size}`});}catch{}} return ranked.sort((a,b)=>b.mtime-a.mtime); }
function threadContext(active) { if(!active?.id||!database)return null; const row=database.prepare("select id,cwd,coalesce(name,preview,title) as title,project_id,rollout_path from threads where id=?").get(active.id); return row?{...row,hostId:active.hostId}:null; }
function demoPayload(context) { const tree=["packages/core/src/index.ts","packages/core/src/workspace-observer.ts","packages/core/src/event-bus.ts","packages/core/test/observer-debounce.test.ts","README.md"];const before=Array.from({length:130},(_,i)=>i===74?"  private debounceMs = 50;":`// unchanged observer context ${i+1}`); const working=[...before];working[74]="  private debounceMs = 75;"; return {context:context||{cwd:"/repo/muster",title:"Pinned task"},tree,activity:[{id:"demo-1",command:"git status --short",output:" M packages/core/src/workspace-observer.ts",status:"complete"},{id:"demo-2",command:"npm test -- observer-debounce",output:"3 tests passed",status:"complete"}],file:{kind:"file",cwd:context?.cwd||"/repo/muster",path:"packages/core/src/workspace-observer.ts",lineCount:130,before:before.join("\n"),working:working.join("\n"),patch:"@@ -75 +75 @@\n-  private debounceMs = 50;\n+  private debounceMs = 75;",stats:{added:1,deleted:1},tree},board:{kind:"board",tasks:[{id:"M-101",title:"Harden observer debounce",status:"ready",model:"Sol",evidence:[]},{id:"M-102",title:"Add rapid-burst regression test",status:"running",model:"Terra",evidence:[]},{id:"M-103",title:"Verify CI stability",status:"review",model:"Terra",evidence:[{summary:"3/3 targeted runs green"}]},{id:"M-099",title:"Reproduce debounce flake",status:"done",model:"Sol",evidence:[{summary:"Flake reproduced"}]}]}}; }

let client=null,lastKey="";
const observeTask=createTaskObserver();
async function connect(){const target=await findCodexTarget(port);if(!target)throw new Error("Codex renderer target not found");client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.evaluate(`(0,eval)(${JSON.stringify(rendererSource)})`);}
async function tick(){
  if(!client)await connect();
  const rendererState=await client.evaluate("({active:window.__musterCompanion?.activeThread?.() || null,selection:window.__musterCompanion?.selection?.() || null})");
  const active=rendererState.active;
  const context=threadContext(active);
  let payload;
  if(demo)payload=demoPayload(context);
  else if(context?.hostId==="local"&&context.cwd){
    const selected=rendererState.selection?.threadId===active?.id?rendererState.selection.path:null;
    const [changed,board,allActivity,tree]=await Promise.all([changedState(context.cwd),loadBoard(context.cwd),readThreadActivity(context.rollout_path),gitTree(context.cwd)]);
    const session=observeTask(active.id,changed,allActivity);
    const visiblePath=selected||session.latestObservedPath;
    const file=visiblePath?await readFullFileSnapshot(context.cwd,visiblePath).catch(()=>null):null;
    payload={context,file,tree:file?.tree||tree,board,activity:[...session.visibleActivity.values()].slice(-12)};
  }else{
    const allActivity=await readThreadActivity(context?.rollout_path);
    const session=context?.id?observeTask(context.id,[],allActivity):null;
    payload={context,file:null,tree:[],board:{kind:"board",tasks:[]},activity:session?[...session.visibleActivity.values()].slice(-12):[]};
  }
  const key=JSON.stringify({thread:active?.id,file:payload.file?.path,size:payload.file?.size,patch:payload.file?.patch,board:payload.board?.updatedAt,activity:payload.activity?.at(-1)?.id,status:payload.activity?.at(-1)?.status});
  if(key!==lastKey){await client.evaluate(`window.__musterCompanion?.sync(${JSON.stringify(payload)})`);lastKey=key;}
}
console.log(`Muster companion attaching to Codex on 127.0.0.1:${port}${demo?" (demo)":""}`);
for(;;){try{await tick();}catch(error){console.error(error.message);client?.close();client=null;}await new Promise(resolve=>setTimeout(resolve,800));}
