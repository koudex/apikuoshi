/**
 * ============================================================
 *  APIKuoshi — src/docs/page.client.js                 v2.1.0
 * ============================================================
 *  Client-side logic for the redesigned /api/docs:
 *    - sidebar navigation from the live catalog (with search)
 *    - endpoint reference accordions + per-endpoint "Try"
 *    - docked playground: Send, JSON syntax highlighting,
 *      status/time chips, copy-as-cURL, copy-JSON, history
 *  Zero dependencies.
 * ============================================================
 */
export const PAGE_CLIENT = `
(function(){
'use strict';
var BOOT = window.__KUOSHI__ || {};
var CATALOG = BOOT.catalog || {};
var FAMS = CATALOG.families || [];
var EP = CATALOG.endpoints || {};
var SYSTEM_EP = CATALOG.systemEndpoints || [];
var ALL = [];
FAMS.forEach(function(f){ (EP[f.key]||[]).forEach(function(e){ ALL.push({ep:e, fam:f}); }); });
SYSTEM_EP.forEach(function(e){ ALL.push({ep:e, fam:{key:'system',label:'System',gc:'#8a93a2'}}); });

function $(s,c){ return (c||document).querySelector(s); }
function $all(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

var toastTimer=null;
function toast(msg){ var t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.classList.remove('show'); },1600); }
function copy(text,label){ (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(function(){ toast((label||'Copied')+' ✓'); },function(){ toast('Copy failed'); }); }

/* ================= health pill ================= */
function health(){
  var dot=$('#status-dot'), lbl=$('#status-lbl');
  fetch('/api/health',{headers:{'Accept':'application/json'}}).then(function(r){return r.json();}).then(function(j){
    dot.className='dot on'; lbl.textContent='online · v'+(j.version||'?');
  }).catch(function(){ dot.className='dot off'; lbl.textContent='api unreachable'; });
}

/* ================= JSON highlighter ================= */
function hl(json){
  var out = esc(json);
  out = out.replace(/("(?:\\\\.|[^"\\\\])*")(\s*:)?|\\b(true|false)\\b|\\bnull\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/g, function(m, str, colon, boolw){
    if (str) return colon ? '<span class="k">'+str+'</span>'+colon : '<span class="s">'+str+'</span>';
    if (boolw) return '<span class="b">'+m+'</span>';
    if (m === 'null') return '<span class="null">null</span>';
    return '<span class="n">'+m+'</span>';
  });
  return out;
}

/* ================= sidebar ================= */
function epId(ep){ return 'ep-'+ep.p.replace(/[^a-z0-9]+/gi,'-')+'-'+(ep.m||'GET').toLowerCase(); }

function buildSidebar(filter){
  var nav = $('#sb-nav'); nav.innerHTML='';
  var f = (filter||'').toLowerCase();
  FAMS.forEach(function(fam){
    var list = (EP[fam.key]||[]).filter(function(e){
      return !f || (e.p+' '+e.d+' '+fam.label).toLowerCase().indexOf(f) !== -1;
    });
    if (!list.length) return;
    var g = document.createElement('div'); g.className='sb-group';
    g.innerHTML = '<div class="sb-group-h"><span class="gdot" style="--gc:'+esc(fam.gc||'var(--accent)')+'"></span>'+esc(fam.label)+'</div>';
    list.forEach(function(e){
      var a = document.createElement('a'); a.className='sb-item'; a.href='#'+epId(e);
      a.innerHTML = '<span class="mp">'+esc(e.m)+'</span><span class="pth">'+esc(e.p)+'</span>';
      a.addEventListener('click', function(){ setTimeout(scrollSpy, 60); });
      g.appendChild(a);
    });
    nav.appendChild(g);
  });
  var sys = SYSTEM_EP.filter(function(e){ return !f || (e.p+' '+e.d).toLowerCase().indexOf(f)!==-1; });
  if (sys.length){
    var g = document.createElement('div'); g.className='sb-group';
    g.innerHTML = '<div class="sb-group-h"><span class="gdot" style="--gc:#8a93a2"></span>System</div>';
    sys.forEach(function(e){
      var a = document.createElement('a'); a.className='sb-item'; a.href='#'+epId(e);
      a.innerHTML = '<span class="mp">'+esc(e.m)+'</span><span class="pth">'+esc(e.p)+'</span>';
      g.appendChild(a);
    });
    nav.appendChild(g);
  }
}

function scrollSpy(){
  var items = $all('.sb-item');
  var best=null, bestTop=Infinity;
  $all('.ep').forEach(function(sec){
    var top = sec.getBoundingClientRect().top;
    if (top >= 0 && top < 260 && top < bestTop){ bestTop=top; best=sec.id; }
  });
  items.forEach(function(a){ a.classList.toggle('active', best && a.getAttribute('href') === '#'+best); });
}

/* ================= endpoint reference ================= */
function renderEndpoints(){
  var host = $('#ref-host'); host.innerHTML='';
  FAMS.forEach(function(fam){
    var list = EP[fam.key] || [];
    if (!list.length) return;
    var h = document.createElement('h3'); h.className='block'; h.textContent = fam.label;
    host.appendChild(h);
    if (fam.note){ var n = document.createElement('p'); n.style.cssText='color:var(--muted);font-size:12.8px;margin:0 0 8px'; n.textContent = fam.note; host.appendChild(n); }
    list.forEach(function(e){ host.appendChild(epCard(e, fam)); });
  });
  var h = document.createElement('h3'); h.className='block'; h.textContent='System'; host.appendChild(h);
  SYSTEM_EP.forEach(function(e){ host.appendChild(epCard(e, {key:'system',label:'System'})); });
}

function epCard(e, fam){
  var div = document.createElement('div'); div.className='ep'; div.id = epId(e);
  var params = (e.params||[]).map(function(p){
    return '<tr><td class="pn">'+esc(p.n)+'</td><td>'+esc(p.d)+'</td><td>'+(p.ex?'<code>'+esc(p.ex)+'</code>':'—')+'</td></tr>';
  }).join('');
  var ex = e.try || e.p;
  div.innerHTML =
    '<div class="ep-head">'+
      '<span class="method">'+esc(e.m)+'</span>'+
      '<span class="pth">'+esc(e.p)+'</span>'+
      '<button class="trybtn" data-try="'+esc(ex)+'">▶ Try</button>'+
      '<span class="chev">▶</span>'+
    '</div>'+
    '<div class="ep-body">'+
      '<p class="ep-desc">'+esc(e.d)+'</p>'+
      ((e.params&&e.params.length) ? '<table class="param-t"><tr><th>param</th><th>what it does</th><th>example</th></tr>'+params+'</table>' : '<p class="ep-desc" style="font-size:12.5px">No parameters.</p>')+
      (e.tip ? '<div class="tip"><b>Tip —</b> '+esc(e.tip)+'</div>' : '')+
    '</div>';
  div.querySelector('.ep-head').addEventListener('click', function(ev){
    if (ev.target.closest('.trybtn')) return;
    div.classList.toggle('open');
  });
  div.querySelector('.trybtn').addEventListener('click', function(ev){
    ev.stopPropagation();
    div.classList.add('open');
    sendPath(div.querySelector('.trybtn').getAttribute('data-try'), e);
  });
  return div;
}

/* ================= playground ================= */
var history_ = [];
var controller = null;

function setUrl(path){ $('#pg-url').value = path; }

function sendPath(path, epDef){
  $('#pg').scrollIntoView({behavior:'smooth', block:'start'});
  setUrl(path);
  $('#pg-url').focus();
  send();
}

function send(){
  var path = $('#pg-url').value.trim();
  if (!path) { toast('Type a request path first'); return; }
  if (path.charAt(0) !== '/') path = '/' + path;
  var btn = $('#pg-send'); btn.disabled = true;
  $('#pg-meta').classList.add('show');
  $('#pg-meta').innerHTML = '<span class="mchip">loading…</span>';
  var t0 = performance.now();
  if (controller) controller.abort();
  controller = new AbortController();
  fetch(path, { headers:{'Accept':'application/json'}, signal:controller.signal })
    .then(function(r){
      var ms = Math.round(performance.now()-t0);
      return r.text().then(function(txt){ return { status:r.status, ok:r.ok, ms:ms, txt:txt, ct:r.headers.get('content-type')||'' }; });
    })
    .then(function(r){
      var box = $('#resp');
      var pretty = r.txt;
      var data = null;
      try { data = JSON.parse(r.txt); pretty = JSON.stringify(data, null, 2); } catch(e){}
      var status = r.ok
        ? '<span class="mchip ok">HTTP '+r.status+'</span>'
        : '<span class="mchip bad">HTTP '+r.status+'</span>';
      $('#pg-meta').innerHTML = status +
        '<span class="mchip">'+r.ms+' ms</span>' +
        '<span class="mchip">'+(pretty.length/1024).toFixed(1)+' KB</span>' +
        (r.ct ? '<span class="mchip">'+esc(r.ct.split(';')[0])+'</span>' : '');
      box.innerHTML = hl(pretty);
      box.dataset.raw = pretty;
      pushHistory(path);
    })
    .catch(function(err){
      if (err && err.name === 'AbortError') return;
      $('#pg-meta').innerHTML = '<span class="mchip bad">network error</span>';
      $('#resp').textContent = String(err);
    })
    .then(function(){ btn.disabled = false; });
}

function pushHistory(path){
  history_ = history_.filter(function(p){ return p!==path; });
  history_.unshift(path);
  history_ = history_.slice(0,8);
  var host = $('#pg-hist'); host.innerHTML='';
  history_.forEach(function(p){
    var b = document.createElement('button'); b.textContent = p; b.title = p;
    b.addEventListener('click', function(){ setUrl(p); send(); });
    host.appendChild(b);
  });
}

/* ================= boot ================= */
document.addEventListener('DOMContentLoaded', function(){
  health();
  buildSidebar('');
  renderEndpoints();

  $('#sb-search').addEventListener('input', function(){ buildSidebar(this.value); });
  $('#pg-send').addEventListener('click', send);
  $('#pg-url').addEventListener('keydown', function(e){ if (e.key==='Enter') send(); });
  document.addEventListener('keydown', function(e){
    if ((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); send(); }
  });
  $all('.pg-tab').forEach(function(t){
    t.addEventListener('click', function(){
      $all('.pg-tab').forEach(function(x){ x.classList.remove('active'); });
      t.classList.add('active');
      $all('.pg-pane').forEach(function(p){ p.classList.toggle('active', p.id===t.getAttribute('data-pane')); });
    });
  });
  $('#pg-copy-json').addEventListener('click', function(){
    var raw = $('#resp').dataset.raw;
    if (raw) copy(raw, 'JSON copied');
    else toast('Nothing to copy yet');
  });
  $('#pg-copy-curl').addEventListener('click', function(){
    var p = $('#pg-url').value.trim() || '/api/search?q=frieren';
    copy('curl "'+location.origin+(p.charAt(0)==='/'?p:'/'+p)+'"', 'cURL copied');
  });
  $all('.qs').forEach(function(b){
    b.addEventListener('click', function(){ setUrl(b.getAttribute('data-path')); send(); });
  });
  window.addEventListener('scroll', scrollSpy, {passive:true});
  scrollSpy();
});
})();
`;
