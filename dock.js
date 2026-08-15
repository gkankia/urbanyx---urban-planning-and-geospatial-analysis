/* ══════════════════════════════════════════════════════════════════════════════
   Parcel card tabs + mobile bottom sheet.

   One surface: the floating parcel card carries both Parcel and Analysis tabs.
   There is no collapsible side panel — #side-panel is now only a transient
   notice area (search status / usage limit). On mobile the same card becomes a
   bottom sheet with three snap points, and the rail becomes a bottom tab bar.
   ══════════════════════════════════════════════════════════════════════════ */
let _pfcCurTab='parcel';

function _isMobileLayout(){ return window.matchMedia('(max-width:820px)').matches; }

/* Switch the card's tab. Kept callable as _dockTab() because showCatInPanel()
   and toggleZoningPanel() call it by that name. */
function _pfcTab(tab){
  if(!['parcel','analysis','plan'].includes(tab))return;
  _pfcCurTab=tab;
  ['parcel','analysis','plan'].forEach(t=>{const pane=document.getElementById('pfc-pane-'+t);if(pane)pane.style.display=(t===tab)?'':'none';});
  document.querySelectorAll('#pfc-tabs .pfc-tab').forEach(b=>{
    const on=b.getAttribute('data-ptab')===tab;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  _pfcSyncEmpty();
  document.querySelectorAll('#mobile-tabs .mt-btn').forEach(b=>{
    b.classList.toggle('on',b.getAttribute('data-mt')===tab);
  });
}
function _dockTab(tab){ _pfcTab(tab); }

/* Make sure the card is actually on screen (and open on mobile). */
function _dockOpen(){
  const card=document.getElementById('parcel-float-card');
  if(card&&card.style.display==='none'&&_pfcHasSelection())card.style.display='flex';
  if(_isMobileLayout()&&!/sheet-(peek|half|full)/.test(document.body.className))_sheetSnap('half');
}

function _pfcHasSelection(){
  try{ return !!(_currentParcelGeoJSON||_isDrawnArea); }catch(e){ return false; }
}
function _pfcSyncEmpty(){
  const has=_pfcHasSelection();
  const ha=document.getElementById('pfc-empty-analysis');
  if(ha)ha.style.display=has?'none':'';
  if(has&&typeof _updateAnalysisGrid==='function'){ try{_updateAnalysisGrid(true);}catch(e){} }
}

/* ── mobile: bottom sheet snap points ─────────────────────────────────────── */
function _sheetSnap(level){
  document.body.classList.remove('sheet-peek','sheet-half','sheet-full');
  if(level)document.body.classList.add('sheet-'+level);
}
function _mtSelect(which){
  document.querySelectorAll('#mobile-tabs .mt-btn').forEach(b=>b.classList.toggle('on',b.getAttribute('data-mt')===which));
  if(which==='projects'){ _sheetSnap(null); if(typeof openProjectsPanel==='function')openProjectsPanel(); return; }
  if(which==='account'){  _sheetSnap(null); if(typeof navOpenAccount==='function')navOpenAccount(); return; }
  if(!_pfcHasSelection()){
    showToast(lang==='ka'?'ჯერ აირჩიე ნაკვეთი რუკაზე':'Select a parcel on the map first');
    return;
  }
  _dockOpen(); _pfcTab(which); _sheetSnap('half');
}
/* drag the card header between snap points */
function _initSheetDrag(){
  const head=document.getElementById('pfc-header');
  if(!head)return;
  let y0=null,cur=null;
  const order=['peek','half','full'];
  const lvl=()=>{const m=document.body.className.match(/sheet-(peek|half|full)/);return m?m[1]:null;};
  const down=e=>{ if(!_isMobileLayout())return; if(e.target.closest('button,[contenteditable="true"]'))return;
    y0=(e.touches?e.touches[0].clientY:e.clientY); cur=lvl()||'half'; };
  const up=e=>{
    if(y0===null)return;
    const y=(e.changedTouches?e.changedTouches[0].clientY:e.clientY), d=y-y0; y0=null;
    if(Math.abs(d)<26)return;
    const i=order.indexOf(cur);
    if(d<0){ if(i<order.length-1)_sheetSnap(order[i+1]); }
    else { if(i>0)_sheetSnap(order[i-1]); else _sheetSnap(null); }
  };
  head.addEventListener('touchstart',down,{passive:true});
  head.addEventListener('touchend',up,{passive:true});
  head.addEventListener('mousedown',down);
  head.addEventListener('mouseup',up);
}

/* ── export lives in Projects: a project must be saved and open ───────────── */
function _expLabel(){ return lang==='ka'?'ექსპორტი':'Export'; }
function _expTitle(){ return lang==='ka'?'რეპორტი და მონაცემები':'Report & data export'; }
function _ppExport(id,btn){
  if(_openedProjectId!==id){
    showToast(lang==='ka'?'ექსპორტისთვის გახსენი პროექტი':'Open this project first, then export');
    return;
  }
  _rptMenuToggle(btn);
}

/* ── i18n for the new bits ────────────────────────────────────────────────── */
const _PFC_STR={
  en:{ tabParcel:'Parcel', tabAnalysis:'Analysis', tabPlan:'Plan',
       emptyAnalysis:'Select a parcel to run an analysis.',
       mtParcel:'Parcel', mtAnalysis:'Analyse', mtProjects:'Projects', mtAccount:'You' },
  ka:{ tabParcel:'ნაკვეთი', tabAnalysis:'ანალიზი', tabPlan:'გეგმა',
       emptyAnalysis:'ანალიზისთვის აირჩიე ნაკვეთი.',
       mtParcel:'ნაკვეთი', mtAnalysis:'ანალიზი', mtProjects:'პროექტები', mtAccount:'პროფილი' }
};
function _pfcApplyLang(){
  const s=_PFC_STR[lang==='ka'?'ka':'en'];
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('pfc-tab-parcel',s.tabParcel); set('pfc-tab-analysis',s.tabAnalysis); set('pfc-tab-plan',s.tabPlan);
  set('pfc-empty-analysis',s.emptyAnalysis);
  set('mt-lbl-parcel',s.mtParcel); set('mt-lbl-analysis',s.mtAnalysis);
  set('mt-lbl-projects',s.mtProjects); set('mt-lbl-account',s.mtAccount);
  const nl={'nav-lbl-projects':lang==='ka'?'პროექტი':'Projects','nav-lbl-import':lang==='ka'?'იმპორტი':'Import',
            'nav-lbl-draw':lang==='ka'?'ხაზვა':'Draw','nav-lbl-data':lang==='ka'?'მონაცემები':'Data',
            'nav-lbl-user':lang==='ka'?'პროფილი':'Account'};
  Object.keys(nl).forEach(k=>set(k,nl[k]));
}

/* ── boot ─────────────────────────────────────────────────────────────────── */
function _initDock(){
  _pfcTab('parcel');
  try{_pfcApplyLang();}catch(e){}
  _initSheetDrag();
  window.addEventListener('resize',()=>{ if(!_isMobileLayout())_sheetSnap(null); });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_initDock);
else _initDock();
