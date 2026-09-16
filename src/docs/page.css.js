/**
 * ============================================================
 *  APIKuoshi — src/docs/page.css.js                    v2.1.0
 * ============================================================
 *  Stylesheet for the redesigned /api/docs: a professional
 *  API-reference layout (fixed sidebar + reference content +
 *  docked playground) in the spirit of Stripe/Postman docs.
 *  Zero external deps, dark mode via prefers-color-scheme.
 * ============================================================
 */
export const PAGE_CSS = `
:root{
  --bg:#ffffff; --bg-soft:#f7f8fa; --bg-inset:#f1f3f6;
  --text:#0f172a; --muted:#5b6472; --dim:#8a93a2;
  --line:#e5e8ee; --line-strong:#d7dce4;
  --accent:#4f46e5; --accent-soft:#eef0fe; --accent-text:#4338ca;
  --get:#166534; --get-bg:#dcfce7; --get-line:#bbf7d0;
  --ok:#16a34a; --bad:#dc2626; --warn:#b45309;
  --code-bg:#0f172a; --code-text:#e2e8f0;
  --sidebar-w:264px;
  --radius:10px;
  --mono:'SFMono-Regular',ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0d1117; --bg-soft:#11161f; --bg-inset:#161d29;
    --text:#e6eaf0; --muted:#9aa4b2; --dim:#6b7684;
    --line:#1f2733; --line-strong:#2a3442;
    --accent:#818cf8; --accent-soft:#1a2036; --accent-text:#a5b4fc;
    --get:#4ade80; --get-bg:#12261a; --get-line:#1d3b28;
    --code-bg:#0a0e14; --code-text:#dbe2ec;
  }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,'Helvetica Neue',sans-serif;color:var(--text);background:var(--bg)}
a{color:var(--accent-text);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:.92em;background:var(--bg-inset);border:1px solid var(--line);border-radius:5px;padding:1px 5px;word-break:break-all}
b{font-weight:600}
::selection{background:var(--accent-soft)}

/* ---------------- layout ---------------- */
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);flex:0 0 var(--sidebar-w);border-right:1px solid var(--line);background:var(--bg-soft);position:sticky;top:0;height:100vh;overflow-y:auto;overscroll-behavior:contain}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.content{flex:1;min-width:0;padding:28px 34px 90px;max-width:1010px;width:100%}
@media (max-width:1080px){
  .sidebar{display:none}
  .content{padding:20px 18px 80px}
}

/* ---------------- sidebar ---------------- */
.sb-brand{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg-soft);z-index:5}
.sb-logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex:0 0 30px}
.sb-name{font-weight:700;font-size:14.5px;letter-spacing:.2px}
.sb-name em{font-style:normal;color:var(--accent-text)}
.sb-ver{margin-left:auto;font-size:10.5px;color:var(--muted);border:1px solid var(--line-strong);border-radius:99px;padding:1px 7px}
.sb-search{margin:12px 12px 8px;position:relative}
.sb-search input{width:100%;padding:7px 10px 7px 30px;border:1px solid var(--line-strong);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px;outline:none}
.sb-search input:focus{border-color:var(--accent)}
.sb-search svg{position:absolute;left:9px;top:8px;width:14px;height:14px;stroke:var(--dim)}
.sb-nav{padding:4px 8px 24px}
.sb-group{margin-top:12px}
.sb-group-h{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);padding:6px 10px 4px}
.sb-group-h .gdot{width:7px;height:7px;border-radius:50%;background:var(--gc,var(--accent))}
.sb-item{display:flex;align-items:center;gap:7px;padding:5px 10px 5px 14px;border-radius:7px;color:var(--muted);font-size:12.8px;cursor:pointer;white-space:nowrap;overflow:hidden}
.sb-item .mp{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--get);flex:0 0 auto}
.sb-item .pth{overflow:hidden;text-overflow:ellipsis}
.sb-item:hover{background:var(--bg-inset);color:var(--text);text-decoration:none}
.sb-item.active{background:var(--accent-soft);color:var(--accent-text)}
.sb-foot{padding:10px 16px;border-top:1px solid var(--line);font-size:11.5px;color:var(--dim)}
.sb-status{display:flex;align-items:center;gap:7px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--dim)}
.dot.on{background:var(--ok);box-shadow:0 0 0 3px rgba(22,163,74,.15)}
.dot.off{background:var(--bad)}

/* ---------------- topbar ---------------- */
.topbar{display:none;border-bottom:1px solid var(--line);padding:10px 16px;align-items:center;gap:10px;position:sticky;top:0;background:var(--bg);z-index:40}
@media (max-width:1080px){ .topbar{display:flex} }
.topbar .sb-name{font-size:14px}
.tb-status{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}

/* ---------------- hero ---------------- */
.hero{padding:26px 0 8px}
.hero .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--accent-text);background:var(--accent-soft);border:1px solid var(--line);border-radius:99px;padding:4px 12px}
.hero h1{font-size:27px;line-height:1.2;margin:14px 0 8px;letter-spacing:-.02em}
.hero h1 em{font-style:normal;color:var(--accent-text)}
.hero p.sub{color:var(--muted);max-width:70ch;margin:0 0 14px;font-size:14.5px}
.quickstart{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px}
.qs{display:flex;align-items:center;gap:10px;background:var(--code-bg);color:var(--code-text);border-radius:var(--radius);padding:10px 14px;font-family:var(--mono);font-size:12.5px;cursor:pointer;border:1px solid transparent}
.qs:hover{border-color:var(--accent)}
.qs .lbl{color:#8b96a5;font-family:inherit}
.chiprow{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
.chip{font-size:11.5px;color:var(--muted);border:1px solid var(--line-strong);border-radius:99px;padding:3px 10px;background:var(--bg)}
.chip b{color:var(--text)}

/* ---------------- sections ---------------- */
section{margin-top:44px;scroll-margin-top:20px}
.sec-head{margin-bottom:14px}
.sec-head .step{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-text)}
.sec-head h2{font-size:19px;margin:5px 0 4px;letter-spacing:-.01em}
.sec-head p{color:var(--muted);margin:0;font-size:13.5px;max-width:76ch}
h3.block{font-size:15px;margin:22px 0 8px}

/* ---------------- cards + tables ---------------- */
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:900px){ .grid2{grid-template-columns:1fr} }
table.kt{width:100%;border-collapse:collapse;font-size:12.8px;margin-top:6px}
table.kt th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);text-align:left;font-weight:700}
table.kt th,table.kt td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
table.kt tr:last-child td{border-bottom:none}
table.kt td:first-child{white-space:nowrap}
.note{border-radius:8px;padding:10px 13px;font-size:12.8px;border:1px solid var(--line);background:var(--bg-soft);color:var(--muted);margin-top:10px}
.note b{color:var(--text)}
.note.good{border-color:var(--get-line);background:var(--get-bg);color:var(--text)}

/* ---------------- endpoint reference ---------------- */
.ep{border:1px solid var(--line);border-radius:var(--radius);margin:12px 0;background:var(--bg);overflow:hidden;scroll-margin-top:16px}
.ep:target{border-color:var(--accent)}
.ep-head{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--bg-soft);border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
.method{font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--get);background:var(--get-bg);border:1px solid var(--get-line);border-radius:6px;padding:2px 7px}
.ep-head .pth{font-family:var(--mono);font-size:13px;font-weight:600}
.ep-head .chev{margin-left:auto;color:var(--dim);transition:transform .15s;font-size:11px}
.ep.open .ep-head .chev{transform:rotate(90deg)}
.ep-body{display:none;padding:14px}
.ep.open .ep-body{display:block}
.ep-desc{color:var(--muted);font-size:13.5px;margin:0 0 10px}
.param-t{width:100%;border-collapse:collapse;font-size:12.8px}
.param-t th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);text-align:left;padding:5px 10px;border-bottom:1px solid var(--line)}
.param-t td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.param-t tr:last-child td{border-bottom:none}
.param-t .pn{font-family:var(--mono);font-weight:600;white-space:nowrap}
.param-t .req{color:var(--warn);font-size:10px;font-weight:700;margin-left:4px}
.tip{margin-top:10px;font-size:12.6px;color:var(--muted);background:var(--bg-soft);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:8px 12px}
.trybtn{margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--accent-text);background:var(--accent-soft);border:1px solid var(--line);border-radius:7px;padding:4px 10px;cursor:pointer}
.trybtn:hover{border-color:var(--accent)}

/* ---------------- playground ---------------- */
.playground{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg);box-shadow:0 1px 2px rgba(15,23,42,.04)}
.pg-tabs{display:flex;gap:2px;background:var(--bg-soft);border-bottom:1px solid var(--line);padding:6px 8px 0}
.pg-tab{font-size:12.5px;font-weight:600;color:var(--muted);padding:7px 13px;border-radius:8px 8px 0 0;cursor:pointer;border:1px solid transparent;border-bottom:none}
.pg-tab.active{color:var(--text);background:var(--bg);border-color:var(--line)}
.pg-urlrow{display:flex;gap:8px;padding:12px;background:var(--bg)}
.pg-url{flex:1;display:flex;align-items:center;background:var(--code-bg);border-radius:8px;overflow:hidden}
.pg-url .verb{font-family:var(--mono);font-size:11px;font-weight:700;color:#7dd3fc;padding:0 0 0 12px;flex:0 0 auto}
.pg-url input{flex:1;background:transparent;border:none;outline:none;color:var(--code-text);font-family:var(--mono);font-size:12.8px;padding:10px 12px;min-width:0}
.send{flex:0 0 auto;background:var(--accent);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;padding:0 20px;cursor:pointer}
.send:hover{filter:brightness(1.08)}
.send:disabled{opacity:.55;cursor:wait}
.pg-meta{display:none;flex-wrap:wrap;gap:8px;padding:0 12px 10px;align-items:center}
.pg-meta.show{display:flex}
.mchip{font-family:var(--mono);font-size:11px;border-radius:6px;padding:2px 8px;border:1px solid var(--line)}
.mchip.ok{color:var(--ok);border-color:var(--get-line);background:var(--get-bg)}
.mchip.bad{color:var(--bad);background:#fde8e8;border-color:#fecaca}
@media (prefers-color-scheme: dark){ .mchip.bad{background:#2a1214;border-color:#3f1d1f} }
.resp-wrap{position:relative;border-top:1px solid var(--line)}
.resp{margin:0;padding:16px 18px;background:var(--code-bg);color:var(--code-text);font-family:var(--mono);font-size:12.3px;line-height:1.55;max-height:460px;overflow:auto;white-space:pre;border:none;border-radius:0}
.resp .k{color:#93c5fd}.resp .s{color:#86efac}.resp .n{color:#fca5a5}.resp .b{color:#f0abfc}.resp .null{color:#64748b}
.pg-tools{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line);background:var(--bg-soft);flex-wrap:wrap}
.tool{font-size:11.5px;font-weight:600;color:var(--muted);background:var(--bg);border:1px solid var(--line-strong);border-radius:7px;padding:4px 10px;cursor:pointer}
.tool:hover{color:var(--text);border-color:var(--accent)}
.pg-hist{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px;background:var(--bg-soft)}
.pg-hist button{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--bg);border:1px solid var(--line);border-radius:99px;padding:3px 10px;cursor:pointer;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-hist button:hover{color:var(--text);border-color:var(--accent)}
.pane{display:none}
.pane.active{display:block}

/* ---------------- footer ---------------- */
footer{border-top:1px solid var(--line);padding:18px 34px;color:var(--dim);font-size:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--bg-soft)}
footer a{color:var(--muted)}

/* ---------------- toast ---------------- */
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--text);color:var(--bg);font-size:12.5px;font-weight:600;border-radius:99px;padding:8px 18px;opacity:0;pointer-events:none;transition:.2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
`;
