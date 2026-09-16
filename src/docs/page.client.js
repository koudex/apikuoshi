/** APIKuoshi docs — client-side logic (playground, health, highlighting). No deps. */
export const PAGE_CLIENT = `
(function(){
'use strict';
var BOOT = window.__KUOSHI__ || {};
var CATALOG = BOOT.catalog || {};
var EP = CATALOG.endpoints || {};
var SYSTEM_EP = CATALOG.systemEndpoints || [];
var FAM_LABELS = {};
(CATALOG.families || []).forEach(function(f){ FAM_LABELS[f.key] = f.label; });
FAM_LABELS.system = 'System';
var GROUP_ORDER = ['core','anime','playback','browse','catalog','meta','system'];
var state = { selected:null, params:{}, custom:false, history:[], controller:null };

function $(s,c){ return (c||document).querySelector(s); }
function $all(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---------- toast ---------- */
var toastTimer=null;
function toast(msg){ var t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.classList.remove('show'); },1600); }

/* ---------- health pill ---------- */
function health(){
  var dot=$('#status-dot'), lbl=$('#status-lbl');
  fetch('/api/health',{headers:{'Accept':'application/json'}}).then(function(r){return r.json();}).then(function(j){
    dot.className='dot on'; lbl.textContent='online · v'+(j.version||'?')+' · '+(j.status||'ok');
  }).catch(function(){ dot.className='dot off'; lbl.textContent='api unreachable'; });
}

/* ---------- endpoint picker ---------- */
function flatEndpoints(){
  var out=[];
  GROUP_ORDER.forEach(function(g){
    var list = (g==='system') ? SYSTEM_EP : (EP[g]||[]);
    list.forEach(function(e){ out.push({ g:g, label:FAM_LABELS[g]||g, e:e }); });
  });
  return out;
}
function renderPicker(filter){
  var list=$('#ep-list'); list.innerHTML='';
  var items=flatEndpoints();
  if(filter){ var f=filter.toLowerCase();
    items=items.filter(function(it){ return (it.e.p+' '+it.e.d+' '+it.label).toLowerCase().indexOf(f)>=0; }); }
  items.forEach(function(it){
    var row=document.createElement('div'); row.className='pg-ep';
    row.setAttribute('data-path',it.e.p); row.setAttribute('data-group',it.g);
    var meth=document.createElement('span'); meth.className='method'; meth.textContent=it.e.m;
    var path=document.createElement('span'); path.className='path'; path.textContent=it.e.p;
    var gname=document.createElement('span'); gname.className='gname'; gname.textContent=it.label;
    row.appendChild(meth); row.appendChild(path); row.appendChild(gname);
    row.addEventListener('click',function(){ select(it); });
    list.appendChild(row);
  });
}
function select(it){
  state.selected=it; state.custom=false;
  $all('.pg-ep').forEach(function(r){ r.classList.toggle('sel', r.getAttribute('data-path')===it.e.p && r.getAttribute('data-group')===it.g); });
  renderParams(it);
  setUrl(buildUrl(it, state.params));
  $('#url-input').focus();
}
function renderParams(it){
  var box=$('#pg-params'); box.innerHTML='';
  state.params={};
  if(it && it.e.params && it.e.params.length){
    it.e.params.forEach(function(p){
      state.params[p.n]=p.ex||'';
      var row=document.createElement('div'); row.className='pg-param';
      var lab=document.createElement('label'); lab.textContent=p.n; lab.title=p.d;
      var inp=document.createElement('input'); inp.value=p.ex||''; inp.placeholder=p.d;
      inp.setAttribute('data-pname',p.n);
      inp.addEventListener('input',function(){
        state.params[p.n]=inp.value;
        if(!state.custom) setUrl(buildUrl(state.selected,state.params));
      });
      row.appendChild(lab); row.appendChild(inp); box.appendChild(row);
    });
  } else {
    var hint=document.createElement('div'); hint.className='pg-hint';
    hint.textContent='No parameters for this endpoint — just press Send.';
    box.appendChild(hint);
  }
}
function buildUrl(it,params){
  if(!it) return '';
  if(it.e.try && !hasUserInput(params,it)) return it.e.try;
  var path=it.e.p;
  var query=[];
  Object.keys(params||{}).forEach(function(k){
    var v=(params||{})[k];
    var seg=':'+k;
    if(path.indexOf(seg)>=0){ if(v) path=path.split(seg).join(v); }
    else if(v!=='') query.push(encodeURIComponent(k)+'='+encodeURIComponent(v));
  });
  path=path.replace(/:([a-zA-Z0-9_]+)/g,'');
  // APIKuoshi fix: catalog paths already start with /api — never prefix again
  // (the old buildUrl produced /api/api/... whenever a param was edited).
  var base = path.indexOf('/api')===0 ? path : '/api'+path;
  return query.length? base+'?'+query.join('&') : base;
}
function hasUserInput(params,it){
  if(!params) return false;
  return Object.keys(params).some(function(k){ return String(params[k]||'')!=='' && String(params[k])!==(exFor(it,k)||''); });
}
function exFor(it,k){
  var p=(it.e.params||[]).filter(function(x){return x.n===k;})[0];
  return p? (p.ex||'') : '';
}
function setUrl(u){ $('#url-input').value=u; }
function currentUrl(){ return $('#url-input').value.trim(); }

/* ---------- JSON highlighting ---------- */
function highlight(json){
  var s=esc(json);
  s=s.replace(/("(\\\\u[a-fA-F0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false)\\b|\\bnull\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,
    function(m){
      var cls='j-num';
      if(/^"/.test(m)){ cls=/:$/.test(m)?'j-key':'j-str'; }
      else if(/true|false/.test(m)){ cls='j-bool'; }
      else if(/null/.test(m)){ cls='j-null'; }
      return '<span class="'+cls+'">'+m+'</span>';
    });
  return s;
}

/* ---------- send ---------- */
function send(){
  var url=currentUrl();
  if(!url){ toast('Type an endpoint URL first'); return; }
  if(url.indexOf('/')!==0){ url='/'+url; }
  var method=(state.selected&&state.selected.e&&state.selected.e.m)||'GET';
  if(state.controller) state.controller.abort();
  state.controller=new AbortController();
  var t0=performance.now();
  var btn=$('#send-btn'); btn.disabled=true; btn.textContent='Sending…';
  $('#resp-meta').innerHTML='<span class="rchip">loading…</span>';
  $('#resp-box').textContent='';
  var timeout=setTimeout(function(){ state.controller.abort(); },90000);
  fetch(url,{method:method,headers:{'Accept':'application/json'},signal:state.controller.signal})
    .then(function(r){
      clearTimeout(timeout);
      var ms=Math.round(performance.now()-t0);
      return r.text().then(function(txt){ return { status:r.status, ms:ms, txt:txt }; });
    })
    .then(function(res){
      var pretty=res.txt;
      try{ pretty=JSON.stringify(JSON.parse(res.txt),null,2); }catch(e){}
      var ok=res.status>=200&&res.status<300;
      var meta=$('#resp-meta');
      meta.innerHTML='';
      var c1=document.createElement('span'); c1.className='rchip '+(ok?'ok':'err'); c1.textContent='HTTP '+res.status;
      var c2=document.createElement('span'); c2.className='rchip'; c2.textContent=res.ms+' ms';
      var c3=document.createElement('span'); c3.className='rchip'; c3.textContent=(new Blob([res.txt]).size/1024).toFixed(1)+' KB';
      var c4=document.createElement('span'); c4.className='rchip'; c4.textContent=method+' '+url;
      meta.appendChild(c1); meta.appendChild(c2); meta.appendChild(c3); meta.appendChild(c4);
      var act=document.createElement('div'); act.className='resp-actions';
      var b1=document.createElement('button'); b1.className='mini'; b1.textContent='Copy JSON';
      b1.addEventListener('click',function(){ navigator.clipboard.writeText(pretty).then(function(){toast('Response copied');}); });
      var b2=document.createElement('button'); b2.className='mini'; b2.textContent='Copy curl';
      b2.addEventListener('click',function(){ navigator.clipboard.writeText('curl -s '+(method!=='GET'?'-X '+method+' ':'')+'"'+location.origin+url+'" -H "Accept: application/json"').then(function(){toast('curl copied');}); });
      act.appendChild(b1); act.appendChild(b2); meta.appendChild(act);
      $('#resp-box').innerHTML=highlight(pretty);
      pushHistory(url,res.status,res.ms);
    })
    .catch(function(err){
      clearTimeout(timeout);
      var meta=$('#resp-meta');
      var aborted = err && (err.name==='AbortError');
      meta.innerHTML='<span class="rchip err">'+(aborted?'timeout after 90s':'network error')+'</span>';
      $('#resp-box').textContent=aborted?'The request took too long and was aborted. Heavy scrapers can be slow on cold start — try again or pick a lighter endpoint (e.g. /api/health).':String(err);
      pushHistory(url,0,0);
    })
    .finally(function(){ btn.disabled=false; btn.textContent='Send'; });
}
function pushHistory(url,status,ms){
  state.history=state.history.filter(function(h){return h.url!==url;});
  state.history.unshift({url:url,status:status,ms:ms});
  state.history=state.history.slice(0,8);
  renderHistory();
}
function renderHistory(){
  var box=$('#history'); box.innerHTML='';
  if(!state.history.length) return;
  state.history.forEach(function(h){
    var chip=document.createElement('span'); chip.className='hist-chip';
    chip.innerHTML=(h.status>=200&&h.status<300?'<span class="ok">●</span> ':(h.status?'<span class="bad">●</span> ':'<span class="bad">○</span> '))+esc(h.url);
    chip.title=h.url+(h.status?(' — HTTP '+h.status+' · '+h.ms+'ms'):'');
    chip.addEventListener('click',function(){ setUrl(h.url); send(); });
    box.appendChild(chip);
  });
}

/* ---------- wiring ---------- */
function init(){
  health();
  renderPicker('');
  $('#ep-search').addEventListener('input',function(){ renderPicker($('#ep-search').value.trim()); });
  $('#send-btn').addEventListener('click',send);
  $('#url-input').addEventListener('keydown',function(ev){ if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter') send(); });
  $('#url-input').addEventListener('input',function(){ state.custom=true; });
  $all('[data-try]').forEach(function(b){
    b.addEventListener('click',function(){
      var url=b.getAttribute('data-try');
      $all('.pg-ep').forEach(function(r){ r.classList.remove('sel'); });
      state.selected=null; state.custom=true; state.params={};
      $('#pg-params').innerHTML='<div class="pg-hint">Custom URL — edit freely, then press Send.</div>';
      setUrl(url);
      showPlayground();
      send();
    });
  });
  $all('.pg-tab').forEach(function(t){
    t.addEventListener('click',function(){
      $all('.pg-tab').forEach(function(x){x.classList.remove('active');});
      $all('.pg-body').forEach(function(x){x.classList.remove('active');});
      t.classList.add('active');
      $('#'+t.getAttribute('data-pane')).classList.add('active');
    });
  });
  // preload: pick flagship search, but send the fast health call for instant life
  setUrl('/api/search?q=frieren');
  state.custom=true;
  sendHealthDemo();
}
function sendHealthDemo(){
  var t0=performance.now();
  fetch('/api/health',{headers:{'Accept':'application/json'}}).then(function(r){return r.text();}).then(function(txt){
    var ms=Math.round(performance.now()-t0);
    var pretty=txt; try{ pretty=JSON.stringify(JSON.parse(txt),null,2);}catch(e){}
    var meta=$('#resp-meta');
    meta.innerHTML='<span class="rchip ok">HTTP 200</span><span class="rchip">'+ms+' ms</span><span class="rchip">GET /api/health</span>';
    $('#resp-box').innerHTML=highlight(pretty);
    pushHistory('/api/health',200,ms);
  }).catch(function(){});
}
function showPlayground(){
  $all('.pg-tab').forEach(function(x){x.classList.remove('active');});
  $all('.pg-body').forEach(function(x){x.classList.remove('active');});
  var tab=$('#tab-picker-2')||$('#tab-send');
  if(tab){ tab.classList.add('active'); }
  var sendPane=$('#pane-send'); if(sendPane) sendPane.classList.add('active');
  var el=$('#playground'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
})();
`;
