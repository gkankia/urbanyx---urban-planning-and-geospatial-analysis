/* ══════════════════════════════════════════════════════════════════════════════
   DOCK — one rail, one dock. Replaces the old #side-panel card stack plus the
   JS-positioned analysis/zoning flyouts. Also drives the mobile bottom sheet.
   ══════════════════════════════════════════════════════════════════════════ */

/* app.js declares its state with `let`, which lives in the shared script scope
   (not on window). Reads are wrapped so a TDZ/undefined case can never break
   the dock's own boot. */
function _dockHasSelection(){
  try{ return !!(_currentParcelGeoJSON||_isDrawnArea); }catch(e){ return false; }
}
function _dockActiveCat(){
  try{ return typeof _activeCatKey!=='undefined'?_activeCatKey:null; }catch(e){ return null; }
}
function _dockOpenedProject(){
  try{ return typeof _openedProjectId!=='undefined'?_openedProjectId:null; }catch(e){ return null; }
}
function _dockLang(){
  try{ return typeof lang!=='undefined'?lang:'en'; }catch(e){ return 'en'; }
}
function _dockToast(m){ try{ if(typeof showToast==='function')showToast(m); }catch(e){} }

var _dockCurTab='parcel';
var _DOCK_KEY='urbanyx_dock_collapsed';

function _isMobileLayout(){ return window.matchMedia('(max-width:820px)').matches; }

function _dockTab(tab){
  if(tab!=='parcel'&&tab!=='analysis')return;
  _dockCurTab=tab;
  const p=document.getElementById('dock-pane-parcel'),a=document.getElementById('dock-pane-analysis');
  if(p)p.style.display=tab==='parcel'?'':'none';
  if(a)a.style.display=tab==='analysis'?'':'none';
  document.querySelectorAll('#dock-tabs .dock-tab').forEach(b=>{
    const on=b.getAttribute('data-tab')===tab;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  _dockSyncEmpty();
  // keep the mobile tab bar in step
  document.querySelectorAll('#mobile-tabs .mt-btn').forEach(b=>{
    b.classList.toggle('on',b.getAttribute('data-mt')===tab);
  });
}

function _dockOpen(){
  document.body.classList.remove('dock-collapsed');
  try{localStorage.setItem(_DOCK_KEY,'0');}catch(e){}
  const sp=document.getElementById('side-panel');
  if(sp)sp.classList.add('visible');
  if(_isMobileLayout()&&!document.body.className.match(/sheet-(peek|half|full)/))_sheetSnap('half');
}
function _dockCollapse(){
  document.body.classList.add('dock-collapsed');
  try{localStorage.setItem(_DOCK_KEY,'1');}catch(e){}
  if(_isMobileLayout())_sheetSnap(null);
}
function _dockSearchToggle(){
  const open=document.body.classList.toggle('dock-search-open');
  if(open){ const i=document.getElementById('input-side'); if(i)setTimeout(()=>i.focus(),30); }
}
function _dockToggle(){
  document.body.classList.contains('dock-collapsed')?_dockOpen():_dockCollapse();
}

/* Hide the "select a parcel" hint once something is actually selected. */
function _dockSyncEmpty(){
  const pfc=document.getElementById('parcel-float-card');
  const hasSel=!!(pfc&&pfc.style.display&&pfc.style.display!=='none')||_dockHasSelection();
  const hp=document.getElementById('dock-empty-parcel');
  if(hp)hp.style.display=hasSel?'none':'';
  const ha=document.getElementById('dock-empty-analysis');
  if(ha)ha.style.display=hasSel?'none':'';
  // the icon grid owns its own lock/badge state — let it refresh itself
  if(hasSel&&typeof _updateAnalysisGrid==='function'){ try{_updateAnalysisGrid(true);}catch(e){} }
}



/* ══ MOBILE — bottom sheet with three snap points + bottom tab bar ══════════ */
function _sheetSnap(level){
  document.body.classList.remove('sheet-peek','sheet-half','sheet-full');
  if(level)document.body.classList.add('sheet-'+level);
}
function _mtSelect(which){
  document.querySelectorAll('#mobile-tabs .mt-btn').forEach(b=>b.classList.toggle('on',b.getAttribute('data-mt')===which));
  if(which==='projects'){ _sheetSnap(null); if(typeof openProjectsPanel==='function')openProjectsPanel(); return; }
  if(which==='account'){ _sheetSnap(null); if(typeof navOpenAccount==='function')navOpenAccount(); return; }
  _dockOpen(); _dockTab(which); _sheetSnap('half');
}
/* drag the sheet header between snap points */
function _initSheetDrag(){
  const head=document.getElementById('dock-head'),sp=document.getElementById('side-panel');
  if(!head||!sp)return;
  let y0=null,cur=null;
  const order=['peek','half','full'];
  const level=()=>{const m=document.body.className.match(/sheet-(peek|half|full)/);return m?m[1]:null;};
  const onDown=(e)=>{ if(!_isMobileLayout())return; if(e.target.closest('input,button'))return;
    y0=(e.touches?e.touches[0].clientY:e.clientY); cur=level()||'half'; };
  const onUp=(e)=>{
    if(y0===null)return;
    const y=(e.changedTouches?e.changedTouches[0].clientY:e.clientY);
    const d=y-y0; y0=null;
    if(Math.abs(d)<26)return;
    let i=order.indexOf(cur);
    if(d<0&&i<order.length-1)_sheetSnap(order[i+1]);          // drag up → taller
    else if(d>0){ if(i>0)_sheetSnap(order[i-1]); else _sheetSnap(null); } // drag down → shorter/closed
  };
  head.addEventListener('touchstart',onDown,{passive:true});
  head.addEventListener('touchend',onUp,{passive:true});
  head.addEventListener('mousedown',onDown);
  head.addEventListener('mouseup',onUp);
}

/* ── export lives in Projects now: a project must be saved first ─────────── */
function _expLabel(){ return _dockLang()==='ka'?'ექსპორტი':'Export'; }
function _expTitle(){ return _dockLang()==='ka'?'რეპორტი და მონაცემები':'Report & data export'; }
function _ppExport(id,btn){
  // Exporting reflects what is on the map, so the project must be the open one.
  if(_dockOpenedProject()!==id){
    _dockToast(_dockLang()==='ka'
      ? 'ექსპორტისთვის გახსენი პროექტი'
      : 'Open this project first, then export');
    return;
  }
  if(typeof _rptMenuToggle==='function')_rptMenuToggle(btn);
}

/* ── boot ─────────────────────────────────────────────────────────────────── */
function _initDock(){
  const sp=document.getElementById('side-panel');
  if(sp&&!document.getElementById('dock-expand')){
    const b=document.createElement('button');
    b.id='dock-expand'; b.title='Expand panel'; b.setAttribute('aria-label','Expand panel');
    b.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
    b.onclick=_dockOpen;
    sp.appendChild(b);
  }
  let collapsed=false;
  try{collapsed=localStorage.getItem(_DOCK_KEY)==='1';}catch(e){}
  if(collapsed&&!_isMobileLayout())document.body.classList.add('dock-collapsed');
  _dockTab('parcel');
  try{_dockApplyLang();}catch(e){}
  _initSheetDrag();
  window.addEventListener('resize',()=>{
    if(_isMobileLayout())document.body.classList.remove('dock-collapsed');
    else _sheetSnap(null);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_initDock);
else _initDock();

/* ── bilingual labels for the new dock / rail / mobile chrome ─────────────── */
var _DOCK_STR={
  en:{ tabParcel:'Parcel', tabAnalysis:'Analysis',
       emptyParcel:'Search a cadastral code or click the map to select a parcel.',
       railProjects:'Projects', railImport:'Import', railDraw:'Draw', railData:'Data', railUser:'Account',
       mtParcel:'Parcel', mtAnalysis:'Analyse', mtProjects:'Projects', mtAccount:'You',
       emptyAnalysis:'Select a parcel to run an analysis.' },
  ka:{ tabParcel:'ნაკვეთი', tabAnalysis:'ანალიზი',
       emptyParcel:'მოძებნე საკადასტრო კოდი ან დააჭირე რუკაზე ნაკვეთის ასარჩევად.',
       railProjects:'პროექტი', railImport:'იმპორტი', railDraw:'ხაზვა', railData:'მონაცემები', railUser:'ანგარიში',
       mtParcel:'ნაკვეთი', mtAnalysis:'ანალიზი', mtProjects:'პროექტი', mtAccount:'პროფილი',
       emptyAnalysis:'ანალიზისთვის აირჩიე ნაკვეთი.' }
};
function _dockApplyLang(){
  var s=_DOCK_STR[_dockLang()]||_DOCK_STR.en;
  var set=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
  set('dock-tab-parcel',s.tabParcel); set('dock-tab-analysis',s.tabAnalysis);
  set('dock-empty-parcel',s.emptyParcel); set('dock-empty-analysis',s.emptyAnalysis);
  set('nav-lbl-projects',s.railProjects); set('nav-lbl-import',s.railImport);
  set('nav-lbl-draw',s.railDraw); set('nav-lbl-data',s.railData); set('nav-lbl-user',s.railUser);
  set('mt-lbl-parcel',s.mtParcel); set('mt-lbl-analysis',s.mtAnalysis);
  set('mt-lbl-projects',s.mtProjects); set('mt-lbl-account',s.mtAccount);

}
/* re-apply whenever the app switches language (function decls are global props,
   so wrapping here also catches app.js's own internal applyLang() calls) */
if(typeof applyLang==='function'){
  var _dockOrigApplyLang=applyLang;
  window.applyLang=function(){
    var r=_dockOrigApplyLang.apply(this,arguments);
    try{ _dockApplyLang(); }catch(e){}
    return r;
  };
}
