/** APIKuoshi docs — page stylesheet (injected inline, zero external deps) */
export const PAGE_CSS = `
:root{
  --bg:#0b0d12; --bg2:#10131b; --panel:#141824; --panel2:#181d2b;
  --line:#242b3d; --line2:#2e3750;
  --text:#e9ecf5; --muted:#97a0b6; --dim:#6b7490;
  --pink:#f472b6; --pink2:#f9a8d4; --violet:#a78bfa; --amber:#fbbf24;
  --green:#34d399; --red:#f87171; --cyan:#67e8f9;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,'Liberation Mono',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;scroll-padding-top:76px}
body{background:var(--bg);color:var(--text);font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans',sans-serif;
  background-image:radial-gradient(1200px 500px at 80% -10%,rgba(244,114,182,.07),transparent 60%),radial-gradient(900px 420px at 10% 0%,rgba(167,139,250,.06),transparent 55%)}
a{color:var(--pink2);text-decoration:none}a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:.86em;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:#dbe2f4}
pre{font-family:var(--mono)}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}

/* ---------- topbar ---------- */
.topbar{position:sticky;top:0;z-index:50;background:rgba(11,13,18,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.topbar-in{display:flex;align-items:center;gap:18px;height:60px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;letter-spacing:.3px;color:var(--text);white-space:nowrap}
.logo:hover{text-decoration:none}
.logo .mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;
  background:linear-gradient(135deg,var(--pink),var(--violet));box-shadow:0 4px 14px rgba(244,114,182,.35)}
.logo em{font-style:normal;color:var(--pink)}
.nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav a{color:var(--muted);font-size:13.5px;padding:7px 11px;border-radius:8px;white-space:nowrap}
.nav a:hover{color:var(--text);background:var(--panel2);text-decoration:none}
.status{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);border:1px solid var(--line);
  padding:5px 11px;border-radius:999px;background:var(--panel);white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:var(--dim);flex:none}
.dot.on{background:var(--green);box-shadow:0 0 8px rgba(52,211,153,.8)}
.dot.off{background:var(--red);box-shadow:0 0 8px rgba(248,113,113,.8)}
@media(max-width:860px){.status span.lbl{display:none}.nav a{padding:7px 8px;font-size:12.5px}}

/* ---------- hero ---------- */
.hero{padding:64px 0 40px;text-align:left}
.hero .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--pink2);border:1px solid rgba(244,114,182,.35);
  background:rgba(244,114,182,.08);padding:5px 13px;border-radius:999px;margin-bottom:18px}
.hero h1{font-size:clamp(34px,6vw,54px);line-height:1.08;font-weight:900;letter-spacing:-1px}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,var(--pink),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.sub{color:var(--muted);font-size:17px;max-width:640px;margin:16px 0 24px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:28px}
.chip{font-size:12.5px;color:var(--muted);border:1px solid var(--line);background:var(--panel);padding:5px 12px;border-radius:999px}
.chip b{color:var(--text);font-weight:700}
.btnrow{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:11px;font-weight:700;font-size:14.5px;cursor:pointer;border:1px solid transparent;transition:transform .15s,box-shadow .15s}
.btn:hover{text-decoration:none;transform:translateY(-1px)}
.btn.primary{background:linear-gradient(135deg,var(--pink),#c026d3);color:#fff;box-shadow:0 6px 22px rgba(244,114,182,.35)}
.btn.ghost{background:var(--panel);color:var(--text);border-color:var(--line2)}
.btn.ghost:hover{border-color:var(--pink)}

/* ---------- sections ---------- */
section{padding:44px 0;border-top:1px solid var(--line)}
.sec-head{margin-bottom:26px}
.sec-head .step{font-size:12px;font-weight:800;letter-spacing:2px;color:var(--pink);text-transform:uppercase}
.sec-head h2{font-size:clamp(22px,3.4vw,30px);font-weight:850;letter-spacing:-.4px;margin-top:6px}
.sec-head p{color:var(--muted);margin-top:8px;max-width:760px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px}

/* ---------- pipeline diagram ---------- */
.pipe{display:grid;grid-template-columns:1fr;gap:14px;margin:6px 0 26px}
.pipe-stage{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:16px 18px;position:relative}
.pipe-stage .tag{position:absolute;top:-10px;left:14px;font-size:10.5px;font-weight:800;letter-spacing:1.5px;color:var(--bg);
  background:var(--pink);padding:2px 9px;border-radius:999px;text-transform:uppercase}
.pipe-stage.violet>.tag{background:var(--violet)}.pipe-stage.amber>.tag{background:var(--amber)}.pipe-stage.green>.tag{background:var(--green)}
.pipe-items{display:flex;flex-wrap:wrap;gap:9px;margin-top:8px}
.pipe-item{border:1px solid var(--line2);background:var(--bg2);border-radius:9px;padding:7px 12px;font-size:13px;color:var(--text)}
.pipe-item small{display:block;color:var(--dim);font-size:11px;margin-top:1px}
.pipe-arrow{text-align:center;color:var(--dim);font-size:13px;margin:-4px 0}
.pipe-arrow b{color:var(--pink2);font-weight:700}
@media(min-width:860px){.pipe-arrow{transform:rotate(0deg)}}

/* steps */
.steps{display:grid;grid-template-columns:1fr;gap:12px;counter-reset:step}
@media(min-width:760px){.steps{grid-template-columns:1fr 1fr}}
.step-card{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:16px 18px;position:relative}
.step-card:before{counter-increment:step;content:counter(step);position:absolute;top:-11px;left:16px;width:24px;height:24px;
  border-radius:8px;background:linear-gradient(135deg,var(--pink),var(--violet));color:#fff;font-weight:800;font-size:12.5px;display:grid;place-items:center}
.step-card h4{font-size:14.5px;margin:6px 0 6px;color:var(--text)}
.step-card p{font-size:13.5px;color:var(--muted)}

.badge-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.badge{font-size:11px;color:var(--muted);border:1px solid var(--line2);border-radius:6px;padding:2px 8px;background:var(--bg2)}
.note{border-radius:10px;padding:10px 13px;font-size:13px;margin-top:12px;border:1px solid}
.note.good{color:#b5f0d8;border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.07)}
.note.warn{color:#fde5b0;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.07)}
.note b{font-weight:800}

/* ---------- unified explanation ---------- */
.uni-grid{display:grid;gap:16px}
@media(min-width:900px){.uni-grid{grid-template-columns:1.05fr .95fr}}
.chain{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:12px 0}
.chain .node{font-family:var(--mono);font-size:12.5px;border:1px solid var(--line2);background:var(--bg2);padding:6px 11px;border-radius:9px}
.chain .node.dead{opacity:.45;text-decoration:line-through}
.chain .arr{color:var(--dim)}
.ktable{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
.ktable td{border:1px solid var(--line);padding:8px 11px;vertical-align:top}
.ktable td:first-child{font-family:var(--mono);color:var(--cyan);white-space:nowrap}
.ktable td:last-child{color:var(--muted)}
.example{font-size:13px;color:var(--muted)}
.example .big{font-family:var(--mono);color:var(--text);font-size:20px;font-weight:800}
.example .arrow{color:var(--pink);font-weight:800}

/* ---------- endpoint reference ---------- */
details.group{border:1px solid var(--line);border-radius:14px;background:var(--panel);margin-bottom:12px;overflow:hidden}
details.group>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;padding:15px 18px;font-weight:800;font-size:15px}
details.group>summary::-webkit-details-marker{display:none}
details.group>summary .chev{margin-left:auto;color:var(--dim);transition:transform .2s}
details.group[open]>summary .chev{transform:rotate(90deg)}
details.group>summary .count{font-size:11.5px;color:var(--muted);font-family:var(--mono);border:1px solid var(--line2);border-radius:6px;padding:1px 8px;background:var(--bg2)}
.gdot{width:10px;height:10px;border-radius:3px;background:var(--gc,var(--pink));flex:none}
.ep{border-top:1px solid var(--line);padding:14px 18px}
.ep .row1{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.method{font-family:var(--mono);font-size:11px;font-weight:800;color:#0b0d12;background:var(--green);border-radius:6px;padding:2px 8px;margin-top:2px;flex:none}
.ep .path{font-family:var(--mono);font-size:13.5px;color:var(--text);word-break:break-all}
.ep .desc{color:var(--muted);font-size:13.5px;margin-top:6px}
.ep .ptable{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
.ep .ptable td{border:1px solid var(--line);padding:6px 10px;vertical-align:top}
.ep .ptable td:first-child{font-family:var(--mono);color:var(--cyan);white-space:nowrap}
.ep .ptable td:nth-child(2){color:var(--muted)}
.try{margin-left:auto;flex:none;font-size:12px;font-weight:700;color:var(--pink2);border:1px solid rgba(244,114,182,.4);
  background:rgba(244,114,182,.08);padding:4px 12px;border-radius:8px;cursor:pointer;transition:background .15s}
.try:hover{background:rgba(244,114,182,.2)}
.tip{font-size:12.5px;color:var(--amber);margin-top:8px}

/* ---------- playground ---------- */
.playground{border:1px solid var(--line2);border-radius:18px;background:var(--bg2);overflow:hidden}
.pg-top{display:flex;gap:0;border-bottom:1px solid var(--line);background:var(--panel);overflow-x:auto;scrollbar-width:none}
.pg-top::-webkit-scrollbar{display:none}
.pg-tab{flex:none;padding:13px 18px;font-size:13.5px;font-weight:700;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}
.pg-tab.active{color:var(--text);border-bottom-color:var(--pink)}
.pg-body{display:none;padding:18px}
.pg-body.active{display:block}
.pg-url{display:flex;gap:9px;align-items:stretch}
.pg-url input{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line2);color:var(--text);
  font-family:var(--mono);font-size:13.5px;padding:11px 13px;border-radius:10px;outline:none}
.pg-url input:focus{border-color:var(--pink)}
.send{flex:none;background:linear-gradient(135deg,var(--pink),#c026d3);border:none;color:#fff;font-weight:800;
  font-size:14px;padding:0 26px;border-radius:10px;cursor:pointer;box-shadow:0 4px 16px rgba(244,114,182,.3)}
.send:hover{filter:brightness(1.1)}
.send:disabled{opacity:.55;cursor:wait}
.pg-params{margin:14px 0 4px;display:grid;gap:8px}
.pg-param{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center}
.pg-param label{font-family:var(--mono);font-size:12px;color:var(--cyan)}
.pg-param input{background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);
  font-size:12.5px;padding:8px 11px;border-radius:8px;outline:none;width:100%}
.pg-param input:focus{border-color:var(--pink)}
.pg-hint{font-size:12px;color:var(--dim);margin-top:10px}
.pg-list{max-height:520px;overflow-y:auto;display:grid;gap:4px;padding-right:4px}
.pg-list::-webkit-scrollbar{width:8px}.pg-list::-webkit-scrollbar-thumb{background:var(--line2);border-radius:8px}
.pg-search{width:100%;background:var(--bg);border:1px solid var(--line2);color:var(--text);padding:10px 13px;
  border-radius:10px;font-size:13.5px;outline:none;margin-bottom:10px}
.pg-search:focus{border-color:var(--pink)}
.pg-ep{display:flex;gap:9px;align-items:center;padding:9px 11px;border-radius:9px;cursor:pointer;border:1px solid transparent}
.pg-ep:hover{background:var(--panel2);border-color:var(--line)}
.pg-ep.sel{background:rgba(244,114,182,.09);border-color:rgba(244,114,182,.4)}
.pg-ep .path{font-family:var(--mono);font-size:12.5px;color:var(--text);word-break:break-all;flex:1}
.pg-ep .gname{font-size:11px;color:var(--dim);flex:none}
.resp-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.rchip{font-size:11.5px;font-family:var(--mono);border:1px solid var(--line2);border-radius:6px;padding:3px 9px;color:var(--muted);background:var(--bg)}
.rchip.ok{color:#b5f0d8;border-color:rgba(52,211,153,.4)}
.rchip.err{color:#ffc9c9;border-color:rgba(248,113,113,.4)}
.resp-actions{margin-left:auto;display:flex;gap:7px}
.mini{font-size:11.5px;color:var(--muted);border:1px solid var(--line2);background:var(--bg);border-radius:7px;padding:4px 10px;cursor:pointer}
.mini:hover{color:var(--text);border-color:var(--pink)}
pre.resp{max-height:480px;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:15px;
  font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
pre.resp::-webkit-scrollbar{width:8px}pre.resp::-webkit-scrollbar-thumb{background:var(--line2);border-radius:8px}
.j-key{color:#8ab8ff}.j-str{color:#a7e5b8}.j-num{color:#ffd08a}.j-bool{color:#f9a8d4}.j-null{color:#8b93a8}.j-punc{color:#6b7490}
.history{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.hist-chip{font-family:var(--mono);font-size:11px;color:var(--muted);border:1px solid var(--line);background:var(--bg);
  border-radius:999px;padding:4px 11px;cursor:pointer;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hist-chip:hover{color:var(--text);border-color:var(--pink)}
.hist-chip .ok{color:var(--green)}.hist-chip .bad{color:var(--red)}

/* ---------- config table ---------- */
.env-table{width:100%;border-collapse:collapse;font-size:13px}
.env-table td{border:1px solid var(--line);padding:9px 12px;vertical-align:top}
.env-table td:first-child{font-family:var(--mono);color:var(--cyan);white-space:nowrap}
.env-table td:nth-child(2){font-family:var(--mono);color:var(--amber);white-space:nowrap}
.env-table td:last-child{color:var(--muted)}
.table-scroll{overflow-x:auto}

/* ---------- footer ---------- */
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--dim);font-size:13px}
footer .frow{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
footer a{color:var(--muted)}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(80px);opacity:0;transition:all .25s;
  background:var(--panel2);border:1px solid var(--pink);color:var(--text);font-size:13px;padding:9px 18px;border-radius:10px;z-index:99;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1}
`;
