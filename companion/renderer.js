(() => {
  if (window.__musterCompanion?.version === 7) return;

  const state = { tab: "codebase", width: 430, context: null, file: null, tree: [], board: null, activity: [], selectedPath: null };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const style = document.createElement("style");
  style.id = "muster-companion-style";
  style.textContent = `
    #muster-companion-panel{position:absolute;right:0;top:0;bottom:0;width:var(--muster-width,430px);z-index:25;display:flex;flex-direction:column;border-left:1px solid var(--border-default,#2b2b2b);background:var(--surface-primary,#0b0b0b);color:var(--text-primary,#eee);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
    #muster-companion-panel *{box-sizing:border-box}
    #muster-companion-resizer{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize}
    #muster-companion-header{height:44px;display:flex;align-items:center;gap:4px;padding:0 9px;border-bottom:1px solid var(--border-default,#292929)}
    #muster-companion-header button{border:0;background:transparent;color:#888;padding:7px 9px;border-radius:7px;cursor:pointer}
    #muster-companion-header button[data-active=true]{color:#eee;background:#222}
    #muster-companion-header .spacer{flex:1}
    #muster-companion-body{min-height:0;flex:1;overflow:auto}
    .muster-tree-row{display:flex;width:100%;padding:7px 12px;border:0;background:transparent;color:#aaa;text-align:left;font:12px "SFMono-Regular",Menlo,monospace;cursor:pointer}
    .muster-tree-row:hover,.muster-tree-row[data-active=true]{background:#202838;color:#a9c2ff}
    .muster-board{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:1px;min-width:780px;min-height:100%;background:#292929}
    .muster-lane{padding:9px;background:#0b0b0b}.muster-lane h4{display:flex;justify-content:space-between;margin:0 0 9px;color:#aaa;font-size:12px}
    .muster-card{display:grid;gap:5px;margin-bottom:8px;padding:9px;border:1px solid #2b2b2b;border-radius:8px;background:#151515;font-size:11px}.muster-card.running{border-color:#5877b7;background:#182034}.muster-card small{color:#777}.muster-card .ok{color:#63c174}
    #muster-live-file{margin:14px 24px 18px;border:1px solid #303030;border-radius:10px;overflow:hidden;background:#080808;color:#ddd}
    #muster-live-file header{height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #292929;font-size:12px}
    #muster-live-file header .spacer{flex:1}#muster-live-file header button{border:0;background:transparent;color:#888;padding:5px 8px;border-radius:6px;cursor:pointer}#muster-live-file header button.active{background:#292929;color:#eee}
    #muster-live-file .file-scroll{max-height:560px;overflow:auto}#muster-live-file .code{min-width:760px;padding:8px 0 22px}
    #muster-live-file .row{display:grid;grid-template-columns:22px 48px 1fr;min-height:21px;font:12px/1.45 "SFMono-Regular",Menlo,monospace}#muster-live-file .row .mark{text-align:center}#muster-live-file .row .num{text-align:right;padding-right:10px;color:#5f5f5f}#muster-live-file .row code{white-space:pre;color:#cfcfcf}#muster-live-file .row.add{background:#11291a}#muster-live-file .row.del{background:#34191b}#muster-live-file .row.add code,#muster-live-file .row.add .mark{color:#b9dfc0}#muster-live-file .row.del code,#muster-live-file .row.del .mark{color:#e3b8ba}
    #muster-live-activity{margin:14px 24px;border:1px solid #303030;border-radius:10px;overflow:hidden;background:#0a0a0a;color:#ddd;font:12px "SFMono-Regular",Menlo,monospace}
    #muster-live-activity>header{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-bottom:1px solid #292929;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}#muster-live-activity>header span{color:#777}
    #muster-live-activity details{border-bottom:1px solid #202020}#muster-live-activity details:last-child{border-bottom:0}#muster-live-activity summary{display:grid;grid-template-columns:12px 1fr auto;gap:8px;align-items:center;padding:9px 12px;cursor:pointer;list-style:none}#muster-live-activity summary::-webkit-details-marker{display:none}#muster-live-activity .status{color:#63c174}#muster-live-activity .running .status{color:#d9ad58}#muster-live-activity code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#muster-live-activity pre{max-height:220px;margin:0;padding:10px 32px;overflow:auto;border-top:1px solid #202020;color:#9d9d9d;white-space:pre-wrap}
  `;
  document.head.append(style);

  function activeThread() {
    const row = document.querySelector('[data-app-action-sidebar-thread-active="true"]');
    return row ? { id: row.dataset.appActionSidebarThreadId?.replace(/^local:/, ""), hostId: row.dataset.appActionSidebarThreadHostId, title: row.dataset.appActionSidebarThreadTitle } : null;
  }

  function ensurePanel() {
    const layout = document.querySelector('[data-app-shell-main-content-layout]');
    if (!layout) return null;
    layout.style.position = "relative";
    layout.style.paddingRight = `${state.width}px`;
    let panel = document.getElementById("muster-companion-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "muster-companion-panel";
      panel.innerHTML = `<div id="muster-companion-resizer"></div><header id="muster-companion-header"><button data-tab="codebase">Codebase</button><button data-tab="board">Board</button><span class="spacer"></span><button data-close aria-label="Hide Muster">×</button></header><div id="muster-companion-body"></div>`;
      layout.append(panel);
      panel.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; renderPanel(); }));
      panel.querySelector("[data-close]").addEventListener("click", () => { panel.hidden = true; layout.style.paddingRight = "0px"; });
      const resizer = panel.querySelector("#muster-companion-resizer");
      resizer.addEventListener("pointerdown", (event) => {
        const startX = event.clientX, startWidth = state.width;
        const move = (next) => { state.width = Math.max(320, Math.min(900, startWidth + startX - next.clientX)); panel.style.setProperty("--muster-width", `${state.width}px`); layout.style.paddingRight = `${state.width}px`; };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    }
    panel.hidden = false;
    panel.style.setProperty("--muster-width", `${state.width}px`);
    return panel;
  }

  const laneNames = { backlog: "Backlog", ready: "Ready", running: "Running", review: "Review", done: "Done" };
  function renderPanel() {
    const panel = ensurePanel(); if (!panel) return;
    panel.querySelectorAll("[data-tab]").forEach((button) => button.dataset.active = String(button.dataset.tab === state.tab));
    const body = panel.querySelector("#muster-companion-body");
    if (state.tab === "board") {
      const tasks = state.board?.tasks || [];
      body.innerHTML = `<div class="muster-board">${Object.entries(laneNames).map(([lane,label]) => { const rows=tasks.filter(task=>task.status===lane); return `<section class="muster-lane"><h4>${label}<span>${rows.length}</span></h4>${rows.map(task=>`<article class="muster-card ${lane}"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.id || "")}</small>${task.model ? `<small>${escapeHtml(task.model)}</small>` : ""}${task.evidence?.length ? `<small class="ok">${escapeHtml(task.evidence.at(-1).summary)}</small>` : ""}</article>`).join("") || `<small>No tasks</small>`}</section>`; }).join("")}</div>`;
    } else {
      const tree = state.tree || state.file?.tree || [];
      body.innerHTML = `<div style="padding:9px 10px;color:#888;font-size:12px">${escapeHtml(state.context?.cwd || "No active local workspace")}</div>${tree.map(path=>`<button class="muster-tree-row" data-path="${escapeHtml(path)}" data-active="${path===state.file?.path}">${escapeHtml(path)}</button>`).join("")}`;
      body.querySelectorAll(".muster-tree-row").forEach(button=>button.addEventListener("click",()=>{state.selectedPath=button.dataset.path;renderPanel()}));
    }
  }

  function parsePatch(patch) {
    const added = new Set(), deletedAt = new Map(); let oldLine=0,newLine=0;
    for (const line of String(patch||"").split("\n")) { const h=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/); if(h){oldLine=+h[1];newLine=+h[2];continue} if(line.startsWith("+++")||line.startsWith("---"))continue; if(line.startsWith("+")){added.add(newLine++);} else if(line.startsWith("-")){const rows=deletedAt.get(newLine)||[];rows.push({oldLine,text:line.slice(1)});deletedAt.set(newLine,rows);oldLine++;} else if(line.startsWith(" ")){oldLine++;newLine++;} }
    return {added,deletedAt};
  }
  function fileRows(file, mode) { const source=mode==="before"?file.before:file.working; const changes=parsePatch(file.patch); let html=""; String(source||"").split("\n").forEach((line,index)=>{const n=index+1;if(mode!=="before")for(const d of changes.deletedAt.get(n)||[])html+=`<div class="row del"><span class="mark">−</span><span class="num">${d.oldLine}</span><code>${escapeHtml(d.text)}</code></div>`;const add=mode!=="before"&&changes.added.has(n);html+=`<div class="row ${add?"add":""}"><span class="mark">${add?"+":""}</span><span class="num">${n}</span><code>${escapeHtml(line||" ")}</code></div>`});return html; }
  function renderFile() {
    const timeline = document.querySelector('[data-app-action-timeline-scroll]');
    const conversation = timeline?.querySelector('[data-thread-user-message-navigation-content="true"]');
    if (!conversation || !state.file) return;
    let canvas=document.getElementById("muster-live-file");
    if(!canvas){canvas=document.createElement("section");canvas.id="muster-live-file";conversation.append(canvas);}
    else if(canvas.parentElement!==conversation)conversation.append(canvas);
    const mode=canvas.dataset.mode||"working"; const stats=state.file.stats||{added:0,deleted:0};
    canvas.innerHTML=`<header><strong>${escapeHtml(state.file.path)}</strong><span>Full file · ${state.file.lineCount} lines</span><span style="color:#63c174">+${stats.added}</span><span style="color:#e46e6e">−${stats.deleted}</span><span class="spacer"></span><button data-mode="working" class="${mode==="working"?"active":""}">Working</button><button data-mode="before" class="${mode==="before"?"active":""}">Before</button></header><div class="file-scroll"><div class="code">${fileRows(state.file,mode)}</div></div>`;
    canvas.querySelectorAll("[data-mode]").forEach(button=>button.onclick=()=>{canvas.dataset.mode=button.dataset.mode;renderFile()});
    setTimeout(()=>canvas.querySelector(".add,.del")?.scrollIntoView({block:"center",inline:"nearest"}),0);
  }

  function renderActivity() {
    const conversation = document.querySelector('[data-app-action-timeline-scroll] [data-thread-user-message-navigation-content="true"]');
    if (!conversation) return;
    let activity=document.getElementById("muster-live-activity");
    if(!state.activity?.length){activity?.remove();return;}
    if(!activity){activity=document.createElement("section");activity.id="muster-live-activity";const file=document.getElementById("muster-live-file");file?conversation.insertBefore(activity,file):conversation.append(activity);}
    activity.innerHTML=`<header><strong>Terminal activity</strong><span>live · ${state.activity.length} recent</span></header>${state.activity.map((item,index)=>`<details class="${item.status}" ${index===state.activity.length-1?"open":""}><summary><span class="status">${item.status==="running"?"●":"✓"}</span><code>${escapeHtml(item.command)}</code><span>${item.status}</span></summary>${item.output?`<pre>${escapeHtml(item.output)}</pre>`:""}</details>`).join("")}`;
  }

  function sync(payload) { if(payload.context?.id!==state.context?.id)state.selectedPath=null;state.context=payload.context??state.context; state.file=payload.file??null; state.tree=payload.tree??payload.file?.tree??[]; state.board=payload.board??state.board; state.activity=payload.activity??[]; ensurePanel(); renderPanel(); if(state.file)renderFile(); else document.getElementById("muster-live-file")?.remove(); renderActivity(); }
  const observer=new MutationObserver(()=>{ensurePanel(); if(state.file&&!document.getElementById("muster-live-file"))renderFile();if(state.activity?.length&&!document.getElementById("muster-live-activity"))renderActivity();}); observer.observe(document.documentElement,{childList:true,subtree:true});
  window.__musterCompanion={version:7,sync,activeThread,selection:()=>({threadId:state.context?.id,path:state.selectedPath})}; ensurePanel(); renderPanel();
})();
