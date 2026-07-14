const SUPABASE_URL      = "https://yikkligsbpzhznhkibow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y0DUnurQBvQtZCUOQ-NAjg_Fux7jx_6";
const PROXY             = "https://spring-recipe-402c.gkankia.workers.dev";
const MAPBOX_TOKEN      = "pk.eyJ1Ijoiam9yam9uZTkwIiwiYSI6ImNtZDY5ZDZqbDA5MHUya3F2emJncXk0eXgifQ.U-XZt6e_Z-LeVuWx3hut_A";
const MAPILLARY_TOKEN   = "MLY|24314119614934772|574fb7a546cc6d61a240f83f11e151c2";
const BACKEND_URL = "https://urbanyx-urban-planning-and-geospatial-analysis-production.up.railway.app";
// ── Paddle ── set PADDLE_SANDBOX=true for testing, false for live
const PADDLE_SANDBOX          = true;
const PADDLE_TOKEN_SBX        = "test_c8d49e591f6e941d16296911e7e";
const PADDLE_TOKEN_LIVE       = "LIVE_TOKEN_HERE";
const PADDLE_PRICE_ANNUAL_SBX = "pri_01kwsdyem6rmzfe50ag2kcvtez";
const PADDLE_PRICE_MONTHLY_SBX= "pri_01kwsdwvt5ne12q0xpap48473s";
const PADDLE_PRICE_ANNUAL_LIVE= "LIVE_ANNUAL_PRICE_HERE";
const PADDLE_PRICE_MONTHLY_LIVE="LIVE_MONTHLY_PRICE_HERE";
const PADDLE_TOKEN        = PADDLE_SANDBOX ? PADDLE_TOKEN_SBX  : PADDLE_TOKEN_LIVE;
const PADDLE_PRICE_ANNUAL = PADDLE_SANDBOX ? PADDLE_PRICE_ANNUAL_SBX  : PADDLE_PRICE_ANNUAL_LIVE;
const PADDLE_PRICE_MONTHLY= PADDLE_SANDBOX ? PADDLE_PRICE_MONTHLY_SBX : PADDLE_PRICE_MONTHLY_LIVE;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let lang = "en", hasSearched = false, mapMoved = false, mapReady = false, pdfjsLib = null;
let _toastTimer=null;function showToast(msg,dur=3000){const el=document.getElementById('app-toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>el.classList.remove('show'),dur);}
// Escape untrusted text (remote APIs, user-imported files, OSM data) before it goes into innerHTML/setHTML
function escapeHtml(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
// Restrict dynamically built link targets to safe schemes (blocks javascript: URLs)
function safeUrl(u){u=String(u??"").trim();return /^(https?:|tel:|mailto:)/i.test(u)?u:"#";}
// Guest functionality removed — the platform requires sign-in for parcel views and analyses.
// Tiers: free 50/mo · 14-day trial 300 · paid pro 1,000/mo
const FREE_PARCEL_LIMIT = 50;
const FREE_ANALYSIS_LIMIT = 50;
const TRIAL_PARCEL_LIMIT = 300;
const TRIAL_ANALYSIS_LIMIT = 300;
const PRO_PARCEL_LIMIT = 1000;
const PRO_ANALYSIS_LIMIT = 1000;
let _freeParcelCount = 0;
let _freeAnalysisCount = 0;
let _proParcelCount = 0;
let _proAnalysisCount = 0;
function _isTrialing(){return currentUser?._subStatus==="trialing";}
function _parcelLimit(){return currentUser?.plan==="pro"?(_isTrialing()?TRIAL_PARCEL_LIMIT:PRO_PARCEL_LIMIT):FREE_PARCEL_LIMIT;}
function _analysisLimit(){return currentUser?.plan==="pro"?(_isTrialing()?TRIAL_ANALYSIS_LIMIT:PRO_ANALYSIS_LIMIT):FREE_ANALYSIS_LIMIT;}
function _ymNow(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
// Counters reset at the start of each calendar month (month stamp per user)
function _resetIfNewMonth(uid,stampKey,keys){
  if(localStorage.getItem(stampKey+uid)!==_ymNow()){
    localStorage.setItem(stampKey+uid,_ymNow());
    keys.forEach(k=>localStorage.setItem(k+uid,"0"));
  }
}
function _loadFreeCounts(uid){
  _resetIfNewMonth(uid,"frM_",["frP_","frA_"]);
  _freeParcelCount=parseInt(localStorage.getItem("frP_"+uid)||"0",10);
  _freeAnalysisCount=parseInt(localStorage.getItem("frA_"+uid)||"0",10);
}
function _saveFreeCounts(uid){
  localStorage.setItem("frP_"+uid,String(_freeParcelCount));
  localStorage.setItem("frA_"+uid,String(_freeAnalysisCount));
}
function _loadProCounts(uid){
  _resetIfNewMonth(uid,"prM_",["prP_","prA_"]);
  _proParcelCount=parseInt(localStorage.getItem("prP_"+uid)||"0",10);
  _proAnalysisCount=parseInt(localStorage.getItem("prA_"+uid)||"0",10);
}
function _saveProCounts(uid){
  localStorage.setItem("prP_"+uid,String(_proParcelCount));
  localStorage.setItem("prA_"+uid,String(_proAnalysisCount));
}
function _isLargeParcel(){return(_currentParcelAreaM2||0)>=5000;}
let parcelCentroid = null, _parcelCardLngLat = null, _parcelCardDragged = false, _statusTimer = null, currentUser = null, _afterAuthCb = null, _pendingLogs = [], _marketingConsent = false;
let _currentBasemap = 'dark', _layersPanelOpen = false;
const _pulseSize=64;
const _pulsingDot={
  width:_pulseSize,height:_pulseSize,data:new Uint8Array(_pulseSize*_pulseSize*4),context:null,
  onAdd(){const c=document.createElement("canvas");c.width=_pulseSize;c.height=_pulseSize;this.context=c.getContext("2d");},
  render(){
    const t=(performance.now()%1400)/1400;
    const cx=_pulseSize/2,cy=_pulseSize/2,innerR=4.5;
    const outerR=innerR+(_pulseSize/2-innerR-2)*t;
    const ctx=this.context;
    ctx.clearRect(0,0,_pulseSize,_pulseSize);
    ctx.beginPath();ctx.arc(cx,cy,outerR,0,Math.PI*2);
    ctx.fillStyle=`rgba(96,165,250,${0.5*(1-t)})`;ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,innerR,0,Math.PI*2);
    ctx.fillStyle="rgba(96,165,250,1)";ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=1.5;ctx.stroke();
    this.data=ctx.getImageData(0,0,_pulseSize,_pulseSize).data;
    map.triggerRepaint();return true;
  }
};
let _mapillaryImages = [], _currentImageIdx = 0;
let _ownerParcels = [];
let _currentParcelGeoJSON=null;
let _dbParcelGeoJSON=null;
let _currentParcelAreaM2=null;
let _setbackRingAreaM2=null;
let _editingBldId=null;
let _editingDrawId=null;
let _editingOrigGeom=null;
let _maxFootprintM2=null;
let _maxFloorAreaM2=null;
let _noDevZone=false;
let _noDevZoneUnion=null;
let _climateData=null;
let _canopyRawData=null;
let _lstRawData=null;
let _canopyPct=null;
let _lstMean=null;
let _solarOverlayCache=null;
let _solarGeoData=null;
let _walkData=null;
let _proData=null;
let _isoData=null;
let _windData=null;

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  en: {
    brand:"Urbanyx", placeholder:"01.15.07.002.057", btn:"Search", btnLoading:"...",
    searching:"Searching…", notFound:"Parcel not found.", error:"Something went wrong.", found:"Parcel found", govGeDown:"maps.gov.ge unavailable — search by cadastral code",
    code:"Cadastral", area:"Area", type:"Type", addr:"Address", owner:"Owner", sqm:"m²",
    lineDesc:"Description", lineCoverage:"Zone", lineOwnership:"Ownership type", lineExtra:"Details",
    parcelInfo:"Parcel Info",
    analyseBtn:"Walkability Analysis", freeBadge:"Free", proAnalyseBtn:"Advanced Spatial Analysis",
    analysingIso:"1/2 · Computing isochrone…", analysingOsm:"2/2 · Counting amenities…",
    analysingProIso:"1/2 · Computing isochrone…", analysingProLayers:"2/2 · Fetching education & mobility data…",
    climateBtn:"Climate Analysis", climateCardTitle:"Climate Analysis",
    retrying:"Retrying…", analysisError:"Analysis failed — try again.",
    isoTitle:"10-Min Walking Zone", isoDesc:"Free walkable area from parcel",
    isoTitlePro:"15-Min Walking Zone", isoDescPro:"Pro walkable area from parcel",
    scoreTitle:"Diversity Index", outOf:"Shannon SDI",
    done:"Analysis complete", proDone:"Pro analysis complete",
    mapillaryTitle:"Street Imagery", mapillaryNone:"No street imagery found nearby.",
    analyzing:"Analyzing…",
    mapillaryNear:"Street imagery — within 20m of parcel", mapillaryFar:"Street imagery — nearest in neighbourhood",
    mapillaryOpen:"Click image to open in Mapillary",
    proLayersTitle:"Advanced Spatial Analysis",
    verdicts:["Very poor","Poor","Fair","Good","Very good","Excellent"],
    planFree:"Free plan", planPro:"Pro plan",
    upgrade:"Upgrade", billing:"Billing", signOut:"Sign out",
    centerSignIn:"Sign in", centerSignUp:"Create account", orClick:"click or draw on the map",
    cats:{ food:{label:"Food & drink",icon:"🍽"}, health:{label:"Health",icon:"🏥"}, parks:{label:"Parks & nature",icon:"🌿"}, retail:{label:"Retail",icon:"🛒"}, culture:{label:"Culture & leisure",icon:"🎭"} },
    proCats:{ schools:{label:"Schools",icon:"🏫"}, kindergartens:{label:"Kindergartens",icon:"🧒"}, crashes:{label:"Road incidents",icon:"⚠️"} },
    proCategories:{ climate:"Climate", education:"Education", mobility:"Mobility", morphology:"Urban Morphology", energy:"Clean Energy", relief:"Relief Analysis" },
    accessibilityTitle:"Accessibility Analysis", accModeLabel:"Transport mode", accTimeLabel:"Travel time", accGenerate:"Generate Isochrone", accModes:{walking:"Walking",cycling:"Cycling",driving:"Driving"}, accNoIso:"Generate an isochrone first", ttcAreaSmall:"Area under 5,000 m² — generate an isochrone first", ttcAoiLabel:"Study area", ttcTitle:"Transit", ttcNearby:"Public Transport", ttcNoStops:"No stops in isochrone", ttcNoArrivals:"No upcoming arrivals", ttcOnTime:"on time", ttcLoading:"Loading...",
    reliefTypes:{ height:"Height", slope:"Slope", aspect:"Aspect" },
    reliefLoading:"Loading DTM…", reliefMin:"Min", reliefMax:"Max", reliefMean:"Mean",
    reliefUnits:{ height:"m a.s.l.", slope:"°", aspect:"°" },
    slopeClasses:[{l:"Flat",r:"<3°"},{l:"Gentle",r:"3–8°"},{l:"Moderate",r:"8–15°"},{l:"Steep",r:"15–30°"},{l:"Very steep",r:">30°"}],
    slopeClassColors:["#34d399","#86efac","#fbbf24","#f97316","#ef4444"],
    solarSuitability:"Solar suitability", solarDesc:"South-facing (135–225°), slope ≤ 30°",
    windBtn:"Wind Analysis", windCardTitle:"Wind Analysis",
    windSpeed:"Mean wind speed", windPowerDensity:"Power density", windCapFactor:"Capacity factor",
    windYield:"Est. annual yield", windRefTurbine:"5 kW ref. turbine · 30m hub",
    windChecking:"Checking surroundings…", windBuildings:"Buildings within 500m — site not suitable for wind turbines",
    windRose:"Wind rose",
    aspectDirs:["N","NE","E","SE","S","SW","W","NW"],
    auth:{
      siTitle:"Sign in", siEmail:"Email", siPassword:"Password",
      siBtn:"Sign in", siForgot:"Forgot password?", siCreate:"Create account",
      siFooter:'<a onclick="showView(\'view-reset\')">Forgot password?</a> · <a onclick="showView(\'view-signup\')">Create account</a>',
      suTitle:"Create account", suSub:"Includes a free 14-day Pro trial — no payment needed",
      suName:"Full name",
      suSector:"Sector", suSectorPh:"Select your sector",
      suSectors:["Architecture / Urban Design","Engineering","Real Estate / Development","Government / Public Sector","Academic / Research","Urban Planning","Construction","Finance / Investment","Legal","Other"],
      suOrg:"Organisation (optional)",
      suRole:"Role / Job title",
      suPurpose:"Purpose of use", suPurposePh:"Select your purpose",
      suPurposes:["Site analysis","Urban planning & research","Investment / Due diligence","Academic research","Professional services","Personal interest","Other"],
      suEmail:"Email", suPassword:"Password (min 8 characters)",
      suBtn:"Create account",
      suFooter:'<a onclick="showView(\'view-signin\')">Already have an account? Sign in</a>',
      confirmTitle:"Check your email", confirmBtn:"Got it",
      resetTitle:"Reset password", resetSub:"Enter your email and we'll send a reset link.",
      resetEmail:"Email", resetBtn:"Send reset link", resetBack:"← Back",
      resetSent:"Reset link sent — check your inbox.",
      errFill:"Please fill in all fields.",
      errPassword:"Password must be at least 8 characters.",
      errTerms:"You must accept the Terms & Conditions to continue.",
      suTerms:'I have read and agree to the <a href="/terms" target="_blank" style="color:#818cf8;text-decoration:underline">Terms & Conditions</a> and <a href="/privacy" target="_blank" style="color:#818cf8;text-decoration:underline">Privacy Policy</a>, including the 14-day free trial and automatic billing after the trial period.',
      errEmail:"Please enter your email.",
      updatePwTitle:"Set new password",updatePwSub:"Enter your new password below.",
      updatePwLabel:"New password",updatePwBtn:"Update password",pwUpdated:"Password updated — you're signed in"
    },
    pw:{
      title:"Upgrade to Pro",sub:"Every new account starts with a 14-day Pro trial (300 analysis tokens).",
      freeName:"Free",proBadge:"Pro",proName:"Pro",freePeriod:"",proPeriod:"/mo",proBilling:"billed annually · €150/yr",proMonthlyPeriod:"/mo",proMonthlyBilling:"billed monthly",togAnnual:"Annual",togMonthly:"Monthly",
      colFree:"Free",colPro:"Pro",
      r1:"Parcel-level analysis",f1:"50",p1:"1000",
      r2:"Zoning analysis<br><small style='opacity:.45;font-size:.9em'>Tbilisi only</small>",f2:"50",p2:"1000",
      r3:"Plan on your own",f3:"—",p3:"✓",
      r4:"Street imagery",f4:"✓",p4:"✓",
      r5:"Urban mobility analysis<br><small style='opacity:.45;font-size:.9em'>Tbilisi only</small>",f5:"—",p5:"✓",
      r6:"Space syntax analysis",f6:"✓",p6:"✓",
      r7:"Urban diversity score",f7:"—",p7:"✓",
      r8:"Climate analysis",f8:"—",p8:"✓",
      r9:"Energy efficiency",f9:"—",p9:"✓",
      r10:"Relief analysis<br><small style='opacity:.45;font-size:.9em'>Tbilisi only</small>",f10:"—",p10:"✓",
      cta:"Upgrade to Pro",notSignedIn:"No account?",createFirst:"Create a free account",
      comingSoon:"Payment coming soon! Contact us to upgrade manually.",
      trialNote:"14-day free trial included",
      trialTitle:"Upgrade to keep your Pro access",
      trialSub:"Your trial ends in X days. Subscribe now to keep climate analysis, GeoData export, and extended isochrone.",
      billingComingSoon:"Billing portal coming soon.",
      freeLimitTitle:"Free limit reached",freeLimitSub:"You’ve used your 50 parcel views this month. Upgrade to Pro for up to 1,000.",
      freeAnalysisLimitTitle:"Free limit reached",freeAnalysisLimitSub:"You’ve used your 50 analyses this month. Upgrade to Pro for up to 1,000.",
      trialLimitTitle:"Trial limit reached",trialLimitSub:"You’ve used your 300 trial parcel views. Subscribe to Pro for up to 1,000 every month.",
      trialAnalysisLimitTitle:"Trial limit reached",trialAnalysisLimitSub:"You’ve used your 300 trial analyses. Subscribe to Pro for up to 1,000 every month.",
      proLimitTitle:"Pro limit reached",proLimitSub:"You’ve used your 1,000 parcel views. Contact us to extend your limit.",
      proAnalysisLimitTitle:"Pro limit reached",proAnalysisLimitSub:"You’ve used your 1,000 analyses. Contact us to extend your limit.",
    rateInfoTip:"Different exchange rates and bank fees may apply."
    },
    polySelectBtn:"Draw", polySelectBtnActive:"Cancel", drawImportLabel:"Import",
    drawShapeType:"Shape", drawPolygon:"Polygon", drawRectangle:"Square", drawCircle:"Circle", drawLine:"Line",
    polyDrawHint:"Click to draw polygon — double-click to finish",
    rectDrawHint:"Click and drag to draw rectangle",
    circleDrawHint:"Click and drag to draw circle",
    lineDrawHint:"Click to place points — double-click to finish",
    polyPanelTitle:"Selected Parcels", polyParcelsSub:"parcels intersected", polyDlBtn:"Download GeoJSON",
    polySearching:"Searching parcels…", polyNone:"No parcels found in this area.",
    exportBtn:"Export PDF", exportGenerating:"Generating…", exportProOnly:"PDF export is a Pro feature.",
    geodataBtn:"Download GeoData", geodataProOnly:"GeoData export is a Pro feature.",
    pdfTitle:"Parcel Analysis Report", pdfGenerated:"Generated by Urbanyx",
    pdfWalkability:"Walkability Analysis", pdfDiversityIndex:"Shannon Diversity Index",
    pdfStreetImagery:"Street Imagery", pdfProAnalysis:"Pro Analysis",
    pdfNoScore:"Run analysis to generate score", pdfNoImage:"No street imagery available",
    hist:{ live:"Live", history:"History", coverage:(f,n)=>`Archive since ${f} · ${n} day${n==1?'':'s'} of data`,
      onTime:"On-time", onTimeSub:"−1…+5 min", medDelay:"Median delay", p90:"90th-pct delay", ewt:"Excess wait",
      worst:"Least reliable stops in area", noData:"No history for this area yet — data collection began 12 Jul 2026.",
      insufficient:"insufficient data", late:"late", traceHint:"Click a route chip below to paint its speed along the route",
      dirToggle:"⇄ direction", clearTrace:"Clear trace", loading:"Crunching history…",
      days:{all:"All days",weekday:"Weekdays",sat:"Sat",sun:"Sun"},
      bands:{all:"All day",am_peak:"AM peak",midday:"Midday",pm_peak:"PM peak",evening:"Evening"},
      chartTitle:"Median delay by hour", chartUnit:"min", obs:"obs",
      scoreLabel:"Area reliability", worstRoute:"Worst route", schedHeadway:"Sched. headway", perDay:"/day avg",
      infoScore:"Weighted share of arrivals within +5 min of schedule across all observed stops in this isochrone (each stop weighted by its observation count). Grades: A ≥80%, B ≥70%, C ≥60%, D ≥50%, E ≥40%, F below 40%.",
      colorBy:"Color stops by", varOntime:"On-time", varLate:"Late >5 min", varDelay:"Median delay", varHeadway:"Headway",
      infoOnTime:"Share of observed arrivals within −60s…+300s of the scheduled time (industry standard window). Sample size shown in the tooltip; stops with fewer than 30 matched observations are excluded from coloring.",
      infoMed:"Median of the daily median signed delays across the area's stops. Positive = late, negative = early. Derived from vehicle positions sampled every 2 minutes; individual arrivals are interpolated, giving roughly ±1 minute precision.",
      infoP90:"90th percentile of delay — the worst-case a rider should plan for. One in ten arrivals is later than this.",
      infoEwt:"Excess Wait Time: how much longer riders actually wait versus the scheduled headway (E[h²]/2E[h]). Only computed for the All-day view, since headways need the full day's arrivals.",
      infoBandEwt:"EWT and headway metrics are available in the All-day view only.",
      exportPdf:"PDF · TIA", exportCsv:"CSV", exportGeo:"GeoJSON" },
    dash:{ title:"Dashboard", usage:"Usage", usedToday:"Searches this month", remaining:"Remaining", limit:"Monthly limit", resetsAt:"Resets on", billing:"Plan & Billing", freePlan:"Free plan", proPlan:"Pro plan", freeDesc:"50 parcel views and analyses / month", proDesc:"1,000 searches / month · Full Pro analysis · GeoData export", upgrade:"Upgrade to Pro", manageBilling:"Manage billing", billingTitle:"Billing", billingSubFree:"Manage your plan", billingSubPro:"Your active subscription", billingLblPlan:"Current plan", billingLblHistory:"Billing history", billingPeriod:"/month", billingRenewal:"Next payment", billingTrialEnds:"Trial ends", billingDaysLeft:"days remaining", billingTrialNote:"Your 14-day free trial is active. If you cancel now, you keep full access until the trial ends.", billingPostTrialNote:"If you cancel, you keep Pro access until your renewal date. No further charges after that.", billingCanceling:"Cancellation scheduled — access continues until period end.", billingNoHistory:"No billing history yet", billingCancel:"Cancel subscription", billingCancelConfirm:"Are you sure you want to cancel? You will keep access until the current period ends.", billingCanceledTrial:"Your subscription has been cancelled. No charge was made.", billingCanceledRefund:"Your subscription has been cancelled and a refund has been issued for the unused period.", signOut:"Sign out", activity:"Activity this month" },
    projects:{ navTip:"My Projects", panelTitle:"My Projects", saveBtn:"Save current analysis", emptyMsg:"No saved projects yet.", openBtn:"Open", deleteConfirm:"Delete this project?", loadingMsg:"Loading…", savingMsg:"Saving…", saveModalTitle:"Save Project", saveModalHint:"Saves map view, selected features, imported layers and analysis results.", cancelBtn:"Cancel", confirmBtn:"Save", savedToast:"Project saved", deletedToast:"Project deleted", loadedToast:"Project loaded", errorSave:"Failed to save project", errorLoad:"Failed to load project", errorDelete:"Delete failed", layers:"layer", layersPlural:"layers" },
    activityLabels:{ map_click:"Clicks", free_analysis:"Free analysis", pro_analysis:"Pro analysis", relief_analysis:"Relief", pdf_export:"PDF export", geojson_export:"GeoJSON export" },
    activityIcons:{ map_click:"—", free_analysis:"○", pro_analysis:"◆", relief_analysis:"△", pdf_export:"↓", geojson_export:"⬡" },
    layers:{ btn:"Layers", basemap:"Basemap", layers:"Layers", cadastral:"Parcels", lineObjects:"Lines", forestFund:"Forest", dark:"Dark", satellite:"Satellite", day:"Day", night:"Night" },
    searchesLeft:"searches left this month", viewPlans:"View plans", plansBtn:"Plans",
    limitWarning:(left,resetDate)=>`You've used 90%+ of your monthly searches. ${left} remaining, resets on ${resetDate}.`,
    limitWarnCta:"Upgrade for 1,000 searches/month →"
  },
  ka: {
    brand:"ნაკვეთის ვიუერი", placeholder:"01.15.07.002.057", btn:"ძიება", btnLoading:"...",
    searching:"იძიება…", notFound:"ნაკვეთი ვერ მოიძებნა.", error:"შეცდომა.", found:"ნაკვეთი მოიძებნა", govGeDown:"maps.gov.ge მიუწვდომელია — ძიებით ჩატვირთეთ ნაკვეთი",
    code:"საკადასტრო კოდი", area:"ფართობი", type:"ტიპი", addr:"მისამართი", owner:"მესაკუთრე", sqm:"კვ.მ.",
    lineDesc:"აღწერა", lineCoverage:"ზონა", lineOwnership:"საკ. ტიპი", lineExtra:"მახასიათებლები",
    parcelInfo:"ნაკვეთის ინფო",
    analyseBtn:"სიარულის ანალიზი", freeBadge:"უფასო", proAnalyseBtn:"სივრცული ანალიზი",
    analysingIso:"1/2 · იზოქრონი იანგარიშება…", analysingOsm:"2/2 · ობიექტები ითვლება…",
    analysingProIso:"1/2 · იზოქრონი იანგარიშება…", analysingProLayers:"2/2 · განათლება და მობილობის მონაცემები…",
    climateBtn:"კლიმატის ანალიზი", climateCardTitle:"კლიმატის ანალიზი",
    retrying:"ხელახლა ცდა…", analysisError:"ანალიზი ვერ მოხერხდა.",
    isoTitle:"10 წუთის სავალი ზონა", isoDesc:"უფასო სიარულის არე",
    isoTitlePro:"15 წუთის სავალი ზონა", isoDescPro:"Pro სიარულის არე",
    scoreTitle:"მრავალფეროვნების ინდექსი", outOf:"შენონის SDI",
    done:"ანალიზი დასრულდა", proDone:"Pro ანალიზი დასრულდა",
    mapillaryTitle:"ქუჩის სურათები", mapillaryNone:"სურათები ვერ მოიძებნა.",
    analyzing:"ანალიზი…",
    mapillaryNear:"ქუჩის სურათები — ნაკვეთიდან 20მ-ში", mapillaryFar:"ქუჩის სურათები — უახლოესი სამეზობლოში",
    mapillaryOpen:"სურათზე დაჭერით გაიხსნება Mapillary",
    proLayersTitle:"სივრცული ანალიზი",
    verdicts:["ძალიან ცუდი","ცუდი","საშუალო","კარგი","ძალიან კარგი","შესანიშნავი"],
    planFree:"უფასო გეგმა", planPro:"Pro გეგმა",
    upgrade:"განახლება", billing:"ბილინგი", signOut:"გასვლა",
    centerSignIn:"შესვლა", centerSignUp:"ანგარიშის შექმნა", orClick:"დააჭირეთ ან დახატეთ რუკაზე",
    cats:{ food:{label:"საკვები და სასმელი",icon:"🍽"}, health:{label:"ჯანდაცვა",icon:"🏥"}, parks:{label:"პარკები",icon:"🌿"}, retail:{label:"სავაჭრო",icon:"🛒"}, culture:{label:"კულტურა",icon:"🎭"} },
    proCats:{ schools:{label:"სკოლები",icon:"🏫"}, kindergartens:{label:"საბავშვო ბაღები",icon:"🧒"}, crashes:{label:"საგზაო ინციდენტები",icon:"⚠️"} },
    proCategories:{ climate:"კლიმატი", education:"განათლება", mobility:"მობილობა", morphology:"ურბანული მორფოლოგია", energy:"სუფთა ენერგია", relief:"რელიეფის ანალიზი" },
    accessibilityTitle:"ხელმისაწვდომობის ანალიზი", accModeLabel:"სატრანსპორტო საშუალება", accTimeLabel:"გადაადგილების დრო", accGenerate:"იზოქრონის გენერაცია", accModes:{walking:"სიარული",cycling:"ველოსიპედი",driving:"ავტომობილი"}, accNoIso:"ჯერ გენერირეთ იზოქრონი", ttcAreaSmall:"არეალი 5,000 კვ.მ-ზე ნაკლებია — ჯერ გენერირეთ იზოქრონი", ttcAoiLabel:"საკვლევი არეალი", ttcTitle:"ტრანსპორტი", ttcNearby:"საჯარო ტრანსპორტი", ttcNoStops:"იზოქრონში გაჩერება არ არის", ttcNoArrivals:"მომდევნო ჩამოსვლა არ არის", ttcOnTime:"დროულად", ttcLoading:"იტვირთება...",
    reliefTypes:{ height:"სიმაღლე", slope:"დახრა", aspect:"ორიენტაცია" },
    reliefLoading:"DTM იტვირთება…", reliefMin:"მინ", reliefMax:"მაქს", reliefMean:"საშ",
    reliefUnits:{ height:"მ ა.დ.", slope:"°", aspect:"°" },
    slopeClasses:[{l:"ბარი",r:"<3°"},{l:"ვარდნილი",r:"3–8°"},{l:"საშუალო",r:"8–15°"},{l:"ციცაბო",r:"15–30°"},{l:"ძ.ციცაბო",r:">30°"}],
    slopeClassColors:["#34d399","#86efac","#fbbf24","#f97316","#ef4444"],
    solarSuitability:"მზის პოტენციალი", solarDesc:"სამხ. (135–225°), დახ. ≤ 30°",
    windBtn:"ქარის ანალიზი", windCardTitle:"ქარის ანალიზი",
    windSpeed:"საშ. ქარის სიჩქარე", windPowerDensity:"სიმძლავრის სიმჭიდროვე", windCapFactor:"სიმძლავრის კოეფ.",
    windYield:"სავარ. წლ. გამომუშავება", windRefTurbine:"5 კვტ ეტ. ტურბინა · 30მ სიმაღლე",
    windChecking:"გარემო შემოწმება…", windBuildings:"500 მ. რადიუსში შენობებია — ქარის ტურბინა არ არის რეკომენდებული",
    windRose:"ქარის ვარდი",
    aspectDirs:["ჩ","ჩ-აღ","აღ","სამ-აღ","სამ","სამ-დ","დ","ჩ-დ"],
    auth:{
      siTitle:"შესვლა", siEmail:"ელ-ფოსტა", siPassword:"პაროლი",
      siBtn:"შესვლა",
      siFooter:'<a onclick="showView(\'view-reset\')">პაროლი დაგავიწყდა?</a> · <a onclick="showView(\'view-signup\')">ანგარიშის შექმნა</a>',
      suTitle:"ანგარიშის შექმნა", suSub:"მოიცავს უფასო 14-დღიან Pro პერიოდს — ბარათი არ სჭირდება",
      suName:"სახელი",
      suSector:"სექტორი", suSectorPh:"აირჩიე სექტორი",
      suSectors:["არქიტექტურა / ურბანული დიზაინი","ინჟინერია","უძრავი ქონება / დეველოპმენტი","მთავრობა / საჯარო სექტორი","აკადემია / კვლევა","ურბანული დაგეგმარება","მშენებლობა","ფინანსები / ინვესტიცია","იურიდიული","სხვა"],
      suOrg:"ორგანიზაცია (არასავალდებულო)",
      suRole:"როლი / პოზიცია",
      suPurpose:"გამოყენების მიზანი", suPurposePh:"აირჩიე მიზანი",
      suPurposes:["ადგილის ანალიზი","ურბანული დაგეგმარება და კვლევა","ინვესტიცია / დიუ-დილიჯენსი","აკადემიური კვლევა","პროფესიული მომსახურება","პირადი ინტერესი","სხვა"],
      suEmail:"ელ-ფოსტა", suPassword:"პაროლი (მინ. 8 სიმბოლო)",
      suBtn:"ანგარიშის შექმნა",
      suFooter:'<a onclick="showView(\'view-signin\')">უკვე გაქვს ანგარიში? შედი</a>',
      confirmTitle:"შეამოწმე ელ-ფოსტა", confirmBtn:"კარგი",
      resetTitle:"პაროლის აღდგენა", resetSub:"შეიყვანე ელ-ფოსტა და გამოგიგზავნით ბმულს.",
      resetEmail:"ელ-ფოსტა", resetBtn:"ბმულის გაგზავნა", resetBack:"← უკან",
      resetSent:"ბმული გაიგზავნა — შეამოწმე ელ-ფოსტა.",
      errFill:"შეავსე ყველა ველი.",
      errPassword:"პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო.",
      errTerms:"გასაგრძელებლად საჭიროა წესებსა და პირობებზე თანხმობა.",
      suTerms:'წავიკითხე და ვეთანხმები <a href="/terms" target="_blank" style="color:#818cf8;text-decoration:underline">წესებსა და პირობებს</a> და <a href="/privacy" target="_blank" style="color:#818cf8;text-decoration:underline">კონფიდენციალურობის პოლიტიკას</a>, 14-დღიანი საცდელი პერიოდის ჩათვლით, და ავტომატური ბილინგის ციკლს.',
      errEmail:"შეიყვანე ელ-ფოსტა.",
      updatePwTitle:"ახალი პაროლის დაყენება",updatePwSub:"შეიყვანე ახალი პაროლი.",
      updatePwLabel:"ახალი პაროლი",updatePwBtn:"პაროლის განახლება",pwUpdated:"პაროლი განახლდა — შესული ხართ"
    },
    pw:{
      title:"Pro-ზე გადასვლა",sub:"შექმენი უფასო ანგარიში 50 ნაკვეთის ხედვისა და 50 ანალიზისთვის. Pro აძლევს ულიმიტო წვდომასა და პრემიუმ ფუნქციებს.",
      freeName:"უფასო",proBadge:"Pro",proName:"Pro",freePeriod:"",proPeriod:"/თვე",proBilling:"წლიურად · €150/წელ",proMonthlyPeriod:"/თვე",proMonthlyBilling:"ყოველთვიურად",togAnnual:"წლიური",togMonthly:"თვიური",
      colFree:"უფასო",colPro:"Pro",
      r1:"ნაკვეთის ანალიზი",f1:"50",p1:"1000",
      r2:"ზონირების ანალიზი<br><small style='opacity:.45;font-size:.9em'>თბილისი თავ</small>",f2:"50",p2:"1000",
      r3:"საკუთარი გეგმის შედგენა",f3:"—",p3:"✓",
      r4:"ქუჩის გამოსახულება",f4:"✓",p4:"✓",
      r5:"ურბანული მობილობა<br><small style='opacity:.45;font-size:.9em'>თბილისი თავ</small>",f5:"—",p5:"✓",
      r6:"სივრცული სინტაქსი",f6:"✓",p6:"✓",
      r7:"ურბანული მრავალპეროვნება",f7:"—",p7:"✓",
      r8:"კლიმატის ანალიზი",f8:"—",p8:"✓",
      r9:"ენერგოეფურობა",f9:"—",p9:"✓",
      r10:"რელიევის ანალიზი<br><small style='opacity:.45;font-size:.9em'>თბილისი თავ</small>",f10:"—",p10:"✓",
      cta:"Pro-ზე გადასვლა",notSignedIn:"ანგარიში არ გაქვს?",createFirst:"შექმენი უფასო ანგარიში",
      comingSoon:"გადახდა მალე! დაგვიკავშირდი Pro-ზე გადასასვლელად.",
      trialNote:"მოიცავს 14-დღიან უფასო პერიოდს",
      trialTitle:"განაახლე Pro წვდომის შესანარჩუნებლად",
      trialSub:"საცდელი პერიოდი სრულდება X დღეში. გამოიწერე ახლა კლიმატის ანალიზის, GeoData ექსპორტის და გაფართოებული იზოქრონის შესანარჩუნებლად.",
      billingComingSoon:"ბილინგის პორტალი მალე.",
      freeLimitTitle:"ლიმიტი ამოიწურა",freeLimitSub:"გამოიყენე ამ თვის 50 ნაკვეთის ხედვა. Pro გაძლევს 1,000-მდე ყოველთვიურად.",
      freeAnalysisLimitTitle:"ლიმიტი ამოიწურა",freeAnalysisLimitSub:"გამოიყენე ამ თვის 50 ანალიზი. Pro გაძლევს 1,000-მდე ყოველთვიურად.",
      trialLimitTitle:"საცდელი ლიმიტი ამოიწურა",trialLimitSub:"გამოიყენე საცდელი პერიოდის 300 ნაკვეთის ხედვა. გამოიწერე Pro 1,000-მდე ყოველთვიური ხედვისთვის.",
      trialAnalysisLimitTitle:"საცდელი ლიმიტი ამოიწურა",trialAnalysisLimitSub:"გამოიყენე საცდელი პერიოდის 300 ანალიზი. გამოიწერე Pro 1,000-მდე ყოველთვიური ანალიზისთვის.",
      proLimitTitle:"პრო ლიმიტი ამოიწურა",proLimitSub:"გამოიყენე 1,000 ნაკვეთის ხედვა. დაგვიკავშირდეთ.",
      proAnalysisLimitTitle:"პრო ლიმიტი ამოიწურა",proAnalysisLimitSub:"გამოიყენე 1,000 ანალიზი. დაგვიკავშირდეთ.",
    rateInfoTip:"შეიძლება განსხვავებული გაცვლითი კურსი და საბანკო საკომისიო მოქმედებდეს.",
    
    },
    polySelectBtn:"დახატვა", polySelectBtnActive:"გაუქმება", drawImportLabel:"იმპორტი",
    drawShapeType:"ფორმა", drawPolygon:"პოლიგონი", drawRectangle:"კვადრატი", drawCircle:"წრე", drawLine:"ხაზი",
    polyDrawHint:"დააჭირე პოლიგონის დასახატავად — ორჯერ დააჭირე დასასრულებლად",
    rectDrawHint:"გადათრიეთ მართკუთხედის დასახატად",
    circleDrawHint:"გადათრიეთ წრის დასახატად",
    lineDrawHint:"დააჭირეთ წერტილის დასამატებლად — ორჯერ დაასრულეთ",
    polyPanelTitle:"არჩეული ნაკვეთები", polyParcelsSub:"ნაკვეთი გადაიკვეთა", polyDlBtn:"GeoJSON ჩამოტვირთვა",
    polySearching:"ნაკვეთები ძიებაში…", polyNone:"ამ ზონაში ნაკვეთები ვერ მოიძებნა.",
    exportBtn:"PDF ექსპორტი", exportGenerating:"მზადდება…", exportProOnly:"PDF ექსპორტი Pro ფუნქციაა.",
    geodataBtn:"GeoData ჩამოტვირთვა", geodataProOnly:"GeoData ექსპორტი Pro ფუნქციაა.",
    pdfTitle:"ნაკვეთის ანალიზის ანგარიში", pdfGenerated:"შექმნილია Urbanyx-ით",
    hist:{ live:"ლაივი", history:"ისტორია", coverage:(f,n)=>`არქივი ${f}-დან · ${n} დღის მონაცემი`,
      onTime:"დროულად", onTimeSub:"−1…+5 წთ", medDelay:"მედიანური დაგვ.", p90:"90-ე პროც. დაგვ.", ewt:"ზედმეტი ლოდინი",
      worst:"ყველაზე არასანდო გაჩერებები", noData:"ამ არეალზე ისტორია ჯერ არ არის — შეგროვება დაიწყო 12 ივლ 2026.",
      insufficient:"არასაკმარისი მონაცემი", late:"გვიან", traceHint:"დააჭირე მარშრუტის ნომერს სიჩქარის კვალის სანახავად",
      dirToggle:"⇄ მიმართულება", clearTrace:"კვალის წაშლა", loading:"ისტორია იტვირთება…",
      days:{all:"ყველა დღე",weekday:"სამუშაო",sat:"შაბ",sun:"კვ"},
      bands:{all:"მთელი დღე",am_peak:"დილის პიკი",midday:"შუადღე",pm_peak:"საღამოს პიკი",evening:"საღამო"},
      chartTitle:"მედიანური დაგვიანება საათობრივად", chartUnit:"წთ", obs:"დაკვ.",
      scoreLabel:"არეალის სანდოობა", worstRoute:"ყველაზე ცუდი მარშ.", schedHeadway:"გეგმ. ინტერვალი", perDay:"/დღეში",
      infoScore:"გეგმიდან +5 წუთამდე მოსული ავტობუსების შეწონილი წილი იზოქრონის ყველა გაჩერებაზე (თითო გაჩერება იწონება დაკვირვებების რაოდენობით). შეფასება: A ≥80%, B ≥70%, C ≥60%, D ≥50%, E ≥40%, F 40%-ზე ქვემოთ.",
      colorBy:"გაჩერებების შეფერვა", varOntime:"დროულობა", varLate:"დაგვ. >5 წთ", varDelay:"მედ. დაგვიანება", varHeadway:"ინტერვალი",
      infoOnTime:"დაკვირვებული მოსვლების წილი გეგმიურ დროსთან −60წმ…+300წმ ფარგლებში (ინდუსტრიული სტანდარტი). 30-ზე ნაკლები დაკვირვების გაჩერებები შეფასებიდან გამორიცხულია.",
      infoMed:"დღიური მედიანური დაგვიანებების მედიანა არეალის გაჩერებებზე. დადებითი = გვიან, უარყოფითი = ადრე. სიზუსტე დაახლ. ±1 წუთი (პოზიციები იზომება ყოველ 2 წუთში).",
      infoP90:"დაგვიანების 90-ე პროცენტილი — ყველაზე ცუდი შემთხვევა, რასაც მგზავრი უნდა ელოდოს. ათიდან ერთი მოსვლა ამაზე გვიანია.",
      infoEwt:"ზედმეტი ლოდინის დრო: რამდენად მეტს ელოდება მგზავრი რეალურად გეგმიურ ინტერვალთან შედარებით. მხოლოდ მთელი დღის ხედშია ხელმისაწვდომი.",
      infoBandEwt:"EWT და ინტერვალის მეტრიკები მხოლოდ მთელი დღის ხედშია.",
      exportPdf:"PDF · TIA", exportCsv:"CSV", exportGeo:"GeoJSON" },
    dash:{ title:"დეშბორდი", usage:"გამოყენება", usedToday:"ძიება ამ თვეში", remaining:"დარჩენილი", limit:"თვიური ლიმიტი", resetsAt:"განახლდება", billing:"გეგმა და ბილინგი", freePlan:"უფასო გეგმა", proPlan:"Pro გეგმა", freeDesc:"50 ნაკვეთის ხედვა და ანალიზი / თვეში", proDesc:"1,000 ძიება / თვეში · Pro ანალიზი · GeoData ექსპორტი", upgrade:"Pro-ზე გადასვლა", manageBilling:"ბილინგის მართვა", billingTitle:"ბილინგი", billingSubFree:"გეგმის მართვა", billingSubPro:"თქვენი გამოწერა", billingLblPlan:"მიმდინარე გეგმა", billingLblHistory:"გადახდების ისტორია", billingPeriod:"/თვეში", billingRenewal:"შემდეგი გადახდა", billingTrialEnds:"საცდელი მთავრდება", billingDaysLeft:"დღე რჩება", billingTrialNote:"14-დღიანი უფასო პერიოდი აქტიურია. გაუქმების შემთხვევაში პრო ფუნქციები ხელმისაწვდომი იქნება გამოცდის ბოლომდე.", billingPostTrialNote:"გაუქმების შემთხვევაში Pro წვდომა შენარჩუნდება განახლების თარიღამდე. ამის შემდეგ თანხა არ ჩამოიჭრება.", billingCanceling:"გაუქმება დაგეგმილია — წვდომა გრძელდება პერიოდის ბოლომდე.", billingNoHistory:"გადახდების ისტორია ცარიელია", billingCancel:"გამოწერის გაუქმება", billingCancelConfirm:"დარწმუნებული ხარ? წვდომა შენარჩუნდება მიმდინარე პერიოდის ბოლომდე.", billingCanceledTrial:"გამოწერა გაუქმდა. თანხა არ ჩამოიჭრება.", billingCanceledRefund:"გამოწერა გაუქმდა და გამოუყენებელი პერიოდის თანხა დაბრუნდება.", signOut:"გასვლა", activity:"ამ თვის აქტივობა" },
    projects:{ navTip:"ჩემი პროექტები", panelTitle:"ჩემი პროექტები", saveBtn:"მიმდინარე ანალიზის შენახვა", emptyMsg:"შენახული პროექტები არ არის.", openBtn:"გახსნა", deleteConfirm:"წაშალოს ეს პროექტი?", loadingMsg:"იტვირთება…", savingMsg:"ინახება…", saveModalTitle:"პროექტის შენახვა", saveModalHint:"ინახება რუკის ხედი, შერჩეული ობიექტები, შემოტანილი ფენები და ანალიზის შედეგები.", cancelBtn:"გაუქმება", confirmBtn:"შენახვა", savedToast:"პროექტი შენახულია", deletedToast:"პროექტი წაშლილია", loadedToast:"პროექტი ჩაიტვირთა", errorSave:"შენახვა ვერ მოხერხდა", errorLoad:"ჩატვირთვა ვერ მოხერხდა", errorDelete:"წაშლა ვერ მოხერხდა", layers:"ფენა", layersPlural:"ფენა" },
    activityLabels:{ map_click:"ნაკვეთები", free_analysis:"სიარული", pro_analysis:"სივრც. ანალ.", relief_analysis:"რელიეფი", pdf_export:"PDF", geojson_export:"GeoJSON" },
    activityIcons:{ map_click:"—", free_analysis:"○", pro_analysis:"◆", relief_analysis:"△", pdf_export:"↓", geojson_export:"⬡" },
    pdfWalkability:"სიარულის ანალიზი", pdfDiversityIndex:"შენონის მრავალფეროვნების ინდექსი",
    pdfStreetImagery:"ქუჩის სურათები", pdfProAnalysis:"სივრცული ანალიზი",
    pdfNoScore:"ქულის მისაღებად გაუშვი ანალიზი", pdfNoImage:"ქუჩის სურათები არ არის",
    layers:{ btn:"ფენები", basemap:"საბაზო რუკა", layers:"ფენები", cadastral:"ნაკვეთები", lineObjects:"ხაზები", forestFund:"ტყე", dark:"მუქი", satellite:"სატელიტი", day:"დღე", night:"ღამე" },
    searchesLeft:"ძიება დარჩა ამ თვეში", viewPlans:"გეგმების ნახვა", plansBtn:"გეგმები",
    limitWarning:(left,resetDate)=>`თვიური ლიმიტის 90%+ გამოიყენე. დარჩა ${left}, განახლდება ${resetDate}.`,
    limitWarnCta:"Pro-ზე გადასვლა — 1,000 ძიება/თვეში →"
  }
};

function t(){return T[lang];}

function setLang(l){
  lang=l;
  document.querySelectorAll(".lang-btn").forEach(b=>b.classList.toggle("active",(l==="en"&&b.textContent==="EN")||(l==="ka"&&b.textContent==="ქა")));
  if(mapReady) map.setLanguage(l==='ka'?'ka':'en');
  const _nll=document.getElementById('nav-lang-label');if(_nll)_nll.textContent=l==='en'?'EN':'ქა';
  applyLang();
}

function applyLang(){
  const tr=t(); const pw=tr.pw; const auth=tr.auth;
  // Core
  const _brand=document.getElementById("brand");if(_brand)_brand.textContent=tr.brand;
  document.getElementById("input-center").placeholder=tr.placeholder;
  document.getElementById("input-side").placeholder=tr.placeholder;
  document.getElementById("btn-center").textContent=tr.btn;
  document.getElementById("btn-side").textContent=tr.btn;
  // Parcel info
  document.getElementById("lbl-parcel-info").textContent=tr.parcelInfo;
  document.getElementById("lbl-code").textContent=tr.code;
  document.getElementById("lbl-area").textContent=tr.area;
  document.getElementById("lbl-type").textContent=tr.type;
  document.getElementById("lbl-addr").textContent=tr.addr;
  document.getElementById("lbl-owner").textContent=tr.owner;
  // Buttons
  document.getElementById("analyse-btn-label").textContent=tr.analyseBtn;
  document.getElementById("free-badge").textContent=tr.freeBadge;
  // Analysis cards
  document.getElementById("lbl-score-title").textContent=tr.scoreTitle;
  document.getElementById("lbl-out-of").textContent=tr.outOf;
  const _mgl=document.getElementById("lbl-mapillary-gallery");if(_mgl)_mgl.textContent=tr.mapillaryTitle;
  const _lbl=document.getElementById("lbl-lightbox-open");if(_lbl)_lbl.textContent=tr.mapillaryOpen;
  const _pat=document.getElementById("lbl-pro-analysis-title");if(_pat)_pat.textContent=tr.proLayersTitle;
  const _ebl=document.getElementById("export-btn-label");if(_ebl)_ebl.textContent=tr.exportBtn;
  const _gdl=document.getElementById("geodata-btn-label");if(_gdl)_gdl.textContent=tr.geodataBtn;
  // Polygon select
  const _plt=document.getElementById("lbl-poly-title");if(_plt)_plt.textContent=tr.polyPanelTitle;
  const _pls=document.getElementById("lbl-poly-parcels-sub");if(_pls)_pls.textContent=tr.polyParcelsSub;
  const _pld=document.getElementById("lbl-poly-dl");if(_pld)_pld.textContent=tr.polyDlBtn;
  if(document.getElementById("draw-hint")?.style.display!=="none"&&_polyDrawing){const _dshint=_drawShape==='rectangle'?tr.rectDrawHint:(_drawShape==='circle'?tr.circleDrawHint:tr.polyDrawHint);_setDrawHint(_dshint);}
  const _dst=document.getElementById("lbl-draw-shape-type");if(_dst)_dst.textContent=tr.drawShapeType||'Shape';
  const _dpoly=document.getElementById("lbl-draw-polygon");if(_dpoly)_dpoly.textContent=tr.drawPolygon||'Polygon';
  const _drect=document.getElementById("lbl-draw-rectangle");if(_drect)_drect.textContent=tr.drawRectangle||'Square';
  const _dcirc=document.getElementById("lbl-draw-circle");if(_dcirc)_dcirc.textContent=tr.drawCircle||'Circle';
  const _dline=document.getElementById("lbl-draw-line");if(_dline)_dline.textContent=tr.drawLine||'Line';
  const _dimp=document.getElementById("lbl-draw-import");if(_dimp)_dimp.textContent=tr.drawImportLabel||'Import';
  const _lp=tr.layers;
  document.getElementById("layers-btn-text").textContent=_lp.btn;
  document.getElementById("lbl-lp-basemap").textContent=_lp.basemap;
  document.getElementById("lbl-lp-layers").textContent=_lp.layers;
  document.getElementById("lbl-lp-cadastral").textContent=_lp.cadastral;
  document.getElementById("lbl-lp-lineobjects").textContent=_lp.lineObjects;
  document.getElementById("lbl-lp-forestfunds").textContent=_lp.forestFund;
  document.getElementById("lbl-bm-dark").textContent=_lp.dark;
  document.getElementById("lbl-bm-satellite").textContent=_lp.satellite;
  document.getElementById("lbl-bm-day").textContent=_lp.day;
  document.getElementById("lbl-bm-night").textContent=_lp.night;
  document.getElementById("u-signout-btn").textContent=tr.signOut;
  const _nts=document.getElementById("nav-tip-signout");if(_nts)_nts.textContent=tr.signOut;
  const _ntu=document.getElementById("nav-tip-user");if(_ntu)_ntu.textContent=lang==="ka"?"ანგარიში":"Account";
  const _ntp=document.getElementById("nav-tip-parcel");if(_ntp)_ntp.textContent=lang==="ka"?"მიწის ნაკვეთი":"Parcel search";
  const _ntan=document.getElementById("nav-tip-analysis");if(_ntan)_ntan.textContent=lang==="ka"?"ანალიზი":"Analysis";
  const _ntl=document.getElementById("nav-tip-layers");if(_ntl)_ntl.textContent=lang==="ka"?"ფენები":"Layers";
  const plansBtn=document.getElementById("plans-btn");if(plansBtn)plansBtn.textContent=tr.plansBtn;
  const signinBtnEl=document.getElementById("signin-btn");if(signinBtnEl)signinBtnEl.textContent=tr.centerSignIn;
  // Center auth links
  document.getElementById("center-signin-link").textContent=tr.centerSignIn;
  document.getElementById("center-signup-link").textContent=tr.centerSignUp;
  const orEl=document.getElementById("or-click-text");if(orEl)orEl.textContent=tr.orClick;
  // Auth modal — sign in
  document.getElementById("si-title").textContent=auth.siTitle;
  document.getElementById("lbl-si-email").textContent=auth.siEmail;
  document.getElementById("si-email").placeholder=lang==="en"?"you@example.com":"თქვენ@example.com";
  document.getElementById("lbl-si-password").textContent=auth.siPassword;
  document.getElementById("si-password").placeholder="••••••••";
  document.getElementById("btn-signin").textContent=auth.siBtn;
  document.getElementById("si-footer").innerHTML=auth.siFooter;
  // Auth modal — sign up
  document.getElementById("su-title").textContent=auth.suTitle;
  document.getElementById("su-sub").textContent=auth.suSub;
  document.getElementById("lbl-su-name").textContent=auth.suName;
  document.getElementById("su-name").placeholder=lang==="en"?"Your name":"თქვენი სახელი";
  document.getElementById("lbl-su-sector").textContent=auth.suSector||"";
  const _sphEl=document.getElementById("su-sector-ph");if(_sphEl)_sphEl.textContent=auth.suSectorPh||"";
  const _ssel=document.getElementById("su-sector");
  if(_ssel){const _sv=_ssel.value;while(_ssel.options.length>1)_ssel.remove(1);(auth.suSectors||[]).forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;_ssel.appendChild(o);});_ssel.value=_sv;}
  document.getElementById("lbl-su-org").textContent=auth.suOrg||"";
  document.getElementById("lbl-su-role").textContent=auth.suRole||"";
  document.getElementById("lbl-su-purpose").textContent=auth.suPurpose||"";
  const _pphEl=document.getElementById("su-purpose-ph");if(_pphEl)_pphEl.textContent=auth.suPurposePh||"";
  const _psel=document.getElementById("su-purpose");
  if(_psel){const _pv=_psel.value;while(_psel.options.length>1)_psel.remove(1);(auth.suPurposes||[]).forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;_psel.appendChild(o);});_psel.value=_pv;}
  document.getElementById("lbl-su-email").textContent=auth.suEmail;
  document.getElementById("su-email").placeholder=lang==="en"?"you@example.com":"თქვენ@example.com";
  document.getElementById("lbl-su-password").textContent=auth.suPassword;
  document.getElementById("su-password").placeholder="••••••••";
  document.getElementById("btn-signup").textContent=auth.suBtn;
  document.getElementById("su-footer").innerHTML=auth.suFooter;
  const termsSpan=document.getElementById("lbl-su-terms");
  if(termsSpan)termsSpan.innerHTML=auth.suTerms||"";
  // Auth modal — confirm
  document.getElementById("confirm-title").textContent=auth.confirmTitle;
  document.getElementById("btn-confirm").textContent=auth.confirmBtn;
  // Auth modal — reset
  document.getElementById("btn-back-reset").textContent=auth.resetBack;
  document.getElementById("reset-title").textContent=auth.resetTitle;
  document.getElementById("reset-sub").textContent=auth.resetSub;
  document.getElementById("lbl-reset-email").textContent=auth.resetEmail;
  document.getElementById("reset-email").placeholder=lang==="en"?"you@example.com":"თქვენ@example.com";
  document.getElementById("btn-reset").textContent=auth.resetBtn;
  const _upt=document.getElementById("update-pw-title");if(_upt)_upt.textContent=auth.updatePwTitle||"";
  const _ups=document.getElementById("update-pw-sub");if(_ups)_ups.textContent=auth.updatePwSub||"";
  const _upl=document.getElementById("lbl-update-pw");if(_upl)_upl.textContent=auth.updatePwLabel||"";
  const _upb=document.getElementById("btn-update-pw");if(_upb)_upb.textContent=auth.updatePwBtn||"";
  // Paywall
  document.getElementById("pw-title").textContent=pw.title;
  document.getElementById("pw-sub").textContent=pw.sub;
  document.getElementById("pw-free-name").textContent=pw.freeName;
  document.getElementById("pw-free-period").textContent=pw.freePeriod;
  document.getElementById("pw-pro-badge").textContent=pw.proBadge;
  document.getElementById("pw-pro-name").textContent=pw.proName;
  const _ta=document.getElementById("pw-btog-annual");if(_ta)_ta.textContent=pw.togAnnual||"Annual";
  const _tm=document.getElementById("pw-btog-monthly");if(_tm)_tm.textContent=pw.togMonthly||"Monthly";
  setPwBilling("annual");
  document.getElementById("pw-col-free").textContent=pw.colFree;
  document.getElementById("pw-col-pro").textContent=pw.colPro;
  [1,2,3,4,5,6,7,8,9,10].forEach(i=>{
    const r=document.getElementById("pw-r"+i),f=document.getElementById("pw-f"+i),p=document.getElementById("pw-p"+i);
    if(r)r.innerHTML=pw["r"+i]||"";if(f)f.textContent=pw["f"+i];if(p)p.textContent=pw["p"+i];
  });
  document.getElementById("pw-cta-btn").textContent=pw.cta;
  const _tn=document.getElementById("pw-trial-note");if(_tn)_tn.textContent=pw.trialNote||"";
  document.getElementById("pw-footer").innerHTML=`${pw.notSignedIn} <a onclick="openAuthForUpgrade()">${pw.createFirst}</a>`;
  updateUserUI();
  const abLabel = document.getElementById("analyse-btn-label");
    if(abLabel) abLabel.textContent = tr.analyseBtn;
    const fbLabel = document.getElementById("free-badge");
    if(fbLabel) fbLabel.textContent = tr.freeBadge;
    const expLabel = document.getElementById("export-btn-label");
    if(expLabel) expLabel.textContent = tr.exportBtn;
}



// ── User UI ───────────────────────────────────────────────────────────────────
function setAvatar(el, url, initials){
  const textEl=el.querySelector(".avatar-initials");
  let img=el.querySelector(".avatar-img");
  if(url){
    if(!img){img=document.createElement("img");img.className="avatar-img";img.alt="";el.prepend(img);}
    img.src=url;
    img.onerror=()=>{img.remove();if(textEl)textEl.textContent=initials;};
    if(textEl)textEl.textContent="";
  }else{
    if(img)img.remove();
    if(textEl)textEl.textContent=initials;
  }
}

function updateUserUI(){
  // Free tier: analyses are Pro features — greyed & unclickable (trial = pro).
  document.body.classList.toggle("free-tier",!currentUser||currentUser.plan!=="pro");
  const pill=document.getElementById("user-pill");
  const pwFooter=document.getElementById("pw-footer");
  const authLink=document.getElementById("center-auth-link");
  const plansBtn=document.getElementById("plans-btn");
  const signinBtn=document.getElementById("signin-btn");
  const drawGroup=document.getElementById("draw-tool-group");
  const tr=t();
  if(currentUser){
    const initials=(currentUser.name||currentUser.email||"U").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    setAvatar(document.getElementById("u-avatar"),currentUser.avatarUrl,initials);
    const _navAvEl=document.getElementById("nav-u-avatar");if(_navAvEl)setAvatar(_navAvEl,currentUser.avatarUrl,initials);
    document.getElementById("u-name").textContent=currentUser.name||currentUser.email;
    const planEl=document.getElementById("u-plan");
    planEl.textContent=currentUser.plan==="pro"?tr.planPro:tr.planFree;
    planEl.className="u-plan"+(currentUser.plan==="pro"?"":" free");
    pill.classList.add("visible");
    const _navSO=document.getElementById("nav-signout-btn");if(_navSO)_navSO.style.display="";
    _updateProjectsNavBtn();
    if(pwFooter)pwFooter.style.display="none";
    if(authLink)authLink.style.display="none";
    if(signinBtn)signinBtn.style.display="none";
    if(plansBtn)plansBtn.style.display=currentUser.plan==="pro"?"none":"";
    if(drawGroup){drawGroup.style.display=currentUser.plan==="pro"?"block":"none";}
    const _atb=document.getElementById('analysis-tool-btn');if(_atb)_atb.style.display=currentUser.plan==="pro"?"flex":"none";
  } else {
    pill.classList.remove("visible");
    if(pwFooter)pwFooter.style.display="";
    if(authLink)authLink.style.display="";
    if(signinBtn)signinBtn.style.display="";
    if(plansBtn)plansBtn.style.display="";
    if(drawGroup)drawGroup.style.display="none";
    const _atb=document.getElementById('analysis-tool-btn');if(_atb)_atb.style.display="none";
    const _navSO2=document.getElementById("nav-signout-btn");if(_navSO2)_navSO2.style.display="none";
    _updateProjectsNavBtn();
    const _navAvEl2=document.getElementById("nav-u-avatar");if(_navAvEl2){const _ti=_navAvEl2.querySelector(".avatar-initials");if(_ti)_ti.textContent="";}
  }
}

function _getRegPeriod(registeredAt){
  // Rolling period anchored to the user's registration day-of-month.
  // e.g. registered Jun 15 → periods are Jun 15–Jul 14, Jul 15–Aug 14, etc.
  const reg=new Date(registeredAt);
  const now=new Date();
  const regDay=reg.getDate();
  function safeDay(y,m,d){const last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d,last));}
  let y=now.getFullYear(),m=now.getMonth();
  let start=safeDay(y,m,regDay);
  if(start>now){m--;if(m<0){m=11;y--;}start=safeDay(y,m,regDay);}
  if(start<reg)start=reg;
  const rm=start.getMonth()+1,ry=start.getFullYear()+(rm>11?1:0);
  const reset=safeDay(ry,rm%12,regDay);
  return{since:start.toISOString(),resetDate:reset};
}

async function fetchSearchUsage(){
  // For Pro users: count from billing period start so the trial-to-paid transition
  // doesn't reset clicks. For free users: count from registration anniversary period.
  let since;
  if(currentUser.plan==='pro'&&window._subPeriodEnd){
    const cycleDays=window._subInterval==='year'?365:30;
    since=new Date(new Date(window._subPeriodEnd).getTime()-cycleDays*86400000).toISOString();
  } else {
    since=currentUser.registeredAt?_getRegPeriod(currentUser.registeredAt).since:new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString();
  }
  const{data,error}=await sb.rpc("get_search_count",{p_user_id:currentUser.id,since_ts:since});
  if(error){
    console.error("fetchSearchUsage RPC failed:",error.message);
    // Fallback: direct table count
    const{count,error:e2}=await sb.from("search_logs").select("id",{count:"exact",head:true})
      .eq("user_id",currentUser.id).gte("created_at",since);
    if(e2){console.error("search_logs fallback failed:",e2.message);return 0;}
    console.log("fetchSearchUsage fallback count:",count);
    return count||0;
  }
  // RPC may return a scalar number or an array row
  if(typeof data==="number")return data;
  if(Array.isArray(data)&&data.length)return Number(data[0].count??data[0].search_count??data[0].cnt??0);
  const n=Number(data);
  if(!isNaN(n))return n;
  console.error("fetchSearchUsage unexpected data format:",data);
  return 0;
}

async function fetchUserMonthlyLimit(){
  const planLimit=currentUser.plan==="pro"?(_isTrialing()?TRIAL_PARCEL_LIMIT:PRO_PARCEL_LIMIT):FREE_PARCEL_LIMIT;
  const now=new Date();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const {data}=await sb.from("search_overrides").select("custom_limit").eq("user_id",currentUser.id).eq("year_month",ym).maybeSingle();
  const custom=data?.custom_limit??null;
  return {limit:custom??planLimit,custom,planLimit};
}

async function updateSearchCounter(){
  if(!currentUser)return;
  try{
    const _now=new Date();
    const [used,{limit}]=await Promise.all([fetchSearchUsage(),fetchUserMonthlyLimit()]);
    const threshold=Math.floor(limit*0.9);
    const left=Math.max(0,limit-used);
    const _pe=window._subPeriodEnd?new Date(window._subPeriodEnd):null;
    const _freeReset=currentUser.registeredAt?_getRegPeriod(currentUser.registeredAt).resetDate:new Date(_now.getFullYear(),_now.getMonth()+1,1);
    const resetDate=(_pe&&currentUser.plan==='pro'?_pe:_freeReset)
      .toLocaleDateString(lang==="ka"?"ka-GE":"en-GB",{month:"short",day:"numeric"});
    const warningEl=document.getElementById("limit-warning");
    const warningText=document.getElementById("limit-warning-text");
    const warningCta=document.getElementById("limit-warning-cta");
    if(used>=threshold&&warningEl&&warningText&&warningCta){
      warningText.textContent=t().limitWarning(left,resetDate);
      warningCta.textContent=currentUser.plan==="pro"?"":t().limitWarnCta;
      warningCta.style.display=currentUser.plan==="pro"?"none":"block";
      warningEl.style.display="block";
    } else if(warningEl){
      warningEl.style.display="none";
    }
    if(left===0)_limitCache={allowed:false,ts:Date.now()};
    if(document.getElementById("dashboard-modal")?.classList.contains("open"))loadDashboardStats();
  }catch(e){console.warn("updateSearchCounter:",e);}
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function showView(id){
  ["view-signin","view-signup","view-confirm","view-reset","view-update-password"].forEach(v=>{
    document.getElementById(v).style.display=v===id?"":"none";
  });
  ["si-error","su-error","reset-error"].forEach(e=>{const el=document.getElementById(e);if(el)el.textContent="";});
}
function openAuthModal(view="view-signin"){showView(view);document.getElementById("auth-modal").classList.add("open");}
function closeAuthModal(){document.getElementById("auth-modal").classList.remove("open");_afterAuthCb=null;}
function onAuthOverlayClick(e){if(e.target===document.getElementById("auth-modal"))closeAuthModal();}
function openAuthForUpgrade(){closePaywall();_afterAuthCb=()=>openPaywall();openAuthModal("view-signup");}

async function signInEmail(){
  const btn=document.getElementById("btn-signin");
  const errEl=document.getElementById("si-error");
  const email=document.getElementById("si-email").value.trim();
  const password=document.getElementById("si-password").value;
  errEl.textContent="";
  if(!email||!password){errEl.textContent=t().auth.errFill;return;}
  btn.disabled=true;btn.innerHTML=`<span class="spinner-sm"></span>`;
  const{data,error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent=t().auth.siBtn;
  if(error){errEl.textContent=error.message;return;}
  await onAuthSuccess(data.session);
  closeAuthModal();
}

async function signUp(){
  const btn=document.getElementById("btn-signup");
  const errEl=document.getElementById("su-error");
  const name=document.getElementById("su-name").value.trim();
  const sector=document.getElementById("su-sector").value;
  const org=document.getElementById("su-org").value.trim();
  const role=document.getElementById("su-role").value.trim();
  const purpose=document.getElementById("su-purpose").value;
  const email=document.getElementById("su-email").value.trim();
  const password=document.getElementById("su-password").value;
  errEl.textContent="";
  const termsChecked=document.getElementById("su-terms")?.checked;
  _marketingConsent=document.getElementById("su-marketing-cb")?.checked||false;
  if(!email||!password||!sector||!role||!purpose){errEl.textContent=t().auth.errFill;return;}
  if(password.length<8){errEl.textContent=t().auth.errPassword;return;}
  if(!termsChecked){errEl.textContent=t().auth.errTerms;return;}
  const termsAcceptedAt=new Date().toISOString();
  btn.disabled=true;btn.innerHTML=`<span class="spinner-sm"></span>`;
  const{data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,sector,organisation:org,role,purpose,terms_accepted:true,terms_accepted_at:termsAcceptedAt},emailRedirectTo:location.origin+location.pathname}});
  btn.disabled=false;btn.textContent=t().auth.suBtn;
  if(error){errEl.textContent=error.message;return;}
  if(data.user){sb.from("profiles").upsert({id:data.user.id,marketing_consent:_marketingConsent},{onConflict:"id"}).then(()=>{});}
  if(data.session){await onAuthSuccess(data.session);closeAuthModal();}
  else{
    document.getElementById("confirm-sub").textContent=lang==="en"
      ?`We sent a confirmation link to ${email}. Click it to activate your account.`
      :`დადასტურების ბმული გაიგზავნა ${email}-ზე. დააჭირე გასააქტიურებლად.`;
    showView("view-confirm");
  }
}

async function resetPassword(){
  const btn=document.getElementById("btn-reset");
  const errEl=document.getElementById("reset-error");
  const email=document.getElementById("reset-email").value.trim();
  errEl.textContent="";
  if(!email){errEl.textContent=t().auth.errEmail;return;}
  btn.disabled=true;btn.innerHTML=`<span class="spinner-sm"></span>`;
  const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  btn.disabled=false;btn.textContent=t().auth.resetBtn;
  if(error){errEl.textContent=error.message;return;}
  errEl.style.color="#86efac";errEl.textContent=t().auth.resetSent;
}

async function onAuthSuccess(session){
  const u=session.user;
  let plan="free",isAdmin=false;
  try{
    const{data,error:subErr}=await sb.from("subscriptions").select("plan,status,billing_interval,current_period_end,subscription_started_at,trial_ends_at,trial_active").eq("user_id",u.id).single();
    if(subErr){console.error("[sub] fetch error:",subErr.code,subErr.message);}
    if(data){
      window._subInterval=data.billing_interval||"month";
      window._subPeriodEnd=data.current_period_end||null;
      window._subStartedAt=data.subscription_started_at||null;
      window._trialEndsAt=data.trial_ends_at||null;
      const periodInFuture=data.current_period_end&&new Date(data.current_period_end)>new Date();
      const trialExpired=data.status==="trialing"&&data.trial_ends_at&&new Date(data.trial_ends_at)<=new Date();
      // "canceling" only grants access while the paid period is still running;
      // past current_period_end it is treated as ended even if the webhook
      // that finalizes the downgrade hasn't arrived yet.
      const effectiveStatus=(data.status==="canceled"&&periodInFuture)?"canceling"
        :(data.status==="canceling"&&!periodInFuture)?"ended"
        :trialExpired?"expired":data.status;
      window._subStatus=effectiveStatus||"free";
      if(effectiveStatus==="active"||effectiveStatus==="trialing"||effectiveStatus==="canceling")plan=data.plan;
      console.log("[sub] status="+effectiveStatus+" plan="+plan);
    }
  }catch(e){console.warn("Plan fetch:",e);}
  try{
    const{data}=await sb.from("profiles").select("is_admin,marketing_consent").eq("id",u.id).single();
    if(data){isAdmin=!!data.is_admin;_marketingConsent=!!data.marketing_consent;}
  }catch(e){console.warn("Profile fetch:",e);}
  currentUser={id:u.id,email:u.email,name:u.user_metadata?.full_name||"",plan,isAdmin,accessToken:session.access_token,avatarUrl:u.user_metadata?.avatar_url||null,_subStatus:window._subStatus||"free",registeredAt:u.created_at||null};
  localStorage.removeItem("gstP");localStorage.removeItem("gstA"); // clean up legacy guest counters
  if(currentUser.plan==="pro"){_loadProCounts(currentUser.id);}else{_loadFreeCounts(currentUser.id);}
  updateUserUI();
  flushPendingLogs().then(()=>updateSearchCounter());
  if(_afterAuthCb){const cb=_afterAuthCb;_afterAuthCb=null;cb();}
}

async function logout(){
  await sb.auth.signOut();
  currentUser=null;
  mapMoved=false;
  updateUserUI();
  resetAnalysis();
  hasSearched=false;
  document.getElementById("side-panel").classList.remove("visible");
  document.getElementById("center-search").classList.remove("hidden");
  document.getElementById("center-search").classList.remove("compact");
  document.getElementById("map-blur").classList.remove("hidden");
  document.getElementById("info-card").style.display="none";
  if(mapReady){
    map.getSource("parcel")?.setData({type:"FeatureCollection",features:[]});
    map.getSource("isochrone")?.setData({type:"FeatureCollection",features:[]});
  }
  setStatus("","");
}

// ── Paywall ───────────────────────────────────────────────────────────────────
function _openPaywallLimit(ctx){
  const pw=t().pw;
  const titles={free_parcel:pw.freeLimitTitle,free_analysis:pw.freeAnalysisLimitTitle,trial_parcel:pw.trialLimitTitle,trial_analysis:pw.trialAnalysisLimitTitle,pro_parcel:pw.proLimitTitle,pro_analysis:pw.proAnalysisLimitTitle};
  const subs={free_parcel:pw.freeLimitSub,free_analysis:pw.freeAnalysisLimitSub,trial_parcel:pw.trialLimitSub,trial_analysis:pw.trialAnalysisLimitSub,pro_parcel:pw.proLimitSub,pro_analysis:pw.proAnalysisLimitSub};
  const titleEl=document.getElementById("pw-title");const subEl=document.getElementById("pw-sub");
  if(titleEl)titleEl.textContent=titles[ctx]||pw.title;
  if(subEl)subEl.textContent=subs[ctx]||pw.sub;
  const footer=document.getElementById("pw-footer");
  if(footer)footer.innerHTML=currentUser?"":`${pw.notSignedIn} <a onclick="openAuthForUpgrade()">${pw.createFirst}</a>`;
  openPaywall(true);
}
function _getRateTooltip(){
  let tt=document.getElementById("pw-rate-tooltip");
  if(!tt){tt=document.createElement("div");tt.id="pw-rate-tooltip";tt.className="pw-rate-tooltip";document.body.appendChild(tt);}
  return tt;
}
function _showRateInfo(e){
  const tt=_getRateTooltip();
  tt.textContent=t().pw.rateInfoTip||"";
  tt.style.left=(e.clientX+12)+"px";tt.style.top=(e.clientY+12)+"px";
  tt.style.display="block";
}
function _moveRateInfo(e){
  const tt=document.getElementById("pw-rate-tooltip");if(!tt)return;
  tt.style.left=(e.clientX+12)+"px";tt.style.top=(e.clientY+12)+"px";
}
function _hideRateInfo(){
  const tt=document.getElementById("pw-rate-tooltip");if(!tt)return;
  tt.style.display="none";
}
function setPwBilling(mode){
  const pw=t().pw;
  const ta=document.getElementById("pw-btog-annual"),tm=document.getElementById("pw-btog-monthly");
  if(ta)ta.classList.toggle("active",mode==="annual");
  if(tm)tm.classList.toggle("active",mode==="monthly");
  const price=document.getElementById("pw-pro-price");
  const period=document.getElementById("pw-pro-period");
  const billing=document.getElementById("pw-pro-billing");
  if(mode==="annual"){
    if(price)price.textContent="€12.50";
    if(period)period.textContent=pw.proPeriod||"/mo";
    if(billing)billing.textContent=pw.proBilling||"";
  } else {
    if(price)price.textContent="€15";
    if(period)period.textContent=pw.proMonthlyPeriod||"/mo";
    if(billing)billing.textContent=pw.proMonthlyBilling||"";
  }
}
function openPaywall(_skipTitleReset){
  if(!_skipTitleReset){
    const pw=t().pw;
    const titleEl=document.getElementById("pw-title");
    const subEl=document.getElementById("pw-sub");
    if(currentUser&&currentUser._subStatus==="trialing"&&window._trialEndsAt){
      const daysLeft=Math.max(0,Math.ceil((new Date(window._trialEndsAt)-new Date())/86400000));
      if(daysLeft>0){
        if(titleEl)titleEl.textContent=pw.trialTitle||"Upgrade to keep your Pro access";
        if(subEl)subEl.textContent=(pw.trialSub||"Your trial ends in X days.").replace("X",daysLeft);
      }else{if(titleEl)titleEl.textContent=pw.title;if(subEl)subEl.textContent=pw.sub;}
    }else{if(titleEl)titleEl.textContent=pw.title;if(subEl)subEl.textContent=pw.sub;}
  }
  document.getElementById("paywall-modal").classList.add("open");
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function openDashboard(){
  if(!currentUser)return;
  const tr=t();const dash=tr.dash;
  const modal=document.getElementById("dashboard-modal");
  // Profile
  const initials=(currentUser.name||currentUser.email||"U").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
  setAvatar(document.getElementById("dash-avatar"),currentUser.avatarUrl,initials);
  document.getElementById("dash-name").textContent=currentUser.name||currentUser.email;
  document.getElementById("dash-email").textContent=currentUser.email;
  const badge=document.getElementById("dash-plan-badge");
  badge.textContent=currentUser.plan==="pro"?dash.proPlan:dash.freePlan;
  badge.className="dash-plan-badge "+(currentUser.plan==="pro"?"pro":"free");
  // Trial banner
  const _tb=document.getElementById("dash-trial-banner");
  const _tt=document.getElementById("dash-trial-text");
  if(_tb&&currentUser._subStatus==="trialing"&&window._trialEndsAt){
    const _dl=Math.max(0,Math.ceil((new Date(window._trialEndsAt)-new Date())/86400000));
    if(_dl>0){
      const _urg=_dl<=5;
      _tt.textContent=_urg?`Your trial ends in ${_dl} day${_dl!==1?"s":""} — upgrade to keep access`:`Your Pro trial ends in ${_dl} day${_dl!==1?"s":""}`;
      _tb.className="trial-banner "+(_urg?"amber":"green");
      _tb.style.display="";
    }else{_tb.style.display="none";}
  }else if(_tb){_tb.style.display="none";}
  // Labels
  document.getElementById("lbl-dash-usage").textContent=dash.usage;
  document.getElementById("lbl-dash-used-today").textContent=dash.usedToday;
  document.getElementById("lbl-dash-remaining").textContent=dash.remaining;
  document.getElementById("lbl-dash-billing").textContent=dash.billing;
  document.getElementById("dash-plan-name").textContent=currentUser.plan==="pro"?dash.proPlan:dash.freePlan;
  document.getElementById("dash-plan-desc").textContent=currentUser.plan==="pro"?dash.proDesc:dash.freeDesc;
  document.getElementById("dash-signout-btn").textContent=dash.signOut;
  const upgradeBtn=document.getElementById("dash-upgrade-btn");
  const billingBtn=document.getElementById("dash-billing-btn");
  upgradeBtn.textContent=dash.upgrade;billingBtn.textContent=dash.manageBilling;
  upgradeBtn.style.display=currentUser.plan==="pro"?"none":"";
  billingBtn.style.display=currentUser.plan==="pro"?"":"none";
  // Stats placeholder while loading
  document.getElementById("dash-used-today").textContent="…";
  document.getElementById("dash-remaining").textContent="…";
  document.getElementById("dash-limit-label").textContent=`${dash.limit}: …`;
  document.getElementById("dash-reset-label").textContent="";
  document.getElementById("dash-limit-bar").style.width="0%";
  const _noticeEl=document.getElementById("dash-limit-notice");if(_noticeEl)_noticeEl.style.display="none";
  const _mcCb=document.getElementById("dash-marketing-cb");if(_mcCb)_mcCb.checked=_marketingConsent;
  modal.classList.add("open");
  loadDashboardStats();
}

async function loadDashboardStats(){
  if(!currentUser)return;
  const tr=t();const dash=tr.dash;
  try{
    const _now=new Date();
    const [used,{limit,custom,planLimit}]=await Promise.all([fetchSearchUsage(),fetchUserMonthlyLimit()]);
    const left=Math.max(0,limit-used);
    const pct=Math.min(100,Math.round((used/limit)*100));
    const color=pct>=90?"#fca5a5":pct>=70?"#fbbf24":"#34d399";
    const _periodEnd=window._subPeriodEnd?new Date(window._subPeriodEnd):null;
    const _freeReset2=currentUser.registeredAt?_getRegPeriod(currentUser.registeredAt).resetDate:new Date(_now.getFullYear(),_now.getMonth()+1,1);
    const resetDate=(_periodEnd&&currentUser.plan==='pro'?_periodEnd:_freeReset2)
      .toLocaleDateString(lang==="ka"?"ka-GE":"en-GB",{month:"short",day:"numeric"});
    document.getElementById("dash-used-today").textContent=used;
    document.getElementById("dash-used-today").style.color=color;
    document.getElementById("dash-remaining").textContent=left;
    document.getElementById("dash-remaining").style.color=color;
    document.getElementById("dash-reset-label").textContent=`${dash.resetsAt} ${resetDate}`;
    document.getElementById("dash-limit-label").textContent=`${dash.limit}: ${limit.toLocaleString()}`;
    const bar=document.getElementById("dash-limit-bar");
    bar.style.background=color;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{bar.style.width=pct+"%";}));
    // Limit override notice
    const noticeEl=document.getElementById("dash-limit-notice");
    if(noticeEl){
      if(custom!=null&&custom!==planLimit){
        const isBonus=custom>planLimit;
        noticeEl.className="dash-limit-notice "+(isBonus?"bonus":"restrict");
        noticeEl.style.display="";
        const tr=t();
        const icon=isBonus?"✦":"⚠";
        const msg=isBonus
          ?(lang==="ka"?`შენი ყოველთვიური ლიმიტი გაზრდილია, როგორც მადლიერების ნიშანი.`:`Your monthly limit has been extended as a thank-you.`)
          :(lang==="ka"?`შენი ყოველთვიური ლიმიტი შეზღუდულია პოლიტიკის დარღვევის გამო.`:`Your monthly limit has been reduced due to a policy concern.`);
        noticeEl.innerHTML=`<span class="dash-limit-notice-icon">${icon}</span><span>${msg}</span>`;
      }else{
        noticeEl.style.display="none";
      }
    }
  // Feature activity
  try{
    const tr2=t();
    const since2=currentUser.registeredAt?_getRegPeriod(currentUser.registeredAt).since:new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString();
    const{data:featureRows,error:feErr}=await sb.from("feature_usage").select("event_type").eq("user_id",currentUser.id).gte("created_at",since2);
    if(feErr)console.error("feature_usage select failed:",feErr.message);
    const fc={};
    for(const r of featureRows||[])fc[r.event_type]=(fc[r.event_type]||0)+1;
    const ORDER=["map_click","free_analysis","pro_analysis","relief_analysis","pdf_export","geojson_export"];
    const items=ORDER.filter(k=>fc[k]);
    const actSection=document.getElementById("dash-activity-section");
    const actLbl=document.getElementById("lbl-dash-activity");
    if(actLbl)actLbl.textContent=tr2.dash.activity;
    if(items.length&&actSection){
      document.getElementById("dash-activity-grid").innerHTML=items.map(k=>`<div class="dash-stat"><div class="dash-stat-val" style="font-size:1.1rem">${fc[k]}</div><div class="dash-stat-label">${tr2.activityIcons[k]} ${tr2.activityLabels[k]}</div></div>`).join("");
      actSection.style.display="";
    }else if(actSection){
      actSection.style.display="none";
    }
  }catch(e2){console.error("activity section failed:",e2);}
  }catch(e){
    console.error("loadDashboardStats failed:",e);
    document.getElementById("dash-used-today").textContent="—";
    document.getElementById("dash-remaining").textContent="—";
  }
}

function closeDashboard(){document.getElementById("dashboard-modal").classList.remove("open");}
function onDashboardOverlayClick(e){if(e.target===document.getElementById("dashboard-modal"))closeDashboard();}

// ── Avatar upload ─────────────────────────────────────────────────────────────
function triggerAvatarUpload(){
  if(!currentUser)return;
  const inp=document.createElement("input");
  inp.type="file";inp.accept="image/*";
  inp.onchange=e=>{const file=e.target.files?.[0];if(file)uploadAvatar(file);};
  inp.click();
}

async function uploadAvatar(file){
  if(!currentUser)return;
  const dashAvatar=document.getElementById("dash-avatar");
  const uAvatar=document.getElementById("u-avatar");
  // Show loading state
  const overlay=dashAvatar.querySelector(".avatar-overlay");
  if(overlay){overlay.textContent="⏳";overlay.style.opacity="1";}
  try{
    const ext=file.name.split(".").pop().toLowerCase()||"jpg";
    const path=`${currentUser.id}/avatar.${ext}`;
    const {error:upErr}=await sb.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type});
    if(upErr)throw upErr;
    const {data}=sb.storage.from("avatars").getPublicUrl(path);
    const publicUrl=data.publicUrl+"?t="+Date.now();
    const {error:metaErr}=await sb.auth.updateUser({data:{avatar_url:publicUrl}});
    if(metaErr)throw metaErr;
    currentUser.avatarUrl=publicUrl;
    const initials=(currentUser.name||currentUser.email||"U").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    setAvatar(uAvatar,publicUrl,initials);
    setAvatar(dashAvatar,publicUrl,initials);
  }catch(e){
    alert("Avatar upload failed: "+(e.message||JSON.stringify(e)));
    console.error("Avatar upload:",e);
  }finally{
    if(overlay){overlay.textContent="📷";overlay.style.opacity="";}
  }
}

async function toggleMarketingConsent(value){
  _marketingConsent=!!value;
  if(!currentUser)return;
  await sb.from("profiles").update({marketing_consent:_marketingConsent}).eq("id",currentUser.id);
}

function openDeletionRequest(){
  closeDashboard();
  document.getElementById("del-form-view").style.display="";
  document.getElementById("del-success-view").style.display="none";
  document.querySelectorAll('input[name="del-reason"]').forEach(r=>r.checked=r.value==="no_reason");
  const btn=document.getElementById("del-submit-btn");
  btn.disabled=false;btn.textContent="Submit request";
  document.getElementById("deletion-modal").classList.add("open");
}
function closeDeletionRequest(){
  document.getElementById("deletion-modal").classList.remove("open");
}
async function submitDeletionRequest(){
  if(!currentUser)return;
  const btn=document.getElementById("del-submit-btn");
  btn.disabled=true;btn.innerHTML='<span class="spinner-sm"></span>';
  const reason=document.querySelector('input[name="del-reason"]:checked')?.value||"no_reason";
  try{
    await sb.from("deletion_requests").insert({user_id:currentUser.id,email:currentUser.email,reason});
    document.getElementById("del-form-view").style.display="none";
    document.getElementById("del-success-view").style.display="";
  }catch(e){
    console.error("Deletion request:",e);
    btn.disabled=false;btn.textContent="Submit request";
    setStatus("Could not submit request. Please try again.","error");
  }
}

// ── GeoData download ──────────────────────────────────────────────────────────
function _dlGeoJSON(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/geo+json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}

function downloadAnalysisData(){
  if(!currentUser||currentUser.plan!=="pro"){alert(t().geodataProOnly);return;}
  if(!_currentParcelGeoJSON){return;}
  const code=document.getElementById("val-code").textContent||"parcel";
  const slug=code.replace(/\./g,"-");
  const props={
    cadastral_code:code,
    area:document.getElementById("val-area").textContent,
    type:document.getElementById("val-type").textContent,
    address:document.getElementById("val-addr").textContent,
    owner:document.getElementById("val-owner").textContent
  };
  if(_walkData){
    props.walkability_score=_walkData.score;
    props.food_count=_walkData.counts.food||0;
    props.health_count=_walkData.counts.health||0;
    props.parks_count=_walkData.counts.parks||0;
    props.retail_count=_walkData.counts.retail||0;
    props.culture_count=_walkData.counts.culture||0;
  }
  if(_climateData){
    if(_climateData.canopyPct!==null)props.canopy_pct=_climateData.canopyPct;
    if(_climateData.lst!==null)props.lst_celsius=_climateData.lst;
  }
  if(_proData){
    props.schools_count=_proData.schoolCount;
    props.kindergartens_count=_proData.kgCount;
    props.crashes_count=_proData.crashCount;
  }
  logFeatureUse("geojson_export").catch(()=>{});
  _dlGeoJSON(`parcel_${slug}.geojson`,{type:"FeatureCollection",features:[{type:"Feature",geometry:_currentParcelGeoJSON,properties:props}]});
  if(_isoData&&_isoData.features?.length){
    const isoFeatures=_isoData.features.map(f=>({...f,properties:{...f.properties,cadastral_code:code,type:"walking_isochrone"}}));
    setTimeout(()=>_dlGeoJSON(`isochrone_${slug}.geojson`,{type:"FeatureCollection",features:isoFeatures}),200);
  }
}
// ── Polygon parcel select ─────────────────────────────────────────────────────
let _draw = null;
let _polyParcels = [];
let _polyDrawing = false;
let _drawShape = 'polygon';
let _drawJustFinished = false;
let _shapeMouseHandlers = null;
let _drawMenuOpen = false;
let _extrusionActive = false;
let _extrusionHeight = 12;
let _selectedFloors = new Set();
let _floorOverrides = {}; // {floorIdx:{useType,color:[r,g,b],ring:null|[...]}}
const FLOOR_USES=[
  {id:'residential',label:'Residential',color:[0xe8/255,0x96/255,0x30/255],hex:'#e89630'},
  {id:'commercial',label:'Commercial',color:[0x34/255,0xd3/255,0x99/255],hex:'#34d399'},
  {id:'office',label:'Office',color:[0x60/255,0xa5/255,0xfa/255],hex:'#60a5fa'},
  {id:'parking',label:'Parking',color:[0x94/255,0xa3/255,0xb8/255],hex:'#94a3b8'},
  {id:'amenity',label:'Amenity',color:[0xc0/255,0x84/255,0xfc/255],hex:'#c084fc'},
];
let _dbPreviewEnabled = false;
let _dbPreviewTimer = null;
// ── Multi-building ────────────────────────────────────────────────────────────
let _buildings=[];        // [{id,geojson,ring,drawShape,areaM2,perimM,areaStr,perimStr,extrusionActive,extrusionHeight,floorOverrides}]
let _activeBldId=null;    // id of currently active (editable) building
let _selectedBldIds=new Set(); // ids of all highlighted buildings (shift-click multi-select)
let _bldSeq=0;
let _isDrawnArea = false;
let _drawnAreaProps = {};
let _drawnFeatureId = null;
let _shapeEditMode = false;

function initDrawControl(){
  if(_draw)return;
  _draw=new MapboxDraw({
    displayControlsDefault:false,
    controls:{},
    defaultMode:"simple_select",
    styles:[
      {id:"gl-draw-polygon-fill",type:"fill",filter:["all",["==","$type","Polygon"],["!=","mode","static"]],paint:{"fill-color":"#a5b4fc","fill-opacity":0.15}},
      {id:"gl-draw-polygon-stroke",type:"line",filter:["all",["==","$type","Polygon"],["!=","mode","static"]],layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":["case",["==",["get","selected"],true],"#fdba74","#a5b4fc"],"line-width":["case",["==",["get","selected"],true],2.5,2],"line-dasharray":[4,2]}},
      {id:"gl-draw-polygon-midpoint",type:"circle",filter:["all",["==","$type","Point"],["==","meta","midpoint"]],paint:{"circle-radius":3,"circle-color":"#a5b4fc"}},
      {id:"gl-draw-polygon-vertex",type:"circle",filter:["all",["==","$type","Point"],["==","meta","vertex"]],paint:{"circle-radius":5,"circle-color":"#c7d2fe","circle-stroke-width":2,"circle-stroke-color":"#fff"}},
      {id:"gl-draw-line",type:"line",filter:["all",["==","$type","LineString"],["==","mode","draw_line_string"]],layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#a5b4fc","line-width":2.5,"line-dasharray":[4,2]}}
    ]
  });
  map.addControl(_draw,"top-right");
  map.on("draw.create",onDrawCreate);
  map.on("draw.update",onDrawShapeUpdate);
  map.on("draw.modechange",e=>{
    if(_editingBldId&&e.mode!=='direct_select')_exitBldEditMode(true);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&_editingBldId){e.preventDefault();_exitBldEditMode(false);}
  });
  // Right-click to finish polygon
  map.getCanvas().addEventListener("contextmenu",function(e){
    if(!_polyDrawing)return;
    e.preventDefault();e.stopPropagation();
    map.getCanvas().dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true,view:window,clientX:e.clientX,clientY:e.clientY,button:0,buttons:1}));
  },{capture:true});
}

// Loads Three.js on first use, then calls cb(). Subsequent calls fire cb() immediately.
let _threeLoaded=false;
function _ensureThreeJs(cb){
  if(_threeLoaded||typeof THREE!=='undefined'){_threeLoaded=true;cb();return;}
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload=()=>{_threeLoaded=true;cb();};
  document.head.appendChild(s);
}

function toggleExtrusion(){
  const canExtrude=_isDrawnArea&&['polygon','rectangle','circle'].includes(_drawShape);
  if(!canExtrude){showToast(lang==='ka'?'3D გასააქტიურებლად დახაზე პოლიგონი, წრე ან კვადრატი':'Draw a polygon, circle or square on the map to use 3D extrusion');return;}
  if(!_isDrawnArea)return;
  _extrusionActive=!_extrusionActive;
  document.getElementById('nav-extrusion-btn')?.classList.toggle('active',_extrusionActive);
  const _extIco=document.getElementById('nav-extrusion-icon');if(_extIco)_extIco.style.opacity=_extrusionActive?'1':'0.55';
  if(!mapReady)return;
  if(_extrusionActive){
    // Always drawn area here (guarded above). Lazy-load Three.js on first use.
    _ensureThreeJs(()=>{
      const _tb=_activeBld();
      if(_tb&&!_tb.threeEditor){
        _threeEditor=new _BuildingEditorLayer(_activeBldId);
        map.addLayer(_threeEditor);
        _tb.threeEditor=_threeEditor;
      } else if(_tb?.threeEditor){
        _threeEditor=_tb.threeEditor;
        _threeEditor.rebuild();
      }
      if(_threeEditor)_threeEditor._activateListeners();
      if(_threeEditor)_threeEditor.setEditMode(_shapeEditMode);
      if(map.getLayer('extrusion-layer'))map.setLayoutProperty('extrusion-layer','visibility','none');
    });
    // Hide flat parcel/building footprint so it doesn't compete with the 3D building
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','none');
    if(map.getLayer('parcel-line'))map.setLayoutProperty('parcel-line','visibility','none');
    if(_activeBldId){
      try{map.setLayoutProperty('bld-fill-'+_activeBldId,'visibility','none');}catch(_){}
      try{map.setLayoutProperty('bld-line-'+_activeBldId,'visibility','none');}catch(_){}
    }
    map.easeTo({pitch:55,duration:700});
  } else {
    if(_threeEditor){const _tb=_activeBld();_threeEditor._deactivateListeners();try{map.removeLayer(_threeEditor.id);}catch(e){}_threeEditor.dispose();if(_tb)_tb.threeEditor=null;_threeEditor=null;}
    map.getSource('extrusion-floors')?.setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('extrusion-layer'))map.setLayoutProperty('extrusion-layer','visibility','none');
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','visible');
    if(map.getLayer('parcel-line'))map.setLayoutProperty('parcel-line','visibility','visible');
    if(_activeBldId){
      try{map.setLayoutProperty('bld-fill-'+_activeBldId,'visibility','visible');}catch(_){}
      try{map.setLayoutProperty('bld-line-'+_activeBldId,'visibility','visible');}catch(_){}
    }
    map.easeTo({pitch:0,duration:500});
  }
  _update3DMetrics();
}

function setExtrusionHeight(val){
  _extrusionHeight=+val;
  const _bldA=_activeBld()?.areaM2||_currentParcelAreaM2||0;
  const _maxH=(_maxFloorAreaM2!=null&&_bldA>0)?Math.max(3,Math.floor(_maxFloorAreaM2/_bldA)*3):null;
  if(_maxH!=null&&_extrusionHeight>_maxH)_extrusionHeight=_maxH;
  const floors=Math.max(1,Math.round(_extrusionHeight/3));
  const lbl=document.getElementById('extrusion-height-label');
  if(lbl)lbl.textContent=_extrusionHeight+' m  ·  ~'+floors+' fl'+(_maxH!=null&&_extrusionHeight>=_maxH?' · max':'');
  const sl=document.getElementById('extrusion-height-slider');
  if(sl){sl.value=_extrusionHeight;if(_maxH!=null)sl.setAttribute('max',String(_maxH));}
  if(_threeEditor)_threeEditor.rebuild();
  else if(mapReady&&_extrusionActive)_rebuildExtrusionFloors();
  _update3DMetrics();
}

function _applyExtrusionHeightCap(){
  const bldA=(_activeBld()?.areaM2)||_currentParcelAreaM2||0;
  const maxH=(_maxFloorAreaM2!=null&&bldA>0)?Math.max(3,Math.floor(_maxFloorAreaM2/bldA)*3):null;
  const sl=document.getElementById('extrusion-height-slider');
  if(sl){if(maxH!=null)sl.setAttribute('max',String(maxH));else sl.removeAttribute('max');}
  if(maxH!=null&&_extrusionHeight>maxH)setExtrusionHeight(maxH);
}
function _clearExtrusion(){
  if(mapReady){
    map.getSource('extrusion-floors')?.setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('extrusion-layer')){
      map.setLayoutProperty('extrusion-layer','visibility','none');
      if(!_extrusionActive&&map.getPitch()>0)map.easeTo({pitch:0,duration:400});
    }
  }
}

// ── Multi-building helpers ────────────────────────────────────────────────────
function _bldById(id){return _buildings.find(b=>b.id===id)||null;}
function _activeBld(){return _bldById(_activeBldId);}

function _saveBldState(){
  const b=_activeBld();if(!b)return;
  b.extrusionActive=_extrusionActive;
  b.extrusionHeight=_extrusionHeight;
  b.floorOverrides=Object.assign({},_floorOverrides);
}

function _updateBldHighlights(){
  if(!mapReady)return;
  const multiSel=_selectedBldIds.size>1;
  const zoningOn=!!document.getElementById('nav-zoning-btn')?.classList.contains('active');
  _buildings.forEach(b=>{
    const isActive=b.id===_activeBldId;
    const isSel=_selectedBldIds.has(b.id);
    const viol=zoningOn&&(b.violatesSetback||false);
    try{map.setPaintProperty('bld-fill-'+b.id,'fill-color',viol?'#ef4444':'#6366f1');}catch(_){}
    if(isActive){
      try{map.setPaintProperty('bld-fill-'+b.id,'fill-opacity',viol?0.5:0.45);}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-color',viol?'#fca5a5':'#c7d2fe');}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-width',3);}catch(_){}
    } else if(isSel){
      try{map.setPaintProperty('bld-fill-'+b.id,'fill-opacity',viol?0.4:0.35);}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-color',viol?'#ef4444':'#818cf8');}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-width',2.5);}catch(_){}
    } else {
      try{map.setPaintProperty('bld-fill-'+b.id,'fill-opacity',multiSel?0.15:0.3);}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-color',viol?(multiSel?'#ef4444':'#fca5a5'):(multiSel?'#4338ca':'#a5b4fc'));}catch(_){}
      try{map.setPaintProperty('bld-line-'+b.id,'line-width',1.5);}catch(_){}
    }
  });
}

function _freezeBld(bld){
  if(!mapReady||!bld.extrusionActive)return;
  try{map.setLayoutProperty('bld-fill-'+bld.id,'visibility','none');}catch(_){}
  try{map.setLayoutProperty('bld-line-'+bld.id,'visibility','none');}catch(_){}
}

function _thawBld(bld){
  if(!mapReady)return;
  if(bld._extClickHandler){try{map.off('click','bld-ext-'+bld.id,bld._extClickHandler);}catch(_){}bld._extClickHandler=null;}
  try{if(map.getLayer('bld-ext-'+bld.id))map.removeLayer('bld-ext-'+bld.id);}catch(_){}
  try{map.setLayoutProperty('bld-fill-'+bld.id,'visibility','visible');}catch(_){}
  try{map.setLayoutProperty('bld-line-'+bld.id,'visibility','visible');}catch(_){}
}

function _activateBld(id){
  const bld=_bldById(id);if(!bld)return;
  _selectedBldIds.add(id);
  if(bld.extrusionActive)_thawBld(bld);
  _activeBldId=id;
  _currentParcelGeoJSON=bld.geojson;
  _currentParcelAreaM2=bld.areaM2;
  _isDrawnArea=true;
  _drawShape=bld.drawShape;
  _extrusionActive=bld.extrusionActive;
  _extrusionHeight=bld.extrusionHeight;
  _floorOverrides=Object.assign({},bld.floorOverrides);
  parcelCentroid=getCentroid(bld.geojson);
  const sl=document.getElementById('extrusion-height-slider');if(sl)sl.value=_extrusionHeight;
  const lbl=document.getElementById('extrusion-height-label');if(lbl)lbl.textContent=_extrusionHeight+' m';
  if(_extrusionActive){
    if(bld.threeEditor){
      _threeEditor=bld.threeEditor;
      _threeEditor.rebuild();
      _threeEditor._activateListeners();
      _threeEditor.setEditMode(_shapeEditMode);
      if(mapReady&&map.getLayer('extrusion-layer'))map.setLayoutProperty('extrusion-layer','visibility','none');
    } else {
      _ensureThreeJs(()=>{
        _threeEditor=new _BuildingEditorLayer(id);
        map.addLayer(_threeEditor);
        bld.threeEditor=_threeEditor;
        _threeEditor._activateListeners();
        _threeEditor.setEditMode(_shapeEditMode);
        if(map.getLayer('extrusion-layer'))map.setLayoutProperty('extrusion-layer','visibility','none');
      });
    }
    if(mapReady){
      try{map.setLayoutProperty('bld-fill-'+id,'visibility','none');}catch(_){}
      try{map.setLayoutProperty('bld-line-'+id,'visibility','none');}catch(_){}
      map.easeTo({pitch:55,duration:700});
    }
    document.getElementById('draw-3d-sw')?.classList.add('on');
    const _ctrl=document.getElementById('draw-3d-controls');if(_ctrl)_ctrl.style.display='block';
    document.getElementById('nav-extrusion-btn')?.classList.add('active');
    const _ico=document.getElementById('nav-extrusion-icon');if(_ico)_ico.style.opacity='1';
  } else {
    document.getElementById('draw-3d-sw')?.classList.remove('on');
    const _ctrl2=document.getElementById('draw-3d-controls');if(_ctrl2)_ctrl2.style.display='none';
    document.getElementById('nav-extrusion-btn')?.classList.remove('active');
    const _ico2=document.getElementById('nav-extrusion-icon');if(_ico2)_ico2.style.opacity='0.55';
    const _fpanel=document.getElementById('floor-detail-panel');if(_fpanel)_fpanel.style.display='none';
  }
  _updateBldHighlights();
  const isKa=lang==='ka';
  const panel=document.getElementById('poly-result-panel');
  if(panel)panel.style.display='block';
  document.getElementById('lbl-poly-title').textContent=isKa?'ზომები':'Metrics';
  document.getElementById('val-prp-footprint').textContent=bld.areaStr;
  document.getElementById('lbl-prp-footprint').textContent=isKa?'ფართობი':'Footprint';
  document.getElementById('val-prp-perimeter').textContent=bld.perimStr;
  document.getElementById('lbl-prp-perimeter').textContent=isKa?'პერიმეტრი':'Perimeter';
  const _pdb=document.getElementById('poly-dl-btn');if(_pdb)_pdb.disabled=false;
  _update3DMetrics();
  _updateMetricsExtrusion();
  _updateCombinedMetrics();
}

function _selectBuilding(id,shift=false){
  if(shift){
    if(id===_activeBldId){
      // Shift-click on active building: clear multi-select back to single
      _selectedBldIds.clear();
      _selectedBldIds.add(id);
    } else if(_selectedBldIds.has(id)){
      _selectedBldIds.delete(id);
    } else {
      _selectedBldIds.add(id);
    }
    _updateBldHighlights();
    _updateCombinedMetrics();
    return;
  }
  // Normal click: clear multi-select, switch active building
  _selectedBldIds.clear();
  if(id===_activeBldId)return;
  _saveBldState();
  const prev=_activeBld();
  if(prev?.extrusionActive)_freezeBld(prev);
  const _pte=_threeEditor;
  _threeEditor=null; // clear reference; editor stays on map
  _extrusionActive=false;
  if(_pte)_pte._deactivateListeners();
  _activateBld(id);
}

function _updateCombinedMetrics(){
  const sel=_buildings.filter(b=>_selectedBldIds.has(b.id));
  if(sel.length<=1)return;
  const isKa=lang==='ka';
  const fmtM2=v=>v>=10000?(v/10000).toFixed(2)+' ha':Math.round(v).toLocaleString()+' m²';
  const fmtM=v=>v>=1000?(v/1000).toFixed(2)+' km':Math.round(v).toLocaleString()+' m';
  const totalArea=sel.reduce((s,b)=>s+b.areaM2,0);
  const totalPerim=sel.reduce((s,b)=>s+b.perimM,0);
  document.getElementById('lbl-poly-title').textContent=sel.length+(isKa?' შენობა':' Buildings');
  document.getElementById('val-prp-footprint').textContent=fmtM2(totalArea);
  document.getElementById('lbl-prp-footprint').textContent=isKa?'საერთო ფართობი':'Total footprint';
  document.getElementById('val-prp-perimeter').textContent=fmtM(totalPerim);
  document.getElementById('lbl-prp-perimeter').textContent=isKa?'პერიმეტრი':'Total perimeter';
  // Combined 3D metrics across extruded buildings in selection
  const extSel=sel.filter(b=>b.extrusionActive);
  const extRows=document.getElementById('prp-extrusion-rows');
  const b3d=document.getElementById('poly-dl-3d-btn');
  if(extSel.length>0){
    if(extRows)extRows.style.display='flex';
    if(b3d)b3d.style.display='none';
    let totalFloorM2=0;const useArea={};
    extSel.forEach(b=>{
      const n=Math.max(1,Math.round(b.extrusionHeight/3));
      for(let f=0;f<n;f++){
        const ov=b.floorOverrides[f];
        const m2=ov?.ring?computePolygonAreaM2(ov.ring):(b.areaM2||0);
        totalFloorM2+=m2;
        const key=ov?.useType||'__none__';
        useArea[key]=(useArea[key]||0)+m2;
      }
    });
    const heights=extSel.map(b=>b.extrusionHeight);
    const hMin=Math.min(...heights),hMax=Math.max(...heights);
    const hStr=hMin===hMax?hMin+' m':hMin+'–'+hMax+' m';
    const totalFloors=extSel.reduce((s,b)=>s+Math.max(1,Math.round(b.extrusionHeight/3)),0);
    document.getElementById('val-prp-height').textContent=hStr;
    document.getElementById('val-prp-floors').textContent=totalFloors;
    document.getElementById('val-prp-totalarea').textContent=fmtM2(totalFloorM2);
    document.getElementById('lbl-prp-height').textContent=isKa?'სიმაღლე':'Height';
    document.getElementById('lbl-prp-floors').textContent=isKa?'სართული':'Total floors';
    document.getElementById('lbl-prp-totalarea').textContent=isKa?'საერთო ფართი':'Total GFA';
    const bd=document.getElementById('prp-use-breakdown');
    if(bd){
      bd.innerHTML='';
      const hasAny=FLOOR_USES.some(u=>useArea[u.id]);
      if(!hasAny){bd.style.display='none';}else{
        bd.style.display='flex';
        FLOOR_USES.forEach(u=>{const a=useArea[u.id];if(!a)return;
          const pct=Math.round(a/totalFloorM2*100);
          const row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:6px';
          row.innerHTML='<span style="display:flex;align-items:center;gap:4px;font-size:0.62rem;color:rgba(255,255,255,0.45);min-width:0"><span style="width:6px;height:6px;border-radius:50%;background:'+u.hex+';flex-shrink:0;display:inline-block"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+u.label+'</span></span><span style="font-size:0.62rem;white-space:nowrap;color:rgba(255,255,255,0.65)">'+fmtM2(a)+'&nbsp;<span style="color:'+u.hex+';font-weight:700">'+pct+'%</span></span>';
          bd.appendChild(row);});
      }
    }
  } else {
    if(extRows)extRows.style.display='none';
    if(b3d)b3d.style.display='none';
  }
}

function _registerBuilding(geojson){
  _saveBldState();
  const prev=_activeBld();
  if(prev?.extrusionActive)_freezeBld(prev);
  const _pte2=_threeEditor;
  _threeEditor=null; // clear reference; editor stays on map
  if(_pte2)_pte2._deactivateListeners();
  _extrusionActive=false;
  const id='bld_'+(++_bldSeq);
  const coords=geojson.type==='Polygon'?geojson.coordinates[0]:geojson.coordinates[0][0];
  const aM2=computePolygonAreaM2(coords);
  const pM=computePolygonPerimeterM(coords);
  const bld={id,geojson,ring:coords,drawShape:'polygon',
    areaM2:aM2,perimM:pM,
    areaStr:aM2>=10000?(aM2/10000).toFixed(2)+' ha':Math.round(aM2).toLocaleString()+' m²',
    perimStr:pM>=1000?(pM/1000).toFixed(2)+' km':Math.round(pM).toLocaleString()+' m',
    extrusionActive:false,extrusionHeight:12,floorOverrides:{}};
  _buildings.push(bld);
  if(mapReady){
    try{
      map.addSource('bld-src-'+id,{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',geometry:geojson,properties:{}}]}});
      map.addLayer({id:'bld-fill-'+id,type:'fill',source:'bld-src-'+id,paint:{'fill-color':'#6366f1','fill-opacity':0.35}});
      map.addLayer({id:'bld-line-'+id,type:'line',source:'bld-src-'+id,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#a5b4fc','line-width':2}});
      map.on('click','bld-fill-'+id,e=>{e.originalEvent._bldHandled=true;_selectBuilding(id,e.originalEvent.shiftKey);});
      map.on('mouseenter','bld-fill-'+id,()=>{if(map.getCanvas())map.getCanvas().style.cursor='pointer';});
      map.on('mouseleave','bld-fill-'+id,()=>{if(map.getCanvas())map.getCanvas().style.cursor='';});
      map.on('dblclick','bld-fill-'+id,e=>{e.originalEvent.stopPropagation();map.doubleClickZoom.disable();setTimeout(()=>map.doubleClickZoom.enable(),400);_enterBldEditMode(id);});
    }catch(_){}
    if(_dbParcelGeoJSON){
      map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_dbParcelGeoJSON,properties:{}}]});
    }else{
      map.getSource('parcel')?.setData({type:'FeatureCollection',features:[]});
    }
  }
  try{if(_draw){_draw.deleteAll();_draw.changeMode('simple_select');}}catch(_){}
  _activateBld(id);
  return bld;
}

function _deselectBuilding(){
  if(!_activeBldId)return;
  _saveBldState();
  const pb=_activeBld();
  if(pb?.extrusionActive)_freezeBld(pb);
  _threeEditor=null; // clear reference; editor stays on map
  _extrusionActive=false;_extrusionHeight=12;_floorOverrides={};_selectedFloors.clear();
  _activeBldId=null;_selectedBldIds.clear();_isDrawnArea=false;_currentParcelGeoJSON=null;_currentParcelAreaM2=0;
  _updateBldHighlights();
  document.getElementById('poly-result-panel').style.display='none';
  const fpanel=document.getElementById('floor-detail-panel');if(fpanel)fpanel.style.display='none';
  document.getElementById('draw-3d-sw')?.classList.remove('on');
  const ctrl=document.getElementById('draw-3d-controls');if(ctrl)ctrl.style.display='none';
  const sl=document.getElementById('extrusion-height-slider');if(sl)sl.value=12;
  const lbl=document.getElementById('extrusion-height-label');if(lbl)lbl.textContent='12 m';
  if(mapReady){
    map.getSource('extrusion-floors')?.setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('extrusion-layer'))map.setLayoutProperty('extrusion-layer','visibility','none');
  }
  _update3DMetrics();
}

function removeActiveBuilding(){
  const id=_activeBldId;if(!id)return;
  const bld=_bldById(id);
  // Dispose Three.js editor before deselecting
  if(bld?.threeEditor){try{map.removeLayer(bld.threeEditor.id);}catch(_){}try{bld.threeEditor.dispose();}catch(_){}bld.threeEditor=null;}
  _deselectBuilding();
  if(!bld)return;
  if(mapReady){
    if(bld._extClickHandler){try{map.off('click','bld-ext-'+id,bld._extClickHandler);}catch(_){}bld._extClickHandler=null;}
    try{if(map.getLayer('bld-ext-'+id))map.removeLayer('bld-ext-'+id);}catch(_){}
    try{if(map.getLayer('bld-line-'+id))map.removeLayer('bld-line-'+id);}catch(_){}
    try{if(map.getLayer('bld-fill-'+id))map.removeLayer('bld-fill-'+id);}catch(_){}
    try{if(map.getSource('bld-src-'+id))map.removeSource('bld-src-'+id);}catch(_){}
    map.off('click','bld-fill-'+id);
  }
  _buildings=_buildings.filter(b=>b.id!==id);
  if(_buildings.length){_activateBld(_buildings[_buildings.length-1].id);_checkSetbackViolation(_currentParcelGeoJSON);}else{const _sw=document.getElementById('pfc-setback-warn');if(_sw)_sw.style.display='none';}
}

function _selectFloor(fi){
  const panel=document.getElementById('floor-detail-panel');
  if(fi<0){
    _selectedFloors.clear();
    if(panel)panel.style.display='none';
    if(_threeEditor)_threeEditor.rebuild();
    return;
  }
  // Toggle: click same floor to deselect, click new floor to add to selection
  if(_selectedFloors.has(fi))_selectedFloors.delete(fi);
  else _selectedFloors.add(fi);
  if(_threeEditor)_threeEditor.rebuild();
  _refreshFloorPanel();
}

function _setFloorUse(fi,useId){
  if(!_floorOverrides[fi])_floorOverrides[fi]={};
  const use=FLOOR_USES.find(u=>u.id===useId);
  _floorOverrides[fi].useType=useId;
  _floorOverrides[fi].color=use?use.color:null;
  if(_threeEditor)_threeEditor.rebuild();
  _refreshFloorPanel();
  _updateMetricsExtrusion();
}
function _applyUseToSelection(useId){
  const use=FLOOR_USES.find(u=>u.id===useId);
  _selectedFloors.forEach(fi=>{
    if(!_floorOverrides[fi])_floorOverrides[fi]={};
    _floorOverrides[fi].useType=useId;
    _floorOverrides[fi].color=use?use.color:null;
  });
  if(_threeEditor)_threeEditor.rebuild();
  _refreshFloorPanel();
  _updateMetricsExtrusion();
}
function _resetSelectedFloors(){
  _selectedFloors.forEach(fi=>_resetFloor(fi));
  _selectFloor(-1);
  _updateMetricsExtrusion();
}
function _refreshFloorPanel(){
  const panel=document.getElementById('floor-detail-panel');
  const numEl=document.getElementById('floor-sel-num');
  const swatchEl=document.getElementById('floor-sel-swatch');
  const btnsEl=document.getElementById('floor-use-btns');
  if(!panel)return;
  if(_selectedFloors.size===0){panel.style.display='none';return;}
  panel.style.display='block';
  const isMulti=_selectedFloors.size>1;
  if(isMulti){
    if(numEl)numEl.textContent=_selectedFloors.size+' floors selected';
    if(swatchEl)swatchEl.style.background='#94a3b4';
  }else{
    const fi=[..._selectedFloors][0];
    const ov=_floorOverrides[fi]||{};
    const activeUse=FLOOR_USES.find(u=>u.id===ov.useType);
    if(numEl)numEl.textContent='Floor '+(fi+1)+(activeUse?' · '+activeUse.label:'');
    if(swatchEl)swatchEl.style.background=activeUse?activeUse.hex:'#94a3b4';
  }
  const useCounts={};
  _selectedFloors.forEach(f=>{const u=(_floorOverrides[f]||{}).useType;if(u)useCounts[u]=(useCounts[u]||0)+1;});
  const dominantUse=Object.entries(useCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(btnsEl){
    btnsEl.innerHTML='';
    FLOOR_USES.forEach(u=>{
      const btn=document.createElement('button');
      const singleOv=!isMulti?(_floorOverrides[[..._selectedFloors][0]]||{}):{};
      btn.className='floor-use-btn'+((isMulti?dominantUse:singleOv.useType)===u.id?' active':'');
      btn.style.setProperty('--fu-c',u.hex);
      btn.innerHTML=`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${u.hex};margin-right:4px;vertical-align:middle;flex-shrink:0"></span>${u.label}`;
      btn.onclick=()=>_applyUseToSelection(u.id);
      btnsEl.appendChild(btn);
    });
  }
}

function _resetFloor(fi){
  if(fi<0)return;
  if(_floorOverrides[fi]){
    delete _floorOverrides[fi].useType;
    delete _floorOverrides[fi].color;
    if(!_floorOverrides[fi].ring)delete _floorOverrides[fi];
  }
  _selectFloor(fi);
  _updateMetricsExtrusion();
}

function _resetExtrusionFull(){
  _extrusionActive=false;_extrusionHeight=12;_drawnFeatureId=null;_shapeEditMode=false;
  _selectedFloors.clear();_floorOverrides={};
  if(_threeEditor){const _rb=_activeBld();try{map.removeLayer(_threeEditor.id);}catch(e){}try{_threeEditor.dispose();}catch(e){}if(_rb)_rb.threeEditor=null;_threeEditor=null;}
  document.getElementById('draw-3d-sw')?.classList.remove('on');
  document.getElementById('edit-shape-btn')?.classList.remove('active');
  const ctrl=document.getElementById('draw-3d-controls');if(ctrl)ctrl.style.display='none';
  const panel=document.getElementById('floor-detail-panel');if(panel)panel.style.display='none';
  const sl=document.getElementById('extrusion-height-slider');if(sl)sl.value=12;
  const lbl=document.getElementById('extrusion-height-label');if(lbl)lbl.textContent='12 m';
  if(mapReady){
    map.getSource('extrusion-floors')?.setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('extrusion-layer')){
      map.setLayoutProperty('extrusion-layer','visibility','none');
      if(map.getPitch()>0)map.easeTo({pitch:0,duration:400});
    }
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','visible');
    if(map.getLayer('parcel-line'))map.setLayoutProperty('parcel-line','visibility','visible');
  }
  _update3DMetrics();
}

function _rebuildExtrusionFloors(){
  if(!mapReady||!_currentParcelGeoJSON||!_extrusionActive)return;
  const src=map.getSource('extrusion-floors');if(!src)return;
  src.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_currentParcelGeoJSON,
    properties:{floor_base:0,floor_top:_extrusionHeight}}]});
}

function onDrawShapeUpdate(){
  const data=_draw.getAll();
  if(!data.features.length)return;
  const poly=data.features[0].geometry;
  if(_editingBldId){
    const bld=_bldById(_editingBldId);
    if(bld){
      const coords=poly.type==='Polygon'?poly.coordinates[0]:poly.coordinates[0][0];
      bld.geojson=poly;bld.ring=coords;
      const aM2=Math.round(computePolygonAreaM2(coords));
      bld.areaM2=aM2;bld.areaStr=aM2>=10000?(aM2/10000).toFixed(2)+' ha':aM2.toLocaleString()+' m²';
      _currentParcelGeoJSON=poly;_currentParcelAreaM2=aM2;
      if(mapReady)map.getSource('bld-src-'+bld.id)?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:poly,properties:{}}]});
      if(bld.extrusionActive)_rebuildExtrusionFloors();
      _update3DMetrics();
      _checkSetbackViolation(poly);
      _checkAreaViolation(bld);
    }
    return;
  }
  _currentParcelGeoJSON=poly;
  parcelCentroid=getCentroid(poly);
  if(mapReady)map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:poly,properties:{cadastral:'drawn',selected:false}}]});
  const coords=poly.type==='Polygon'?poly.coordinates[0]:poly.coordinates[0][0];
  const aM2=Math.round(computePolygonAreaM2(coords));
  _currentParcelAreaM2=aM2;
  const aStr=aM2>=10000?(aM2/10000).toFixed(2)+' ha':aM2.toLocaleString()+' m²';
  document.getElementById('val-code').textContent=aStr;
  if(_extrusionActive)_rebuildExtrusionFloors();
  _update3DMetrics();
  _checkSetbackViolation(poly);
  _checkAreaViolation(_activeBld());
}

let _threeEditor=null;

function toggleShapeEditMode(){
  if(!_isDrawnArea||!_extrusionActive)return;
  _shapeEditMode=!_shapeEditMode;
  document.getElementById('edit-shape-btn')?.classList.toggle('active',_shapeEditMode);
  // Three.js layer stays alive; just enable/disable drag interaction
  if(_threeEditor)_threeEditor.setEditMode(_shapeEditMode);
}

class _BuildingEditorLayer{
  constructor(bldId=null){this.id='bld-3d-'+(bldId||'editor');this._bldId=bldId;this.type='custom';this.renderingMode='3d';this._lastMx=null;this._modelMx=null;this._hovG=-1;this._dragging=false;this._dragG=-1;this._dragType=null;this._dragFloorIdx=-1;this._dragP0=null;this._dragRing=null;this._dragH=0;this._dragStartY=0;this._dragStartX=0;this._editMode=false;this._ownOverrides={};this._ownRing=null;this._ownHeight=12;this._ownSelectedFloors=new Set();this._listenersActive=false;this._bm=this._bma.bind(this);this._bd=this._bmd.bind(this);this._bu=this._bmu.bind(this);}

  setEditMode(on){
    this._editMode=on;
    if(!on){this._setHover(-1);if(this._map)this._map.getCanvas().style.cursor='default';}
  }

  onAdd(map,gl){
    this._map=map;
    this._cam=new THREE.Camera();
    this._scene=new THREE.Scene();
    this._rdr=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});
    this._rdr.autoClear=false;
    this._scene.add(new THREE.AmbientLight(0xffffff,0.75));
    const sun=new THREE.DirectionalLight(0xffffff,0.6);sun.position.set(0.5,1,2);this._scene.add(sun);
    try{this._buildMesh();}catch(e){console.warn('_buildMesh onAdd failed, will retry on render:',e);}
    // mousemove is only added while this editor is active (_activateListeners)
    map.getCanvas().addEventListener('mousedown',this._bd);
    window.addEventListener('mouseup',this._bu);
  }

  onRemove(){
    this._deactivateListeners();
    const c=this._map.getCanvas();
    c.removeEventListener('mousedown',this._bd);
    window.removeEventListener('mouseup',this._bu);
    this.dispose();
  }

  rebuild(){if(this._mesh){this._scene.remove(this._mesh);this._mesh.geometry.dispose();}this._buildMesh();this._map.triggerRepaint();}
  _activateListeners(){
    if(this._listenersActive)return;
    this._map.getCanvas().addEventListener('mousemove',this._bm);
    this._listenersActive=true;
  }
  _deactivateListeners(){
    if(!this._listenersActive)return;
    this._map?.getCanvas()?.removeEventListener('mousemove',this._bm);
    this._listenersActive=false;
    this._editMode=false;
    this._ownSelectedFloors=new Set();
    if(this._geo&&this._groups&&this._map){
      this._hovG=-2;this._setHover(-1);this._map.triggerRepaint();
    }
  }


  _buildMesh(){
    // Each editor owns its data snapshot — completely isolated from global state
    if(this===_threeEditor){
      this._ownOverrides=JSON.parse(JSON.stringify(_floorOverrides));
      this._ownRing=_currentParcelGeoJSON?.coordinates[0]?.map(v=>[...v])||null;
      this._ownHeight=_extrusionHeight;
      this._ownSelectedFloors=new Set(_selectedFloors);
    }else{
      const _ob=_bldById(this._bldId);
      this._ownOverrides=JSON.parse(JSON.stringify(_ob?.floorOverrides||{}));
      this._ownRing=(_ob?.geojson?.coordinates[0]||_ob?.ring)?.map(v=>[...v])||null;
      this._ownHeight=_ob?.extrusionHeight||12;
      this._ownSelectedFloors=new Set();
    }
    // Geometry in LOCAL METRES. Model matrix converts to Mercator.
    const ring=this._ownRing;if(!ring)return;
    const N=ring.length-1;
    const cx=ring.reduce((s,v)=>s+v[0],0)/ring.length;
    const cy=ring.reduce((s,v)=>s+v[1],0)/ring.length;
    const om=mapboxgl.MercatorCoordinate.fromLngLat([cx,cy],0);
    this._s=om.meterInMercatorCoordinateUnits();
    this._om=om;
    const s=this._s;

    const ringElevs=ring.map(v=>map.queryTerrainElevation({lng:v[0],lat:v[1]})||0);
    const centroidElev=map.queryTerrainElevation({lng:cx,lat:cy})||0;
    const baseElev=Math.min(centroidElev,...ringElevs);
    this._baseElev=baseElev;
    this._ringElevs=ringElevs;
    const re=ringElevs.map(e=>e-baseElev);

    this._modelMx=new THREE.Matrix4().set(s,0,0,om.x, 0,-s,0,om.y, 0,0,s,baseElev*s, 0,0,0,1);

    const lv=ring.map(v=>{
      const m=mapboxgl.MercatorCoordinate.fromLngLat([v[0],v[1]],0);
      return{x:(m.x-om.x)/s,y:-(m.y-om.y)/s};
    });

    const h=this._ownHeight;
    const FLOOR_H=3.0;
    const SEP_H=0.30;  // visible at all viewing angles
    const SLAB_INSET=0.015; // push slab Z just below separator base to prevent z-fighting
    const numFloors=Math.max(1,Math.round(h/FLOOR_H));
    const floorH=h/numFloors;
    this._numFloors=numFloors;
    this._floorH=floorH;

    // Default neutral grey + dark separator
    const CF=[0x94/255,0xa3/255,0xb4/255]; // default grey
    const CS=[0.09,0.10,0.11];             // dark separator
    const CT=[0xa8/255,0xb4/255,0xc4/255]; // roof face (slightly lighter)

    // Helper: convert ring coords to local-metre verts
    const ringToLv=r=>r.map(v=>{const m=mapboxgl.MercatorCoordinate.fromLngLat([v[0],v[1]],0);return{x:(m.x-om.x)/s,y:-(m.y-om.y)/s};});

    const pos=[],norm=[],col=[];
    this._groups=[];
    let ti=0;

    for(let f=0;f<numFloors;f++){
      const fBase=f*floorH;
      const fTop=fBase+floorH-(f<numFloors-1?SEP_H:0);
      const ov=this._ownOverrides[f]||{};
      const fRing=ov.ring||ring;
      const flv=(fRing===ring)?lv:ringToLv(fRing);
      // Selected floor: bright white-amber highlight; custom use type color otherwise
      const isSel=this._ownSelectedFloors.has(f);
      const c=isSel?[1,0.92,0.55]:(ov.color||CF);

      for(let i=0;i<N;i++){
        const v0=flv[i],v1=flv[i+1];
        const e0=re[i],e1=re[i+1];
        const dx=v1.x-v0.x,dy=v1.y-v0.y,len=Math.sqrt(dx*dx+dy*dy);
        let nx=dy/len,ny=-dx/len;
        if(v0.x*nx+v0.y*ny<0){nx=-nx;ny=-ny;}
        const b0=f===0?e0:fBase, b1=f===0?e1:fBase;
        pos.push(v0.x,v0.y,b0, v1.x,v1.y,b1, v1.x,v1.y,fTop, v0.x,v0.y,b0, v1.x,v1.y,fTop, v0.x,v0.y,fTop);
        for(let k=0;k<6;k++)norm.push(nx,ny,0);
        for(let k=0;k<6;k++)col.push(c[0],c[1],c[2]);
        this._groups.push({type:'side',edgeIdx:i,floorIdx:f,triStart:ti,triCount:2,nx,ny});
        ti+=2;
      }

      // Horizontal slab-top face — fills the interior so building isn't hollow
      // Placed SLAB_INSET below fTop so it doesn't z-fight with the separator base
      if(f<numFloors-1){
        const slabZ=fTop-SLAB_INSET;
        const slabStart=ti;
        for(let i=0;i<N;i++){
          const v0=flv[i],v1=flv[i+1];
          pos.push(0,0,slabZ, v0.x,v0.y,slabZ, v1.x,v1.y,slabZ);
          for(let k=0;k<3;k++)norm.push(0,0,1);
          for(let k=0;k<3;k++)col.push(c[0],c[1],c[2]);
          ti++;
        }
        this._groups.push({type:'slab',floorIdx:f,triStart:slabStart,triCount:N});

        const sepBase=fTop, sepTop=(f+1)*floorH;
        for(let i=0;i<N;i++){
          const v0=flv[i],v1=flv[i+1];
          const dx=v1.x-v0.x,dy=v1.y-v0.y,len=Math.sqrt(dx*dx+dy*dy);
          let nx=dy/len,ny=-dx/len;
          if(v0.x*nx+v0.y*ny<0){nx=-nx;ny=-ny;}
          pos.push(v0.x,v0.y,sepBase, v1.x,v1.y,sepBase, v1.x,v1.y,sepTop, v0.x,v0.y,sepBase, v1.x,v1.y,sepTop, v0.x,v0.y,sepTop);
          for(let k=0;k<6;k++)norm.push(nx,ny,0);
          for(let k=0;k<6;k++)col.push(CS[0],CS[1],CS[2]);
          this._groups.push({type:'separator',floorIdx:f,triStart:ti,triCount:2,nx,ny});
          ti+=2;
        }
      }
    }

    // Roof: use the last floor's ring so a reshaped top floor gets a filled cap
    const lastOv=this._ownOverrides[numFloors-1]||{};
    const lastFRing=lastOv.ring||ring;
    const lastLv=(lastFRing===ring)?lv:ringToLv(lastFRing);
    const topStart=ti;
    for(let i=0;i<N;i++){
      const v0=lastLv[i],v1=lastLv[i+1];
      pos.push(0,0,h, v0.x,v0.y,h, v1.x,v1.y,h);
      for(let k=0;k<3;k++)norm.push(0,0,1);
      const _rc=(this===_threeEditor)?[0xf2/255,0xa8/255,0x48/255]:CT;
      for(let k=0;k<3;k++)col.push(_rc[0],_rc[1],_rc[2]);
      ti++;
    }
    this._groups.push({type:'top',triStart:topStart,triCount:N});

    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    this._posArr=pos;this._geo=geo;
    this._mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({vertexColors:true,opacity:0.95,transparent:true,side:THREE.DoubleSide}));
    this._scene.add(this._mesh);
  }

  _groupBaseColor(gi){
    const fg=this._groups[gi];
    if(!fg)return[0x94/255,0xa3/255,0xb4/255];
    if(fg.type==='separator')return[0.06,0.04,0.02];
    if(fg.type==='top')return(this===_threeEditor)?[0xf2/255,0xa8/255,0x48/255]:[0xa8/255,0xb4/255,0xc4/255];
    if(this._ownSelectedFloors.has(fg.floorIdx))return[1,0.92,0.55];
    return(this._ownOverrides[fg.floorIdx]?.color)||[0x94/255,0xa3/255,0xb4/255];
  }

  _setHover(g){
    if(g===this._hovG)return;
    this._hovG=g;
    const col=this._geo.attributes.color,arr=col.array;
    for(let gi=0;gi<this._groups.length;gi++){
      const fg=this._groups[gi];
      const isHov=gi===g&&fg.type!=='separator';
      const c=isHov?[0xff/255,0xd0/255,0x60/255]:this._groupBaseColor(gi);
      for(let t=fg.triStart;t<fg.triStart+fg.triCount;t++){
        for(let v=0;v<3;v++){arr[(t*3+v)*3]=c[0];arr[(t*3+v)*3+1]=c[1];arr[(t*3+v)*3+2]=c[2];}
      }
    }
    col.needsUpdate=true;
    this._map.triggerRepaint();
  }

  // Returns ray in LOCAL METRE space
  _ray(e){
    if(!this._lastMx||!this._modelMx)return null;
    // full matrix: Mapbox(Mercator→clip) * Model(localM→Mercator) = localM→clip
    const full=new THREE.Matrix4().fromArray(this._lastMx).multiply(this._modelMx);
    const inv=full.clone().invert();
    const c=this._map.getCanvas(),r=c.getBoundingClientRect();
    const xN=((e.clientX-r.left)/r.width)*2-1,yN=-((e.clientY-r.top)/r.height)*2+1;
    const pn=new THREE.Vector4(xN,yN,-1,1).applyMatrix4(inv);
    const pf=new THREE.Vector4(xN,yN,1,1).applyMatrix4(inv);
    pn.divideScalar(pn.w);pf.divideScalar(pf.w);
    const o=new THREE.Vector3(pn.x,pn.y,pn.z);
    const d=new THREE.Vector3(pf.x-pn.x,pf.y-pn.y,pf.z-pn.z).normalize();
    return{o,d};
  }

  _hit(ray){
    const p=this._posArr,EPS=1e-9; // EPS safe at metre scale
    let minT=Infinity,hitTri=-1;
    const _v0=new THREE.Vector3(),_v1=new THREE.Vector3(),_v2=new THREE.Vector3();
    const e1=new THREE.Vector3(),e2=new THREE.Vector3(),hh=new THREE.Vector3(),ss=new THREE.Vector3(),qq=new THREE.Vector3();
    for(let i=0,tris=p.length/9;i<tris;i++){
      const b=i*9;
      _v0.set(p[b],p[b+1],p[b+2]);_v1.set(p[b+3],p[b+4],p[b+5]);_v2.set(p[b+6],p[b+7],p[b+8]);
      e1.subVectors(_v1,_v0);e2.subVectors(_v2,_v0);
      hh.crossVectors(ray.d,e2);const a=e1.dot(hh);
      if(Math.abs(a)<EPS)continue;
      const f=1/a;ss.subVectors(ray.o,_v0);const u=f*ss.dot(hh);
      if(u<0||u>1)continue;
      qq.crossVectors(ss,e1);const v=f*ray.d.dot(qq);
      if(v<0||u+v>1)continue;
      const t=f*e2.dot(qq);
      if(t>EPS&&t<minT){minT=t;hitTri=i;}
    }
    if(hitTri<0)return null;
    let gIdx=-1;
    for(let g=0;g<this._groups.length;g++){const fg=this._groups[g];if(hitTri>=fg.triStart&&hitTri<fg.triStart+fg.triCount){gIdx=g;break;}}
    return{t:minT,gIdx,pt:new THREE.Vector3().copy(ray.o).addScaledVector(ray.d,minT)};
  }

  _bma(e){
    if(this._dragging){this._doDrag(e);return;}
    if(this!==_threeEditor)return;
    const ray=this._ray(e);if(!ray)return;
    const hit=this._hit(ray);
    const fg=hit?this._groups[hit.gIdx]:null;
    // Backface filter: ignore faces whose outward normal points same direction as ray
    // (these are far-side walls that project onto adjacent buildings at camera pitch)
    let gIdx=hit?hit.gIdx:-1;
    if(fg&&fg.type==='side'&&gIdx>=0){
      if(fg.nx*ray.d.x+fg.ny*ray.d.y>=0)gIdx=-1;
    }
    const isFloorFace=gIdx>=0&&fg&&fg.type==='side';
    if(this._editMode){
      this._setHover(gIdx);
      this._map.getCanvas().style.cursor=gIdx>=0?'grab':'default';
    } else if(isFloorFace){
      this._map.getCanvas().style.cursor='pointer';
    } else {
      this._map.getCanvas().style.cursor='default';
    }
  }

  _bmd(e){
    if(e.button!==0)return;
    const ray=this._ray(e);if(!ray)return;
    const hit=this._hit(ray);if(!hit||hit.gIdx<0)return;
    // Passive editor: switch building; store hit gIdx so _bmu can select floor in one click
    if(this!==_threeEditor){
      if(window._threeBldHit)return; // active editor already handled this click
      const _pfg=this._groups[hit.gIdx];
      if(_pfg?.type==='side'){this._dragG=hit.gIdx;this._dragStartX=e.clientX;this._dragStartY=e.clientY;}
      window._threeBldHit=true;
      if(this._bldId)_selectBuilding(this._bldId,e.shiftKey||false);
      return;
    }
    window._threeBldHit=true; // tell map click handler: click landed on 3D building
    const fg=this._groups[hit.gIdx];
    const isFloorFace=fg.type==='side';
    if(!this._editMode&&!isFloorFace)return;
    this._dragG=hit.gIdx;
    this._dragStartX=e.clientX;this._dragStartY=e.clientY;
    if(this._editMode){
      e.stopPropagation();
      this._dragging=true;this._dragP0=hit.pt.clone();
      this._dragType=fg.type;
      this._dragH=_extrusionHeight;
      this._map.getCanvas().style.cursor='grabbing';
      this._map.dragPan.disable();
      if(fg.type==='side'){
        const fi=fg.floorIdx;
        const srcRing=_floorOverrides[fi]?.ring||_currentParcelGeoJSON.coordinates[0];
        this._dragRing=srcRing.map(v=>[...v]);
        this._dragFloorIdx=fi;
        this._sn=this._computeScreenNormal(fg,hit.pt);
      } else {
        this._dragRing=_currentParcelGeoJSON.coordinates[0].map(v=>[...v]);
        this._dragFloorIdx=-1;
        this._sn=null;
      }
    } else if(isFloorFace){
      e.stopPropagation();
    }
  }

  _computeScreenNormal(fg,pt){
    if(!this._lastMx||!this._modelMx)return null;
    const full=new THREE.Matrix4().fromArray(this._lastMx).multiply(this._modelMx);
    const r=this._map.getCanvas().getBoundingClientRect();
    const toScreen=v=>{
      const c=new THREE.Vector4(v.x,v.y,v.z,1).applyMatrix4(full);
      c.divideScalar(c.w);
      return{x:(c.x+1)/2*r.width,y:(1-c.y)/2*r.height};
    };
    const s1=toScreen(pt);
    const s2=toScreen(new THREE.Vector3(pt.x+fg.nx,pt.y+fg.ny,pt.z));
    const dx=s2.x-s1.x,dy=s2.y-s1.y,ppm=Math.sqrt(dx*dx+dy*dy);
    if(ppm<0.01)return null;
    return{dx:dx/ppm,dy:dy/ppm,ppm};
  }

  _updateMeshPositions(h){
    const numFloors=Math.max(1,Math.round(h/3.0));
    if(numFloors!==this._numFloors){this.rebuild();return;}
    const floorH=h/numFloors;
    const SEP_H=0.30;
    const SLAB_INSET=0.015;
    const s=this._s,om=this._om;
    const baseRing=_currentParcelGeoJSON.coordinates[0];
    const N=baseRing.length-1;
    const toLv=r=>r.map(v=>{const m=mapboxgl.MercatorCoordinate.fromLngLat([v[0],v[1]],0);return{x:(m.x-om.x)/s,y:-(m.y-om.y)/s};});
    const baseLv=toLv(baseRing);
    const re=(this._ringElevs||baseRing.map(()=>0)).map(e=>e-(this._baseElev||0));
    const pos=this._posArr,pa=this._geo.attributes.position.array;
    let pi=0;
    for(let f=0;f<numFloors;f++){
      const fBase=f*floorH;
      const fTop=fBase+floorH-(f<numFloors-1?SEP_H:0);
      const fRing=_floorOverrides[f]?.ring||baseRing;
      const lv=(fRing===baseRing)?baseLv:toLv(fRing);
      for(let i=0;i<N;i++){
        const v0=lv[i],v1=lv[i+1],e0=re[i],e1=re[i+1];
        const b0=f===0?e0:fBase,b1=f===0?e1:fBase;
        pos[pi]=v0.x;pos[pi+1]=v0.y;pos[pi+2]=b0;
        pos[pi+3]=v1.x;pos[pi+4]=v1.y;pos[pi+5]=b1;
        pos[pi+6]=v1.x;pos[pi+7]=v1.y;pos[pi+8]=fTop;
        pos[pi+9]=v0.x;pos[pi+10]=v0.y;pos[pi+11]=b0;
        pos[pi+12]=v1.x;pos[pi+13]=v1.y;pos[pi+14]=fTop;
        pos[pi+15]=v0.x;pos[pi+16]=v0.y;pos[pi+17]=fTop;
        pi+=18;
      }
      if(f<numFloors-1){
        // Slab top triangles — placed SLAB_INSET below fTop to avoid z-fighting with separator
        const slabZ=fTop-SLAB_INSET;
        for(let i=0;i<N;i++){
          pos[pi]=0;pos[pi+1]=0;pos[pi+2]=slabZ;
          pos[pi+3]=lv[i].x;pos[pi+4]=lv[i].y;pos[pi+5]=slabZ;
          pos[pi+6]=lv[i+1].x;pos[pi+7]=lv[i+1].y;pos[pi+8]=slabZ;
          pi+=9;
        }
        // Separator walls
        const sepBase=fTop,sepTop=(f+1)*floorH;
        for(let i=0;i<N;i++){
          const v0=lv[i],v1=lv[i+1];
          pos[pi]=v0.x;pos[pi+1]=v0.y;pos[pi+2]=sepBase;
          pos[pi+3]=v1.x;pos[pi+4]=v1.y;pos[pi+5]=sepBase;
          pos[pi+6]=v1.x;pos[pi+7]=v1.y;pos[pi+8]=sepTop;
          pos[pi+9]=v0.x;pos[pi+10]=v0.y;pos[pi+11]=sepBase;
          pos[pi+12]=v1.x;pos[pi+13]=v1.y;pos[pi+14]=sepTop;
          pos[pi+15]=v0.x;pos[pi+16]=v0.y;pos[pi+17]=sepTop;
          pi+=18;
        }
      }
    }
    // Roof uses last floor's ring — matches _buildMesh
    const lastFRing=_floorOverrides[numFloors-1]?.ring||baseRing;
    const lastTopLv=(lastFRing===baseRing)?baseLv:toLv(lastFRing);
    for(let i=0;i<N;i++){
      const v0=lastTopLv[i],v1=lastTopLv[i+1];
      pos[pi]=0;pos[pi+1]=0;pos[pi+2]=h;
      pos[pi+3]=v0.x;pos[pi+4]=v0.y;pos[pi+5]=h;
      pos[pi+6]=v1.x;pos[pi+7]=v1.y;pos[pi+8]=h;
      pi+=9;
    }
    for(let i=0;i<pa.length;i++)pa[i]=pos[i];
    this._geo.attributes.position.needsUpdate=true;
    this._map.triggerRepaint();
  }

  _doDrag(e){
    // Use _dragType captured at mousedown — _groups[_dragG] is stale after any rebuild()
    if(this._dragType==='top'){
      // Free continuous height — 0.5 m precision, no floor snapping
      const rawH=this._dragH+(this._dragStartY-e.clientY)*0.5;
      const newH=Math.max(0.5,Math.round(rawH*2)/2);
      if(newH===_extrusionHeight)return;
      _extrusionHeight=newH;
      _update3DMetrics();
      this.rebuild();
    } else if(this._dragType==='side'){
      if(!this._sn)return;
      const fg=this._groups[this._dragG]||{};
      const dxPx=e.clientX-this._dragStartX,dyPx=e.clientY-this._dragStartY;
      const delta=(dxPx*this._sn.dx+dyPx*this._sn.dy)/this._sn.ppm;
      const nx=fg.nx||0,ny=fg.ny||0;
      const ring=this._dragRing.map(v=>[...v]);
      const N=ring.length-1;
      const i0=fg.edgeIdx,i1=(fg.edgeIdx+1)%N;
      for(const idx of[i0,i1]){
        const m0=mapboxgl.MercatorCoordinate.fromLngLat([ring[idx][0],ring[idx][1]],0);
        const m1=new mapboxgl.MercatorCoordinate(m0.x+nx*delta*this._s,m0.y-ny*delta*this._s,0);
        const ll=m1.toLngLat();ring[idx]=[ll.lng,ll.lat];
      }
      ring[N]=[...ring[0]];
      const fi=this._dragFloorIdx;
      if(fi>=0){
        // Per-floor reshape: store ring in override
        if(!_floorOverrides[fi])_floorOverrides[fi]={};
        _floorOverrides[fi].ring=ring;
      } else {
        // Base shape: move entire building footprint
        _currentParcelGeoJSON={type:'Polygon',coordinates:[ring]};
        if(mapReady)map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_currentParcelGeoJSON,properties:{cadastral:'drawn',selected:false}}]});
        const aM2=Math.round(computePolygonAreaM2(ring));
        _currentParcelAreaM2=aM2;
        const _aStr2=aM2>=10000?(aM2/10000).toFixed(2)+' ha':aM2.toLocaleString()+' m²';
        document.getElementById('val-code').textContent=_aStr2;
        document.getElementById('val-prp-footprint').textContent=_aStr2;
      }
      this._updateMeshPositions(_extrusionHeight);
      _updateMetricsExtrusion();
    }
  }

  _bmu(e){
    // Passive editors must not fire — stale _dragG would select a floor on the wrong building
    if(this!==_threeEditor&&!this._dragging){this._dragG=-1;return;}
    const moved=Math.hypot((e?.clientX||0)-this._dragStartX,(e?.clientY||0)-this._dragStartY);
    // Click detection: works with or without edit mode
    if(moved<5&&this._dragG>=0){
      const fg=this._groups[this._dragG];
      if(fg&&fg.type==='side'){
        const fi=fg.floorIdx;
        _selectFloor(fi); // toggle floor in multi-selection
        if(!this._dragging){this._dragG=-1;return;}
      }
    }
    if(!this._dragging){this._dragG=-1;return;}
    this._dragging=false;this._sn=null;
    this._map.dragPan.enable();
    this._map.getCanvas().style.cursor='default';
    this.rebuild();
    if(_draw&&_drawnFeatureId){
      try{_draw.delete([_drawnFeatureId]);const a=_draw.add({type:'Feature',geometry:_currentParcelGeoJSON,properties:{}});_drawnFeatureId=a[0]??null;}catch(ex){}
    }
    if(_extrusionActive)_rebuildExtrusionFloors();
    this._dragG=-1;
  }

  render(gl,matrix){
    // Self-heal if _buildMesh threw during onAdd (e.g., terrain not ready yet)
    if(!this._modelMx){try{this._buildMesh();}catch(e){return;}if(!this._modelMx)return;}
    this._lastMx=matrix;
    // projectionMatrix = Mapbox(Mercator→clip) * Model(localM→Mercator) = localM→clip
    this._cam.projectionMatrix=new THREE.Matrix4().fromArray(matrix).multiply(this._modelMx);
    this._rdr.resetState();
    this._rdr.render(this._scene,this._cam);
    this._map.triggerRepaint();
  }

  dispose(){
    if(this._mesh){this._scene.remove(this._mesh);this._mesh.geometry.dispose();}
    this._scene.clear();this._rdr.dispose();
    this._map?.getCanvas()&&(this._map.getCanvas().style.cursor='default');
    this._map?.dragPan.enable();
  }
}

function _update3DMetrics(){
  const rowH=document.getElementById('row-3d-height');
  const rowF=document.getElementById('row-3d-floors');
  const show=_isDrawnArea&&_extrusionActive;
  if(rowH)rowH.style.display=show?'flex':'none';
  if(rowF)rowF.style.display=show?'flex':'none';
  const canExtrude=_isDrawnArea&&['polygon','rectangle','circle'].includes(_drawShape);
  const extBtn=document.getElementById('nav-extrusion-btn');
  const extIcon=document.getElementById('nav-extrusion-icon');
  if(extBtn){
    extBtn.classList.toggle('active',_extrusionActive);
    if(extIcon)extIcon.style.opacity=canExtrude?(_extrusionActive?'1':'0.55'):'0.3';
  }
  const editBtn=document.getElementById('edit-shape-btn');
  if(editBtn)editBtn.style.display=(show&&_drawnFeatureId)?'block':'none';
  if(_extrusionActive)_applyExtrusionHeightCap();
  _updateMetricsExtrusion();
  _updateAnalysisBtn();
  _updateGeoToolbar();
}

function _updateMetricsExtrusion(){
  const extRows=document.getElementById('prp-extrusion-rows');
  if(!extRows)return;
  if(!_isDrawnArea||!_extrusionActive){extRows.style.display='none';const _b3=document.getElementById('poly-dl-3d-btn');if(_b3)_b3.style.display='none';return;}
  const numFloors=Math.max(1,Math.round(_extrusionHeight/3));
  const isKa=lang==='ka';
  const fmtM2=v=>v>=10000?(v/10000).toFixed(2)+' ha':Math.round(v).toLocaleString()+' m²';
  // Sum area per use type across all floors
  let totalM2=0;
  const useArea={};
  for(let f=0;f<numFloors;f++){
    const ov=_floorOverrides[f];
    const floorM2=ov?.ring?computePolygonAreaM2(ov.ring):(_currentParcelAreaM2||0);
    totalM2+=floorM2;
    const key=ov?.useType||'__none__';
    useArea[key]=(useArea[key]||0)+floorM2;
  }
  extRows.style.display='flex';
  const _b3d=document.getElementById('poly-dl-3d-btn');if(_b3d)_b3d.style.display='flex';
  document.getElementById('lbl-prp-height').textContent=isKa?'სიმაღლე':'Height';
  document.getElementById('val-prp-height').textContent=_extrusionHeight+' m';
  document.getElementById('lbl-prp-floors').textContent=isKa?'სართული':'Floors';
  document.getElementById('val-prp-floors').textContent=numFloors;
  document.getElementById('lbl-prp-totalarea').textContent=isKa?'საერთო ფართი':'Total floor area';
  document.getElementById('val-prp-totalarea').textContent=fmtM2(totalM2);
  {const _k2r=document.getElementById('row-prp-k2limit');const _k2v=document.getElementById('val-prp-k2limit');
  if(_k2r&&_k2v){if(_maxFloorAreaM2!=null){
    _k2r.style.display='flex';
    document.getElementById('lbl-prp-k2limit').textContent=isKa?'K2 ლიმიტი':'K2 limit';
    _k2v.textContent=fmtM2(_maxFloorAreaM2);
    _k2v.style.color='rgba(239,68,68,0.75)';}
  else{_k2r.style.display='none';}}}
  // Use-type breakdown
  const bd=document.getElementById('prp-use-breakdown');
  if(!bd)return;
  bd.innerHTML='';
  const hasAny=FLOOR_USES.some(u=>useArea[u.id]);
  if(!hasAny){bd.style.display='none';return;}
  bd.style.display='flex';
  FLOOR_USES.forEach(u=>{
    const a=useArea[u.id];if(!a)return;
    const pct=Math.round(a/totalM2*100);
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:6px';
    row.innerHTML='<span style="display:flex;align-items:center;gap:4px;font-size:0.62rem;color:rgba(255,255,255,0.45);min-width:0"><span style="width:6px;height:6px;border-radius:50%;background:'+u.hex+';flex-shrink:0;display:inline-block"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+u.label+'</span></span><span style="font-size:0.62rem;white-space:nowrap;color:rgba(255,255,255,0.65)">'+fmtM2(a)+'&nbsp;<span style="color:'+u.hex+';font-weight:700">'+pct+'%</span></span>';
    bd.appendChild(row);
  });
  const unassigned=useArea['__none__'];
  if(unassigned&&hasAny){
    const pct=Math.round(unassigned/totalM2*100);
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:6px';
    row.innerHTML='<span style="font-size:0.62rem;color:rgba(255,255,255,0.25)">'+(isKa?'დაუსახელებელი':'Unassigned')+'</span><span style="font-size:0.62rem;color:rgba(255,255,255,0.35);white-space:nowrap">'+fmtM2(unassigned)+'&nbsp;<span style="font-weight:700">'+pct+'%</span></span>';
    bd.appendChild(row);
  }
}

function _updateMapInfoBadge(){
  const badge=document.getElementById('map-info-badge');
  if(badge)badge.style.display='none';
}

function _updateAnalysisBtn(){
  const btn=document.getElementById('analysis-tool-btn');
  if(!btn)return;
  btn.disabled=false;
  btn.title='Run spatial analysis';
}

function _updateGeoToolbar(){
  const tb=document.getElementById('geo-toolbar');
  if(tb)tb.style.display=_extrusionActive?'flex':'none';
}

function _setAnalysisPanel(open){
  const proCard=document.getElementById('pro-analysis-card');
  const bottomBar=document.getElementById('analysis-bottom-bar');
  const btn=document.getElementById('analysis-tool-btn');
  if(open){
    if(bottomBar)bottomBar.classList.add('visible');
    if(btn)btn.classList.add('active');
  }else{
    closeCatPopover();
    if(proCard){proCard.style.display='none';}
    document.querySelectorAll('.pro-cat').forEach(el=>el.classList.remove('open'));
    document.querySelectorAll('.cat-icon-btn').forEach(b=>b.classList.remove('active'));
    if(bottomBar)bottomBar.classList.remove('visible');
    if(btn)btn.classList.remove('active');
    _activeCatKey=null;
  }
}
function toggleAnalysisFromMap(){
  if(!_currentParcelGeoJSON&&!parcelCentroid)return;
  const bottomBar=document.getElementById('analysis-bottom-bar');
  const isOpen=bottomBar&&bottomBar.classList.contains('visible');
  if(isOpen){_setAnalysisPanel(false);return;}
  setupProCard(false);
  _setAnalysisPanel(true);
  const freBtn=document.getElementById('analyse-btn');
  if(freBtn&&freBtn.style.display!=='none')runAnalysis();
}

function togglePolygonSelect(){toggleDrawMenu();}

function _drawAreaBtnLabel(){return t().polySelectBtn||'Draw';}

function _setDrawHint(text){
  const h=document.getElementById('draw-hint');
  if(!h)return;
  h.style.display='flex';
  h.innerHTML=text+'<span class="hint-esc">Esc</span>';
}

function toggleDrawMenu(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(_polyDrawing){cancelDraw();return;}
  _drawMenuOpen=!_drawMenuOpen;
  const popup=document.getElementById('draw-shape-popup');
  if(popup){
    popup.classList.toggle('open',_drawMenuOpen);
    if(_drawMenuOpen){
      const nb=document.getElementById('nav-draw-btn');
      if(nb){const r=nb.getBoundingClientRect();popup.style.top=r.top+'px';popup.style.left='68px';}
      setTimeout(()=>{document.addEventListener('click',_closeDrawMenuOutside,{capture:true});},0);
    } else {
      document.removeEventListener('click',_closeDrawMenuOutside,{capture:true});
    }
  }
}

function _closeDrawMenuOutside(e){
  const nb=document.getElementById('nav-draw-btn');
  const popup=document.getElementById('draw-shape-popup');
  if((nb&&nb.contains(e.target))||(popup&&popup.contains(e.target)))return;
  _drawMenuOpen=false;
  if(popup)popup.classList.remove('open');
  const ni=document.getElementById('nav-draw-icon');
  if(nb){nb.classList.remove('active');if(ni)ni.style.opacity='0.55';}
  document.removeEventListener('click',_closeDrawMenuOutside,{capture:true});
}

function _clearDrawBtnActive(){
  const btn=document.getElementById('draw-area-btn');
  if(btn){btn.classList.remove('active','open');}
  document.getElementById('draw-shape-popup')?.classList.remove('open');
  document.removeEventListener('click',_closeDrawMenuOutside,{capture:true});
  _drawMenuOpen=false;
}

document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  if(_drawMenuOpen){
    _drawMenuOpen=false;
    document.getElementById('draw-area-btn')?.classList.remove('open');
    document.getElementById('draw-shape-popup')?.classList.remove('open');
    document.removeEventListener('click',_closeDrawMenuOutside,{capture:true});
  } else if(_polyDrawing){
    cancelDraw();
  }
});

function makeBBoxPoly(a,b){
  const minLng=Math.min(a.lng,b.lng),maxLng=Math.max(a.lng,b.lng);
  const minLat=Math.min(a.lat,b.lat),maxLat=Math.max(a.lat,b.lat);
  return{type:'Polygon',coordinates:[[[minLng,minLat],[maxLng,minLat],[maxLng,maxLat],[minLng,maxLat],[minLng,minLat]]]};
}

function makeCirclePoly(center,edge,nPts){
  nPts=nPts||64;
  const lngF=111320*Math.cos(center.lat*Math.PI/180),latF=110540;
  const dx=(edge.lng-center.lng)*lngF,dy=(edge.lat-center.lat)*latF;
  const r=Math.sqrt(dx*dx+dy*dy);
  if(r<1)return{type:'Polygon',coordinates:[[[center.lng,center.lat],[center.lng,center.lat],[center.lng,center.lat],[center.lng,center.lat]]]};
  const coords=[];
  for(let i=0;i<=nPts;i++){const ang=(i/nPts)*2*Math.PI;coords.push([center.lng+Math.cos(ang)*r/lngF,center.lat+Math.sin(ang)*r/latF]);}
  return{type:'Polygon',coordinates:[coords]};
}

function startDraw(shape){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!mapReady)return;
  if(_noDevZone&&(shape==='polygon'||shape==='rectangle'||shape==='circle')){showToast('This area is not designated for development. Building is not permitted.',4500);return;}
  initDrawControl();
  if(_polyDrawing&&_drawShape===shape){cancelDraw();return;}
  if(_polyDrawing)cancelDraw();
  // Keep parcel float card and zoning analysis active during drawing
  if(!_isDrawnArea){
    resetAnalysis();
    document.getElementById("info-card").style.display="none";
    document.getElementById("owner-results-card").style.display="none";
    document.getElementById("floor-detail-panel").style.display="none";
    setStatus("","");
    const _inputEl=document.getElementById("input-side");
    if(_inputEl)_inputEl.value="";
    _updateMapInfoBadge();
  }
  // close popup
  _drawMenuOpen=false;
  document.getElementById('draw-shape-popup')?.classList.remove('open');
  const btn=document.getElementById('draw-area-btn');
  if(btn){btn.classList.remove('open');btn.classList.add('active');}
  _drawShape=shape;_polyDrawing=true;
  const hint=document.getElementById('draw-hint');
  const tr=t();
  // Deselect active building without deleting it
  if(_activeBldId){_saveBldState();const _pb=_activeBld();if(_pb?.extrusionActive)_freezeBld(_pb);_threeEditor=null;_extrusionActive=false;_activeBldId=null;_updateBldHighlights();}
  if(_isDrawnArea){_isDrawnArea=false;try{resetAnalysis();}catch(_){}if(mapReady){if(_dbParcelGeoJSON){map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_dbParcelGeoJSON,properties:{}}]});}else{map.getSource('parcel')?.setData({type:'FeatureCollection',features:[]});}}}
  document.getElementById('poly-result-panel').style.display='none';
  if(shape==='polygon'){
    _draw.deleteAll();_draw.changeMode('draw_polygon');
    _setDrawHint(tr.polyDrawHint);
  } else if(shape==='line'){
    _draw.deleteAll();_draw.changeMode('draw_line_string');
    _setDrawHint(tr.lineDrawHint||'Click to place points — double-click to finish');
  } else {
    _draw.deleteAll();_draw.changeMode('simple_select');
    _setDrawHint(shape==='rectangle'?(tr.rectDrawHint||'Click and drag to draw rectangle'):(tr.circleDrawHint||'Click and drag to draw circle'));
    _startShapeDrag(shape);
  }
}

function cancelDraw(){
  if(_drawShape==='polygon'||_drawShape==='line'){
    try{_draw.deleteAll();_draw.changeMode('simple_select');}catch(_){}
  } else {
    if(_shapeMouseHandlers){_shapeMouseHandlers();_shapeMouseHandlers=null;}
    if(mapReady){map.dragPan.enable();map.getSource('draw-preview')?.setData({type:'FeatureCollection',features:[]});}
  }
  _polyDrawing=false;_drawShape='polygon';_drawMenuOpen=false;
  const btn=document.getElementById('draw-area-btn');
  if(btn){btn.classList.remove('active','open');}
  document.getElementById('draw-shape-popup')?.classList.remove('open');
  const hint=document.getElementById('draw-hint');if(hint)hint.style.display='none';
}

let _drawImportType=null;
let _rasterLayers=[];
async function _importGeoTIFF(file){
  showToast(lang==='ka'?'რასტერი იტვირთება…':'Loading raster…',2500);
  try{
    if(!window.GeoTIFF){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/geotiff@2/dist-browser/geotiff.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const buf=await file.arrayBuffer();
    const tiff=await GeoTIFF.fromArrayBuffer(buf);
    const image=await tiff.getImage();
    const bbox=image.getBoundingBox(); // [xmin,ymin,xmax,ymax] in file CRS
    const [xmin,ymin,xmax,ymax]=bbox;
    // Sanity check: must look like geographic coordinates
    if(xmin<-181||xmax>181||ymin<-91||ymax>91){
      showToast(lang==='ka'?'GeoTIFF-ი WGS84 კოორდინატებში უნდა იყოს':'GeoTIFF must be in WGS84 (EPSG:4326)',4000);return;
    }
    const w=image.getWidth(),h=image.getHeight();
    const bands=await image.readRasters();
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    const id=ctx.createImageData(w,h);
    if(bands.length>=3){
      // Normalize each band to 0-255 if needed (e.g. float32)
      const norm=(band)=>{
        let mn=Infinity,mx=-Infinity;
        for(let i=0;i<band.length;i++){if(isFinite(band[i])){mn=Math.min(mn,band[i]);mx=Math.max(mx,band[i]);}}
        const rng=mx-mn||1;
        return(v)=>Math.round(((v-mn)/rng)*255);
      };
      const nr=norm(bands[0]),ng=norm(bands[1]),nb=norm(bands[2]);
      for(let i=0;i<w*h;i++){id.data[i*4]=nr(bands[0][i]);id.data[i*4+1]=ng(bands[1][i]);id.data[i*4+2]=nb(bands[2][i]);id.data[i*4+3]=bands[3]?bands[3][i]:255;}
    } else {
      // Single band — greyscale with min-max stretch
      let mn=Infinity,mx=-Infinity;
      for(let i=0;i<bands[0].length;i++){const v=bands[0][i];if(isFinite(v)){mn=Math.min(mn,v);mx=Math.max(mx,v);}}
      const rng=mx-mn||1;
      for(let i=0;i<w*h;i++){const v=Math.round(((bands[0][i]-mn)/rng)*255);id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v;id.data[i*4+3]=255;}
    }
    ctx.putImageData(id,0,0);
    const dataUrl=canvas.toDataURL('image/png');
    const uid='gt'+(Date.now().toString(36));
    const srcId=`raster-${uid}`;
    map.addSource(srcId,{type:'image',url:dataUrl,coordinates:[[xmin,ymax],[xmax,ymax],[xmax,ymin],[xmin,ymin]]});
    map.addLayer({id:`${srcId}-layer`,type:'raster',source:srcId,paint:{'raster-opacity':0.85}});
    _rasterLayers.push({uid,srcId,name:file.name});
    map.fitBounds([[xmin,ymin],[xmax,ymax]],{padding:60,duration:800});
    showToast(`${file.name} — ${w}×${h}px`);
  }catch(e){console.error('[geotiff]',e);showToast(lang==='ka'?'GeoTIFF წაკითხვა ვერ მოხერხდა':'Failed to read GeoTIFF',4000);}
}

function importDrawFile(type){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  _drawImportType=type;
  const inp=document.getElementById('draw-file-input');
  if(type==='geojson')inp.accept='.geojson,.json';
  else if(type==='shapefile')inp.accept='.zip';
  else if(type==='csv')inp.accept='.csv,.tsv,.txt';
  else if(type==='geotiff')inp.accept='.tif,.tiff,.geotiff';
  inp.value='';
  inp.click();
  document.getElementById('draw-shape-popup')?.classList.remove('open');
  document.getElementById('draw-area-btn')?.classList.remove('open');
  _drawMenuOpen=false;
}

async function handleDrawFileImport(evt){
  const file=evt.target.files[0];
  if(!file)return;
  if(_drawImportType==='geotiff'){await _importGeoTIFF(file);return;}
  initDrawControl();
  showToast((lang==='ka'?'ფაილი იტვირთება…':'Importing file…'),2500);
  try{
    let geojson=null;
    if(_drawImportType==='geojson'){
      const text=await file.text();
      geojson=JSON.parse(text);
    } else if(_drawImportType==='shapefile'){
      if(!window.shp){
        await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/shpjs@latest/dist/shp.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      const buf=await file.arrayBuffer();
      geojson=await window.shp(buf);
    } else if(_drawImportType==='csv'){
      const text=await file.text();
      geojson=_parseCSVtoGeoJSON(text,file.name);
    }
    if(!geojson)throw new Error('Could not parse file');

    // Normalise to FeatureCollection (shpjs can return an array of FCs for multi-layer zips)
    let fc;
    if(Array.isArray(geojson)){
      fc={type:'FeatureCollection',features:geojson.flatMap(g=>(g.type==='FeatureCollection'?g.features:[g]))};
    } else if(geojson.type==='FeatureCollection'){
      fc=geojson;
    } else if(geojson.type==='Feature'){
      fc={type:'FeatureCollection',features:[geojson]};
    } else {
      fc={type:'FeatureCollection',features:[{type:'Feature',geometry:geojson,properties:{}}]};
    }

    const validFeatures=fc.features.filter(f=>f&&f.geometry);
    if(!validFeatures.length){showToast(lang==='ka'?'ფაილში ფიჩერი ვერ მოიძებნა':'No features found in file',3500);return;}

    const cleanFc={type:'FeatureCollection',features:validFeatures};

    // Fly map to imported extent first
    let coordsOk=false;
    try{
      const bbox=turf.bbox(cleanFc);
      if(bbox.every(isFinite)&&bbox[0]>=-180&&bbox[2]<=180&&bbox[1]>=-90&&bbox[3]<=90){
        map.fitBounds([[bbox[0],bbox[1]],[bbox[2],bbox[3]]],{padding:60,maxZoom:18,duration:800});
        coordsOk=true;
      }
    }catch(_){}
    if(!coordsOk){
      showToast(lang==='ka'?'კოორდინატები WGS84 დიაპაზონს სცილდება. შეამოწმეთ სვეტები.':'Coordinates outside WGS84 range — check column mapping.',5000);
    }

    const layerName=file.name.replace(/\.[^.]+$/,'');
    _addImportedLayer(layerName,cleanFc);
    showToast((lang==='ka'?`${validFeatures.length} ფიჩერი დაემატა`:`${validFeatures.length} feature${validFeatures.length>1?'s':''} imported`),3000);
  }catch(e){
    console.error('[import]',e);
    showToast((lang==='ka'?'იმპორტი ვერ მოხერხდა: ':'Import failed: ')+(e.message||'unknown error'),4500);
  }
}

// ── Imported layer registry ───────────────────────────────────────────────────
const _IMPORT_COLORS=['#818cf8','#34d399','#fb923c','#f472b6','#38bdf8','#facc15','#a78bfa'];
let _importedLayers=[];
let _selectedImportUid=null;

function _addImportedLayer(name,fc){
  const uid='il'+(Date.now().toString(36));
  const color=_IMPORT_COLORS[_importedLayers.length%_IMPORT_COLORS.length];
  const srcId=`import-${uid}-src`;

  // Insert before the first draw-control layer so imports sit below drawn shapes
  const drawLayer=map.getStyle().layers.find(l=>l.id.startsWith('gl-draw-'));
  const before=drawLayer?.id;

  map.addSource(srcId,{type:'geojson',data:fc});
  map.addLayer({id:`import-${uid}-fill`,type:'fill',source:srcId,
    filter:['match',['geometry-type'],['Polygon','MultiPolygon'],true,false],
    paint:{'fill-color':color,'fill-opacity':0.18}
  },before);
  map.addLayer({id:`import-${uid}-line`,type:'line',source:srcId,
    filter:['match',['geometry-type'],['Polygon','MultiPolygon','LineString','MultiLineString'],true,false],
    paint:{'line-color':color,'line-width':1.8,'line-opacity':0.9}
  },before);
  map.addLayer({id:`import-${uid}-circle`,type:'circle',source:srcId,
    filter:['match',['geometry-type'],['Point','MultiPoint'],true,false],
    paint:{'circle-color':color,'circle-radius':5,'circle-opacity':0.9,'circle-stroke-width':1.5,'circle-stroke-color':'rgba(0,0,0,0.6)'}
  },before);

  const columns=_analyzeAttributes(fc.features);
  const geomTypes=_getImportGeomTypes(fc.features);
  _importedLayers.push({uid,name,color,visible:true,count:fc.features.length,fc,columns,geomTypes,vizExpanded:false,vizActive:false});
  _renderImportedLayersPanel();
  _updateDataNavBtn();
  if(!_dpUid){_dpUid=uid;}
  if(document.getElementById('pp-pane-data')?.style.display!=='none')_renderPPDataTab();
}

function _renderImportedLayersPanel(){
  const sep=document.getElementById('il-panel-sep');
  const title=document.getElementById('il-panel-title');
  const list=document.getElementById('il-panel-list');
  if(!sep||!title||!list)return;
  const isKa=lang==='ka';
  const hasLayers=_importedLayers.length>0;
  sep.style.display=hasLayers?'':'none';
  title.style.display=hasLayers?'':'none';
  title.textContent=isKa?'იმპორტირებული ფაილები':'Imported Files';
  list.innerHTML=_importedLayers.map(l=>`
    <div id="ilrow-${l.uid}">
      <div class="lp-row il-row" style="align-items:center;gap:0">
        <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
          <input type="color" class="il-color-dot" value="${l.color}" title="${lang==='ka'?'ფერის შეცვლა':'Change color'}" onchange="event.stopPropagation();_setImportedLayerColor('${l.uid}',this.value)" onclick="event.stopPropagation()">
          <span class="lp-row-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${l.name}">${l.name}</span>
          <span class="il-count">${l.count}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;margin-left:6px">
          <button class="il-viz-btn ${l.vizExpanded?'active':''}" onclick="event.stopPropagation();toggleLayerViz('${l.uid}')" title="${isKa?'ვიზუალიზაცია':'Visualize data'}"><svg width="11" height="10" viewBox="0 0 11 10" fill="currentColor"><rect x="0" y="5" width="2.2" height="5" rx="0.5"/><rect x="3.2" y="2.5" width="2.2" height="7.5" rx="0.5"/><rect x="6.4" y="0" width="2.2" height="10" rx="0.5"/><rect x="9.6" y="3.5" width="1.4" height="6.5" rx="0.5"/></svg></button>
          <div class="lp-sw ${l.visible?'on':''}" id="ilsw-${l.uid}" onclick="event.stopPropagation();toggleImportedLayer('${l.uid}')"></div>
          <button class="il-del-btn" onclick="event.stopPropagation();removeImportedLayer('${l.uid}')" title="${isKa?'წაშლა':'Remove'}"><img src="analysis-logos/delete.svg"></button>
        </div>
      </div>
      ${l.vizExpanded?_buildVizPanel(l.uid):''}
    </div>`).join('');
}

function toggleImportedLayer(uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return;
  entry.visible=!entry.visible;
  const vis=entry.visible?'visible':'none';
  [`import-${uid}-fill`,`import-${uid}-line`,`import-${uid}-circle`].forEach(id=>{
    if(map.getLayer(id))map.setLayoutProperty(id,'visibility',vis);
  });
  const sw=document.getElementById('ilsw-'+uid);
  if(sw)sw.classList.toggle('on',entry.visible);
  // Clear selection if this layer is hidden or no imported layers remain visible
  if(!entry.visible&&_selectedImportUid===uid)_clearImportedSelection();
  if(!_importedLayers.some(l=>l.visible))_clearImportedSelection();
}

function removeImportedLayer(uid){
  if(_selectedImportUid===uid)_clearImportedSelection();
  [`import-${uid}-fill`,`import-${uid}-line`,`import-${uid}-circle`,`import-${uid}-heat`].forEach(id=>{
    try{if(map.getLayer(id))map.removeLayer(id);}catch(_){}
  });
  if(map.getSource(`import-${uid}-src`))map.removeSource(`import-${uid}-src`);
  _importedLayers=_importedLayers.filter(l=>l.uid!==uid);
  delete _vizState[uid];
  delete _layerFilters[uid];
  if(_dpUid===uid)_dpUid=_importedLayers[0]?.uid||null;
  if(!_importedLayers.some(l=>l.visible))_clearImportedSelection();
  _renderImportedLayersPanel();
  _updateDataNavBtn();
  if(_dpUid)_renderDP();
  else closeDataPanel();
  if(document.getElementById('pp-pane-data')?.style.display!=='none')_renderPPDataTab();
}

// ── Projects ──────────────────────────────────────────────────────────────────
function _ppSetTab(tab){
  ['projects','data'].forEach(t=>{
    document.getElementById('pp-tab-'+t)?.classList.toggle('active',t===tab);
    const pane=document.getElementById('pp-pane-'+t);
    if(pane)pane.style.display=t===tab?'flex':'none';
  });
  if(tab==='data')_renderPPDataTab();
}
function _renderPPDataTab(){
  const list=document.getElementById('pp-data-list');if(!list)return;
  if(!_importedLayers.length){
    list.innerHTML='<div class="pp-data-empty">No imported data layers yet.<br>Use the Draw &amp; Import tool to add GeoJSON, Shapefile, CSV, or GeoTIFF.</div>';
    return;
  }
  list.innerHTML=_importedLayers.map(l=>`<div class="pp-data-card"><div class="pp-data-card-info"><div class="pp-data-dot" style="background:${l.color}"></div><div><div class="pp-data-name">${l.name.replace(/</g,'&lt;')}</div><div class="pp-data-meta">${l.count.toLocaleString()} features · ${Object.keys(l.columns||{}).length} columns</div></div></div><button class="pp-data-open-btn" onclick="closeProjectsPanel();_dpTab='table';openDataPanel('${l.uid}')">Open Table</button></div>`).join('');
}
function openProjectsPanel(){
  if(!currentUser){openAuthModal('view-signin');return;}
  _ppSetTab('projects');
  document.getElementById('projects-panel').classList.add('open');
  _loadProjectsList();
}
function closeProjectsPanel(){
  document.getElementById('projects-panel').classList.remove('open');
}
function onProjectsPanelOverlayClick(e){
  if(e.target.id==='projects-panel')closeProjectsPanel();
}
function openSaveProjectModal(){
  if(!currentUser){openAuthModal('view-signin');return;}
  const tr=t().projects;
  document.getElementById('lbl-spm-title').textContent=tr.saveModalTitle;
  document.getElementById('lbl-spm-hint').textContent=tr.saveModalHint;
  document.getElementById('lbl-spm-cancel').textContent=tr.cancelBtn;
  document.getElementById('spm-confirm-btn').textContent=tr.confirmBtn;
  document.getElementById('spm-name-input').value='';
  document.getElementById('save-project-modal').classList.add('open');
  setTimeout(()=>document.getElementById('spm-name-input').focus(),80);
}
function closeSaveProjectModal(){
  document.getElementById('save-project-modal').classList.remove('open');
}
function onSaveProjectModalOverlayClick(e){
  if(e.target.id==='save-project-modal')closeSaveProjectModal();
}
function _captureMapThumbnail(){
  try{
    const src=map.getCanvas();
    const tmp=document.createElement('canvas');
    const scale=Math.min(320/src.width,180/src.height,1);
    tmp.width=Math.round(src.width*scale);
    tmp.height=Math.round(src.height*scale);
    tmp.getContext('2d').drawImage(src,0,0,tmp.width,tmp.height);
    return tmp.toDataURL('image/jpeg',0.45);
  }catch(e){return null;}
}

// ── Auto-save state ──────────────────────────────────────────────────────────
let _openedProjectId=null,_openedProjectName='',_autoSaveTimer=null,_autoSaveTickTimer=null,_lastSavedAt=null,_autoSaveBusy=false;

function _startAutoSave(id,name){
  _stopAutoSave();
  _openedProjectId=id;
  _openedProjectName=name||'Project';
  _lastSavedAt=Date.now();
  _updateAutoSaveChip('idle');
  document.getElementById('autosave-chip')?.classList.add('asc-visible');
  // Save every 15 seconds; tick relative time every 30s
  _autoSaveTimer=setInterval(_autoSaveProject,15000);
  _autoSaveTickTimer=setInterval(_tickAutoSaveTime,30000);
}

function _stopAutoSave(){
  clearInterval(_autoSaveTimer);clearInterval(_autoSaveTickTimer);
  _autoSaveTimer=null;_autoSaveTickTimer=null;
  _openedProjectId=null;_lastSavedAt=null;_autoSaveBusy=false;
  document.getElementById('autosave-chip')?.classList.remove('asc-visible');
}

function _updateAutoSaveChip(state){
  const dot=document.getElementById('asc-dot');
  const nameEl=document.getElementById('asc-name');
  const statusEl=document.getElementById('asc-status');
  if(!dot||!nameEl||!statusEl)return;
  nameEl.textContent=_openedProjectName;
  dot.classList.remove('asc-saving','asc-error');
  if(state==='saving'){dot.classList.add('asc-saving');statusEl.textContent='· Saving...';}
  else if(state==='error'){dot.classList.add('asc-error');statusEl.textContent='· Save failed';}
  else{statusEl.textContent='· Saved just now';}
}

function _tickAutoSaveTime(){
  if(!_openedProjectId||!_lastSavedAt||_autoSaveBusy)return;
  const statusEl=document.getElementById('asc-status');
  if(!statusEl)return;
  const mins=Math.round((Date.now()-_lastSavedAt)/60000);
  statusEl.textContent=mins<1?'· Saved just now':`· Saved ${mins}m ago`;
}

async function _autoSaveProject(){
  if(!_openedProjectId||_autoSaveBusy||!currentUser)return;
  _autoSaveBusy=true;
  _updateAutoSaveChip('saving');
  try{
    const thumbnail=_captureMapThumbnail();
    const state=_collectProjectState();
    const {error}=await sb.from('projects').update({
      thumbnail,
      map_state:state.map_state,
      selected_geom:state.selected_geom,
      selected_meta:state.selected_meta,
      imported_layers:state.imported_layers,
      analysis_snapshot:state.analysis_snapshot
    }).eq('id',_openedProjectId).eq('user_id',currentUser.id);
    if(error)throw error;
    _lastSavedAt=Date.now();
    _updateAutoSaveChip('idle');
  }catch(e){
    console.warn('[projects] auto-save failed:',e);
    _updateAutoSaveChip('error');
  }finally{
    _autoSaveBusy=false;
  }
}

// Build a replay-able action list from the current active analysis state.
// Called at save time — we inspect DOM toggles and data vars to know what the user ran.
function _buildActionLog(){
  const sw=id=>document.getElementById(id)?.classList.contains('on');
  const actions=[];
  // Walkability (free analysis) feature removed — no longer recorded at save time;
  // the isochrone itself is persisted via savedSnap.isoData.
  // Accessibility panel toggles (isochrone-dependent)
  if(sw('acc-iso-sw'))actions.push({fn:'toggleAccIsochrone'});
  if(_schoolsLayerActive)actions.push({fn:'toggleAccSchools'});
  if(_kgLayerActive)actions.push({fn:'toggleAccKindergartens'});
  if(sw('acc-mob-sw'))actions.push({fn:'toggleAccMobility'});
  if(sw('acc-transit-sw'))actions.push({fn:'toggleAccTransit'});
  // History mode state (restored after transit re-opens on replay)
  if(sw('acc-transit-sw')&&_ttcMode==='history')actions.push({fn:'_histRestore',args:[_histDays,_histBand,_histDaytype]});
  if(sw('acc-parking-sw'))actions.push({fn:'toggleAccParking'});
  // Climate (independent of isochrone — parcel only)
  if(_canopyOverlayCache)actions.push({fn:'toggleAccCanopy'});
  if(_lstOverlayCache)actions.push({fn:'toggleAccLST'});
  // Relief (independent)
  if(typeof _reliefActiveType!=='undefined'&&_reliefActiveType)actions.push({fn:'toggleAccRelief',args:[_reliefActiveType]});
  // Energy (independent)
  if(_solarOverlayCache)actions.push({fn:'runSolarAnalysis'});
  if(_windData)actions.push({fn:'runWindAnalysis'});
  // Morphology (independent)
  if(sw('acc-connectivity-sw'))actions.push({fn:'toggleAccConnectivity'});
  if(sw('acc-orientation-sw'))actions.push({fn:'toggleAccOrientation'});
  if(typeof _osmActive!=='undefined'&&_osmActive)actions.push({fn:'toggleAccOSM'});
  // Which panel was open (shown last after content is ready)
  if(_activeCatKey)actions.push({fn:'showCatInPanel',args:[_activeCatKey]});
  return actions;
}

// Replay a saved action log after project load.
// Phase 1: await walkability (sets _isoData), then fire all others in parallel, then open panel.
async function _replayActions(actions,savedSnap){
  try{
    // Restore accessibility settings so isochrone uses the right mode/time
    if(savedSnap.accMode&&typeof _accMode!=='undefined')_accMode=savedSnap.accMode;
    if(savedSnap.accMinutes&&typeof _accMinutes!=='undefined')_accMinutes=savedSnap.accMinutes;
    // Init panel DOM structure
    if(typeof setupProCard==='function')setupProCard(false);
    // Walkability (free analysis) feature removed — old projects may still carry
    // an onAnalyseClick action; restore the saved isochrone directly instead of
    // re-running the analysis (accessibility analyses only need _isoData).
    if(savedSnap.isoData){
      _isoData=savedSnap.isoData;
      if(mapReady)map.getSource('isochrone')?.setData(_isoData);
    }
    // Wait for any camera animation from runAnalysis (fitBounds 800ms) to finish before
    // adding raster overlays — Mapbox defers image-source renders during camera movement
    if(mapReady&&map.isMoving())await new Promise(r=>map.once('idle',r));
    // Phase 2: fire all other analyses in parallel (schools/KG now have _isoData from phase 1)
    const phase2=actions.filter(a=>a.fn!=='onAnalyseClick'&&a.fn!=='showCatInPanel');
    await Promise.allSettled(phase2.map(async action=>{
      try{
        // showCatInPanel needs the panel button element — handled in phase 3
        if(action.fn==='showCatInPanel')return;
        const fn=window[action.fn];
        if(typeof fn!=='function')return;
        const result=fn(...(action.args||[]));
        if(result instanceof Promise)await result;
      }catch(e){}
    }));
    // Force Mapbox to flush all pending layer/source additions to the canvas
    if(mapReady&&typeof map.triggerRepaint==='function')map.triggerRepaint();
    // Phase 3: open the category panel (content is now populated by phase 2)
    const panelAction=actions.find(a=>a.fn==='showCatInPanel');
    if(panelAction){
      await new Promise(r=>setTimeout(r,400));
      const catKey=(panelAction.args||[])[0];
      const catBtn=document.getElementById('cat-btn-'+catKey);
      if(catBtn&&typeof showCatInPanel==='function')showCatInPanel(catKey,catBtn);
    }
  }catch(e){console.error('[projects] replay:',e);}
}

function _restoreBuildings(savedBuildings, activeBldId){
  if(!savedBuildings||!savedBuildings.length)return;
  // Clean up any existing buildings without triggering camera/panel side-effects
  _buildings.forEach(b=>{
    if(!mapReady)return;
    if(b.threeEditor){try{map.removeLayer(b.threeEditor.id);}catch(_){}try{b.threeEditor.dispose();}catch(_){}b.threeEditor=null;}
    if(b._extClickHandler){try{map.off('click','bld-ext-'+b.id,b._extClickHandler);}catch(_){}b._extClickHandler=null;}
    try{if(map.getLayer('bld-ext-'+b.id))map.removeLayer('bld-ext-'+b.id);}catch(_){}
    try{if(map.getLayer('bld-line-'+b.id))map.removeLayer('bld-line-'+b.id);}catch(_){}
    try{if(map.getLayer('bld-fill-'+b.id))map.removeLayer('bld-fill-'+b.id);}catch(_){}
    try{if(map.getSource('bld-src-'+b.id))map.removeSource('bld-src-'+b.id);}catch(_){}
  });
  _buildings=[];_activeBldId=null;_selectedBldIds.clear();_threeEditor=null;
  _extrusionActive=false;_extrusionHeight=12;_floorOverrides={};
  // Reconstruct each building
  for(const sb of savedBuildings){
    const bld={id:sb.id,geojson:sb.geojson,ring:sb.ring,drawShape:sb.drawShape||'polygon',
      areaM2:sb.areaM2||0,perimM:sb.perimM||0,areaStr:sb.areaStr||'',perimStr:sb.perimStr||'',
      extrusionActive:sb.extrusionActive||false,extrusionHeight:sb.extrusionHeight||12,
      floorOverrides:sb.floorOverrides||{},threeEditor:null};
    _buildings.push(bld);
    // Keep the sequence counter above any restored ids so new buildings don't collide
    const n=parseInt(sb.id.replace('bld_',''),10);
    if(!isNaN(n)&&n>_bldSeq)_bldSeq=n;
    if(!mapReady)continue;
    try{
      map.addSource('bld-src-'+bld.id,{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',geometry:bld.geojson,properties:{}}]}});
      map.addLayer({id:'bld-fill-'+bld.id,type:'fill',source:'bld-src-'+bld.id,paint:{'fill-color':'#6366f1','fill-opacity':0.35}});
      map.addLayer({id:'bld-line-'+bld.id,type:'line',source:'bld-src-'+bld.id,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#a5b4fc','line-width':2}});
      map.on('click','bld-fill-'+bld.id,e=>{e.originalEvent._bldHandled=true;_selectBuilding(bld.id,e.originalEvent.shiftKey);});
      map.on('mouseenter','bld-fill-'+bld.id,()=>{if(map.getCanvas())map.getCanvas().style.cursor='pointer';});
      map.on('mouseleave','bld-fill-'+bld.id,()=>{if(map.getCanvas())map.getCanvas().style.cursor='';});
      map.on('dblclick','bld-fill-'+bld.id,e=>{e.originalEvent.stopPropagation();map.doubleClickZoom.disable();setTimeout(()=>map.doubleClickZoom.enable(),400);_enterBldEditMode(bld.id);});
    }catch(e){console.warn('[projects] restore bld layers:',e);}
  }
  const targetId=activeBldId&&_bldById(activeBldId)?activeBldId:(_buildings.length?_buildings[_buildings.length-1].id:null);
  if(!targetId)return;
  const extrudedNonActive=_buildings.filter(b=>b.extrusionActive&&b.id!==targetId);
  if(extrudedNonActive.length||_bldById(targetId)?.extrusionActive){
    // Load Three.js if any building needs the 3D editor
    _ensureThreeJs(()=>{
      // Create frozen (non-interactive) editors for background extruded buildings
      for(const bld of extrudedNonActive){
        try{
          const ed=new _BuildingEditorLayer(bld.id);
          map.addLayer(ed);bld.threeEditor=ed;
          ed._deactivateListeners();
          // Hide 2D footprint since Three.js takes over visually
          try{map.setLayoutProperty('bld-fill-'+bld.id,'visibility','none');}catch(_){}
          try{map.setLayoutProperty('bld-line-'+bld.id,'visibility','none');}catch(_){}
        }catch(e){console.warn('[projects] restore frozen editor:',e);}
      }
      _activateBld(targetId);
    });
  } else {
    _activateBld(targetId);
  }
}

function _collectProjectState(){
  const getT=id=>document.getElementById(id)?.textContent||'';
  return {
    map_state:{center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),basemap:_currentBasemap},
    selected_geom:_currentParcelGeoJSON||null,
    selected_meta:{code:getT('val-code'),area:getT('val-area'),type:getT('val-type'),addr:getT('val-addr'),owner:getT('val-owner'),centroid:parcelCentroid||null},
    imported_layers:_importedLayers.map(l=>({uid:l.uid,name:l.name,color:l.color,visible:l.visible,count:l.count,geomTypes:l.geomTypes||[],vizActive:l.vizActive||false,vizState:_vizState[l.uid]||null,fc:l.fc})),
    analysis_snapshot:(()=>{
      const resultsHtml={};
      // Main floating cards (score ring, wind)
      ['score-card','wind-card'].forEach(id=>{
        const el=document.getElementById(id);
        if(el&&el.style.display!=='none'&&el.textContent.trim())
          resultsHtml[id]={html:el.innerHTML,display:el.style.display||'block'};
      });
      // All analysis category panels in the side panel
      ['accessibility','education','mobility','climate','morphology','energy','relief'].forEach(cat=>{
        const el=document.getElementById('pro-cat-'+cat+'-content');
        if(el&&el.textContent.trim())resultsHtml['pro-cat-'+cat+'-content']={html:el.innerHTML};
      });
      // Float card extras: zoning, K-values, building parameters
      ['pfc-zone-row','pfc-kvals-row','pfc-build-params-row'].forEach(id=>{
        const el=document.getElementById(id);
        if(el&&el.style.display!=='none'&&el.textContent.trim())
          resultsHtml[id]={html:el.innerHTML,display:el.style.display||'block'};
      });
      const snap={
        parcelAreaM2:_currentParcelAreaM2||null,
        activeCatKey:_activeCatKey||null,
        resultsHtml
      };
      // Walkability — saved explicitly so score ring can be re-rendered without a network call
      if(_walkData)snap.walkData={score:_walkData.score,counts:{..._walkData.counts}};
      // Isochrone polygon — GeoJSON, restored directly onto the map source
      if(_isoData)try{snap.isoData=JSON.parse(JSON.stringify(_isoData));}catch(e){}
      // Climate analysis data
      if(_climateData)try{snap.climateData=JSON.parse(JSON.stringify(_climateData));}catch(e){}
      if(_canopyPct!=null)snap.canopyPct=_canopyPct;
      if(_lstMean!=null)snap.lstMean=_lstMean;
      // Education (schools/kindergartens)
      if(_proData)try{snap.proData=JSON.parse(JSON.stringify(_proData));}catch(e){}
      // Wind
      if(_windData)try{snap.windData=JSON.parse(JSON.stringify(_windData));}catch(e){}
      // Accessibility mode/time settings (needed to replay the correct isochrone)
      snap.accMode=typeof _accMode!=='undefined'?_accMode:'walking';
      snap.accMinutes=typeof _accMinutes!=='undefined'?_accMinutes:15;
      // Action log — derived from current toggle state so restore can replay the exact analyses
      snap.actions=_buildActionLog();
      // Flush active building's current global state (extrusionActive, height, floorOverrides)
      // into the _buildings array before reading it — toggleExtrusion never calls _saveBldState
      if(typeof _saveBldState==='function')_saveBldState();
      // 3D buildings drawn by the user (threeEditor is a live object — excluded)
      if(_buildings.length){
        snap.buildings=_buildings.map(b=>({
          id:b.id,geojson:b.geojson,ring:b.ring,drawShape:b.drawShape||'polygon',
          areaM2:b.areaM2,perimM:b.perimM,areaStr:b.areaStr,perimStr:b.perimStr,
          extrusionActive:b.extrusionActive||false,
          extrusionHeight:b.extrusionHeight||12,
          floorOverrides:b.floorOverrides||{}
        }));
        if(_activeBldId)snap.activeBldId=_activeBldId;
      }
      return snap;
    })()
  };
}
async function confirmSaveProject(){
  const name=document.getElementById('spm-name-input').value.trim();
  if(!name)return;
  const tr=t().projects;
  const btn=document.getElementById('spm-confirm-btn');
  btn.disabled=true;btn.textContent=tr.savingMsg;
  try{
    const thumbnail=_captureMapThumbnail();
    const state=_collectProjectState();
    const {error}=await sb.from('projects').insert({
      user_id:currentUser.id,name,thumbnail,
      map_state:state.map_state,
      selected_geom:state.selected_geom,
      selected_meta:state.selected_meta,
      imported_layers:state.imported_layers,
      analysis_snapshot:state.analysis_snapshot
    });
    if(error)throw error;
    closeSaveProjectModal();
    showToast(tr.savedToast);
    if(document.getElementById('projects-panel').classList.contains('open'))_loadProjectsList();
  }catch(err){
    console.error('[projects] save:',err);
    showToast(tr.errorSave+(err.message?': '+err.message:''));
  }finally{
    btn.disabled=false;btn.textContent=tr.confirmBtn;
  }
}
async function _loadProjectsList(){
  const listEl=document.getElementById('pp-list');
  const tr=t().projects;
  listEl.innerHTML=`<div class="pp-empty" style="opacity:0.5">${tr.loadingMsg}</div>`;
  try{
    const {data,error}=await sb.from('projects')
      .select('id,name,thumbnail,map_state,imported_layers,created_at')
      .eq('user_id',currentUser.id)
      .order('created_at',{ascending:false})
      .limit(50);
    if(error)throw error;
    if(!data||!data.length){listEl.innerHTML=`<div class="pp-empty">${tr.emptyMsg}</div>`;return;}
    listEl.innerHTML=data.map(p=>{
      const d=new Date(p.created_at);
      const ds=d.toLocaleDateString(lang==='ka'?'ka-GE':'en-US',{day:'numeric',month:'short',year:'numeric'});
      const lc=(p.imported_layers||[]).length;
      const meta=lc>0?`${lc} ${lc===1?tr.layers:tr.layersPlural}`:(p.map_state?.center?`${+(p.map_state.center.lat||0).toFixed(4)}, ${+(p.map_state.center.lng||0).toFixed(4)}`:'');
      const thumb=p.thumbnail
        ?`<img class="pp-thumb" src="${p.thumbnail}" alt="" loading="lazy">`
        :`<div class="pp-thumb-placeholder"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg></div>`;
      return `<div class="pp-project-card">${thumb}<div class="pp-card-body"><div class="pp-card-name">${p.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div><div class="pp-card-meta">${ds}${meta?' · '+meta:''}</div></div><div class="pp-card-footer"><button class="pp-load-btn" onclick="event.stopPropagation();loadProject('${p.id}')">${tr.openBtn}</button><button class="pp-del-btn" onclick="event.stopPropagation();deleteProject('${p.id}',this)" title="Delete"><img src="analysis-logos/delete.svg"></button></div></div>`;
    }).join('');
  }catch(err){
    console.error('[projects] list:',err);
    listEl.innerHTML=`<div class="pp-empty" style="color:rgba(239,68,68,0.7)">${tr.errorLoad}</div>`;
  }
}
async function deleteProject(id,btn){
  if(!confirm(t().projects.deleteConfirm))return;
  if(btn)btn.disabled=true;
  const {error}=await sb.from('projects').delete().eq('id',id).eq('user_id',currentUser.id);
  if(error){showToast(t().projects.errorDelete);if(btn)btn.disabled=false;return;}
  showToast(t().projects.deletedToast);
  _loadProjectsList();
}
async function loadProject(id){
  const tr=t().projects;
  showToast(tr.loadingMsg);
  try{
    const {data,error}=await sb.from('projects').select('*').eq('id',id).eq('user_id',currentUser.id).single();
    if(error||!data)throw error||new Error('not found');
    closeProjectsPanel();
    await _restoreProjectState(data);
    showToast(tr.loadedToast);
    _startAutoSave(data.id,data.name);
  }catch(err){
    console.error('[projects] load:',err);
    showToast(tr.errorLoad);
  }
}
async function _restoreProjectState(project){
  const ms=project.map_state||{};
  // 1. Switch basemap if needed (wait for style load)
  if(ms.basemap&&ms.basemap!==_currentBasemap){
    switchBasemap(ms.basemap);
    await new Promise(r=>setTimeout(r,700));
  }
  // 2. Fly to saved viewport
  if(ms.center){
    map.flyTo({center:[ms.center.lng,ms.center.lat],zoom:ms.zoom||14,bearing:ms.bearing||0,pitch:ms.pitch||0,duration:1000});
  }
  // 3. Clear existing imported layers
  _importedLayers.slice().forEach(l=>removeImportedLayer(l.uid));
  // 4. Re-add imported layers with saved settings
  const savedLayers=project.imported_layers||[];
  for(const snap of savedLayers){
    if(!snap.fc)continue;
    _addImportedLayer(snap.name,snap.fc);
    const entry=_importedLayers[_importedLayers.length-1];
    if(!entry)continue;
    // Restore color
    if(snap.color&&snap.color!==entry.color){
      _setImportedLayerColor(entry.uid,snap.color);
      entry.color=snap.color;
    }
    // Restore visibility
    if(!snap.visible)toggleImportedLayer(entry.uid);
    // Restore viz state (re-apply paint if viz was active)
    if(snap.vizState){
      _vizState[entry.uid]=snap.vizState;
      if(snap.vizActive){
        entry.vizActive=true;
        const vs=snap.vizState;
        try{_applyImportedViz(entry.uid,vs.type,vs.col,vs.ramp);}catch(e){}
      }
    }
  }
  // 5. Restore selected feature / float card
  if(project.selected_geom&&project.selected_meta){
    const meta=project.selected_meta;
    const setT=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||'';};
    setT('val-code',meta.code);setT('val-area',meta.area);setT('val-type',meta.type);
    setT('val-addr',meta.addr);setT('val-owner',meta.owner);
    _currentParcelGeoJSON=project.selected_geom;
    _dbParcelGeoJSON=_currentParcelGeoJSON;
    _currentParcelAreaM2=project.analysis_snapshot?.parcelAreaM2||null;
    parcelCentroid=meta.centroid||ms.center||null;
    // Restore parcel outline on map
    if(mapReady&&_currentParcelGeoJSON){
      map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_currentParcelGeoJSON,properties:{}}]});
    }
    if(parcelCentroid){
      if(!hasSearched)transitionToSide(meta.code||'—');
      showParcelPopup(parcelCentroid);
    }
  }
  // 5.5 Restore drawn buildings / 3D extrusions
  // Deferred until flyTo completes — _activateBld calls map.easeTo({pitch:55}) which
  // would cancel the flyTo animation if run immediately, leaving the map at the wrong position.
  const savedSnap=project.analysis_snapshot||{};
  if((savedSnap.buildings||[]).length>0){
    const doRestoreBuildings=()=>_restoreBuildings(savedSnap.buildings,savedSnap.activeBldId||null);
    if(ms.center&&mapReady){map.once('moveend',doRestoreBuildings);}
    else{doRestoreBuildings();}
  }
  // 6. Restore analysis — deferred so showParcelPopup DOM side-effects settle first
  const savedActions=savedSnap.actions||[];
  if(savedActions.length>0){
    // New format: replay the exact sequence of analyses the user ran
    setTimeout(()=>_replayActions(savedActions,savedSnap),800);
  }else if(Object.keys(savedSnap.resultsHtml||{}).length>0||savedSnap.walkData||savedSnap.isoData){
    // Legacy fallback: projects saved before action log was added — restore via HTML injection
    setTimeout(()=>{
      try{
        if(savedSnap.walkData)_walkData=savedSnap.walkData;
        if(savedSnap.isoData){_isoData=savedSnap.isoData;if(mapReady)map.getSource('isochrone')?.setData(_isoData);}
        if(savedSnap.climateData)_climateData=savedSnap.climateData;
        if(savedSnap.canopyPct!=null)_canopyPct=savedSnap.canopyPct;
        if(savedSnap.lstMean!=null)_lstMean=savedSnap.lstMean;
        if(savedSnap.proData)_proData=savedSnap.proData;
        if(savedSnap.windData)_windData=savedSnap.windData;
        if(typeof setupProCard==='function')setupProCard(false);
        if(savedSnap.walkData?.counts&&typeof renderScore==='function')renderScore(savedSnap.walkData.counts);
        Object.entries(savedSnap.resultsHtml||{}).forEach(([id,data])=>{
          const el=document.getElementById(id);
          if(!el||!data?.html)return;
          el.innerHTML=data.html;
          if(data.display)el.style.display=data.display;
        });
        const savedCat=savedSnap.activeCatKey;
        if(savedCat){const catBtn=document.getElementById('cat-btn-'+savedCat);if(catBtn)showCatInPanel(savedCat,catBtn);}
      }catch(err){console.error('[projects] restore:',err);}
    },700);
  }
}
// Show/hide the Projects nav button based on login state (called after auth state changes)
function _updateProjectsNavBtn(){
  const btn=document.getElementById('nav-projects-btn');
  if(btn)btn.style.display=currentUser?'':'none';
  if(btn&&currentUser){
    const tip=document.getElementById('nav-tip-projects');
    if(tip)tip.textContent=t().projects.navTip;
  }
}

// ── Attribute analysis & data visualization ───────────────────────────────────
const _VIZ_RAMPS={
  blues:  {label:'Blues',  stops:['#c6dbef','#9ecae1','#6baed6','#3182bd','#08519c']},
  reds:   {label:'Reds',   stops:['#fcbba1','#fc9272','#fb6a4a','#de2d26','#a50f15']},
  greens: {label:'Greens', stops:['#c7e9c0','#a1d99b','#74c476','#31a354','#006d2c']},
  oranges:{label:'Oranges',stops:['#fdd0a2','#fdae6b','#fd8d3c','#e6550d','#a63603']},
  purples:{label:'Purples',stops:['#dadaeb','#bcbddc','#9e9ac8','#756bb1','#54278f']},
};
const _VIZ_CAT=['#818cf8','#34d399','#fb923c','#f472b6','#38bdf8','#facc15','#a78bfa','#4ade80','#f87171','#22d3ee'];
let _vizState={};

function _analyzeAttributes(features){
  const cols={};
  const keys=[...new Set(features.flatMap(f=>Object.keys(f.properties||{})))];
  for(const key of keys){
    const vals=features.map(f=>f.properties?.[key]).filter(v=>v!=null&&v!=='');
    if(!vals.length)continue;
    const nums=vals.map(v=>parseFloat(v)).filter(v=>isFinite(v));
    const unique=[...new Set(vals.map(v=>String(v)))];
    const isNum=nums.length/vals.length>0.8;
    const mn=isNum?Math.min(...nums):null;
    const mx=isNum?Math.max(...nums):null;
    const mean=isNum&&nums.length?(nums.reduce((a,b)=>a+b,0)/nums.length):null;
    let histogram=null;
    if(isNum&&nums.length>1){
      const BINS=12;const range=(mx-mn)||1;
      histogram=new Array(BINS).fill(0);
      nums.forEach(v=>{const b=Math.min(BINS-1,Math.floor((v-mn)/range*BINS));histogram[b]++;});
    }
    cols[key]={
      type:isNum?'numeric':unique.length<=15?'categorical':'text',
      min:mn,max:mx,mean,histogram,
      uniqueVals:unique.slice(0,20),
      uniqueCount:unique.length,
    };
  }
  return cols;
}

function _getImportGeomTypes(features){
  const types=new Set(features.map(f=>f.geometry?.type).filter(Boolean));
  return{
    hasPolygon:[...types].some(t=>t.includes('Polygon')),
    hasLine:[...types].some(t=>t.includes('Line')),
    hasPoint:[...types].some(t=>t.includes('Point')),
  };
}

function _getVizTypes(colType,geomTypes){
  const v=[];
  if(geomTypes.hasPolygon){
    if(colType==='numeric')v.push({id:'choropleth',label:'Choropleth'});
    if(colType==='categorical')v.push({id:'cat-fill',label:'Category Fill'});
  }
  if(geomTypes.hasPoint){
    if(colType==='numeric')v.push({id:'proportional',label:'Proportional Circles'});
    if(colType==='categorical')v.push({id:'cat-circle',label:'Category Colors'});
    v.push({id:'heatmap',label:'Heat Map'});
  }
  if(geomTypes.hasLine){
    if(colType==='numeric')v.push({id:'grad-line',label:'Graduated Width'});
    if(colType==='categorical')v.push({id:'cat-line',label:'Category Colors'});
  }
  return v;
}

function toggleLayerViz(uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return;
  entry.vizExpanded=!entry.vizExpanded;
  if(entry.vizExpanded&&!_vizState[uid]){
    const cols=entry.columns;
    const numCol=Object.entries(cols).find(([,v])=>v.type==='numeric')?.[0];
    const catCol=Object.entries(cols).find(([,v])=>v.type==='categorical')?.[0];
    const firstCol=numCol||catCol||Object.keys(cols)[0]||null;
    const colType=firstCol?cols[firstCol]?.type:null;
    const vizTypes=firstCol?_getVizTypes(colType,entry.geomTypes):[];
    _vizState[uid]={col:firstCol,vizType:vizTypes[0]?.id||null,scheme:'blues'};
  }
  _renderImportedLayersPanel();
}

function _buildVizPanel(uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return'';
  const colKeys=Object.keys(entry.columns);
  if(!colKeys.length)return`<div class="il-viz-wrap" style="font-size:0.65rem;color:rgba(255,255,255,0.25)">${lang==='ka'?'ატრიბუტები არ მოიძებნა':'No attributes found in this layer.'}</div>`;
  const state=_vizState[uid]||{};
  const colType=state.col?entry.columns[state.col]?.type:null;
  const vizTypes=colType?_getVizTypes(colType,entry.geomTypes):[];
  const needsScheme=state.vizType&&['choropleth','proportional','grad-line'].includes(state.vizType);

  const colOptions=Object.entries(entry.columns).map(([k,v])=>
    `<option value="${k}" ${k===state.col?'selected':''}>${k} (${v.type})</option>`
  ).join('');

  const schemeHtml=Object.entries(_VIZ_RAMPS).map(([key,r])=>
    `<div class="il-scheme-opt ${state.scheme===key?'on':''}" data-scheme="${key}" onclick="_selectVizScheme('${uid}','${key}')" title="${r.label}">${r.stops.map(c=>`<div class="il-scheme-swatch" style="background:${c}"></div>`).join('')}</div>`
  ).join('');

  const pillsHtml=vizTypes.length
    ?vizTypes.map(v=>`<button class="il-viz-pill ${state.vizType===v.id?'on':''}" data-type="${v.id}" onclick="_selectVizType('${uid}','${v.id}')">${v.label}</button>`).join('')
    :`<span style="font-size:0.61rem;color:rgba(255,255,255,0.22)">${lang==='ka'?'ამ სვეტისთვის ვიზ. ხელმიუწვდომელია':'No visualization for this column type'}</span>`;

  return`<div class="il-viz-wrap">
    <div class="il-viz-sub">${lang==='ka'?'სვეტი':'Column'}</div>
    <select class="il-viz-select" id="ilviz-col-${uid}" onchange="_onVizColChange('${uid}')">${colOptions}</select>
    <div id="ilviz-types-${uid}">
      <div class="il-viz-sub">${lang==='ka'?'ვიზუალიზაცია':'Visualization'}</div>
      <div class="il-viz-pills">${pillsHtml}</div>
    </div>
    <div id="ilviz-scheme-${uid}" ${needsScheme?'':'style="display:none"'}>
      <div class="il-viz-sub">${lang==='ka'?'ფერის სქემა':'Color Ramp'}</div>
      <div class="il-scheme-row">${schemeHtml}</div>
    </div>
    <button class="il-viz-apply" onclick="applyLayerViz('${uid}')">${lang==='ka'?'გამოყენება':'Apply'}</button>
    <button class="il-viz-reset" onclick="resetLayerViz('${uid}')">${lang==='ka'?'გადაყენება':'Reset to default'}</button>
  </div>`;
}

function _onVizColChange(uid){
  const sel=document.getElementById(`ilviz-col-${uid}`);
  if(!sel)return;
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry||!_vizState[uid])return;
  _vizState[uid].col=sel.value;
  const colType=entry.columns[sel.value]?.type;
  const vizTypes=_getVizTypes(colType,entry.geomTypes);
  _vizState[uid].vizType=vizTypes[0]?.id||null;
  // Re-render just the types + scheme area
  const typesEl=document.getElementById(`ilviz-types-${uid}`);
  const schemeEl=document.getElementById(`ilviz-scheme-${uid}`);
  if(typesEl){
    const pillsHtml=vizTypes.length
      ?vizTypes.map(v=>`<button class="il-viz-pill ${_vizState[uid].vizType===v.id?'on':''}" data-type="${v.id}" onclick="_selectVizType('${uid}','${v.id}')">${v.label}</button>`).join('')
      :`<span style="font-size:0.61rem;color:rgba(255,255,255,0.22)">No visualization for this column type</span>`;
    typesEl.innerHTML=`<div class="il-viz-sub">Visualization</div><div class="il-viz-pills">${pillsHtml}</div>`;
  }
  const needsScheme=_vizState[uid].vizType&&['choropleth','proportional','grad-line'].includes(_vizState[uid].vizType);
  if(schemeEl)schemeEl.style.display=needsScheme?'':'none';
}

function _selectVizType(uid,type){
  if(!_vizState[uid])return;
  _vizState[uid].vizType=type;
  document.querySelectorAll(`#ilviz-types-${uid} .il-viz-pill`).forEach(p=>p.classList.toggle('on',p.dataset.type===type));
  const needsScheme=['choropleth','proportional','grad-line'].includes(type);
  const schemeEl=document.getElementById(`ilviz-scheme-${uid}`);
  if(schemeEl)schemeEl.style.display=needsScheme?'':'none';
}

function _selectVizScheme(uid,scheme){
  if(!_vizState[uid])return;
  _vizState[uid].scheme=scheme;
  document.querySelectorAll(`#ilviz-scheme-${uid} .il-scheme-opt`).forEach(o=>o.classList.toggle('on',o.dataset.scheme===scheme));
}

function applyLayerViz(uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  const state=_vizState[uid];
  if(!entry||!state?.col||!state?.vizType)return;
  const col=state.col;
  const info=entry.columns[col];
  const ramp=(_VIZ_RAMPS[state.scheme]||_VIZ_RAMPS.blues).stops;
  const fillId=`import-${uid}-fill`,lineId=`import-${uid}-line`,circleId=`import-${uid}-circle`;

  const numExpr=(min,max)=>{
    const step=(max-min)/4||1;
    return['interpolate',['linear'],['to-number',['get',col]],
      min,ramp[0], min+step,ramp[1], min+step*2,ramp[2], min+step*3,ramp[3], max,ramp[4]];
  };
  const catExpr=(col,fallback)=>['match',['get',col],...info.uniqueVals.flatMap((v,i)=>[v,_VIZ_CAT[i%_VIZ_CAT.length]]),fallback||'#888'];

  try{
    if(state.vizType==='choropleth'&&map.getLayer(fillId)){
      map.setPaintProperty(fillId,'fill-color',numExpr(info.min,info.max));
      map.setPaintProperty(fillId,'fill-opacity',0.75);
      map.setPaintProperty(lineId,'line-color','rgba(0,0,0,0.25)');
      map.setPaintProperty(lineId,'line-width',0.5);
    } else if(state.vizType==='cat-fill'&&map.getLayer(fillId)){
      map.setPaintProperty(fillId,'fill-color',catExpr(col));
      map.setPaintProperty(fillId,'fill-opacity',0.65);
    } else if(state.vizType==='proportional'&&map.getLayer(circleId)){
      map.setPaintProperty(circleId,'circle-radius',['interpolate',['linear'],['to-number',['get',col]],info.min,4,info.max,22]);
      map.setPaintProperty(circleId,'circle-color',entry.color);
    } else if(state.vizType==='cat-circle'&&map.getLayer(circleId)){
      map.setPaintProperty(circleId,'circle-color',catExpr(col,'#888'));
      map.setPaintProperty(circleId,'circle-radius',6);
    } else if(state.vizType==='grad-line'&&map.getLayer(lineId)){
      map.setPaintProperty(lineId,'line-width',['interpolate',['linear'],['to-number',['get',col]],info.min,1,info.max,8]);
    } else if(state.vizType==='cat-line'&&map.getLayer(lineId)){
      map.setPaintProperty(lineId,'line-color',catExpr(col,entry.color));
    } else if(state.vizType==='heatmap'){
      const heatId=`import-${uid}-heat`;
      if(!map.getLayer(heatId)){
        const wExpr=info?.type==='numeric'&&info.max>info.min
          ?['interpolate',['linear'],['to-number',['get',col]],info.min,0,info.max,1]:1;
        map.addLayer({id:heatId,type:'heatmap',source:`import-${uid}-src`,
          filter:['in',['geometry-type'],['literal',['Point','MultiPoint']]],
          paint:{'heatmap-weight':wExpr,'heatmap-intensity':['interpolate',['linear'],['zoom'],8,0.6,15,2.5],
            'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,255,0)',0.2,'rgba(0,200,255,0.7)',0.5,'rgba(0,220,100,0.9)',0.8,'rgba(255,165,0,0.95)',1,'rgba(255,40,40,1)'],
            'heatmap-radius':['interpolate',['linear'],['zoom'],8,18,14,30],'heatmap-opacity':0.82}});
      } else {
        map.setLayoutProperty(heatId,'visibility','visible');
      }
      try{map.setLayoutProperty(circleId,'visibility','none');}catch(_){}
    }
    entry.vizActive=true;
    showToast(lang==='ka'?'ვიზუალიზაცია გამოყენებულია':'Visualization applied',2500);
  }catch(e){
    console.error('[viz]',e);
    showToast('Visualization error: '+e.message,3500);
  }
}

function resetLayerViz(uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return;
  const fillId=`import-${uid}-fill`,lineId=`import-${uid}-line`,circleId=`import-${uid}-circle`;
  if(map.getLayer(fillId)){map.setPaintProperty(fillId,'fill-color',entry.color);map.setPaintProperty(fillId,'fill-opacity',0.18);}
  if(map.getLayer(lineId)){map.setPaintProperty(lineId,'line-color',entry.color);map.setPaintProperty(lineId,'line-width',1.8);map.setPaintProperty(lineId,'line-opacity',0.9);}
  if(map.getLayer(circleId)){map.setLayoutProperty(circleId,'visibility','visible');map.setPaintProperty(circleId,'circle-color',entry.color);map.setPaintProperty(circleId,'circle-radius',5);}
  try{if(map.getLayer(`import-${uid}-heat`))map.setLayoutProperty(`import-${uid}-heat`,'visibility','none');}catch(_){}
  entry.vizActive=false;
  showToast(lang==='ka'?'ვიზუალიზაცია გადაყენდა':'Reset to default',2000);
}

// ── Data Explorer Panel ───────────────────────────────────────────────────────
let _dpUid=null,_dpTab='viz',_dpPage=0,_dpSortState={col:null,dir:'asc'},_dpSearch='',_dpSelRow=-1;
let _layerFilters={};

function openDataPanel(uid){
  const u=uid||_importedLayers[0]?.uid||null;
  if(!u){showToast('Import a data file first to open the Data Explorer.');return;}
  _dpUid=u;_dpPage=0;_dpSearch='';_dpSelRow=-1;
  _renderDP();
  document.getElementById('data-panel')?.classList.add('dp-open');
  document.getElementById('nav-data-btn')?.classList.add('active');
}
function closeDataPanel(){
  document.getElementById('data-panel')?.classList.remove('dp-open');
  document.getElementById('nav-data-btn')?.classList.remove('active');
}
function _updateDataNavBtn(){
  const btn=document.getElementById('nav-data-btn');
  if(btn)btn.style.display=_importedLayers.length?'':'none';
}
function _dpFmtNum(n){
  if(n==null)return'—';
  const v=+n;if(isNaN(v))return String(n);
  if(Math.abs(v)>=1000000)return(v/1000000).toFixed(1)+'M';
  if(Math.abs(v)>=1000)return Math.round(v).toLocaleString();
  if(Math.abs(v)>=10)return(+v.toFixed(1)).toLocaleString();
  return(+v.toFixed(2)).toLocaleString();
}
function _dpFmtCell(v){
  if(v===null||v===undefined)return'<span class="dp-null">—</span>';
  const s=String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return s.length>35?s.substring(0,33)+'…':s;
}
function _dpGetFilterCount(uid){return Object.values(_layerFilters[uid]||{}).filter(f=>f.enabled).length;}

function _renderDP(){
  const panel=document.getElementById('data-panel');if(!panel)return;
  const layer=_importedLayers.find(l=>l.uid===_dpUid);
  if(!layer){panel.innerHTML='<div class="dp-empty" style="margin:40px auto">No layer selected</div>';return;}
  const fc=_dpGetFilterCount(_dpUid);
  const layerPicker=_importedLayers.length>1
    ?`<div class="dp-layer-row"><select class="dp-layer-sel" onchange="openDataPanel(this.value)">${_importedLayers.map(l=>`<option value="${l.uid}"${l.uid===_dpUid?' selected':''}>${l.name.replace(/</g,'&lt;')} (${l.count.toLocaleString()})</option>`).join('')}</select></div>`
    :`<div class="dp-layer-name">${layer.name.replace(/</g,'&lt;')}<span class="dp-feat-count">${layer.count.toLocaleString()} features</span></div>`;
  const tabs=['viz','table','filter'].map(t=>{
    const lbl=t==='viz'?'Visualize':t==='table'?'Table':('Filter'+(fc>0?` <span class="dp-flt-badge">${fc}</span>`:''));
    return`<button class="dp-tab${_dpTab===t?' active':''}" onclick="_dpTab='${t}';_dpPage=0;_renderDP()">${lbl}</button>`;
  }).join('');
  let body='';
  if(_dpTab==='viz')body=_dpRenderViz(layer);
  else if(_dpTab==='table')body=_dpRenderTable(layer);
  else body=_dpRenderFilters(layer);
  panel.innerHTML=`<div class="dp-header"><span class="dp-title">Data Explorer</span><button class="dp-close" onclick="closeDataPanel()">✕</button></div>${layerPicker}<div class="dp-tabs">${tabs}</div><div class="dp-body">${body}</div>`;
}

function _dpRenderViz(layer){
  const cols=Object.entries(layer.columns||{});
  if(!cols.length)return'<div class="dp-empty">No attributes found</div>';
  if(!_vizState[layer.uid]){
    const numCol=cols.find(([,c])=>c.type==='numeric')?.[0]||cols[0][0];
    _vizState[layer.uid]={col:numCol,vizType:null,scheme:'blues'};
  }
  const vs=_vizState[layer.uid];
  const selCol=vs.col||cols[0][0];
  const colInfo=layer.columns[selCol];
  const colOpts=cols.map(([k,c])=>`<option value="${k}"${k===selCol?' selected':''}>[${c.type==='numeric'?'#':c.type==='categorical'?'≡':'T'}] ${k.replace(/</g,'&lt;')}</option>`).join('');
  // Stats
  let statsHtml='';
  if(colInfo?.type==='numeric'&&colInfo.histogram){
    const maxBin=Math.max(...colInfo.histogram,1);
    const bins=colInfo.histogram.map(v=>`<div class="dp-bin" style="height:${Math.round(v/maxBin*28)+2}px" title="${v}"></div>`).join('');
    statsHtml=`<div class="dp-stats-row"><span>${_dpFmtNum(colInfo.min)}</span><div class="dp-histogram">${bins}</div><span>${_dpFmtNum(colInfo.max)}</span></div><div class="dp-stats-meta">mean ${_dpFmtNum(colInfo.mean)} · ${colInfo.uniqueCount.toLocaleString()} unique values</div>`;
  } else if(colInfo?.type==='categorical'){
    statsHtml=`<div class="dp-cat-tags">${(colInfo.uniqueVals||[]).slice(0,6).map(v=>`<span class="dp-cat-tag">${String(v).replace(/</g,'&lt;').substring(0,22)}</span>`).join('')}${colInfo.uniqueCount>6?`<span class="dp-cat-more">+${colInfo.uniqueCount-6}</span>`:''}</div>`;
  }
  // Viz types
  const vizTypes=_getVizTypes(colInfo?.type,layer.geomTypes);
  const selViz=vs.vizType||(vizTypes[0]?.id||null);
  if(!vs.vizType&&vizTypes.length)vs.vizType=vizTypes[0].id;
  const cards=vizTypes.map(vt=>`<div class="dp-viz-card${selViz===vt.id?' active':''}" onclick="_dpSelViz('${layer.uid}','${vt.id}')"><div class="dp-viz-icon">${_dpVizIcon(vt.id)}</div><div class="dp-viz-label">${vt.label}</div></div>`).join('');
  // Ramps
  const needsRamp=['choropleth','grad-line','proportional'].includes(selViz);
  const selScheme=vs.scheme||'blues';
  const rampHtml=needsRamp?`<div class="dp-section-label">Color scheme</div><div class="dp-ramps">${Object.entries(_VIZ_RAMPS).map(([k,r])=>`<div class="dp-ramp${selScheme===k?' active':''}" onclick="_dpSelScheme('${layer.uid}','${k}')" title="${r.label}">${r.stops.map(c=>`<span style="background:${c}"></span>`).join('')}</div>`).join('')}</div>`:'';
  const isActive=layer.vizActive;
  return`<div class="dp-section-label">Column</div><select class="dp-col-sel" onchange="_dpOnCol('${layer.uid}',this.value)">${colOpts}</select><div class="dp-stats-box">${statsHtml||'<span style="color:rgba(255,255,255,0.2);font-size:0.65rem">Text column — no statistics</span>'}</div><div class="dp-section-label">Visualization type</div><div class="dp-viz-grid">${cards||'<span style="color:rgba(255,255,255,0.22);font-size:0.65rem">No viz available for this column + geometry</span>'}</div>${rampHtml}<div class="dp-actions"><button class="dp-apply-btn" onclick="_dpApply('${layer.uid}')">Apply</button>${isActive?`<button class="dp-reset-btn" onclick="resetLayerViz('${layer.uid}');_renderDP()">Reset</button>`:''}</div>`;
}

function _dpOnCol(uid,col){
  if(!_vizState[uid])_vizState[uid]={scheme:'blues'};
  _vizState[uid].col=col;
  const layer=_importedLayers.find(l=>l.uid===uid);
  const colInfo=layer?.columns?.[col];
  const vizTypes=_getVizTypes(colInfo?.type,layer?.geomTypes||{});
  _vizState[uid].vizType=vizTypes[0]?.id||null;
  _renderDP();
}
function _dpSelViz(uid,type){
  if(!_vizState[uid])_vizState[uid]={scheme:'blues'};
  _vizState[uid].vizType=type;
  _renderDP();
}
function _dpSelScheme(uid,scheme){
  if(!_vizState[uid])_vizState[uid]={};
  _vizState[uid].scheme=scheme;
  _renderDP();
}
function _dpApply(uid){
  const vs=_vizState[uid];
  if(!vs?.col||!vs?.vizType){showToast('Pick a column and visualization type first');return;}
  applyLayerViz(uid);
  _renderDP();
}
function _dpVizIcon(type){
  const I={
    choropleth:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="#6366f1" opacity="0.25"/><rect x="9" y="1" width="6" height="6" rx="1" fill="#6366f1" opacity="0.55"/><rect x="1" y="9" width="6" height="6" rx="1" fill="#6366f1" opacity="0.8"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#6366f1"/></svg>',
    'cat-fill':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="#818cf8"/><rect x="9" y="1" width="6" height="6" rx="1" fill="#34d399"/><rect x="1" y="9" width="6" height="6" rx="1" fill="#fb923c"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#f472b6"/></svg>',
    proportional:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="12" r="2.5" fill="#6366f1" opacity="0.7"/><circle cx="12" cy="6" r="5" fill="#6366f1"/></svg>',
    'cat-circle':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="2.5" fill="#818cf8"/><circle cx="12" cy="5" r="2.5" fill="#34d399"/><circle cx="5" cy="12" r="2.5" fill="#fb923c"/><circle cx="12" cy="12" r="2.5" fill="#f472b6"/></svg>',
    'grad-line':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13 L14 3" stroke="#6366f1" stroke-width="1.5"/><path d="M2 14.5 L14 5.5" stroke="#6366f1" stroke-width="3"/></svg>',
    'cat-line':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="2" y1="5" x2="14" y2="5" stroke="#818cf8" stroke-width="2"/><line x1="2" y1="11" x2="14" y2="11" stroke="#34d399" stroke-width="2"/></svg>',
    heatmap:'<svg width="16" height="16" viewBox="0 0 16 16"><defs><radialGradient id="hg2"><stop offset="0%" stop-color="#ef4444"/><stop offset="55%" stop-color="#f97316"/><stop offset="100%" stop-color="#fde047" stop-opacity="0"/></radialGradient></defs><circle cx="8" cy="8" r="7" fill="url(#hg2)" opacity="0.85"/></svg>'
  };
  return I[type]||'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" fill="#6366f1" opacity="0.5"/></svg>';
}

function _dpRenderTable(layer){
  const features=layer.fc.features;
  const cols=Object.keys(layer.columns||{});
  if(!cols.length)return'<div class="dp-empty">No attributes found</div>';
  // Apply search
  let rows=features;
  if(_dpSearch){const q=_dpSearch.toLowerCase();rows=rows.filter(f=>Object.values(f.properties||{}).some(v=>String(v??'').toLowerCase().includes(q)));}
  // Apply active filters
  const af=Object.entries(_layerFilters[layer.uid]||{}).filter(([,f])=>f.enabled);
  if(af.length){rows=rows.filter(f=>af.every(([col,fi])=>{
    const v=f.properties?.[col];
    if(fi.min!=null){const n=+v;return!isNaN(n)&&n>=fi.min&&n<=fi.max;}
    if(fi.vals)return fi.vals.includes(String(v??''));
    return true;
  }));}
  // Sort
  if(_dpSortState.col){const {col,dir}=_dpSortState;rows=[...rows].sort((a,b)=>{const av=a.properties?.[col]??'',bv=b.properties?.[col]??'';const an=+av,bn=+bv;if(!isNaN(an)&&!isNaN(bn))return dir==='asc'?an-bn:bn-an;return dir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));});}
  const total=rows.length;const PAGE=50;const pages=Math.max(1,Math.ceil(total/PAGE));const page=Math.min(_dpPage,pages-1);
  const slice=rows.slice(page*PAGE,(page+1)*PAGE);
  const MAXC=7;const visCols=cols.slice(0,MAXC);
  const ths=visCols.map(c=>{const s=_dpSortState.col===c;return`<th onclick="_dpSortBy('${c}')" class="${s?'sorted':''}">${c.replace(/</g,'&lt;')}${s?(_dpSortState.dir==='asc'?' ↑':' ↓'):''}</th>`;}).join('');
  const trs=slice.map((f,i)=>{const idx=page*PAGE+i;const tds=visCols.map(c=>`<td>${_dpFmtCell(f.properties?.[c])}</td>`).join('');return`<tr class="${_dpSelRow===idx?'dp-row-sel':''}" onclick="_dpClickRow('${layer.uid}',${idx})">${tds}</tr>`;}).join('');
  const pager=pages>1?`<div class="dp-pager"><button ${page===0?'disabled':''} onclick="_dpPage=${page-1};_renderDP()">‹ Prev</button><span>${page+1} / ${pages}</span><button ${page>=pages-1?'disabled':''} onclick="_dpPage=${page+1};_renderDP()">Next ›</button></div>`:'';
  return`<div class="dp-search-row"><input class="dp-search" placeholder="Search…" value="${_dpSearch.replace(/"/g,'&quot;')}" oninput="_dpSearch=this.value;_dpPage=0;_renderDP()"><span class="dp-tbl-count">${total.toLocaleString()} / ${features.length.toLocaleString()}</span></div><div class="dp-table-wrap"><table class="dp-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>${pager}`;
}

function _dpSortBy(col){_dpSortState.dir=_dpSortState.col===col?(_dpSortState.dir==='asc'?'desc':'asc'):'asc';_dpSortState.col=col;_dpPage=0;_renderDP();}

function _dpClickRow(uid,idx){
  _dpSelRow=idx;
  const layer=_importedLayers.find(l=>l.uid===uid);if(!layer)return;
  const features=layer.fc.features;const f=features[idx];if(!f)return;
  _selectImportedFeature(f,uid);
  if(f.geometry){
    const cs=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.type==='MultiPoint'?f.geometry.coordinates:f.geometry.type==='LineString'?f.geometry.coordinates:f.geometry.type==='MultiLineString'?f.geometry.coordinates.flat():f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates.flat(2).flat():[];
    if(cs.length){const lngs=cs.map(c=>c[0]),lats=cs.map(c=>c[1]);map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:80,duration:600,maxZoom:16});}
  }
  _renderDP();
}

function _dpRenderFilters(layer){
  const cols=Object.entries(layer.columns||{});
  if(!cols.length)return'<div class="dp-empty">No attributes to filter</div>';
  const filters=_layerFilters[layer.uid]||{};
  let html='';
  cols.filter(([,c])=>c.type==='numeric').forEach(([col,c])=>{
    const f=filters[col]||{};const fMin=f.min??c.min??0;const fMax=f.max??c.max??1;const active=!!f.enabled;
    html+=`<div class="dp-filter-col${active?' dp-flt-active':''}"><div class="dp-flt-header"><span class="dp-flt-name">${col.replace(/</g,'&lt;')}</span><span class="dp-flt-type"># numeric</span>${active?`<button class="dp-flt-clear" onclick="_dpClearFilter('${layer.uid}','${col}')">✕</button>`:''}</div><div class="dp-range-wrap"><input type="range" class="dp-range dp-range-min" min="${c.min}" max="${c.max}" value="${fMin}" step="${((c.max-c.min)||1)/200}" oninput="_dpRangeMin('${layer.uid}','${col}',+this.value)"><input type="range" class="dp-range dp-range-max" min="${c.min}" max="${c.max}" value="${fMax}" step="${((c.max-c.min)||1)/200}" oninput="_dpRangeMax('${layer.uid}','${col}',+this.value)"></div><div class="dp-range-labels"><span data-flt="${layer.uid}-${col}-min">${_dpFmtNum(fMin)}</span><span data-flt="${layer.uid}-${col}-max">${_dpFmtNum(fMax)}</span></div></div>`;
  });
  cols.filter(([,c])=>c.type==='categorical').forEach(([col,c])=>{
    const f=filters[col]||{};const selVals=f.vals||(c.uniqueVals||[]).slice();const active=!!f.enabled;
    html+=`<div class="dp-filter-col${active?' dp-flt-active':''}"><div class="dp-flt-header"><span class="dp-flt-name">${col.replace(/</g,'&lt;')}</span><span class="dp-flt-type">≡ category</span>${active?`<button class="dp-flt-clear" onclick="_dpClearFilter('${layer.uid}','${col}')">✕</button>`:''}</div><div class="dp-cat-checks">${(c.uniqueVals||[]).slice(0,15).map(v=>`<label class="dp-check-row"><input type="checkbox" ${selVals.includes(String(v))?'checked':''} onchange="_dpToggleCat('${layer.uid}','${col}','${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',this.checked)"><span>${String(v).replace(/</g,'&lt;').substring(0,35)}</span></label>`).join('')}${c.uniqueCount>15?`<div class="dp-cat-more">…and ${c.uniqueCount-15} more</div>`:''}</div></div>`;
  });
  const fc=_dpGetFilterCount(layer.uid);
  if(fc)html+=`<button class="dp-reset-all-btn" onclick="_dpResetFilters('${layer.uid}')">Reset all ${fc} filter${fc>1?'s':''}</button>`;
  return html||'<div class="dp-empty">No numeric or categorical columns to filter</div>';
}

function _dpRangeMin(uid,col,val){
  if(!_layerFilters[uid])_layerFilters[uid]={};
  if(!_layerFilters[uid][col])_layerFilters[uid][col]={};
  const layer=_importedLayers.find(l=>l.uid===uid);
  const c=layer?.columns?.[col];
  const mx=_layerFilters[uid][col].max??c?.max??val;
  _layerFilters[uid][col].min=Math.min(+val,mx);_layerFilters[uid][col].enabled=true;
  _dpApplyFilters(uid);
  const lbl=document.querySelector(`[data-flt="${uid}-${col}-min"]`);if(lbl)lbl.textContent=_dpFmtNum(+val);
}
function _dpRangeMax(uid,col,val){
  if(!_layerFilters[uid])_layerFilters[uid]={};
  if(!_layerFilters[uid][col])_layerFilters[uid][col]={};
  const layer=_importedLayers.find(l=>l.uid===uid);
  const c=layer?.columns?.[col];
  const mn=_layerFilters[uid][col].min??c?.min??val;
  _layerFilters[uid][col].max=Math.max(+val,mn);_layerFilters[uid][col].enabled=true;
  _dpApplyFilters(uid);
  const lbl=document.querySelector(`[data-flt="${uid}-${col}-max"]`);if(lbl)lbl.textContent=_dpFmtNum(+val);
}
function _dpToggleCat(uid,col,val,checked){
  if(!_layerFilters[uid])_layerFilters[uid]={};
  const layer=_importedLayers.find(l=>l.uid===uid);
  const c=layer?.columns?.[col];
  if(!_layerFilters[uid][col])_layerFilters[uid][col]={vals:[...(c?.uniqueVals||[]).map(String)],enabled:false};
  const f=_layerFilters[uid][col];
  if(checked){if(!f.vals.includes(String(val)))f.vals.push(String(val));}
  else{f.vals=f.vals.filter(v=>v!==String(val));}
  f.enabled=f.vals.length<(c?.uniqueCount||Infinity);
  _dpApplyFilters(uid);
  const fc=_dpGetFilterCount(uid);
  const badge=document.querySelector('#data-panel .dp-tab:last-child .dp-flt-badge');
  if(fc>0){if(badge)badge.textContent=fc;else{const tb=document.querySelector('#data-panel .dp-tab:last-child');if(tb)tb.innerHTML=`Filter <span class="dp-flt-badge">${fc}</span>`;}}
  else{const tb=document.querySelector('#data-panel .dp-tab:last-child');if(tb)tb.textContent='Filter';}
}
function _dpClearFilter(uid,col){if(_layerFilters[uid]?.[col])_layerFilters[uid][col].enabled=false;_dpApplyFilters(uid);_renderDP();}
function _dpResetFilters(uid){_layerFilters[uid]={};_dpApplyFilters(uid);_renderDP();}
function _dpApplyFilters(uid){
  if(!mapReady)return;
  const filters=Object.entries(_layerFilters[uid]||{}).filter(([,f])=>f.enabled);
  let expr=null;
  if(filters.length){
    const conds=filters.map(([col,f])=>{
      if(f.min!=null)return['all',['>=',['to-number',['get',col]],f.min],['<=',['to-number',['get',col]],f.max]];
      if(f.vals)return['in',['get',col],['literal',f.vals]];
      return null;
    }).filter(Boolean);
    expr=conds.length===1?conds[0]:['all',...conds];
  }
  ['fill','line','circle','heat'].forEach(t=>{try{const id=`import-${uid}-${t}`;if(map.getLayer(id))map.setFilter(id,expr);}catch(_){}});
}

// ── Imported layer feature selection ─────────────────────────────────────────
function _initImportSelectionLayers(){
  if(!mapReady||map.getSource('import-sel-src'))return;
  map.addSource('import-sel-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'import-sel-fill',type:'fill',source:'import-sel-src',
    filter:['match',['geometry-type'],['Polygon','MultiPolygon'],true,false],
    paint:{'fill-color':'#fff','fill-opacity':0.07}
  });
  map.addLayer({id:'import-sel-line',type:'line',source:'import-sel-src',
    paint:{'line-color':'#fff','line-width':2.2,'line-opacity':0.85,'line-dasharray':[4,2.5]}
  });
  map.addLayer({id:'import-sel-circle',type:'circle',source:'import-sel-src',
    filter:['match',['geometry-type'],['Point','MultiPoint'],true,false],
    paint:{'circle-radius':12,'circle-color':'rgba(255,255,255,0)','circle-stroke-width':2.5,'circle-stroke-color':'#fff'}
  });
}

function _dimImportedLayers(active){
  _importedLayers.forEach(l=>{
    if(!l.visible)return;
    const fill=`import-${l.uid}-fill`,line=`import-${l.uid}-line`,circ=`import-${l.uid}-circle`;
    if(map.getLayer(fill))map.setPaintProperty(fill,'fill-opacity',active?0.04:0.18);
    if(map.getLayer(line))map.setPaintProperty(line,'line-opacity',active?0.18:0.9);
    if(map.getLayer(circ)){map.setPaintProperty(circ,'circle-opacity',active?0.18:0.9);map.setPaintProperty(circ,'circle-stroke-opacity',active?0.18:1);}
  });
}

function _selectImportedFeature(feature,uid){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return;
  _selectedImportUid=uid;
  _dimImportedLayers(true);
  _initImportSelectionLayers();
  map.getSource('import-sel-src')?.setData({type:'FeatureCollection',features:[feature]});

  const geom=feature.geometry;
  const isPolygon=geom.type==='Polygon'||geom.type==='MultiPolygon';
  const isLine=geom.type==='LineString'||geom.type==='MultiLineString';

  // Set globals used by analysis
  _currentParcelGeoJSON=isPolygon?geom:null;
  _dbParcelGeoJSON=_currentParcelGeoJSON;
  if(isPolygon){
    const ring=geom.type==='Polygon'?geom.coordinates[0]:geom.coordinates[0][0];
    _currentParcelAreaM2=ring?Math.round(computePolygonAreaM2(ring)):null;
  } else {_currentParcelAreaM2=null;}
  parcelCentroid=getCentroid(geom);

  // Display geometry on parcel source (outline)
  if(isPolygon||isLine){
    map.getSource('parcel')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:geom,properties:{}}]});
  }

  // Populate info fields (read by showParcelPopup)
  const tr=t();
  const props=feature.properties||{};
  const propKeys=Object.keys(props).filter(k=>props[k]!=null&&props[k]!=='');
  const nameKey=propKeys.find(k=>/^(name|title|id|fid|objectid|code|label|nom|nombre)$/i.test(k));
  const featureName=nameKey?String(props[nameKey]):entry.name;
  const geomLabel=isPolygon?(lang==='ka'?'პოლიგონი':'Polygon'):isLine?(lang==='ka'?'ხაზი':'Line'):(lang==='ka'?'წერტილი':'Point');
  const areaDisplay=isPolygon&&_currentParcelAreaM2?Number(_currentParcelAreaM2).toLocaleString()+' '+tr.sqm:geomLabel;
  const attrKeys=propKeys.filter(k=>k!==nameKey).slice(0,2);

  document.getElementById('val-code').textContent=featureName;
  document.getElementById('lbl-area').textContent=isPolygon?(tr.area||'Area'):(lang==='ka'?'გეომეტრია':'Geometry');
  document.getElementById('val-area').textContent=areaDisplay;
  document.getElementById('val-type').textContent=entry.name;
  document.getElementById('lbl-type').textContent=lang==='ka'?'ფენა':'Layer';
  document.getElementById('lbl-addr').textContent=attrKeys[0]||'—';
  document.getElementById('val-addr').textContent=attrKeys[0]?String(props[attrKeys[0]]):'—';
  document.getElementById('lbl-owner').textContent=attrKeys[1]||'—';
  document.getElementById('val-owner').textContent=attrKeys[1]?String(props[attrKeys[1]]):'—';
  ['val-type','val-addr','val-owner'].forEach(id=>{
    const row=document.getElementById(id)?.closest('.info-row');if(row)row.style.display='';
  });
  document.getElementById('row-line-ownership')?.style&&(document.getElementById('row-line-ownership').style.display='none');
  document.getElementById('row-line-extra')?.style&&(document.getElementById('row-line-extra').style.display='none');

  // Show float card
  transitionToSide(featureName);
  showParcelPopup(parcelCentroid);
  setupProCard(false);
  _updateMapInfoBadge();
  setStatus(lang==='ka'?`${entry.name} — არჩეულია`:`${entry.name} — selected`,'success');
}

function _clearImportedSelection(){
  _dimImportedLayers(false);
  _selectedImportUid=null;
  if(mapReady&&map.getSource('import-sel-src')){
    map.getSource('import-sel-src').setData({type:'FeatureCollection',features:[]});
  }
  if(mapReady&&map.getSource('parcel')){
    map.getSource('parcel').setData({type:'FeatureCollection',features:[]});
  }
  _currentParcelGeoJSON=null;_dbParcelGeoJSON=null;
  _currentParcelAreaM2=null;parcelCentroid=null;
  setStatus('','');
}

function _setImportedLayerColor(uid,color){
  const entry=_importedLayers.find(l=>l.uid===uid);
  if(!entry)return;
  entry.color=color;
  const fillId=`import-${uid}-fill`,lineId=`import-${uid}-line`,circleId=`import-${uid}-circle`;
  // Only update paint if viz hasn't overridden these layers
  if(!entry.vizActive){
    if(map.getLayer(fillId)){map.setPaintProperty(fillId,'fill-color',color);}
    if(map.getLayer(lineId)){map.setPaintProperty(lineId,'line-color',color);}
    if(map.getLayer(circleId)){map.setPaintProperty(circleId,'circle-color',color);}
  }
}

function _parseDxfToGeoJSON(text){
  if(window.DxfParser){
    try{
      const dxf=new DxfParser().parseSync(text);
      return _dxfEntitiesToGeoJSON(dxf.entities||[]);
    }catch(e){console.warn('[dxf] parser error',e);}
  }
  return {type:'FeatureCollection',features:[]};
}

function _dxfEntitiesToGeoJSON(entities){
  const features=[];
  for(const e of entities){
    let geom=null;
    try{
      if(e.type==='LINE'&&e.vertices?.length>=2){
        geom={type:'LineString',coordinates:[[e.vertices[0].x,e.vertices[0].y],[e.vertices[1].x,e.vertices[1].y]]};
      } else if((e.type==='LWPOLYLINE'||e.type==='POLYLINE')&&e.vertices?.length>=2){
        const coords=e.vertices.map(v=>[v.x,v.y]);
        if(e.shape){
          if(coords[0][0]!==coords[coords.length-1][0]||coords[0][1]!==coords[coords.length-1][1])coords.push([...coords[0]]);
          geom={type:'Polygon',coordinates:[coords]};
        } else {
          geom={type:'LineString',coordinates:coords};
        }
      } else if(e.type==='POINT'&&e.position){
        geom={type:'Point',coordinates:[e.position.x,e.position.y]};
      } else if(e.type==='CIRCLE'&&e.center){
        const n=64,cx=e.center.x,cy=e.center.y,r=e.radius;
        const pts=Array.from({length:n+1},(_,i)=>{const a=(i/n)*2*Math.PI;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];});
        geom={type:'Polygon',coordinates:[pts]};
      } else if(e.type==='SPLINE'&&e.controlPoints?.length>=2){
        geom={type:'LineString',coordinates:e.controlPoints.map(p=>[p.x,p.y])};
      }
    }catch(_){}
    if(geom)features.push({type:'Feature',geometry:geom,properties:{layer:e.layer||'0',entityType:e.type}});
  }
  return {type:'FeatureCollection',features};
}

function _parseCSVtoGeoJSON(text,filename){
  // Detect delimiter: whichever of , ; \t appears most in the first line
  const firstLine=text.slice(0,text.indexOf('\n')||500);
  const counts={',':(firstLine.match(/,/g)||[]).length,';':(firstLine.match(/;/g)||[]).length,'\t':(firstLine.match(/\t/g)||[]).length};
  const delim=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];

  // Minimal RFC-4180 parser — handles quoted fields
  function parseRow(line){
    const fields=[];let cur='';let inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
      else if(c===delim&&!inQ){fields.push(cur.trim());cur='';}
      else cur+=c;
    }
    fields.push(cur.trim());
    return fields;
  }

  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)throw new Error('CSV must have a header row and at least one data row');
  const headers=parseRow(lines[0]);

  // Auto-detect lat and lon column indices (case-insensitive, many naming conventions)
  const LAT_RE=/^(lat|latitude|y|lat_dd|ycoord|y_coord|northing|ylat|lat_wgs|wgs_lat|point_y|y_lat|geo_y|latitude_dd|decimallatitude)$/i;
  const LON_RE=/^(lon|long|longitude|lng|x|lon_dd|xcoord|x_coord|easting|xlon|x_lon|lng_wgs|wgs_lon|point_x|x_lon|geo_x|longitude_dd|decimallongitude)$/i;
  let latIdx=headers.findIndex(h=>LAT_RE.test(h.trim()));
  let lonIdx=headers.findIndex(h=>LON_RE.test(h.trim()));

  if(latIdx===-1||lonIdx===-1){
    // Fallback: look for partial matches (e.g. "latitude_wgs84")
    if(latIdx===-1)latIdx=headers.findIndex(h=>/lat/i.test(h));
    if(lonIdx===-1)lonIdx=headers.findIndex(h=>/lon|lng/i.test(h));
    // Last resort: if exactly two numeric-looking columns exist, try x/y positionally
    if(latIdx===-1||lonIdx===-1){
      const numCols=headers.map((h,i)=>({h,i})).filter(({h})=>/^[xy\d]/i.test(h));
      if(numCols.length===2){lonIdx=numCols[0].i;latIdx=numCols[1].i;}
    }
  }
  if(latIdx===-1||lonIdx===-1){
    const colList=headers.join(', ');
    throw new Error(`Could not find lat/lon columns. Found: ${colList}`);
  }

  const features=[];
  for(let i=1;i<lines.length;i++){
    const row=parseRow(lines[i]);
    const lat=parseFloat(row[latIdx]);
    const lon=parseFloat(row[lonIdx]);
    if(!isFinite(lat)||!isFinite(lon))continue;
    const props={};
    headers.forEach((h,j)=>{if(j!==latIdx&&j!==lonIdx)props[h]=row[j]??'';});
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:props});
  }
  if(!features.length)throw new Error(`No valid rows with numeric lat/lon found (lat="${headers[latIdx]}", lon="${headers[lonIdx]}")`);
  return {type:'FeatureCollection',features};
}

function _startShapeDrag(shape){
  let startLL=null;
  function onDown(e){
    startLL={lng:e.lngLat.lng,lat:e.lngLat.lat};
    map.dragPan.disable();
    function onMove(ev){
      if(!startLL)return;
      const geo=shape==='rectangle'?makeBBoxPoly(startLL,ev.lngLat):makeCirclePoly(startLL,ev.lngLat);
      map.getSource('draw-preview')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:geo,properties:{}}]});
    }
    function onUp(ev){
      map.off('mousemove',onMove);map.off('mouseup',onUp);
      map.dragPan.enable();
      map.getSource('draw-preview')?.setData({type:'FeatureCollection',features:[]});
      if(!startLL)return;
      const geo=shape==='rectangle'?makeBBoxPoly(startLL,ev.lngLat):makeCirclePoly(startLL,ev.lngLat);
      startLL=null;_shapeMouseHandlers=null;
      _polyDrawing=false;_drawShape='polygon';
      _clearDrawBtnActive();
      document.getElementById('draw-hint').style.display='none';
      try{_draw.deleteAll();}catch(_){}
      _draw.add({type:'Feature',geometry:geo,properties:{}});
      onDrawCreate();
    }
    map.on('mousemove',onMove);map.on('mouseup',onUp);
  }
  map.once('mousedown',onDown);
  _shapeMouseHandlers=function(){map.off('mousedown',onDown);startLL=null;};
}

function _checkSetbackViolation(drawnPoly){
  const warnEl=document.getElementById('pfc-setback-warn');
  const nodevEl=document.getElementById('pfc-nodev-warn');
  if(!warnEl)return;
  if(!_dbParcelGeoJSON||!document.getElementById('nav-zoning-btn')?.classList.contains('active')){
    warnEl.style.display='none';
    if(nodevEl)nodevEl.style.display='none';
    const ab=_activeBld();if(ab&&ab.violatesSetback){ab.violatesSetback=false;_updateBldHighlights();}
    return;
  }
  try{
    const drawnFeat={type:'Feature',geometry:drawnPoly,properties:{}};
    const parcelFeat={type:'Feature',geometry:_dbParcelGeoJSON,properties:{}};
    const inset=turf.buffer(parcelFeat,-3,{units:'meters'});
    const setbackViol=inset?!turf.booleanWithin(drawnFeat,inset):false;
    warnEl.style.display=setbackViol?'block':'none';
    let nodevViol=false;
    if(_noDevZoneUnion){try{nodevViol=turf.booleanIntersects(drawnFeat,_noDevZoneUnion);}catch(_){}}
    if(nodevEl)nodevEl.style.display=nodevViol?'block':'none';
    const anyViol=setbackViol||nodevViol;
    const ab=_activeBld();
    if(ab&&ab.violatesSetback!==anyViol){ab.violatesSetback=anyViol;_updateBldHighlights();}
  }catch(e){
    warnEl.style.display='none';
    if(nodevEl)nodevEl.style.display='none';
    const ab=_activeBld();if(ab&&ab.violatesSetback){ab.violatesSetback=false;_updateBldHighlights();}
  }
}

function _enterBldEditMode(id){
  if(_editingBldId)_exitBldEditMode(false);
  const bld=_bldById(id);if(!bld)return;
  _editingOrigGeom=JSON.parse(JSON.stringify(bld.geojson));
  try{map.setLayoutProperty('bld-fill-'+id,'visibility','none');}catch(_){}
  try{map.setLayoutProperty('bld-line-'+id,'visibility','none');}catch(_){}
  try{
    _draw.deleteAll();
    const ids=_draw.add({type:'Feature',id:'edit-bld-'+id,geometry:bld.geojson,properties:{}});
    _editingDrawId=ids[0];
    _editingBldId=id;
    _draw.changeMode('direct_select',{featureId:_editingDrawId});
  }catch(e){
    try{map.setLayoutProperty('bld-fill-'+id,'visibility','visible');}catch(_){}
    try{map.setLayoutProperty('bld-line-'+id,'visibility','visible');}catch(_){}
    _editingBldId=null;_editingDrawId=null;_editingOrigGeom=null;
  }
}
function _exitBldEditMode(commit){
  const id=_editingBldId;if(!id)return;
  _editingBldId=null;_editingDrawId=null;
  const bld=_bldById(id);
  if(bld&&!commit&&_editingOrigGeom){
    bld.geojson=_editingOrigGeom;
    const coords=_editingOrigGeom.type==='Polygon'?_editingOrigGeom.coordinates[0]:_editingOrigGeom.coordinates[0][0];
    bld.ring=coords;
    bld.areaM2=Math.round(computePolygonAreaM2(coords));
    if(mapReady)map.getSource('bld-src-'+id)?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:_editingOrigGeom,properties:{}}]});
  }
  _editingOrigGeom=null;
  try{_draw.deleteAll();_draw.changeMode('simple_select');}catch(_){}
  try{map.setLayoutProperty('bld-fill-'+id,'visibility','visible');}catch(_){}
  try{map.setLayoutProperty('bld-line-'+id,'visibility','visible');}catch(_){}
  _updateBldHighlights();
}
function _checkAreaViolation(bld){
  const warnEl=document.getElementById('pfc-area-warn');if(!warnEl)return;
  if(_maxFootprintM2==null||!bld){warnEl.style.display='none';return;}
  warnEl.style.display=(bld.areaM2>_maxFootprintM2)?'block':'none';
}

async function onDrawCreate(){
  const tr=t();
  const hint=document.getElementById("draw-hint");
  hint.style.display="none";
  _polyDrawing=false;_drawShape='polygon';
  _drawJustFinished=true;setTimeout(()=>{_drawJustFinished=false;},300);
  const _dab=document.getElementById('draw-area-btn');
  if(_extrusionActive){
    _drawMenuOpen=true;
    if(_dab){_dab.classList.remove('active');_dab.classList.add('open');}
    document.getElementById('draw-shape-popup')?.classList.add('open');
    setTimeout(()=>{document.addEventListener('click',_closeDrawMenuOutside,{capture:true});},0);
  } else {
    _drawMenuOpen=false;
    if(_dab){_dab.classList.remove('active','open');}
    document.getElementById('draw-shape-popup')?.classList.remove('open');
  }

  const data=_draw.getAll();
  if(!data.features.length)return;
  _drawnFeatureId=data.features[0].id??null;
  const poly=data.features[0].geometry;

  // Handle line drawing — compute elevation profile instead of area analysis
  if(poly.type==='LineString'){
    hint.style.display='none';
    if(_dab){_dab.classList.remove('active','open');}
    try{_draw.deleteAll();}catch(_){}
    map.once('idle',()=>_showLineElevProfile(poly.coordinates));
    return;
  }

  // Clear any previous analysis results before processing new polygon
  clearOverpassLayers();
  clearSyntaxLayers();
  clearOrientLayers();
  clearCanopyOverlay();
  clearLSTOverlay();
  clearReliefOverlay();
  const _lg1=document.getElementById("osm-legend");if(_lg1)_lg1.style.display="none";
  const _sl1=document.getElementById("syntax-legend");if(_sl1)_sl1.style.display="none";
  const _or1=document.getElementById("orient-rose");if(_or1)_or1.style.display="none";
  document.getElementById("acc-osm-sw")?.classList.remove("on");
  document.getElementById("acc-connectivity-sw")?.classList.remove("on");
  document.getElementById("acc-orientation-sw")?.classList.remove("on");
  _climateData=null;_canopyRawData=null;_lstRawData=null;

  // ── Register as a new building (adds its own map source + activates it) ──────
  _drawnAreaProps={};
  document.getElementById('parcel-float-card').style.display='none';
  _registerBuilding(poly);
  _checkSetbackViolation(poly);
  _checkAreaViolation(_activeBld());
  // Show side panel on first draw
  if(!hasSearched){hasSearched=true;document.getElementById("center-search").classList.add("hidden");document.getElementById("map-blur").classList.add("hidden");document.getElementById("side-panel").classList.add("visible");}
  // Fit map to new building
  {const _c=poly.type==="Polygon"?poly.coordinates[0]:poly.coordinates[0][0];
  if(mapReady){const _ln=_c.map(c=>c[0]),_la=_c.map(c=>c[1]);
  map.fitBounds([[Math.min(..._ln),Math.min(..._la)],[Math.max(..._ln),Math.max(..._la)]],{padding:80,duration:800,essential:true});}}
  document.getElementById("info-card").style.display="none";
  document.getElementById("owner-results-card").style.display="none";
  logFeatureUse("map_click").catch(()=>{});
  // Walkability (free analysis) feature removed — #analyse-btn stays hidden
  setupProCard();
  // OSM analysis moved to Urban Functions accordion

}

function computePolygonPerimeterM(coords){
  let p=0;
  for(let i=0;i<coords.length-1;i++){
    const cosLat=Math.cos(coords[i][1]*Math.PI/180);
    const dx=(coords[i+1][0]-coords[i][0])*111320*cosLat;
    const dy=(coords[i+1][1]-coords[i][1])*111320;
    p+=Math.sqrt(dx*dx+dy*dy);
  }
  return p;
}
function computePolygonAreaM2(coords){
  // Shoelace on geographic coords then scale by avg lat
  let area=0;
  for(let i=0,j=coords.length-1;i<coords.length;j=i++){
    area+=(coords[j][0]+coords[i][0])*(coords[j][1]-coords[i][1]);
  }
  const avgLat=coords.reduce((s,c)=>s+c[1],0)/coords.length;
  const metersPerDegLat=111320;
  const metersPerDegLon=111320*Math.cos(avgLat*Math.PI/180);
  return Math.abs(area/2)*metersPerDegLat*metersPerDegLon;
}


// ── OSM + SPACE SYNTAX ANALYSIS ──────────────────────────────────────────────
const OSM_CATS={
  food:     {label:'Food & Drink',color:'#f97316'},
  retail:   {label:'Retail',     color:'#ec4899'},
  education:{label:'Education',  color:'#6366f1'},
  health:   {label:'Health',     color:'#ef4444'},
  public:   {label:'Public Svc.',color:'#14b8a6'},
  leisure:  {label:'Leisure',    color:'#22c55e'},
  tourism:  {label:'Tourism',    color:'#eab308'},
  office:   {label:'Office',     color:'#a855f7'},
  other:    {label:'Other',      color:'rgba(255,255,255,0.3)'}
};
function _osmCat(tags){
  if(!tags)return null;
  const a=tags.amenity,s=tags.shop,o=tags.office,l=tags.leisure,t=tags.tourism;
  if(a){
    if(['restaurant','cafe','bar','fast_food','food_court','pub','biergarten','ice_cream'].includes(a))return'food';
    if(['school','university','college','kindergarten','library','language_school'].includes(a))return'education';
    if(['hospital','clinic','pharmacy','doctors','dentist','veterinary'].includes(a))return'health';
    if(['bank','post_office','police','fire_station','townhall','courthouse','embassy'].includes(a))return'public';
    if(['park','playground'].includes(a))return'leisure';
    return'other';
  }
  if(s)return'retail';if(o)return'office';if(l)return'leisure';if(t)return'tourism';
  return null;
}
let _osmActive=false,_syntaxActive=false;
function clearOverpassLayers(){
  if(!mapReady)return;
  ['overpass-labels','overpass-circles'].forEach(id=>{try{if(map.getLayer(id))map.removeLayer(id);}catch{}});
  try{if(map.getSource('overpass-pois'))map.removeSource('overpass-pois');}catch{}
  _osmActive=false;
}
function clearSyntaxLayers(){
  if(!mapReady)return;
  try{if(map.getLayer('syntax-line'))map.removeLayer('syntax-line');}catch{}
  try{if(map.getSource('syntax-streets'))map.removeSource('syntax-streets');}catch{}
  _syntaxActive=false;
}
function _segBearing(lng1,lat1,lng2,lat2){
  const φ1=lat1*Math.PI/180,φ2=lat2*Math.PI/180,Δλ=(lng2-lng1)*Math.PI/180;
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const b=(Math.atan2(y,x)*180/Math.PI+360)%360;
  return b>=180?b-180:b; // normalise to 0–180°
}
function _haversineM(lng1,lat1,lng2,lat2){
  const R=6371000,φ1=lat1*Math.PI/180,φ2=lat2*Math.PI/180;
  const Δφ=(lat2-lat1)*Math.PI/180,Δλ=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(Δφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function renderOrientRoseSVG(bins){
  // bins: 18 values for 0–180° (each bin = 10°), weighted by street length
  const cx=80,cy=80,maxR=56;
  const maxBin=Math.max(...bins,1);
  let svg='';
  [0.25,0.5,0.75,1].forEach(f=>{svg+=`<circle cx="${cx}" cy="${cy}" r="${(maxR*f).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;});
  svg+=`<line x1="${cx}" y1="${cy-maxR-6}" x2="${cx}" y2="${cy+maxR+6}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`;
  svg+=`<line x1="${cx-maxR-6}" y1="${cy}" x2="${cx+maxR+6}" y2="${cy}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`;
  const hw=8*Math.PI/180; // half-petal width
  for(let i=0;i<18;i++){
    const r=Math.max(3,(bins[i]/maxBin)*maxR);
    const hue=Math.round((i*10/180)*360);
    const col=`hsl(${hue},75%,60%)`;
    for(const dir of[i*10,i*10+180]){
      const rad=(dir-90)*Math.PI/180;
      const a1=rad-hw,a2=rad+hw;
      const x1=(cx+Math.cos(a1)*r).toFixed(2),y1=(cy+Math.sin(a1)*r).toFixed(2);
      const x2=(cx+Math.cos(a2)*r).toFixed(2),y2=(cy+Math.sin(a2)*r).toFixed(2);
      svg+=`<path d="M${cx},${cy} L${x1},${y1} A${r.toFixed(2)},${r.toFixed(2)} 0 0,1 ${x2},${y2} Z" fill="${col}" opacity="0.85"/>`;
    }
  }
  [['N',0],['E',90],['S',180],['W',270]].forEach(([lbl,deg])=>{
    const rad=(deg-90)*Math.PI/180;
    const lx=(cx+Math.cos(rad)*(maxR+11)).toFixed(1),ly=(cy+Math.sin(rad)*(maxR+11)+3).toFixed(1);
    svg+=`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="7.5" fill="rgba(255,255,255,0.35)" font-family="-apple-system,sans-serif">${lbl}</text>`;
  });
  return`<svg width="160" height="160" viewBox="0 0 160 160" style="overflow:visible">${svg}</svg>`;
}
let _orientActive=false;
function clearOrientLayers(){
  if(!mapReady)return;
  try{if(map.getLayer('orient-line'))map.removeLayer('orient-line');}catch{}
  try{if(map.getSource('orient-streets'))map.removeSource('orient-streets');}catch{}
  _orientActive=false;
}
async function runStreetOrientation(geoOverride){
  const btn=document.getElementById('btn-orient');
  const rose=document.getElementById('orient-rose');
  const _oGeo=geoOverride||_getMorphologyGeo();
  if(!_oGeo)return;
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner-sm" style="width:9px;height:9px;border-width:1.5px;vertical-align:middle"></span>';}
  try{
    const coords=_oGeo.type==='Polygon'?_oGeo.coordinates[0]:_oGeo.coordinates[0][0];
    const polyStr=coords.map(c=>`${c[1].toFixed(6)} ${c[0].toFixed(6)}`).join(' ');
    const query=`[out:json][timeout:30];way[highway~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|footway|path|service)$"](poly:"${polyStr}");out body geom;`;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const json=await res.json();
    const ways=json.elements||[];
    const bins=new Array(18).fill(0);
    const features=ways.reduce((acc,way)=>{
      if(!way.geometry||way.geometry.length<2)return acc;
      const g=way.geometry;
      // Accumulate length-weighted bearing bins from each sub-segment
      for(let i=0;i<g.length-1;i++){
        const b=_segBearing(g[i].lon,g[i].lat,g[i+1].lon,g[i+1].lat);
        const len=_haversineM(g[i].lon,g[i].lat,g[i+1].lon,g[i+1].lat);
        bins[Math.min(17,Math.floor(b/10))]+=len;
      }
      // Overall bearing for colour on map
      const overallB=_segBearing(g[0].lon,g[0].lat,g[g.length-1].lon,g[g.length-1].lat);
      acc.push({type:'Feature',geometry:{type:'LineString',coordinates:g.map(pt=>[pt.lon,pt.lat])},
        properties:{bearing:overallB,highway:way.tags?.highway||''}});
      return acc;
    },[]);
    const gj={type:'FeatureCollection',features};
    _orientGJ=gj;_orientBins=bins;_orientDom=null; // kept for morphology export
    if(!map.getSource('orient-streets'))map.addSource('orient-streets',{type:'geojson',data:gj});
    else map.getSource('orient-streets').setData(gj);
    if(!map.getLayer('orient-line')){
      map.addLayer({id:'orient-line',type:'line',source:'orient-streets',
        layout:{'line-join':'round','line-cap':'round'},
        paint:{
          'line-width':2,'line-opacity':0.92,
          'line-color':['interpolate',['linear'],['get','bearing'],
            0,'#4f9cf5',22.5,'#818cf8',45,'#c084fc',67.5,'#f472b6',
            90,'#fb923c',112.5,'#facc15',135,'#4ade80',157.5,'#22d3ee',180,'#4f9cf5']
        }},map.getLayer('parcel-fill')?'parcel-fill':undefined);
    }
    _orientActive=true;btn?.classList.add('active');
    if(btn){btn.disabled=false;btn.innerHTML='Orient';}
    const isKa=lang==='ka';
    // Dominant orientation
    const maxBinIdx=bins.indexOf(Math.max(...bins));
    const domDeg=maxBinIdx*10;
    const domLabel=domDeg<22.5||domDeg>=157.5?'N–S':domDeg<67.5?'NE–SW':domDeg<112.5?'E–W':'NW–SE';
    _orientDom=domLabel;
    rose.style.display='block';
    rose.innerHTML=`<div class="lu-section-title" style="margin-bottom:5px"><span>${isKa?'ქუჩის ორიენტაცია':'Street orientation'}</span><span style="color:rgba(255,255,255,0.35)">${domLabel}</span></div>
      <div style="display:flex;justify-content:center">${renderOrientRoseSVG(bins)}</div>`;
  }catch(e){
    console.error('Orient:',e);
    if(btn){btn.disabled=false;btn.innerHTML='Orient';}
  }
}

async function runOverpassAnalysis(){
  const btn=document.getElementById('btn-osm-analysis');
  const lg=document.getElementById('osm-legend');
  if(_osmActive){clearOverpassLayers();btn?.classList.remove('active');lg.style.display='none';return;}
  if(!_currentParcelGeoJSON)return;
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner-sm" style="width:9px;height:9px;border-width:1.5px;vertical-align:middle"></span>';}
  try{
    const _osmGeo=_getMorphologyGeo();
    const coords=_osmGeo.type==='Polygon'?_osmGeo.coordinates[0]:_osmGeo.coordinates[0][0];
    const polyStr=coords.map(c=>`${c[1].toFixed(6)} ${c[0].toFixed(6)}`).join(' ');
    const query=`[out:json][timeout:30];(node(poly:"${polyStr}");way(poly:"${polyStr}"););out center tags;`;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const json=await res.json();
    const catCounts={};
    const features=(json.elements||[]).reduce((acc,el)=>{
      const cat=_osmCat(el.tags);if(!cat)return acc;
      const lat=el.lat??el.center?.lat,lng=el.lon??el.center?.lon;if(!lat||!lng)return acc;
      acc.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},
        properties:{cat,name:el.tags?.name||'',type:el.tags?.amenity||el.tags?.shop||el.tags?.office||el.tags?.leisure||''}});
      catCounts[cat]=(catCounts[cat]||0)+1;
      return acc;
    },[]);
    const gj={type:'FeatureCollection',features};
    if(!map.getSource('overpass-pois'))map.addSource('overpass-pois',{type:'geojson',data:gj});
    else map.getSource('overpass-pois').setData(gj);
    if(!map.getLayer('overpass-circles')){
      map.addLayer({id:'overpass-circles',type:'circle',source:'overpass-pois',paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],13,3,17,7],
        'circle-color':['match',['get','cat'],
          'food','#f97316','retail','#ec4899','education','#6366f1',
          'health','#ef4444','public','#14b8a6','leisure','#22c55e',
          'tourism','#eab308','office','#a855f7','rgba(255,255,255,0.3)'],
        'circle-stroke-width':1,'circle-stroke-color':'rgba(0,0,0,0.4)','circle-opacity':0.9}});
      map.addLayer({id:'overpass-labels',type:'symbol',source:'overpass-pois',layout:{
        'text-field':['case',['!=',['get','name'],''],['get','name'],''],'text-size':9,
        'text-offset':[0,1.2],'text-optional':true,'text-max-width':8},
        paint:{'text-color':'rgba(255,255,255,0.75)','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1}});
    }
    _osmActive=true;
    btn?.classList.add('active');
    if(btn){btn.disabled=false;btn.innerHTML='OSM';}
    const isKa=lang==='ka';
    lg.style.display='block';
    lg.innerHTML=`<div class="lu-section-title"><span>${isKa?'ფუნქციები':'Functions'}</span><span>${features.length}</span></div>`
      +Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).map(([cat,n])=>
        `<div class="lu-row"><span style="width:8px;height:8px;border-radius:50%;background:${OSM_CATS[cat]?.color||'#999'};flex-shrink:0;display:inline-block;margin-right:2px"></span><span class="lu-name">${escapeHtml(OSM_CATS[cat]?.label||cat)}</span><span class="lu-count">${n}</span></div>`
      ).join('');
  }catch(e){
    console.error('Overpass:',e);
    if(btn){btn.disabled=false;btn.innerHTML='OSM';}
  }
}
async function runSpaceSyntax(geoOverride){
  const btn=document.getElementById('btn-syntax');
  const lg=document.getElementById('syntax-legend');
  const _sGeo=geoOverride||_getMorphologyGeo();
  if(!_sGeo)return;
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner-sm" style="width:9px;height:9px;border-width:1.5px;vertical-align:middle"></span>';}
  try{
    const coords=_sGeo.type==='Polygon'?_sGeo.coordinates[0]:_sGeo.coordinates[0][0];
    const polyStr=coords.map(c=>`${c[1].toFixed(6)} ${c[0].toFixed(6)}`).join(' ');
    const query=`[out:json][timeout:30];way[highway~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|footway|path|service)$"](poly:"${polyStr}");out body geom;`;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const json=await res.json();
    const ways=json.elements||[];
    // Node degree = how many ways share that node (connectivity proxy)
    const nodeDeg={};
    for(const way of ways)for(const nd of(way.nodes||[]))nodeDeg[nd]=(nodeDeg[nd]||0)+1;
    const features=ways.reduce((acc,way)=>{
      if(!way.geometry||way.geometry.length<2)return acc;
      const nodes=way.nodes||[];
      const endDeg=Math.max(nodeDeg[nodes[0]]||1,nodeDeg[nodes[nodes.length-1]]||1);
      const connectivity=Math.max(0,endDeg-1); // subtract self
      acc.push({type:'Feature',geometry:{type:'LineString',coordinates:way.geometry.map(pt=>[pt.lon,pt.lat])},
        properties:{connectivity,highway:way.tags?.highway||'',name:way.tags?.name||''}});
      return acc;
    },[]);
    const gj={type:'FeatureCollection',features};
    _syntaxGJ=gj; // kept for morphology export
    if(!map.getSource('syntax-streets'))map.addSource('syntax-streets',{type:'geojson',data:gj});
    else map.getSource('syntax-streets').setData(gj);
    if(!map.getLayer('syntax-line')){
      map.addLayer({id:'syntax-line',type:'line',source:'syntax-streets',
        layout:{'line-join':'round','line-cap':'round'},
        paint:{
          'line-width':['interpolate',['linear'],['get','connectivity'],0,1.5,3,2.5,6,3.5],
          'line-color':['interpolate',['linear'],['get','connectivity'],0,'#3b82f6',2,'#22c55e',4,'#f97316',6,'#ef4444'],
          'line-opacity':0.85}},
        map.getLayer('parcel-fill')?'parcel-fill':undefined);
    }
    _syntaxActive=true;
    btn?.classList.add('active');
    if(btn){btn.disabled=false;btn.innerHTML='Streets';}
    const isKa=lang==='ka';
    lg.style.display='block';
    lg.innerHTML=`<div class="lu-section-title" style="margin-bottom:5px">${isKa?'ქსელის კავშირი':'Street connectivity'}</div>
      <div class="syntax-ramp"></div>
      <div class="syntax-ramp-labels"><span>${isKa?'დაბალი':'Low'}</span><span>${isKa?'მაღალი':'High'}</span></div>
      <div style="font-size:0.59rem;color:rgba(255,255,255,0.22)">${features.length} ${isKa?'სეგმენტი':'segments'}</div>`;
  }catch(e){
    console.error('Syntax:',e);
    if(btn){btn.disabled=false;btn.innerHTML='Streets';}
  }
}

function downloadPolyParcels(){
  if(!_currentParcelGeoJSON||!_isDrawnArea)return;
  const coords=_currentParcelGeoJSON.type==="Polygon"?_currentParcelGeoJSON.coordinates[0]:_currentParcelGeoJSON.coordinates[0][0];
  const areaM2=Math.round(computePolygonAreaM2(coords));
  const perimM=Math.round(computePolygonPerimeterM(coords));
  const props=Object.assign({area_m2:areaM2,perimeter_m:perimM},_drawnAreaProps);
  logFeatureUse("geojson_export").catch(()=>{});
  _dlGeoJSON("drawn_area.geojson",{type:"FeatureCollection",features:[{type:"Feature",geometry:_currentParcelGeoJSON,properties:props}]});
}

function downloadBuildingOBJ(){
  if(!_threeEditor||!_threeEditor._posArr||!_extrusionActive)return;
  const pos=_threeEditor._posArr;
  const groups=_threeEditor._groups;
  if(!pos||!groups||pos.length<9)return;
  const lines=[
    '# Z-axis Building Export',
    '# Coordinate system: Y-up, metres',
    '# Compatible with SketchUp, Rhino, Blender',
    '# Groups: floor_N_usetype (side+slab), roof',
    ''
  ];
  const triCount=Math.floor(pos.length/9);
  // Vertices — convert from Z-up local metres to OBJ Y-up right-handed
  // local: x=east, y=north, z=height → OBJ: x=east, y=height, z=-north
  for(let i=0;i<triCount;i++){
    const b=i*9;
    for(let v=0;v<3;v++){
      const lx=pos[b+v*3],ly=pos[b+v*3+1],lz=pos[b+v*3+2];
      lines.push('v '+lx.toFixed(4)+' '+lz.toFixed(4)+' '+(-ly).toFixed(4));
    }
  }
  lines.push('');
  // Faces grouped by semantic type
  let currentGroup='';
  groups.forEach(g=>{
    let gName;
    if(g.type==='top'){
      gName='roof';
    } else if(g.type==='separator'){
      gName='separator_floor_'+(g.floorIdx+1);
    } else {
      const useId=_floorOverrides[g.floorIdx]?.useType;
      const useName=useId?(FLOOR_USES.find(u=>u.id===useId)?.id||useId):'unassigned';
      gName='floor_'+(g.floorIdx+1)+'_'+useName;
    }
    if(gName!==currentGroup){lines.push('g '+gName);currentGroup=gName;}
    for(let t=g.triStart;t<g.triStart+g.triCount;t++){
      const vi=t*3+1;
      lines.push('f '+vi+' '+(vi+1)+' '+(vi+2));
    }
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='building.obj';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  logFeatureUse("obj_export").catch(()=>{});
}

function clearPolygonSelect(){
  // Remove all buildings from map
  _buildings.forEach(b=>{
    if(mapReady){
      if(b.threeEditor){try{map.removeLayer(b.threeEditor.id);}catch(_){}try{b.threeEditor.dispose();}catch(_){}b.threeEditor=null;}
      if(b._extClickHandler){try{map.off('click','bld-ext-'+b.id,b._extClickHandler);}catch(_){}b._extClickHandler=null;}
      try{if(map.getLayer('bld-ext-'+b.id))map.removeLayer('bld-ext-'+b.id);}catch(_){}
      try{if(map.getLayer('bld-line-'+b.id))map.removeLayer('bld-line-'+b.id);}catch(_){}
      try{if(map.getLayer('bld-fill-'+b.id))map.removeLayer('bld-fill-'+b.id);}catch(_){}
      try{if(map.getSource('bld-src-'+b.id))map.removeSource('bld-src-'+b.id);}catch(_){}
      map.off('click','bld-fill-'+b.id);
    }
  });
  _buildings=[];_activeBldId=null;_selectedBldIds.clear();_threeEditor=null;
  _resetExtrusionFull();
  _clearLineProfile();
  if(_shapeMouseHandlers){_shapeMouseHandlers();_shapeMouseHandlers=null;}
  if(mapReady){map.dragPan.enable();map.getSource('draw-preview')?.setData({type:'FeatureCollection',features:[]});}
  if(_draw){try{_draw.deleteAll();_draw.changeMode("simple_select");}catch(_){}}
  clearOverpassLayers();clearSyntaxLayers();
  const _lg2=document.getElementById("osm-legend");if(_lg2)_lg2.style.display="none";
  const _sl2=document.getElementById("syntax-legend");if(_sl2)_sl2.style.display="none";
  clearOrientLayers();
  const _or2=document.getElementById("orient-rose");if(_or2)_or2.style.display="none";
  document.getElementById("acc-osm-sw")?.classList.remove("on");
  document.getElementById("acc-connectivity-sw")?.classList.remove("on");
  document.getElementById("acc-orientation-sw")?.classList.remove("on");
  _polyDrawing=false;_drawShape='polygon';
  _polyParcels=[];
  _clearDrawBtnActive();
  const hint=document.getElementById("draw-hint");
  if(hint)hint.style.display="none";
  const panel=document.getElementById("poly-result-panel");
  if(panel)panel.style.display="none";
  if(_isDrawnArea){
    _isDrawnArea=false;
    try{resetAnalysis();}catch(_){}
    if(mapReady){if(_dbParcelGeoJSON){map.getSource("parcel")?.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:_dbParcelGeoJSON,properties:{}}]});}else{map.getSource("parcel")?.setData({type:"FeatureCollection",features:[]});}}
  }
}

function closePaywall(){document.getElementById("paywall-modal").classList.remove("open");}
function onPaywallOverlayClick(e){if(e.target===document.getElementById("paywall-modal"))closePaywall();}

let _paddleReady=false;
function _loadPaddleSDK(){
  return new Promise((resolve,reject)=>{
    if(_paddleReady){resolve();return;}
    if(window.Paddle){
      if(PADDLE_SANDBOX)Paddle.Environment.set("sandbox");
      Paddle.Initialize({token:PADDLE_TOKEN,eventCallback:_paddleEvent});
      _paddleReady=true;resolve();return;
    }
    const s=document.createElement("script");
    s.src="https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload=()=>{
      if(PADDLE_SANDBOX)Paddle.Environment.set("sandbox");
      Paddle.Initialize({token:PADDLE_TOKEN,eventCallback:_paddleEvent});
      _paddleReady=true;resolve();
    };
    s.onerror=reject;
    document.head.appendChild(s);
  });
}
function _paddleEvent(data){
  if(data.name==="checkout.completed")_paddleSuccess(data);
}
async function _paddleSuccess(data){
  // Recovery checkouts can complete without an app session — the webhook (which
  // carries custom_data.user_id) is the source of truth. Guard the client upsert.
  if(!currentUser){closePaywall();return;}
  const sid=data.data?.subscription_id||"";
  try{
    await sb.from("subscriptions").upsert({user_id:currentUser.id,plan:"pro",status:"active",paddle_subscription_id:sid},{onConflict:"user_id"});
  }catch(e){console.warn("Sub save:",e);}
  currentUser.plan="pro";
  closePaywall();updateUserUI();
}
async function startCheckout(){
  if(!currentUser){closePaywall();_afterAuthCb=()=>openPaywall();openAuthModal("view-signup");return;}
  const ctaBtn=document.getElementById("pw-cta-btn");
  ctaBtn.disabled=true;ctaBtn.innerHTML='<span class="spinner-sm"></span>';
  try{
    await _loadPaddleSDK();
    const mode=document.getElementById("pw-btog-monthly")?.classList.contains("active")?"monthly":"annual";
    const _mc=_marketingConsent;
    Paddle.Checkout.open({
      items:[{priceId:mode==="annual"?PADDLE_PRICE_ANNUAL:PADDLE_PRICE_MONTHLY,quantity:1}],
      customer:{email:currentUser.email},
      customData:{user_id:currentUser.id,marketing_consent:_mc}
    });
  }catch(e){console.error("Paddle:",e);}
  finally{ctaBtn.disabled=false;ctaBtn.textContent=t().pw.cta||"Get Pro";}
}

async function updatePassword(){
  const btn=document.getElementById("btn-update-pw");
  const errEl=document.getElementById("update-pw-error");
  const pw=document.getElementById("update-pw-input").value;
  errEl.textContent="";
  if(!pw||pw.length<8){errEl.textContent=t().auth.errPassword;return;}
  btn.disabled=true;btn.innerHTML='<span class="spinner-sm"></span>';
  const{error}=await sb.auth.updateUser({password:pw});
  btn.disabled=false;btn.textContent=t().auth.updatePwBtn;
  if(error){errEl.textContent=error.message;return;}
  // Password changed — leave recovery mode and sign in with the refreshed session
  window._recoveryMode=false;
  const{data:{session}}=await sb.auth.getSession();
  closeAuthModal();
  if(typeof showToast==="function")showToast(t().auth.pwUpdated||"Password updated");
  if(session)await onAuthSuccess(session);
}

function openBillingPortal(){
  if(!currentUser)return;
  const tr=t(),bd=tr.dash;
  const isPro=currentUser.plan==='pro';
  const isCanceling=currentUser._subStatus==='canceling';
  const periodEnd=window._subPeriodEnd?new Date(window._subPeriodEnd):null;
  const daysLeft=periodEnd?Math.max(0,Math.ceil((periodEnd.getTime()-Date.now())/86400000)):null;
  const isInTrial=isPro&&currentUser._subStatus==='trialing'&&window._trialEndsAt&&new Date(window._trialEndsAt)>new Date();

  document.getElementById('bill-title').textContent=bd.billingTitle;
  document.getElementById('bill-subtitle').textContent=isPro?bd.billingSubPro:bd.billingSubFree;

  document.getElementById('bill-lbl-plan').textContent=bd.billingLblPlan;
  const badge=document.getElementById('bill-plan-badge');
  badge.textContent=isPro?bd.proPlan:bd.freePlan;
  badge.className='dash-plan-badge '+(isPro?'pro':'free');
  document.getElementById('bill-plan-desc').textContent=isPro?bd.proDesc:bd.freeDesc;
  document.getElementById('bill-price').textContent=isPro?(window._subInterval==='year'?'€150':'€15'):'€0';
  document.getElementById('bill-period').textContent=isPro?(window._subInterval==='year'?'/year':bd.billingPeriod):bd.billingPeriod;

  const renewEl=document.getElementById('bill-next-renewal');
  if(isInTrial){
    // Trial users have trial_ends_at but no current_period_end (no card on file);
    // show when the trial ends — access drops to Free after this date unless they subscribe.
    const trialEnd=window._trialEndsAt?new Date(window._trialEndsAt):periodEnd;
    const trialFmt=trialEnd.toLocaleDateString(lang==='ka'?'ka-GE':'en-GB',{day:'numeric',month:'long',year:'numeric'});
    const trialDaysLeft=Math.max(0,Math.ceil((trialEnd.getTime()-Date.now())/86400000));
    renewEl.textContent=`${bd.billingTrialEnds}: ${trialFmt} · ${trialDaysLeft} ${bd.billingDaysLeft}`;
    renewEl.style.display='';
  } else if(isPro&&periodEnd){
    const fmt=periodEnd.toLocaleDateString(lang==='ka'?'ka-GE':'en-GB',{day:'numeric',month:'long',year:'numeric'});
    const daysStr=daysLeft!==null?` · ${daysLeft} ${bd.billingDaysLeft}`:'';
    renewEl.textContent=(isCanceling?bd.billingCanceling:(bd.billingRenewal+': '+fmt))+daysStr;
    renewEl.style.display='';
  } else { renewEl.style.display='none'; }

  // Trial / post-trial notice
  const trialEl=document.getElementById('bill-trial-notice');
  if(trialEl){
    const note=isInTrial?bd.billingTrialNote:(!isCanceling&&isPro?bd.billingPostTrialNote:'');
    trialEl.textContent=note;
    trialEl.style.display=note?'':'none';
  }

  document.getElementById('bill-lbl-history').textContent=bd.billingLblHistory;
  document.getElementById('bill-history-list').innerHTML=`<div class="billing-empty">${bd.billingNoHistory}</div>`;

  const upgradeBtn=document.getElementById('bill-upgrade-btn');
  const cancelBtn=document.getElementById('bill-cancel-btn');
  upgradeBtn.textContent=bd.upgrade;upgradeBtn.style.display=isPro?'none':'';
  if(isCanceling){
    cancelBtn.textContent=bd.billingCanceling;cancelBtn.disabled=true;cancelBtn.style.display='';
  } else {
    cancelBtn.textContent=bd.billingCancel;cancelBtn.disabled=false;cancelBtn.style.display=isPro?'':'none';
  }

  const m=document.getElementById('billing-modal');
  m.style.opacity='0';m.style.pointerEvents='all';
  m.style.transition='opacity 0.22s ease';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{m.style.opacity='1';}));
}

async function cancelSubscription(){
  const bd=t().dash;
  if(!confirm(bd.billingCancelConfirm))return;
  const btn=document.getElementById('bill-cancel-btn');
  btn.disabled=true;btn.textContent='...';
  try{
    const{data:{session}}=await sb.auth.getSession();
    const res=await fetch(BACKEND_URL+'/api/paddle/cancel',{
      method:'POST',
      headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'}
    });
    const json=await res.json();
    if(!res.ok)throw new Error(json.error||'Cancel failed');
    if(json.effective_from==='immediately'){
      currentUser.plan='free';currentUser._subStatus='canceled';
      updateUserUI();closeBillingPortal();
      alert(json.was_trial?bd.billingCanceledTrial:bd.billingCanceledRefund);
    } else {
      currentUser._subStatus='canceling';
      btn.textContent=bd.billingCanceling;btn.disabled=true;
    }
  }catch(e){
    btn.disabled=false;btn.textContent=bd.billingCancel;
    alert(e.message||'Could not cancel. Please try again.');
  }
}

function closeBillingPortal(){
  const m=document.getElementById('billing-modal');
  m.style.opacity='0';
  setTimeout(()=>{m.style.pointerEvents='none';},220);
}
function onBillingOverlayClick(e){if(e.target===document.getElementById('billing-modal'))closeBillingPortal();}

// ── Custom layer init (called on first load and after every style switch) ─────
// ── DB Coverage preview ───────────────────────────────────────────────────────
function wktToGeoJSON(wkt){
  if(!wkt)return null;
  wkt=wkt.trim();
  try{
    if(wkt.startsWith("MULTIPOLYGON")){
      const polys=[];
      const inner=wkt.slice(13).trim();
      let depth=0,ringStart=-1,curPoly=[];
      for(let i=0;i<inner.length;i++){
        const c=inner[i];
        if(c==="("){depth++;if(depth===3)ringStart=i+1;}
        else if(c===")"){
          if(depth===3&&ringStart!==-1){curPoly.push(inner.slice(ringStart,i).split(",").map(p=>{const[x,y]=p.trim().split(" ");return[+x,+y];}));ringStart=-1;}
          if(depth===2){polys.push(curPoly);curPoly=[];}
          depth--;
        }
      }
      return{type:"MultiPolygon",coordinates:polys.map(r=>[r])};
    }
    if(wkt.startsWith("POLYGON")){
      const rings=[];const inner=wkt.slice(7).trim();
      let depth=0,ringStart=-1;
      for(let i=0;i<inner.length;i++){
        const c=inner[i];
        if(c==="("){depth++;if(depth===2)ringStart=i+1;}
        else if(c===")"){if(depth===2&&ringStart!==-1){rings.push(inner.slice(ringStart,i).split(",").map(p=>{const[x,y]=p.trim().split(" ");return[+x,+y];}));ringStart=-1;}depth--;}
      }
      return{type:"Polygon",coordinates:rings};
    }
  }catch(e){}
  return null;
}

function initDBPreviewLayer(){
  if(!map.getSource("db-preview")){
    map.addSource("db-preview",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"db-preview-fill",type:"fill",source:"db-preview",filter:["in",["geometry-type"],["literal",["Polygon","MultiPolygon"]]],paint:{"fill-color":"#34d399","fill-opacity":0.2}});
  }
}

function toggleDBPreview(){
  _dbPreviewEnabled=!_dbPreviewEnabled;
  const sw=document.getElementById("db-coverage-sw");
  const countEl=document.getElementById("db-coverage-count");
  if(sw)sw.classList.toggle("on",_dbPreviewEnabled);
  if(!_dbPreviewEnabled){
    if(mapReady&&map.getSource("db-preview"))map.getSource("db-preview").setData({type:"FeatureCollection",features:[]});
    if(countEl){countEl.style.display="none";countEl.textContent="";}
  }else{
    if(countEl)countEl.style.display="block";
    fetchDBParcelsIfEnabled();
  }
}

function fetchDBParcelsIfEnabled(){
  if(!_dbPreviewEnabled||!mapReady)return;
  clearTimeout(_dbPreviewTimer);
  _dbPreviewTimer=setTimeout(fetchDBParcels,400);
}

async function fetchDBParcels(){
  if(!_dbPreviewEnabled||!mapReady)return;
  const zoom=map.getZoom();
  const countEl=document.getElementById("db-coverage-count");
  if(zoom<13){if(countEl)countEl.textContent="Zoom in to load";return;}
  const b=map.getBounds();
  if(countEl)countEl.textContent="Loading…";
  try{
    const{data:rows,error:_rpcErr}=await sb.rpc('parcels_in_bbox',{
      min_lng:b.getWest(),min_lat:b.getSouth(),max_lng:b.getEast(),max_lat:b.getNorth()
    });
    if(_rpcErr)throw new Error(_rpcErr.message);
    const features=rows.map(r=>{try{return{type:"Feature",geometry:JSON.parse(r.geojson),properties:{cadastral:r.cadastral}};}catch(e){return null;}}).filter(Boolean);
    if(map.getSource("db-preview"))map.getSource("db-preview").setData({type:"FeatureCollection",features});
    if(countEl)countEl.textContent=`${features.length} parcels in view`;
  }catch(e){
    console.warn("DB preview:",e);
    if(countEl)countEl.textContent="Error loading";
  }
}

function initCustomLayers(){
  initDBPreviewLayer();
  if(!map.getSource('draw-preview')){
    map.addSource('draw-preview',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'draw-preview-fill',type:'fill',source:'draw-preview',paint:{'fill-color':'#a5b4fc','fill-opacity':0.15}});
    map.addLayer({id:'draw-preview-stroke',type:'line',source:'draw-preview',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#a5b4fc','line-width':2,'line-dasharray':[4,2]}});
  }
  if(!map.getSource("mapbox-dem")){
    map.addSource("mapbox-dem",{type:"raster-dem",url:"mapbox://mapbox.mapbox-terrain-dem-v1",tileSize:512,maxzoom:14});
  }
  map.setTerrain({source:"mapbox-dem",exaggeration:1});
  if(!map.getLayer("sky")){
    try{map.addLayer({id:"sky",type:"sky",paint:{"sky-type":"atmosphere","sky-atmosphere-sun":[0,0],"sky-atmosphere-sun-intensity":15}});}catch(_){}
  }
  if(!map.getSource("isochrone")){
    map.addSource("isochrone",{type:"geojson",data:_isoData||{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"iso-fill",type:"fill",source:"isochrone",slot:"top",paint:{"fill-color":"#a855f7","fill-opacity":0.35}});
    map.addLayer({id:"iso-glow",type:"line",source:"isochrone",slot:"top",paint:{"line-color":"#c084fc","line-width":18,"line-opacity":0.55,"line-blur":12}});
    map.addLayer({id:"iso-line",type:"line",source:"isochrone",slot:"top",paint:{"line-color":"#f0abfc","line-width":3,"line-opacity":1}});
  }
  if(!map.getSource("parcel")){
    const pData=_currentParcelGeoJSON
      ?{type:"FeatureCollection",features:[{type:"Feature",geometry:_currentParcelGeoJSON,properties:{}}]}
      :{type:"FeatureCollection",features:[]};
    map.addSource("parcel",{type:"geojson",data:pData});
    map.addLayer({id:"parcel-fill",type:"fill",source:"parcel",filter:["==","$type","Polygon"],paint:{"fill-color":["case",["==",["get","selected"],true],"#fb923c","#6366f1"],"fill-opacity":["case",["==",["get","selected"],true],0.55,0.35]}});
    map.addLayer({id:"parcel-line",type:"line",source:"parcel",layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":["case",["==",["get","selected"],true],"#fdba74","#a5b4fc"],"line-width":["case",["==",["get","selected"],true],2.5,2]}});
    map.addSource("setback",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"setback-line",type:"line",source:"setback",paint:{"line-color":"#fcd34d","line-width":1.5,"line-opacity":0.75,"line-dasharray":[5,4]}});
    map.addSource("zone-overlay",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"zone-overlay-fill",type:"fill",source:"zone-overlay",paint:{"fill-color":["get","color"],"fill-opacity":["get","opacity"],"fill-outline-color":["coalesce",["get","stroke"],"transparent"]}});
    try{const _hs=8;const _hc=document.createElement('canvas');_hc.width=_hs;_hc.height=_hs;const _hx=_hc.getContext('2d');_hx.clearRect(0,0,_hs,_hs);_hx.strokeStyle='rgba(239,68,68,0.88)';_hx.lineWidth=1.5;[[[0,_hs],[_hs,0]],[[-_hs/2,_hs],[_hs/2,0]],[[_hs/2,_hs],[_hs*1.5,0]]].forEach(([[x1,y1],[x2,y2]])=>{_hx.beginPath();_hx.moveTo(x1,y1);_hx.lineTo(x2,y2);_hx.stroke();});map.addImage('setback-hatch',_hx.getImageData(0,0,_hs,_hs));}catch(_){}
    map.addSource('setback-ring',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'setback-ring-fill',type:'fill',source:'setback-ring',paint:map.hasImage('setback-hatch')?{'fill-pattern':'setback-hatch'}:{'fill-color':'#ef4444','fill-opacity':0.45}});
    map.addSource("extrusion-floors",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"extrusion-layer",type:"fill-extrusion",source:"extrusion-floors",layout:{visibility:"none"},paint:{"fill-extrusion-color":"#94a3b4","fill-extrusion-base":["get","floor_base"],"fill-extrusion-height":["get","floor_top"],"fill-extrusion-opacity":0.92}});
  }
  if(!map.hasImage("mapillary-pulse"))map.addImage("mapillary-pulse",_pulsingDot,{pixelRatio:2});
  if(!map.getSource("mapillary-active")){
    map.addSource("mapillary-active",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"mapillary-active-layer",type:"symbol",source:"mapillary-active",layout:{"icon-image":"mapillary-pulse","icon-allow-overlap":true,"icon-ignore-placement":true}});
  }
  if(!map.getSource("napr-parcels")){
    map.addSource("napr-parcels",{type:"raster",tiles:[`${PROXY}/wms?z={z}&x={x}&y={y}`],tileSize:256,attribution:"© NAPR Georgia"});
    map.addLayer({id:"napr-parcels-layer",type:"raster",source:"napr-parcels",layout:{visibility:cadastralActive?"visible":"none"},paint:{"raster-opacity":0.7}},"parcel-fill");
  }
  if(!map.getSource("napr-lineobjects")){
    map.addSource("napr-lineobjects",{type:"raster",tiles:[`${PROXY}/wms?layers=cite:LR_LINEOBJECTS&z={z}&x={x}&y={y}`],tileSize:256,attribution:"© NAPR Georgia"});
    map.addLayer({id:"napr-lineobjects-layer",type:"raster",source:"napr-lineobjects",layout:{visibility:"none"},paint:{"raster-opacity":0.85}});
  }
  if(!map.getSource("napr-forestfunds")){
    map.addSource("napr-forestfunds",{type:"raster",tiles:[`${PROXY}/wms?layers=cite:LR_FORESTFUNDS&z={z}&x={x}&y={y}`],tileSize:256,attribution:"© NAPR Georgia"});
    map.addLayer({id:"napr-forestfunds-layer",type:"raster",source:"napr-forestfunds",layout:{visibility:"none"},paint:{"raster-opacity":0.75}});
  }
  if(_reliefOverlayCache&&!map.getSource("relief-overlay")){
    const r=_reliefOverlayCache;
    map.addSource("relief-overlay",{type:"image",url:r.dataUrl,coordinates:[r.nw,r.ne,r.se,r.sw]});
    map.addLayer({id:"relief-overlay-layer",type:"raster",source:"relief-overlay",paint:{"raster-opacity":0.82}});
  }
  if(_canopyOverlayCache&&!map.getSource("canopy-overlay")){
    const k=_canopyOverlayCache;
    map.addSource("canopy-overlay",{type:"image",url:k.dataUrl,coordinates:[k.nw,k.ne,k.se,k.sw]});
    map.addLayer({id:"canopy-overlay-layer",type:"raster",source:"canopy-overlay",paint:{"raster-opacity":0.82}});
  }
  if(_lstOverlayCache&&!map.getSource("lst-overlay")){
    const l=_lstOverlayCache;
    map.addSource("lst-overlay",{type:"image",url:l.dataUrl,coordinates:[l.nw,l.ne,l.se,l.sw]});
    map.addLayer({id:"lst-overlay-layer",type:"raster",source:"lst-overlay",paint:{"raster-opacity":0.75}});
  }
  if(_solarOverlayCache&&!map.getSource("solar-overlay")){
    const s=_solarOverlayCache;
    map.addSource("solar-overlay",{type:"image",url:s.dataUrl,coordinates:[s.nw,s.ne,s.se,s.sw]});
    map.addLayer({id:"solar-overlay-layer",type:"raster",source:"solar-overlay",paint:{"raster-opacity":0.88}});
  }
  if(_schoolsLayerActive&&_lastSchoolFeatures){
    _ensureSchoolMapSetup();
    map.getSource('schools-pts').setData({type:'FeatureCollection',features:_lastSchoolFeatures.map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.school_name||f.properties['სკოლა']||'School'}}))});
    map.setLayoutProperty('schools-dot','visibility','visible');
    map.off('mouseenter','schools-dot',_onSchoolHover);
    map.off('mouseleave','schools-dot',_onSchoolLeave);
    map.on('mouseenter','schools-dot',_onSchoolHover);
    map.on('mouseleave','schools-dot',_onSchoolLeave);
  }
  if(_kgLayerActive&&_lastKgFeatures){
    _ensureKgMapSetup();
    map.getSource('kg-pts').setData({type:'FeatureCollection',features:_lastKgFeatures.map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.name||'',type:f.properties.type||'',phone:f.properties.phone||'',phone_1:f.properties.phone_1||'',email:f.properties.email||'',facebook_link:f.properties.facebook_link||'',name_location:f.properties.name_location||''}}))});
    map.setLayoutProperty('kg-dot','visibility','visible');
    map.off('mouseenter','kg-dot',_onKgHover);
    map.off('mouseleave','kg-dot',_onKgLeave);
    map.on('mouseenter','kg-dot',_onKgHover);
    map.on('mouseleave','kg-dot',_onKgLeave);
  }
  // Restore TTC transit layers after basemap change
  const _ttcSw=document.getElementById('acc-transit-sw');
  if(_ttcSw?.classList.contains('on')&&_ttcRenderedStops?.length){
    _ttcShowOnMap(_ttcRenderedStops);
  }
  if(_ttcActiveRouteShape){
    const _savedId=_ttcActiveRouteShape, _savedColor=_ttcActiveRouteColor;
    _ttcActiveRouteShape=null; // reset so showRouteShape doesn't toggle off
    _ttcShowRouteShape(_savedId,_savedColor);
  }
}

// ── Layers panel ──────────────────────────────────────────────────────────────
function toggleLayersPanel(){
  _layersPanelOpen=!_layersPanelOpen;
  const lp=document.getElementById("layers-panel");
  if(lp)lp.classList.toggle("open",_layersPanelOpen);
  const mb=document.getElementById("mzc-layers-btn");if(mb)mb.classList.toggle("active",_layersPanelOpen);
}
document.addEventListener("click",function(e){
  if(_layersPanelOpen&&!e.target.closest("#layers-panel,#layers-btn,#map-zoom-controls")){
    _layersPanelOpen=false;
    document.getElementById("layers-panel").classList.remove("open");
    const mb=document.getElementById("mzc-layers-btn");if(mb)mb.classList.remove("active");
  }
},{passive:true});

function navSelect(section){
  const sp=document.getElementById("side-panel");
  if(!sp)return;
  if(!sp.classList.contains("visible")){
    sp.classList.add("visible");
    
  }
  if(section==="analysis"){
    const ac=document.getElementById("pro-analysis-card");
    if(ac)setTimeout(()=>{sp.scrollTop=Math.max(0,ac.offsetTop-20);},60);
  }else{sp.scrollTop=0;}
}
function _closeOtherNavPanels(keep){
  if(keep!=='draw'&&_drawMenuOpen){
    _drawMenuOpen=false;
    const popup=document.getElementById('draw-shape-popup');if(popup)popup.classList.remove('open');
    const nb=document.getElementById('nav-draw-btn');const ni=document.getElementById('nav-draw-icon');
    if(nb)nb.classList.remove('active');if(ni)ni.style.opacity='0.55';
    document.removeEventListener('click',_closeDrawMenuOutside,{capture:true});
  }
  if(keep!=='import'){
    document.getElementById('import-data-popup')?.classList.remove('open');
    const ib=document.getElementById('nav-import-btn');const ii=document.getElementById('nav-import-icon');
    if(ib)ib.classList.remove('active');if(ii)ii.style.opacity='0.55';
  }
  if(keep!=='layers'&&_layersPanelOpen){
    _layersPanelOpen=false;
    const lp=document.getElementById('layers-panel');if(lp)lp.classList.remove('open');
    const mb=document.getElementById('mzc-layers-btn');if(mb)mb.classList.remove('active');
  }
  if(keep!=='cat'){
    const proCard=document.getElementById('pro-analysis-card');
    if(proCard&&proCard.style.display!=='none'){proCard.style.display='none';}
    document.querySelectorAll('.pro-cat').forEach(el=>el.classList.remove('open'));
    document.querySelectorAll('#nav-cat-group .nav-btn').forEach(b=>b.classList.remove('active'));
    _activeCatKey=null;
  }
}
function navToggleLayers(){ toggleLayersPanel(); }
function navOpenAccount(){ if(typeof currentUser!=="undefined"&&currentUser) openDashboard(); else openAuthModal("view-signin"); }
function navToggleDraw(){
  if(typeof currentUser==="undefined"||!currentUser||currentUser.plan!=="pro"){
    if(typeof openPaywall==="function")openPaywall();
    return;
  }
  _closeOtherNavPanels('draw');
  toggleDrawMenu();
  const ni=document.getElementById("nav-draw-icon");
  const nb=document.getElementById("nav-draw-btn");
  if(ni)ni.style.opacity=_drawMenuOpen?"0.95":"0.55";
  if(nb)nb.classList.toggle("active",_drawMenuOpen);
}
function navToggleImport(){
  _closeOtherNavPanels('import');
  const popup=document.getElementById('import-data-popup');
  const btn=document.getElementById('nav-import-btn');
  const icon=document.getElementById('nav-import-icon');
  if(!popup)return;
  const isOpen=popup.classList.contains('open');
  popup.classList.toggle('open',!isOpen);
  if(btn)btn.classList.toggle('active',!isOpen);
  if(icon)icon.style.opacity=isOpen?'0.55':'0.95';
  if(!isOpen){
    const r=btn.getBoundingClientRect();
    popup.style.top=r.top+'px';
  }
}
function setMapLeft(px){
  const m=document.getElementById('map');
  if(m)m.style.left=px+'px';
  if(typeof map!=='undefined'&&map)setTimeout(()=>map.resize(),0);
}
function navBrandClick(){
  const cs=document.getElementById("center-search");
  const nb=document.getElementById("nav-brand");
  if(!cs)return;
  cs.classList.add("compact");
  const nowHidden=cs.classList.toggle("hidden");
  if(nb)nb.classList.toggle("active",!nowHidden);
  if(!nowHidden)setTimeout(()=>{const inp=cs.querySelector("input");if(inp)inp.focus();},80);
}
function navToggle3D(){toggle3D();}
function navToggleLang(){
  const newLang=typeof lang!=="undefined"&&lang==="en"?"ka":"en";
  setLang(newLang);
  const lbl=document.getElementById("nav-lang-label");
  if(lbl)lbl.textContent=newLang==="en"?"EN":"ქა";
}

const _BASEMAP_STYLES={
  dark:"mapbox://styles/mapbox/dark-v11",
  satellite:"mapbox://styles/mapbox/satellite-streets-v12",
  day:"mapbox://styles/mapbox/standard",
  night:"mapbox://styles/mapbox/standard"
};
function switchBasemap(name){
  if(name===_currentBasemap||!mapReady)return;
  _currentBasemap=name;
  ["dark","satellite","day","night"].forEach(id=>{
    document.getElementById("bm-"+id)?.classList.toggle("active",id===name);
  });
  is3D=false;
  const btn3d=document.getElementById("btn-3d");
  if(btn3d){btn3d.classList.remove("active");btn3d.textContent="3D";}
  document.getElementById("mzc-3d-btn")?.classList.remove("active");
  _reliefActiveType=null;
  mapReady=false;
  const _wasExtruding=_extrusionActive&&_isDrawnArea;
  map.setStyle(_BASEMAP_STYLES[name]);
  map.once("style.load",()=>{
    try{initCustomLayers();}catch(err){console.error("initCustomLayers (switch) failed:",err);}
    mapReady=true;
    map.setLanguage(lang==='ka'?'ka':'en');
    const _nll=document.getElementById('nav-lang-label');if(_nll)_nll.textContent=lang==='en'?'EN':'ქა';
    if(name==="day"){map.setConfigProperty("basemap","lightPreset","day");map.setConfigProperty("basemap","show3dObjects",true);}
    if(name==="night"){map.setConfigProperty("basemap","lightPreset","night");map.setConfigProperty("basemap","show3dObjects",true);}
    if(_wasExtruding){
      const _swBld=_activeBld();
      if(_swBld?.threeEditor){try{map.removeLayer(_swBld.threeEditor.id);}catch(e){}try{_swBld.threeEditor.dispose();}catch(e){}  _swBld.threeEditor=null;}
      if(_threeEditor){try{_threeEditor.dispose();}catch(e){}_threeEditor=null;}
      requestAnimationFrame(()=>{
        _ensureThreeJs(()=>{
          try{
            const _swBld2=_activeBld();
            if(_swBld2&&!_swBld2.threeEditor){
              _threeEditor=new _BuildingEditorLayer(_activeBldId);
              map.addLayer(_threeEditor);
              _swBld2.threeEditor=_threeEditor;
            }
            map.triggerRepaint();
            // DEM tiles may not be loaded yet — terrain elevation returns 0, placing the
            // building underground where it fails the depth test. Rebuild once tiles are ready.
            map.once('idle',()=>{if(_threeEditor){_threeEditor.rebuild();map.triggerRepaint();}});
            if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','none');
            if(map.getLayer('parcel-line'))map.setLayoutProperty('parcel-line','visibility','none');
          }catch(ex){console.error('building-3d restore failed:',ex);}
        });
      });
    }
  });
}

let cadastralActive = false;
function toggleCadastral(){
  if(!mapReady)return;
  cadastralActive=!cadastralActive;
  map.setLayoutProperty("napr-parcels-layer","visibility",cadastralActive?"visible":"none");
  document.getElementById("cadastral-sw").classList.toggle("on",cadastralActive);
}
let lineObjectsActive=false;
function toggleLineObjects(){
  if(!mapReady)return;
  lineObjectsActive=!lineObjectsActive;
  if(map.getLayer("napr-lineobjects-layer"))map.setLayoutProperty("napr-lineobjects-layer","visibility",lineObjectsActive?"visible":"none");
  document.getElementById("lineobjects-sw").classList.toggle("on",lineObjectsActive);
}
let forestFundsActive=false;
function toggleForestFunds(){
  if(!mapReady)return;
  forestFundsActive=!forestFundsActive;
  if(map.getLayer("napr-forestfunds-layer"))map.setLayoutProperty("napr-forestfunds-layer","visibility",forestFundsActive?"visible":"none");
  document.getElementById("forestfunds-sw").classList.toggle("on",forestFundsActive);
}



const _ZONE_NAMES={
  'sacxovrebeli zona':          {ka:'საცხოვრებელი ზონა',      en:'Residential Zone'},
  'sacxovrebeli zona-1':        {ka:'საცხოვრებელი ზონა-1',    en:'Residential Zone-1'},
  'sacxovrebeli zona-2':        {ka:'საცხოვრებელი ზონა-2',    en:'Residential Zone-2'},
  'sacxovrebeli zona-3':        {ka:'საცხოვრებელი ზონა-3',    en:'Residential Zone-3'},
  'sacxovrebeli zona-4':        {ka:'საცხოვრებელი ზონა-4',    en:'Residential Zone-4'},
  'sacxovrebeli zona-5':        {ka:'საცხოვრებელი ზონა-5',    en:'Residential Zone-5'},
  'sacxovrebeli zona-6':        {ka:'საცხოვრებელი ზონა-6',    en:'Residential Zone-6'},
  'sazogadoebriv saqmiani zona':  {ka:'საზოგადოებრივ-საქმიანი ზონა', en:'Public-Commercial Zone'},
  'sazogadoebriv saqmiani zona-1':{ka:'სსზ-1',                en:'PCZ-1'},
  'sazogadoebriv saqmiani zona-2':{ka:'სსზ-2',                en:'PCZ-2'},
  'sazogadoebriv saqmiani zona-3':{ka:'სსზ-3',                en:'PCZ-3'},
  'rekreaciuli zona':           {ka:'სარეკრეაციო ზონა',        en:'Recreational Zone'},
  'rekreaciuli zona-1':         {ka:'სარეკრეაციო ზონა-1',      en:'Recreational Zone-1'},
  'rekreaciuli zona-2':         {ka:'სარეკრეაციო ზონა-2',      en:'Recreational Zone-2'},
  'rekreaciuli zona-3':         {ka:'სარეკრეაციო ზონა-3',      en:'Recreational Zone-3'},
  'samrewvelo zona-1':          {ka:'სამრეწველო ზონა-1',       en:'Industrial Zone-1'},
  'samrewvelo zona-2':          {ka:'სამრეწველო ზონა-2',       en:'Industrial Zone-2'},
  'satransporto zona-1':        {ka:'სატრანსპორტო ზონა-1',     en:'Transport Zone-1'},
  'satransporto zona-2':        {ka:'სატრანსპორტო ზონა-2',     en:'Transport Zone-2'},
  'specialuri zona-1':          {ka:'სპეციალური ზონა-1',       en:'Special Zone-1'},
  'specialuri zona-2':          {ka:'სპეციალური ზონა-2',       en:'Special Zone-2'},
  'specialuri zona-3':          {ka:'სპეციალური ზონა-3',       en:'Special Zone-3'},
  'sanitaruli zona':            {ka:'სანიტარული ზონა',         en:'Sanitary Zone'},
  'satyeo zona':                {ka:'სატყეო ზონა',             en:'Forest Zone'},
  'hidrologia':                 {ka:'ჰიდროლოგია',              en:'Hydrology'},
  'sasoflo sameurneo zona':     {ka:'სასოფლო-სამეურნეო ზონა',  en:'Agricultural Zone'},
  'landSaftur sarekreacio':     {ka:'ლანდშაფტურ-სარეკრეაციო ზონა',  en:'Landscape-Recreational Zone'},
};
function _translateZone(raw){
  if(!raw)return null;
  const key=raw.trim().toLowerCase();
  const entry=_ZONE_NAMES[key]||_ZONE_NAMES[raw.trim()]||null;
  if(!entry)return raw;
  return (typeof lang!=='undefined'&&lang==='ka')?entry.ka:entry.en+'\n'+entry.ka;
}
async function _fetchFunctionalZone(geojson){
  if(!geojson||geojson.type==='LineString'||geojson.type==='MultiLineString')return[];
  const coordsFlat=(geojson.type==='MultiPolygon'?geojson.coordinates.flat(2):geojson.coordinates.flat());
  if(!coordsFlat.length)return[];
  const lngs=coordsFlat.map(c=>c[0]),lats=coordsFlat.map(c=>c[1]);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  // Convert parcel bbox to EPSG:3857 (native WFS CRS) for full-precision geometry
  const _ll2m=([lng,lat])=>[lng*20037508.34/180,Math.log(Math.tan((90+lat)*Math.PI/360))/(Math.PI/180)*20037508.34/180];
  const _m2ll=([x,y])=>[(x*180)/20037508.34,(Math.atan(Math.exp(y*Math.PI/20037508.34))*360/Math.PI)-90];
  const _reprojGeom=(g)=>{if(!g)return g;const rr=ring=>ring.map(_m2ll);if(g.type==='Polygon')return{...g,coordinates:g.coordinates.map(rr)};if(g.type==='MultiPolygon')return{...g,coordinates:g.coordinates.map(p=>p.map(rr))};return g;};
  const [bx1,by1]=_ll2m([minLng,minLat]);
  const [bx2,by2]=_ll2m([maxLng,maxLat]);
  const url=`https://geoserver1.ms.gov.ge/geoserver/ms_maps_main/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=msm_z__gis_data_00013&outputFormat=application/json&srsName=EPSG:3857&BBOX=${bx1},${by1},${bx2},${by2},EPSG:3857&count=500`;
  try{
    const r=await fetch(url);
    if(!r.ok)return[];
    const j=await r.json();
    if(j.features?.length){
      j.features.forEach((f,i)=>{
        const ex=(arr)=>{if(typeof arr[0]==='number'){xs.push(arr[0]);ys.push(arr[1]);}else arr.forEach(ex);};
        const xs=[],ys=[];
        if(f.geometry?.coordinates)ex(f.geometry.coordinates);
        console.log('[ZD]',i,f.properties?.kve_zona,f.geometry?.type,Math.round(Math.max(...xs)-Math.min(...xs))+'m x '+Math.round(Math.max(...ys)-Math.min(...ys))+'m','verts:',xs.length);
      });
    }
    const parcelFeat={type:'Feature',geometry:geojson,properties:{}};
    const parcelArea=turf.area(parcelFeat);
    if(!parcelArea)return[];
    const results=[];
    for(const feat of(j.features||[])){
      try{
        const repGeom=_reprojGeom(feat.geometry);
        if(!repGeom)continue;
        const repFeat={type:'Feature',geometry:repGeom,properties:feat.properties};
        const inter=turf.intersect(parcelFeat,repFeat);
        if(!inter)continue;
        const intArea=turf.area(inter);
        if(intArea<1)continue;
        const pct=Math.round(intArea/parcelArea*100);
        if(pct<1)continue;
        results.push({kve_zona:feat.properties.kve_zona||feat.properties.zona||'',k1:feat.properties.k1,k2:feat.properties.k2,k3:feat.properties.k3,pct,area:intArea,geometry:inter.geometry});
      }catch(e){}
    }
    // Merge entries with the same zone name
    const zoneMap={};
    for(const r of results){
      const k=r.kve_zona;
      if(!zoneMap[k]){zoneMap[k]={...r};}else{
        zoneMap[k].area+=r.area;
        try{
          const u=turf.union({type:'Feature',geometry:zoneMap[k].geometry,properties:{}},{type:'Feature',geometry:r.geometry,properties:{}});
          if(u)zoneMap[k].geometry=u.geometry;
        }catch(_){}
      }
    }
    const merged=Object.values(zoneMap).map(r=>({...r,pct:Math.max(1,Math.round(r.area/parcelArea*100))}));
    merged.sort((a,b)=>b.area-a.area);
    return merged;
  }catch(e){return[];}
}
function _zoneInfo(kve_zona){
  const k=(kve_zona||'').toLowerCase().trim();
  const Z={
    'sacxovrebeli zona':{f:'#f0d67d',o:0.8},
    'sacxovrebeli zona-1':{f:'#ebbd54',o:0.8},
    'sacxovrebeli zona-2':{f:'#e1a61c',o:0.8},
    'sacxovrebeli zona-3':{f:'#ab9154',o:0.8},
    'sacxovrebeli zona-4':{f:'#e6872b',o:0.8},
    'sacxovrebeli zona-5':{f:'#8a7544',o:0.5},
    'sacxovrebeli zona-6':{f:'#734c00',o:0.8},
    'sazogadoebriv saqmiani zona':{f:'#cd6666',o:0.8,s:'#f0f0f0'},
    'sazogadoebriv saqmiani zona-1':{f:'#cf4040',o:0.8,s:'#f0f0f0'},
    'sazogadoebriv saqmiani zona-2':{f:'#a50531',o:0.8,s:'#f0f0f0'},
    'sazogadoebriv saqmiani zona-3':{f:'#7d0e0b',o:0.8,s:'#6e6e6e'},
    'samrewvelo zona-1':{f:'#979797',o:0.8,s:'#f0f0f0'},
    'samrewvelo zona-2':{f:'#616161',o:0.8,s:'#f0f0f0'},
    'satransporto zona-1':{f:'#ffff00',o:0.8},
    'satransporto zona-2':{f:'#ded612',o:0.8},
    'rekreaciuli zona':{f:'#72b751',o:0.8},
    'rekreaciuli zona-1':{f:'#939300',o:0.8},
    'rekreaciuli zona-2':{f:'#88ab0e',o:0.5},
    'rekreaciuli zona-3':{f:'#647e14',o:0.8},
    'satyeo zona':{f:'#4c6300',o:0.8,s:'#f0f0f0'},
    'sasoflo sameurneo zona':{f:'#bef383',o:0.8,s:'#b2b2b2'},
    'landsaftur sarekreacio':{f:'#b7b700',o:0.8},
    'sanitaruli zona':{f:'#f5f5bb',o:0.8,s:'#f0f0f0'},
    'hidrologia':{f:'#80d6ff',o:0.8,s:'#9c9c9c'},
    'specialuri zona-1':{f:'#d5aaaa',o:0.8,s:'#f0f0f0'},
    'specialuri zona-2':{f:'#bf669e',o:0.8,s:'#b85285'},
    'specialuri zona-3':{f:'#b726d7',o:0.8,s:'#f0f0f0'},
  };
  return Z[k]||{f:'#cccccc',o:0.7,s:'#999999'};
}
function _zoneColor(kve_zona){return _zoneInfo(kve_zona).f;}
function _buildZoneChart(zones){
  const r=32,sw=14;
  const circ=+(2*Math.PI*r).toFixed(3);
  let circles='',legend='',cumLen=0;
  circles+=`<circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${sw}"/>`;
  for(const z of zones){
    const segLen=+(z.pct/100*circ).toFixed(3);
    const gap=+(circ-segLen).toFixed(3);
    const offset=+(circ/4-cumLen).toFixed(3);
    const color=_zoneColor(z.kve_zona);
    circles+=`<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="0 ${circ}" stroke-dashoffset="${offset}" opacity="0.9">`
      +`<animate attributeName="stroke-dasharray" from="0 ${circ}" to="${segLen} ${gap}" dur="0.55s" fill="freeze" calcMode="spline" keySplines="0 0.55 0.45 1" keyTimes="0;1"/>`
      +`</circle>`;
    cumLen+=segLen;
    const tr=_translateZone(z.kve_zona);
    const en=tr&&tr.includes('\n')?tr.split('\n')[0]:(tr||z.kve_zona);
    const hasK=z.k1!=null||z.k2!=null||z.k3!=null;
    let tipHtml='';
    if(hasK){
      const fM=n=>`${Math.round(n).toLocaleString('en-US')} m²`;
      const fK=k=>Number(k).toFixed(2);
      const zA=z.area||0;const sbA=_setbackRingAreaM2||0;const nb=Math.max(0,(_currentParcelAreaM2||0)-sbA);
      let tc=`<div style="font-size:0.58rem;font-weight:600;color:rgba(255,255,255,0.65);margin-bottom:4px;white-space:nowrap">${en}</div>`;
      tc+=`<div style="font-size:0.56rem;color:rgba(255,255,255,0.35);margin-bottom:5px">Zone area: ${fM(zA)}</div>`;
      if(z.k1!=null){const fp=Math.round(zA*z.k1);const adjFp=Math.min(fp,Math.round(nb*z.pct/100));
        tc+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:1px 5px;margin-bottom:2px"><span style="font-size:0.56rem;color:rgba(255,255,255,0.25);font-family:monospace">K1=${fK(z.k1)}</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.45)">Max footprint</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.8);text-align:right">${fM(fp)}</span></div>`;
        if(adjFp<fp)tc+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:1px 5px;margin-bottom:2px"><span></span><span style="font-size:0.54rem;color:rgba(239,68,68,0.6)">adj. for setback</span><span style="font-size:0.54rem;color:rgba(239,68,68,0.75);text-align:right">${fM(adjFp)}</span></div>`;}
      if(z.k2!=null)tc+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:1px 5px;margin-bottom:2px"><span style="font-size:0.56rem;color:rgba(255,255,255,0.25);font-family:monospace">K2=${fK(z.k2)}</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.45)">Max floor area</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.8);text-align:right">${fM(Math.round(zA*z.k2))}</span></div>`;
      if(z.k1!=null&&z.k2!=null&&z.k1>0){const maxFloors=Math.floor((z.k2/z.k1)+1e-9);tc+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:1px 5px;margin-bottom:2px"><span style="font-size:0.56rem;color:rgba(255,255,255,0.25);font-family:monospace">K2÷K1</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.45)">Max height (floors)</span><span style="font-size:0.56rem;color:rgba(255,255,255,0.8);text-align:right">${maxFloors}</span></div>`;}
      if(z.k3!=null)tc+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:1px 5px"><span style="font-size:0.56rem;color:rgba(255,255,255,0.25);font-family:monospace">K3=${fK(z.k3)}</span><span style="font-size:0.56rem;color:rgba(52,211,153,0.6)">Min greening</span><span style="font-size:0.56rem;color:rgba(52,211,153,0.85);text-align:right">${fM(Math.round(zA*z.k3))}</span></div>`;
      tipHtml=`<div style="position:relative;display:inline-flex;align-items:center;cursor:help;flex-shrink:0;margin-left:3px" onmouseenter="this.lastElementChild.style.visibility='visible';this.lastElementChild.style.opacity='1'" onmouseleave="this.lastElementChild.style.visibility='hidden';this.lastElementChild.style.opacity='0'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><div style="visibility:hidden;opacity:0;transition:opacity 0.12s;position:absolute;bottom:calc(100% + 5px);right:-4px;background:rgba(12,12,18,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 8px;min-width:160px;z-index:200;box-shadow:0 4px 20px rgba(0,0,0,0.6);pointer-events:none">${tc}</div></div>`;
    }
    legend+=`<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px"><div style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0"></div><span style="color:rgba(255,255,255,0.82);font-size:0.65rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${en}</span><span style="color:rgba(255,255,255,0.45);font-size:0.65rem;flex-shrink:0">${z.pct}%</span>${tipHtml}</div>`;
  }
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:10px"><svg width="84" height="84" viewBox="-42 -42 84 84" style="display:block">${circles}</svg><div style="width:100%">${legend}</div></div>`;
}

function _buildBuildingParams(zones,parcelAreaM2){
  if(!parcelAreaM2||!zones||!zones.length)return'';
  const fM=n=>n==null?'—':Math.round(n).toLocaleString('en-US')+' m²';
  const fK=k=>k==null?'—':Number(k).toFixed(2);
  const sbArea=_setbackRingAreaM2||0;
  const netBuild=Math.max(0,parcelAreaM2-sbArea);
  let h=`<div style="font-size:0.58rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:rgba(255,255,255,0.28);margin-bottom:6px">Building Parameters</div>`;
  // Area summary
  h+=`<div style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin-bottom:8px">`;
  h+=`<span style="color:rgba(255,255,255,0.45);font-size:0.6rem">Parcel area</span><span style="color:rgba(255,255,255,0.8);font-size:0.6rem;text-align:right">${fM(parcelAreaM2)}</span>`;
  if(sbArea>0){
    const sbPct=Math.round(sbArea/parcelAreaM2*100);
    h+=`<span style="color:rgba(239,68,68,0.65);font-size:0.6rem">Setback ring</span><span style="color:rgba(239,68,68,0.65);font-size:0.6rem;text-align:right">−${fM(sbArea)} <span style="opacity:0.7">(${sbPct}%)</span></span>`;
    h+=`<span style="color:rgba(255,255,255,0.7);font-size:0.6rem;font-weight:600">Net buildable</span><span style="color:rgba(255,255,255,0.7);font-size:0.6rem;font-weight:600;text-align:right">${fM(netBuild)}</span>`;
  }
  h+=`</div>`;
  // Per-zone k values
  const zonesK=zones.filter(z=>z.k1!=null||z.k2!=null||z.k3!=null);
  let totFp=0,totFa=0,totGr=0,hasFp=false,hasFa=false,hasGr=false;
  for(const z of zonesK){
    const col=_zoneColor(z.kve_zona);
    const tr=_translateZone(z.kve_zona);const dn=tr&&tr.includes('\n')?tr.split('\n')[0]:(tr||z.kve_zona);
    h+=`<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">`
      +`<div style="width:6px;height:6px;border-radius:1px;background:${col};flex-shrink:0"></div>`
      +`<span style="font-size:0.6rem;color:rgba(255,255,255,0.55);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dn}</span>`
      +`<span style="font-size:0.58rem;color:rgba(255,255,255,0.3)">${z.pct}%</span></div>`;
    h+=`<div style="display:grid;grid-template-columns:auto 1fr auto;gap:2px 5px;padding-left:11px;margin-bottom:6px">`;
    if(z.k1!=null){const fp=Math.round(z.area*z.k1);const adjFp=Math.min(fp,Math.round(netBuild*z.pct/100));totFp+=fp;hasFp=true;
      h+=`<span style="font-size:0.58rem;color:rgba(255,255,255,0.28);font-family:monospace">K1 = ${fK(z.k1)}</span><span style="font-size:0.58rem;color:rgba(255,255,255,0.45)">Max footprint</span><span style="font-size:0.58rem;color:rgba(255,255,255,0.8);text-align:right">${fM(fp)}</span>`;
      if(adjFp<fp)h+=`<span></span><span style="font-size:0.56rem;color:rgba(239,68,68,0.6)">adj. for setback</span><span style="font-size:0.56rem;color:rgba(239,68,68,0.75);text-align:right">${fM(adjFp)}</span>`;}
    if(z.k2!=null){const fa=Math.round(z.area*z.k2);totFa+=fa;hasFa=true;
      h+=`<span style="font-size:0.58rem;color:rgba(255,255,255,0.28);font-family:monospace">K2 = ${fK(z.k2)}</span><span style="font-size:0.58rem;color:rgba(255,255,255,0.45)">Max floor area</span><span style="font-size:0.58rem;color:rgba(255,255,255,0.8);text-align:right">${fM(fa)}</span>`;}
    if(z.k3!=null){const gr=Math.round(z.area*z.k3);totGr+=gr;hasGr=true;
      h+=`<span style="font-size:0.58rem;color:rgba(255,255,255,0.28);font-family:monospace">K3 = ${fK(z.k3)}</span><span style="font-size:0.58rem;color:rgba(52,211,153,0.65)">Min greening</span><span style="font-size:0.58rem;color:rgba(52,211,153,0.85);text-align:right">${fM(gr)}</span>`;}
    h+=`</div>`;
  }
  if(zonesK.length>1&&(hasFp||hasFa||hasGr)){
    h+=`<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:5px;display:grid;grid-template-columns:auto 1fr auto;gap:2px 5px">`;
    if(hasFp){const adjTot=Math.min(totFp,netBuild);
      h+=`<span></span><span style="font-size:0.6rem;color:rgba(255,255,255,0.55);font-weight:600">Total max footprint</span><span style="font-size:0.6rem;color:rgba(255,255,255,0.8);font-weight:600;text-align:right">${fM(totFp)}</span>`;
      if(adjTot<totFp)h+=`<span></span><span style="font-size:0.56rem;color:rgba(239,68,68,0.6)">adj. for setback</span><span style="font-size:0.56rem;color:rgba(239,68,68,0.75);text-align:right">${fM(adjTot)}</span>`;}
    if(hasFa)h+=`<span></span><span style="font-size:0.6rem;color:rgba(255,255,255,0.55);font-weight:600">Total max floor area</span><span style="font-size:0.6rem;color:rgba(255,255,255,0.8);font-weight:600;text-align:right">${fM(totFa)}</span>`;
    if(hasGr)h+=`<span></span><span style="font-size:0.6rem;color:rgba(52,211,153,0.65);font-weight:600">Total min greening</span><span style="font-size:0.6rem;color:rgba(52,211,153,0.85);font-weight:600;text-align:right">${fM(totGr)}</span>`;
    h+=`</div>`;
  }
  return h;
}

function _updateZoneLayer(zones){
  if(!mapReady||!map.getSource('zone-overlay'))return;
  if(!zones||!zones.length){map.getSource('zone-overlay').setData({type:'FeatureCollection',features:[]});return;}
  const features=zones.filter(z=>z.geometry).map(z=>{const i=_zoneInfo(z.kve_zona);return{type:'Feature',geometry:z.geometry,properties:{kve_zona:z.kve_zona,pct:z.pct,color:i.f,opacity:i.o,stroke:i.s||null}};});
  map.getSource('zone-overlay').setData({type:'FeatureCollection',features});
}
function _updateSetbackLayer(geojson){
  if(!mapReady||!map.getSource('setback'))return;
  if(!geojson||geojson.type==='LineString'||geojson.type==='MultiLineString'){
    map.getSource('setback').setData({type:'FeatureCollection',features:[]});return;
  }
  try{
    const feat={type:'Feature',geometry:geojson,properties:{}};
    const inset=turf.buffer(feat,-3,{units:'meters'});
    map.getSource('setback').setData(inset||{type:'FeatureCollection',features:[]});
  }catch(e){map.getSource('setback').setData({type:'FeatureCollection',features:[]});}
}
function _updateSetbackRing(parcelGeom){
  if(!mapReady||!map.getSource('setback-ring'))return;
  if(!parcelGeom){
    _setbackRingAreaM2=null;
    map.getSource('setback-ring').setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','visible');
    return;
  }
  try{
    const parcelFeat={type:'Feature',geometry:parcelGeom,properties:{}};
    const inset=turf.buffer(parcelFeat,-3,{units:'meters'});
    if(!inset){_setbackRingAreaM2=null;map.getSource('setback-ring').setData({type:'FeatureCollection',features:[]});return;}
    const ring=turf.difference(parcelFeat,inset);
    _setbackRingAreaM2=ring?Math.round(turf.area(ring)):null;
    map.getSource('setback-ring').setData(ring||{type:'FeatureCollection',features:[]});
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','none');
  }catch(e){
    _setbackRingAreaM2=null;
    map.getSource('setback-ring').setData({type:'FeatureCollection',features:[]});
    if(map.getLayer('parcel-fill'))map.setLayoutProperty('parcel-fill','visibility','visible');
  }
}
function runZoningAnalysis(){
  const btn=document.getElementById('nav-zoning-btn');
  const zr=document.getElementById('pfc-zone-row');
  const zList=document.getElementById('pfc-zones-list');
  const note=document.getElementById('pfc-setback-note');
  if(btn?.classList.contains('active')){
    btn.classList.remove('active');
    if(zr)zr.style.display='none';
    if(note)note.style.display='none';
    _updateSetbackLayer(null);
    _updateZoneLayer(null);
    _updateSetbackRing(null);
    const _bpr0=document.getElementById('pfc-build-params-row');if(_bpr0)_bpr0.style.display='none';
    _maxFootprintM2=null;_maxFloorAreaM2=null;_noDevZone=false;_noDevZoneUnion=null;window._rptZones=null;document.getElementById('pfc-nodev-warn')?.style&&(document.getElementById('pfc-nodev-warn').style.display='none');document.getElementById('pfc-area-warn')?.style&&(document.getElementById('pfc-area-warn').style.display='none');
    return;
  }
  if(!_currentParcelGeoJSON)return;
  // Usage limit for analysis
  if(!currentUser){openAuthModal("view-signup");return;}
  if(currentUser.plan==='pro'){
    if(_proAnalysisCount>=_analysisLimit()){_openPaywallLimit(_isTrialing()?'trial_analysis':'pro_analysis');return;}
    _proAnalysisCount++;_saveProCounts(currentUser.id);
  } else {
    if(_freeAnalysisCount>=_analysisLimit()){_openPaywallLimit('free_analysis');return;}
    _freeAnalysisCount++;_saveFreeCounts(currentUser.id);
  }
  btn?.classList.add('active');
  if(zr)zr.style.display='block';
  if(zList)zList.innerHTML='<span style="color:rgba(255,255,255,0.3);font-size:0.68rem">Analyzing…</span>';
  if(note)note.style.display='none';
  _updateSetbackLayer(_currentParcelGeoJSON);
  _fetchFunctionalZone(_currentParcelGeoJSON).then(zones=>{
    if(!zones.length){
      if(zr)zr.style.display='none';
      btn?.classList.remove('active');
      _updateSetbackLayer(null);
      _updateZoneLayer(null);
      _updateSetbackRing(null);
      const _bpr1=document.getElementById('pfc-build-params-row');if(_bpr1)_bpr1.style.display='none';
      _maxFootprintM2=null;_maxFloorAreaM2=null;_noDevZone=false;_noDevZoneUnion=null;window._rptZones=null;document.getElementById('pfc-nodev-warn')?.style&&(document.getElementById('pfc-nodev-warn').style.display='none');document.getElementById('pfc-area-warn')?.style&&(document.getElementById('pfc-area-warn').style.display='none');
      return;
    }
    _updateZoneLayer(zones);
    window._rptZones=zones; // active zone list, for the report's zoning legend
    {const _zK=zones.filter(z=>z.k1!=null);const _noD=_zK.length>0&&_zK.every(z=>z.k1==0);_noDevZone=_noD;}
    {const _ndF=zones.filter(z=>z.k1!=null&&z.k1==0&&z.geometry).map(z=>({type:'Feature',geometry:z.geometry,properties:{}}));if(_ndF.length>0){try{_noDevZoneUnion=_ndF.reduce((a,f)=>a?(turf.union(a,f)||a):f,null);}catch(_e){_noDevZoneUnion=_ndF[0]||null;}}else{_noDevZoneUnion=null;}}
    _updateSetbackRing(_noDevZone?null:_currentParcelGeoJSON);
    {const _kz=zones.filter(z=>z.k1!=null&&z.k1>0);_maxFootprintM2=_kz.length?Math.round(_kz.reduce((s,z)=>s+z.area*z.k1,0)):null;}
    {const _kf=zones.filter(z=>z.k2!=null&&z.k2>0);_maxFloorAreaM2=_kf.length?Math.round(_kf.reduce((s,z)=>s+z.area*z.k2,0)):null;}
    _applyExtrusionHeightCap();
    _checkAreaViolation(_activeBld());
    {let _zc=_buildZoneChart(zones);if(_noDevZone)_zc+='<div style="margin-top:7px;padding:5px 8px;background:rgba(234,179,8,0.07);border:1px solid rgba(234,179,8,0.22);border-radius:5px;font-size:0.58rem;color:rgba(234,179,8,0.85);line-height:1.5">&#x26A0; This area is not designated for development. Building is not permitted.</div>';if(zList)zList.innerHTML=_zc;}

    if(note)note.style.display='block';
    const card=document.getElementById('parcel-float-card');
    if(card&&card.style.display==='none')card.style.display='block';
  }).catch((e)=>{
    console.error('[ZoneAnalysis error]',e);
    if(zr)zr.style.display='none';
    btn?.classList.remove('active');
    _updateSetbackLayer(null);
    _updateZoneLayer(null);
    _updateSetbackRing(null);
    const _bpr2=document.getElementById('pfc-build-params-row');if(_bpr2)_bpr2.style.display='none';
    _maxFootprintM2=null;_maxFloorAreaM2=null;_noDevZone=false;_noDevZoneUnion=null;window._rptZones=null;document.getElementById('pfc-nodev-warn')?.style&&(document.getElementById('pfc-nodev-warn').style.display='none');document.getElementById('pfc-area-warn')?.style&&(document.getElementById('pfc-area-warn').style.display='none');
  });
}
function clearParcelSelection(){
  if(_activeBldId){_deselectBuilding();return;}
  if(_isDrawnArea){clearPolygonSelect();return;}
  resetAnalysis();
  hideParcelPopup();
  document.getElementById("info-card").style.display="none";
  document.getElementById("owner-results-card").style.display="none";
  document.getElementById("floor-detail-panel").style.display="none";
  setStatus("","");
  const inputEl=document.getElementById("input-side");
  if(inputEl)inputEl.value="";
  _updateMapInfoBadge();
  if(mapReady)map.getSource("parcel")?.setData({type:"FeatureCollection",features:[]});
}
// Walkability (free analysis) feature removed. Kept as a no-op because old
// saved projects and the hidden #analyse-btn onclick still reference it.
function onAnalyseClick(){}

let is3D = false;
function toggle3D() {
  if (!mapReady) return;
  is3D = !is3D;
  const btn = document.getElementById("btn-3d");
  const mzcBtn = document.getElementById("mzc-3d-btn");
  if (is3D) {
    if (!map.getLayer("3d-buildings")) {
  map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": "#ffffff",
      "fill-extrusion-height": ["interpolate",["linear"],["zoom"],14,0,14.05,["get","height"]],
      "fill-extrusion-base": ["interpolate",["linear"],["zoom"],14,0,14.05,["get","min_height"]],
      "fill-extrusion-opacity": 0.25
    }
  });
  // Move isochrone and parcel layers on top of buildings
  map.moveLayer("iso-fill");
  map.moveLayer("iso-glow");
  map.moveLayer("iso-line");
  map.moveLayer("parcel-fill");
  map.moveLayer("parcel-line");
} else {
  map.setLayoutProperty("3d-buildings", "visibility", "visible");
  map.moveLayer("iso-fill");
  map.moveLayer("iso-glow");
  map.moveLayer("iso-line");
  map.moveLayer("parcel-fill");
  map.moveLayer("parcel-line");
}
    map.easeTo({ pitch: 50, bearing: -15, duration: 800 });
    if(btn){btn.classList.add("active");btn.textContent="3D";}
    if(mzcBtn)mzcBtn.classList.add("active");
  } else {
    if (map.getLayer("3d-buildings")) {
      map.setLayoutProperty("3d-buildings", "visibility", "none");
    }
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    if(btn){btn.classList.remove("active");btn.textContent="3D";}
    if(mzcBtn)mzcBtn.classList.remove("active");
  }
}

// ── Map ───────────────────────────────────────────────────────────────────────
mapboxgl.accessToken=MAPBOX_TOKEN;
const map=new mapboxgl.Map({container:"map",style:"mapbox://styles/mapbox/dark-v11",center:[44.783,41.693],zoom:16,attributionControl:false,preserveDrawingBuffer:true});
map.on("load",()=>{
  mapReady=true;
  map.setLanguage(lang==='ka'?'ka':'en');
  const _mzc=document.getElementById('map-zoom-controls');
  if(_mzc){_mzc.classList.remove('mzc-loading');_mzc.style.display='';_mzc.style.opacity='0';requestAnimationFrame(()=>{_mzc.style.transition='opacity 0.5s ease';_mzc.style.opacity='1';});}

  try{initCustomLayers();}catch(err){console.error("initCustomLayers (load) failed:",err);}

  // Click on map to identify parcel
  // Pointer cursor when hovering imported layer features
  map.on('mousemove',(e)=>{
    if(!_importedLayers.some(l=>l.visible)){map.getCanvas().style.cursor='';return;}
    const layerIds=_importedLayers.filter(l=>l.visible)
      .flatMap(l=>[`import-${l.uid}-fill`,`import-${l.uid}-line`,`import-${l.uid}-circle`].filter(id=>map.getLayer(id)));
    if(!layerIds.length){map.getCanvas().style.cursor='';return;}
    const hits=map.queryRenderedFeatures(e.point,{layers:layerIds});
    map.getCanvas().style.cursor=hits.length?'pointer':'';
  });

  map.on("click",async(e)=>{
    if(_polyDrawing)return;
    if(_drawJustFinished)return;
    if(e.originalEvent?._ttcHandled)return;
    if(e.originalEvent?._bldHandled)return;
    if(mapReady&&map.getLayer('ttc-stops')&&map.queryRenderedFeatures(e.point,{layers:['ttc-stops']}).length)return;
    if(_profileMode)return;
    if(_selectedFloors.size>0&&!window._threeBldHit){_selectFloor(-1);}
    window._threeBldHit=false;
    if(_isDrawnArea)return;

    // Imported layer mode: intercept clicks — no gov API query
    const _visImport=_importedLayers.filter(l=>l.visible);
    if(_visImport.length){
      const _impLayerIds=_visImport.flatMap(l=>
        [`import-${l.uid}-fill`,`import-${l.uid}-line`,`import-${l.uid}-circle`].filter(id=>map.getLayer(id)));
      if(_impLayerIds.length){
        const _impHits=map.queryRenderedFeatures(e.point,{layers:_impLayerIds});
        if(_impHits.length){
          const hit=_impHits[0];
          const hitUid=_visImport.find(l=>
            [`import-${l.uid}-fill`,`import-${l.uid}-line`,`import-${l.uid}-circle`].includes(hit.layer.id))?.uid;
          if(hitUid){_selectImportedFeature(hit,hitUid);return;}
        } else {
          _clearImportedSelection();
        }
      }
      return; // imported layer is on — never fall through to gov API
    }
    // Active bus stop: first click deselects, parcel loads on the next click
    if(_ttcActiveStop){
      _ttcSelectedStopGeo=null;
      _clearBusStopRoute();
      _ttcClearRouteShape();
      _ttcClearPoll();
      _ttcRDState={};
      if(mapReady&&map.getSource('ttc-stops-hl'))
        map.getSource('ttc-stops-hl').setData({type:'FeatureCollection',features:[]});
      document.querySelectorAll('.ttc-stop-card').forEach(c=>c.classList.remove('active'));
      return;
    }
    const{lng,lat}=e.lngLat;
    const bounds=map.getBounds();
    setStatus(t().searching,"");
    try{
      const form=new FormData();
      form.append("keyword",`${lng},${lat}`);
      form.append("keyword_description[coords][]",lng);
      form.append("keyword_description[coords][]",lat);
      form.append("keyword_description[bbox][]",bounds.getWest());
      form.append("keyword_description[bbox][]",bounds.getSouth());
      form.append("keyword_description[bbox][]",bounds.getEast());
      form.append("keyword_description[bbox][]",bounds.getNorth());
      form.append("keyword_description[zoom]",map.getZoom());
      form.append("keyword_description[lang]",lang);
      form.append("keyword_description[layers][]",92);
      form.append("keyword_description[layers][]",97);
      form.append("keyword_description[getinfo_type]","click");
      const res=await fetch("https://maps.gov.ge/map/portal/search",{method:"POST",body:form});
      const data=await res.json();
      if(!data.status||!data.result?.length){setStatus("","");return;}
      const item=data.result[0];
      const lbl=item.details?.info_link?.split("lbl=")[1];
      if(!lbl){setStatus("","");return;}
      const name=item.name||lbl;
      const inputEl=document.getElementById(hasSearched?"input-side":"input-center");
      if(inputEl)inputEl.value=name;
      try{resetAnalysis();}catch(_){}
      await loadParcel(lbl,name);
    }catch(e){
      console.warn("map click:",e);
      if(e.message==="no_shape")setStatus(lang==="ka"?"ამ ნაკვეთისთვის საზღვრის მონაცემები მიუწვდომელია.":"No boundary data available for this parcel.","error");
      else setStatus(t().govGeDown,"");
    }
  });

  // Click on 3D building → open draw popup to adjust height
  function _openExtrusionPopup(){
    if(!_extrusionActive||!_isDrawnArea||_drawMenuOpen||_shapeEditMode)return;
    _drawMenuOpen=true;
    document.getElementById('draw-area-btn')?.classList.add('open');
    document.getElementById('draw-shape-popup')?.classList.add('open');
    setTimeout(()=>{document.addEventListener('click',_closeDrawMenuOutside,{capture:true});},0);
  }
  map.on("click","extrusion-layer",_openExtrusionPopup);
  map.on("mouseenter","extrusion-layer",()=>{if(_extrusionActive&&_isDrawnArea)map.getCanvas().style.cursor="pointer";});
  map.on("mouseleave","extrusion-layer",()=>{map.getCanvas().style.cursor="";});

  // Pointer cursor when hovering parcel
  map.on("moveend",function(){fetchDBParcelsIfEnabled();});
  map.on("move",_updateParcelCardPos);
  map.on("mouseenter","parcel-fill",()=>{map.getCanvas().style.cursor="pointer";});
  map.on("mouseleave","parcel-fill",()=>{map.getCanvas().style.cursor="";});
  _initParcelCardDrag();
});

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(msg,type,id){
  // legacy center element (kept for center-search state, hidden via CSS otherwise)
  const ce=document.getElementById("status-center");
  if(ce){ce.textContent=msg;ce.className="status"+(type?" "+type:"");}
  const toast=document.getElementById("map-status");
  if(!toast)return;
  clearTimeout(_statusTimer);
  if(!msg){toast.classList.remove("visible","success","error");toast.innerHTML="";return;}
  toast.innerHTML=(type?"":'<span class="ms-dot"></span>')+msg;
  toast.className="visible"+(type?" "+type:"");
  if(type==="success")_statusTimer=setTimeout(()=>{toast.classList.remove("visible");},2500);
}
function setLoading(on){
  const tr=t();
  ["center","side"].forEach(s=>{const btn=document.getElementById("btn-"+s);if(!btn)return;btn.disabled=on;btn.textContent=on?tr.btnLoading:tr.btn;});
}
function getCode(){const el=hasSearched?document.getElementById("input-side"):document.getElementById("input-center");return el?el.value.trim():"";}
function transitionToSide(code){
  if(hasSearched)return;hasSearched=true;
  document.getElementById("input-side").value=code;
  document.getElementById("center-search").classList.add("hidden");
  document.getElementById("map-blur").classList.add("hidden");
  document.getElementById("side-panel").classList.add("visible");
}
function resetAnalysis(){
  _currentParcelGeoJSON=null;
  _currentParcelAreaM2=null;
  parcelCentroid=null;
  ["analyse-btn","score-card","pro-analysis-card","export-btn","owner-results-card","wind-card"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display="none";
  });
  _setAnalysisPanel(false);
  _updateMapInfoBadge();
  setStatus("","","status-analysis");
  const btn=document.getElementById("analyse-btn");
  if(btn){
    btn.disabled=false;btn.style.opacity="";btn.filter="";
    btn.innerHTML=`<span id="analyse-btn-label">${t().analyseBtn}</span><span style="font-size:0.58rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(52,211,153,0.15);color:#34d399;border-radius:4px;padding:2px 5px" id="free-badge">${t().freeBadge}</span>`;
  }

  _mapillaryImages=[];_currentImageIdx=0;
  _climateData=null;_canopyRawData=null;_lstRawData=null;_canopyPct=null;_lstMean=null;_walkData=null;_proData=null;_isoData=null;
  const geodataBtn=document.getElementById("geodata-btn");if(geodataBtn)geodataBtn.style.display="none";
  const gallery=document.getElementById("mapillary-gallery");
  if(gallery){gallery.classList.remove("visible");setTimeout(()=>{if(!gallery.classList.contains("visible"))gallery.style.display="none";},420);}
  closeMapillaryLightbox();
  const empty={type:"FeatureCollection",features:[]};
  if(mapReady){
    map.getSource("isochrone")?.setData(empty);
    map.getSource("mapillary-active")?.setData(empty);
  }
  _ownerParcels=[];
  document.getElementById("lp-canopy-sw")?.classList.remove("on");
  document.getElementById("lp-lst-sw")?.classList.remove("on");
  const _cc=document.getElementById("pro-cat-climate-content");if(_cc)_cc.innerHTML="";
  ["pro-cat-education-content","pro-cat-mobility-content","pro-cat-energy-content"].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML="";});
  ["acc-schools-result","acc-kg-result","acc-mob-result","acc-transit-result","acc-canopy-result","acc-lst-result","acc-wind-result","acc-syntax-result","acc-parking-result"].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML="";});
  ["acc-iso-sw","acc-transit-sw","acc-solar-sw","acc-wind-sw","acc-connectivity-sw","acc-orientation-sw","acc-osm-sw","acc-schools-sw","acc-kg-sw","acc-parking-sw"].forEach(id=>{document.getElementById(id)?.classList.remove("on");});
  _ttcClearPoll();if(typeof _ttcRemoveFromMap==="function")_ttcRemoveFromMap();
  _parkingRemoveLayer();
  _isoActive=false;
  const _isoCtrls=document.getElementById("acc-iso-controls");if(_isoCtrls)_isoCtrls.style.display="none";
  const _osmLgR=document.getElementById("osm-legend");if(_osmLgR){_osmLgR.style.display="none";_osmLgR.innerHTML="";}
  clearOverpassLayers();
  clearSyntaxLayers();
  clearOrientLayers();
  {const _sl=document.getElementById("syntax-legend");if(_sl){_sl.style.display="none";_sl.innerHTML="";}}
  {const _or=document.getElementById("orient-rose");if(_or){_or.style.display="none";_or.innerHTML="";}}
  clearReliefOverlay();
  clearCanopyOverlay();
  clearLSTOverlay();
  clearSolarOverlay();
  _windData=null;
  stopWindAnimation();
  _resetExtrusionFull();
  if(_polyDrawing) clearPolygonSelect();
  document.getElementById("lbl-area").textContent=t().area;
  document.getElementById("lbl-addr").textContent=t().addr;
  ["row-line-ownership","row-line-extra"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});
  if(typeof clearSchoolsMapLayer==="function")clearSchoolsMapLayer();
  if(typeof clearKgMapLayer==="function")clearKgMapLayer();
  // Zoning analysis reset
  {const _zb=document.getElementById("nav-zoning-btn");if(_zb)_zb.classList.remove("active");}
  _updateSetbackLayer(null);_updateZoneLayer(null);_updateSetbackRing(null);
  _noDevZone=false;_noDevZoneUnion=null;_maxFootprintM2=null;_maxFloorAreaM2=null;
  ["pfc-zone-row","pfc-setback-note","pfc-setback-warn","pfc-area-warn","pfc-nodev-warn","pfc-build-params-row"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});
}

// ── WKT → GeoJSON ─────────────────────────────────────────────────────────────
function wktToGeoJSON(wkt){
  wkt=wkt.trim().replace(/^SRID=\d+;/i,"");const up=wkt.toUpperCase();
  function parseRing(s){return s.trim().split(",").map(p=>{const t=p.trim().split(/\s+/);return[parseFloat(t[0]),parseFloat(t[1])];}).filter(c=>!isNaN(c[0])&&!isNaN(c[1]));}
  function signedArea(ring){let a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){a+=(ring[j][0]+ring[i][0])*(ring[j][1]-ring[i][1]);}return a/2;}
  function closeRing(r){if(r.length&&(r[0][0]!==r[r.length-1][0]||r[0][1]!==r[r.length-1][1]))r.push([...r[0]]);return r;}
  function fixWinding(rings){return rings.map((r,i)=>{const a=signedArea(r);if(i===0&&a<0)r=[...r].reverse();if(i>0&&a>0)r=[...r].reverse();return closeRing(r);});}
  function groups(s){const g=[];let d=0,st=-1;for(let i=0;i<s.length;i++){if(s[i]==="("){d++;if(d===1)st=i+1;}else if(s[i]===")"){d--;if(d===0&&st!==-1){g.push(s.slice(st,i));st=-1;}}}return g;}
  const body=wkt.slice(wkt.indexOf("("));
  if(up.startsWith("MULTIPOLYGON"))return{type:"MultiPolygon",coordinates:groups(body).map(p=>fixWinding(groups(p).map(parseRing)))};
  if(up.startsWith("MULTILINESTRING"))return{type:"MultiLineString",coordinates:groups(body).flatMap(g=>groups(g).map(parseRing))};
  if(up.startsWith("LINESTRING"))return{type:"LineString",coordinates:parseRing(body.replace(/^\(|\)$/g,""))};
  const innerBody=body.slice(1,body.lastIndexOf(")"));
  return{type:"Polygon",coordinates:fixWinding(groups(innerBody).map(parseRing))};
}
function getCentroid(geojson){
  let coords=[];
  if(geojson.type==="Polygon")coords=geojson.coordinates[0];
  else if(geojson.type==="MultiPolygon")coords=geojson.coordinates[0][0];
  else if(geojson.type==="MultiLineString")coords=geojson.coordinates.flat();
  else coords=geojson.coordinates;
  if(!coords||!coords.length)return[0,0];
  return[coords.reduce((s,c)=>s+c[0],0)/coords.length,coords.reduce((s,c)=>s+c[1],0)/coords.length];
}

function _initParcelCardDrag(){
  const card=document.getElementById('parcel-float-card');
  const header=document.getElementById('pfc-header');
  if(!card||!header)return;
  let dragging=false,ox=0,oy=0;
  header.addEventListener('mousedown',e=>{
    if(e.target.tagName==='BUTTON')return;
    dragging=true;
    const r=card.getBoundingClientRect();
    ox=e.clientX-r.left; oy=e.clientY-r.top;
    document.addEventListener('mousemove',onDM);
    document.addEventListener('mouseup',onDU);
    e.preventDefault();
  });
  function onDM(e){
    if(!dragging)return;
    const mapEl=document.getElementById('map');
    if(!mapEl)return;
    const mr=mapEl.getBoundingClientRect();
    let nx=e.clientX-ox-mr.left;
    let ny=e.clientY-oy-mr.top;
    const cw=card.offsetWidth||200, ch=card.offsetHeight||120;
    nx=Math.max(4,Math.min(mr.width-cw-4,nx));
    ny=Math.max(4,Math.min(mr.height-ch-4,ny));
    card.style.left=nx+'px'; card.style.top=ny+'px';
    _parcelCardDragged=true;
  }
  function onDU(){
    dragging=false;
    document.removeEventListener('mousemove',onDM);
    document.removeEventListener('mouseup',onDU);
  }
}
function _updateParcelCardPos(){
  if(!_parcelCardLngLat||_parcelCardDragged)return;
  const card=document.getElementById('parcel-float-card');
  if(!card||card.style.display==='none')return;
  const pt=map.project(_parcelCardLngLat);
  const cw=card.offsetWidth||200, ch=card.offsetHeight||120;
  card.style.left=(pt.x+88)+'px';
  card.style.top=(pt.y-ch/2)+'px';
}
function toggleParcelCardMin(){
  const card=document.getElementById('parcel-float-card');
  const btn=document.getElementById('pfc-min-btn');
  if(!card)return;
  card.classList.toggle('minimized');
  if(btn)btn.textContent=card.classList.contains('minimized')?'+':'−';
  if(_parcelCardDragged)return;
  _updateParcelCardPos();
}
function showParcelPopup(lngLat){
  if(!map||!lngLat)return;
  const tr=t();
  _parcelCardLngLat=lngLat;
  _parcelCardDragged=false;
  const code =document.getElementById('val-code')?.textContent||'—';
  const area =document.getElementById('val-area')?.textContent||'—';
  const type =document.getElementById('val-type')?.textContent||'—';
  const addr =document.getElementById('val-addr')?.textContent||'—';
  const owner=document.getElementById('val-owner')?.textContent||'—';
  document.getElementById('pfc-code').textContent=code;
  document.getElementById('pfc-area').textContent=area;
  document.getElementById('pfc-type').textContent=type;
  document.getElementById('pfc-addr').textContent=addr;
  document.getElementById('pfc-owner').textContent=owner;
  document.getElementById('pfc-lbl-area').textContent=tr.area||'Area';
  document.getElementById('pfc-lbl-addr').textContent=tr.addr||'Address';
  document.getElementById('nav-zoning-btn')?.classList.remove('active');
  const _zrClr=document.getElementById('pfc-zone-row');
  const _pnClr=document.getElementById('pfc-setback-note');
  if(_zrClr)_zrClr.style.display='none';
  if(_pnClr)_pnClr.style.display='none';
  document.getElementById('pfc-setback-warn')?.style&&(document.getElementById('pfc-setback-warn').style.display='none');
  document.getElementById('pfc-area-warn')?.style&&(document.getElementById('pfc-area-warn').style.display='none');
  document.getElementById('pfc-nodev-warn')?.style&&(document.getElementById('pfc-nodev-warn').style.display='none');
  _noDevZone=false;_noDevZoneUnion=null;_maxFootprintM2=null;_maxFloorAreaM2=null;
  _updateSetbackLayer(null);
  const card=document.getElementById('parcel-float-card');
  const btn=document.getElementById('pfc-min-btn');
  card.classList.remove('minimized');
  if(btn)btn.textContent='−';
  card.style.display='block';
  if(typeof _setAnalysisPanel==='function')_setAnalysisPanel(true);
  const pt=map.project(lngLat);
  const ch=card.offsetHeight||118;
  card.style.left=(pt.x+88)+'px';
  card.style.top=(pt.y-ch/2)+'px';
}
function hideParcelPopup(){
  const card=document.getElementById('parcel-float-card');
  if(card)card.style.display='none';
  _parcelCardLngLat=null;
  _parcelCardDragged=false;
  _dbParcelGeoJSON=null;
  document.getElementById('pfc-setback-warn')?.style&&(document.getElementById('pfc-setback-warn').style.display='none');
  _updateSetbackLayer(null);
  _updateZoneLayer(null);
  _updateSetbackRing(null);
  const _bprH=document.getElementById('pfc-build-params-row');if(_bprH)_bprH.style.display='none';
  _maxFootprintM2=null;_maxFloorAreaM2=null;_noDevZone=false;_noDevZoneUnion=null;window._rptZones=null;document.getElementById('pfc-nodev-warn')?.style&&(document.getElementById('pfc-nodev-warn').style.display='none');document.getElementById('pfc-area-warn')?.style&&(document.getElementById('pfc-area-warn').style.display='none');
  document.getElementById('nav-zoning-btn')?.classList.remove('active');
  const zr=document.getElementById('pfc-zone-row');
  const kr=document.getElementById('pfc-kvals-row');
  const pn=document.getElementById('pfc-setback-note');
  if(zr)zr.style.display='none';
  if(kr)kr.style.display='none';
  if(pn)pn.style.display='none';
}

// ── Parse HTML ────────────────────────────────────────────────────────────────
function parseAttrs(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const bigs=[...doc.querySelectorAll(".bg-blue-100 .text-lg")];
  const area=bigs[1]?bigs[1].textContent.replace(/კვ\.მ\.|კვ.მ./g,"").trim():"";
  let parcelType="",address="",objectType="",objectDesc="",coverageZone="",ownershipType="",extraFeatures="";
  doc.querySelectorAll(".bg-blue-100 .p-2").forEach(row=>{
    const l=row.querySelector(".text-sm")?.textContent?.trim()||"";
    const v=row.querySelector(".text-md")?.textContent?.trim()||"";
    if(l.includes("ნაკვეთის ტიპი"))parcelType=v;
    if(l.includes("მისამართი"))address=v;
    if(l.includes("ობიექტის ტიპი"))objectType=v;
    if(l.includes("ობიექტის აღწერა"))objectDesc=v;
    if(l.includes("დაფარვის ზონა"))coverageZone=v;
    if(l.includes("საკუთრების ტიპი"))ownershipType=v;
    if(l.includes("დამატებითი მახასიათებლები"))extraFeatures=v;
  });
  const owners=[...doc.querySelectorAll(".divide-y.text-gray-800 p")].map(p=>p.textContent.trim()).filter(Boolean).join(", ");
  let registryDocUrl="",regDate="";
  doc.querySelectorAll("label.expandable").forEach(label=>{
    const sn=label.querySelector("span.flex-1")?.textContent?.trim()||"";
    if(!sn.includes("ამონაწერი"))return;
    let latest=null;
    label.querySelectorAll("a[href*='GetBlob']").forEach(a=>{
      const href=a.getAttribute("href")||"";
      const dateStr=a.querySelector("span.font-light")?.textContent?.trim()||"";
      if(dateStr){const[d,m,y]=dateStr.split(".");const iso=`${y}-${m}-${d}`;if(!latest||iso>latest.date)latest={href,date:iso};}
    });
    if(latest){registryDocUrl=latest.href;regDate=latest.date;}
  });
  return{area,parcelType,address,owners,registryDocUrl,regDate,objectType,objectDesc,coverageZone,ownershipType,extraFeatures};
}

// ── PDF owner extraction ──────────────────────────────────────────────────────
async function loadPDFJS(){
  if(pdfjsLib)return pdfjsLib;
  await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  pdfjsLib=window["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjsLib;
}
function parseOwners(text){
  const owners=[],seen=new Set();
  const plain=text.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  let m;
  const pr=/([^,]+?)\s*,\s*P\s*[\/\\]\s*N\s*:\s*(\d{9,11})/g;
  while((m=pr.exec(plain))!==null){if(!seen.has(m[2])){seen.add(m[2]);owners.push({name:m[1].trim(),id:m[2],type:"personal"});}}
  const cr=/([^,]+?)\s*,\s*ID\s+[^\s:,]+\s*:\s*(\d{8,12})/g;
  while((m=cr.exec(plain))!==null){if(!seen.has(m[2])){seen.add(m[2]);owners.push({name:m[1].trim(),id:m[2],type:"company"});}}
  if(!owners.length){const par=/\b(\d{9,11})\b/g;while((m=par.exec(plain))!==null){if(!seen.has(m[1])){seen.add(m[1]);owners.push({name:"",id:m[1],type:m[1].length===9?"company":"personal"});}}}
  return owners;
}
async function fetchOwnerIds(url){
  const pr=await fetch(PROXY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pdf",url})});
  if(!pr.ok)throw new Error("proxy_fail");
  const{base64}=await pr.json();
  const lib=await loadPDFJS();
  const bin=atob(base64);const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const pdf=await lib.getDocument({data:bytes}).promise;
  let txt="";
  for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const ct=await pg.getTextContent();txt+=ct.items.map(x=>x.str).join(" ")+"\n";}
  return parseOwners(txt);
}

// ── Supabase writes ───────────────────────────────────────────────────────────
async function sbFetch(path,method,sbBody,prefer){
  // The worker verifies this token and rejects unauthenticated writes
  const token=(await sb.auth.getSession()).data.session?.access_token;
  if(!token)throw new Error("sbFetch: no session");
  return fetch(PROXY,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action:"supabase",path,method,sbBody,prefer})});
}
async function saveToSupabase(id,cadastral,attrs,shape,owners){
  try{
    await sbFetch("/rest/v1/parcels","POST",{
      id,cadastral,area:attrs.area,parcel_type:attrs.parcelType,
      address:attrs.address,owners:attrs.owners,
      registry_doc_url:attrs.registryDocUrl,shape_wkt:shape,
      object_type:attrs.objectType||null,
      object_desc:attrs.objectDesc||null,
      coverage_zone:attrs.coverageZone||null,
      ownership_type:attrs.ownershipType||null,
      extra_features:attrs.extraFeatures||null,
      searched_by_name:currentUser?.name||currentUser?.email||null,
      searched_by_id:currentUser?.id||null,
      updated_at:new Date().toISOString()
    },"resolution=merge-duplicates");
    if(owners&&owners.length){
      await sbFetch("/rest/v1/owner_ids?cadastral=eq."+encodeURIComponent(cadastral),"DELETE",undefined,"");
      await sbFetch("/rest/v1/owner_ids","POST",owners.map(o=>({cadastral,owner_name:o.name,owner_id:o.id,owner_type:o.type})),"");
    }
  }catch(e){console.warn("Supabase:",e);}
}

// ── Isochrone + OSM ───────────────────────────────────────────────────────────
async function fetchIsochrone(lng,lat,minutes=10,mode="walking"){
  const url=`https://api.mapbox.com/isochrone/v1/mapbox/${mode}/${lng},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${MAPBOX_TOKEN}`;
  const res=await fetch(url);if(!res.ok)throw new Error("isochrone_fail");return res.json();
}
const TAG_MAP={
  amenity:[["restaurant","food"],["cafe","food"],["fast_food","food"],["bar","food"],["pub","food"],["food_court","food"],["ice_cream","food"],["hospital","health"],["clinic","health"],["doctors","health"],["pharmacy","health"],["dentist","health"],["health_centre","health"],["theatre","culture"],["cinema","culture"],["museum","culture"],["library","culture"],["arts_centre","culture"],["community_centre","culture"]],
  shop:[["bakery","food"],["deli","food"],["butcher","food"],["greengrocer","food"],["supermarket","retail"],["convenience","retail"],["clothes","retail"],["electronics","retail"],["hardware","retail"],["furniture","retail"],["books","retail"],["shoes","retail"],["mall","retail"],["market","retail"]],
  leisure:[["park","parks"],["garden","parks"],["nature_reserve","parks"],["playground","parks"],["sports_centre","parks"],["pitch","parks"],["track","parks"],["stadium","culture"],["fitness_centre","culture"]]
};
const CAT_COLORS={food:"#f97316",health:"#ef4444",parks:"#22c55e",retail:"#a855f7",culture:"#ec4899"};
const TAG_LOOKUP={};
for(const[k,pairs]of Object.entries(TAG_MAP)){for(const[v,cat]of pairs){TAG_LOOKUP[k+"="+v]=cat;}}
function isoBbox(f){const c=f.geometry.coordinates[0];const lngs=c.map(x=>x[0]),lats=c.map(x=>x[1]);return[Math.min(...lats),Math.min(...lngs),Math.max(...lats),Math.max(...lngs)].join(",");}

async function fetchAllCategories(bbox){
  const foodTags=[["amenity","restaurant"],["amenity","cafe"],["amenity","fast_food"],["amenity","bar"],["amenity","pub"],["shop","bakery"],["shop","supermarket"],["shop","convenience"],["shop","greengrocer"]];
  const healthTags=[["amenity","hospital"],["amenity","clinic"],["amenity","pharmacy"],["amenity","doctors"],["amenity","dentist"]];
  const parkTags=[["leisure","park"],["leisure","garden"],["leisure","playground"],["leisure","nature_reserve"]];
  const retailTags=[["shop","clothes"],["shop","electronics"],["shop","mall"],["shop","market"],["shop","furniture"],["shop","shoes"]];
  const cultTags=[["amenity","theatre"],["amenity","cinema"],["amenity","museum"],["amenity","library"],["leisure","fitness_centre"]];
  function lines(tags){return tags.map(([k,v])=>`node[${k}=${v}](${bbox});`).join("");}
  const query=`[out:json][timeout:20];
(${lines(foodTags)})->.food;.food out count;
(${lines(healthTags)})->.health;.health out count;
(${lines(parkTags)})->.parks;.parks out count;
(${lines(retailTags)})->.retail;.retail out count;
(${lines(cultTags)})->.culture;.culture out count;`;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let attempt=0;attempt<OVERPASS_ENDPOINTS.length;attempt++){
    const endpoint=OVERPASS_ENDPOINTS[attempt];
    try{
      const res=await fetch(endpoint,{
        method:"POST",
        body:"data="+encodeURIComponent(query),
        signal:AbortSignal.timeout(22000)
      });
      if(!res.ok)throw new Error(`http_${res.status}`);
      const text=await res.text();
      if(text.trimStart().startsWith("<"))throw new Error("html_error");
      const data=JSON.parse(text);
      const arr=data.elements.filter(e=>e.type==="count").map(e=>parseInt(e.tags?.total||"0",10));
      if(arr.length===5)return{food:arr[0],health:arr[1],parks:arr[2],retail:arr[3],culture:arr[4]};
      throw new Error("unexpected_response");
    }catch(err){
      console.warn(`Overpass attempt ${attempt+1} (${endpoint}):`,err.message);
      if(attempt<OVERPASS_ENDPOINTS.length-1){
        setStatus(`${t().retrying} (${attempt+2}/${OVERPASS_ENDPOINTS.length})…`,"","status-analysis");
        await sleep(800);
      }
    }
  }
  // All mirrors failed — return zeros, show a warning but don't crash
  setStatus("","","status-analysis");
  return{food:0,health:0,parks:0,retail:0,culture:0};
}

function shannonIndex(counts){
  const vals=Object.values(counts);
  const total=vals.reduce((s,v)=>s+v,0);
  if(total===0)return 0;
  if(vals.filter(v=>v>0).length<=1)return 0;
  let H=0;
  for(const v of vals){if(v>0){const p=v/total;H-=p*Math.log(p);}}
  const raw=H/Math.log(Object.keys(counts).length);
  const dominance=Math.max(...vals)/total;
  const penalty=dominance>0.5?(1-dominance)*2:1;
  return Math.round(raw*penalty*100);
}

async function fetchOverpass(query,maxRetries=5){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let attempt=0;attempt<maxRetries;attempt++){
    const endpoint=OVERPASS_ENDPOINTS[attempt%OVERPASS_ENDPOINTS.length];
    try{
      const res=await fetch(endpoint,{method:"POST",body:"data="+encodeURIComponent(query),signal:AbortSignal.timeout(45000)});
      if(!res.ok)throw new Error(`http_${res.status}`);
      const text=await res.text();
      if(text.trimStart().startsWith("<"))throw new Error("html_error");
      return JSON.parse(text);
    }catch(err){
      console.warn(`Overpass attempt ${attempt+1}:`,err.message);
      if(attempt<maxRetries-1){setStatus(`${t().retrying} (${attempt+2}/${maxRetries})…`,"","status-analysis");await sleep(1500*(attempt+1));}
    }
  }
  throw new Error("overpass_failed");
}

async function fetchProLayers(bbox){
  const schoolQ=`[out:json][timeout:25];(node[amenity=school](${bbox});way[amenity=school](${bbox});node[amenity=kindergarten](${bbox});way[amenity=kindergarten](${bbox}););out tags;`;
  const crashQ=`[out:json][timeout:25];(node[accident](${bbox});node[highway=traffic_signals](${bbox}););out tags;`;
  const[schoolRes,crashRes]=await Promise.allSettled([fetchOverpass(schoolQ,2),fetchOverpass(crashQ,2)]);
  const schools=schoolRes.status==="fulfilled"?schoolRes.value.elements||[]:[];
  const crashes=crashRes.status==="fulfilled"?crashRes.value.elements||[]:[];
  return{schoolCount:schools.filter(e=>e.tags?.amenity==="school").length,kgCount:schools.filter(e=>e.tags?.amenity==="kindergarten").length,crashCount:crashes.filter(e=>e.tags?.accident).length};
}

// ── Mapillary ─────────────────────────────────────────────────────────────────
async function fetchMapillaryImages(lng,lat){
  if(MAPILLARY_TOKEN==="YOUR_MAPILLARY_TOKEN")return[];
  let bbox;
  if(_currentParcelGeoJSON){
    let coords=[];
    if(_currentParcelGeoJSON.type==="Polygon")coords=_currentParcelGeoJSON.coordinates.flat();
    else if(_currentParcelGeoJSON.type==="MultiPolygon")coords=_currentParcelGeoJSON.coordinates.flat(2);
    if(coords.length){
      const lngs=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
      const buf=0.001;
      bbox=`${Math.min(...lngs)-buf},${Math.min(...lats)-buf},${Math.max(...lngs)+buf},${Math.max(...lats)+buf}`;
    }
  }
  if(!bbox)bbox=`${lng-0.002},${lat-0.002},${lng+0.002},${lat+0.002}`;
  const url=`https://graph.mapillary.com/images?access_token=${MAPILLARY_TOKEN}&fields=id,thumb_256_url,thumb_1024_url,computed_geometry&bbox=${bbox}&limit=50`;
  try{
    const res=await fetch(url);if(!res.ok)return[];
    const data=await res.json();
    const imgs=(data.data||[]).filter(i=>i.computed_geometry?.coordinates);
    const mDist=(c1,c2)=>{const dlat=(c1[1]-c2[1])*111000;const dlng=(c1[0]-c2[0])*111000*Math.cos(c1[1]*Math.PI/180);return Math.sqrt(dlat*dlat+dlng*dlng);};
    // distance from point to nearest parcel boundary segment
    const distToBoundary=(px,py)=>{
      if(!_currentParcelGeoJSON)return Infinity;
      const cosLat=Math.cos(py*Math.PI/180),R=111319;
      const toM=(dLng,dLat)=>Math.sqrt((dLng*cosLat*R)**2+(dLat*R)**2);
      const ptSeg=(px,py,ax,ay,bx,by)=>{
        const dx=bx-ax,dy=by-ay,lenSq=dx*dx+dy*dy;
        const t=lenSq>0?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq)):0;
        return toM(px-(ax+t*dx),py-(ay+t*dy));
      };
      const rings=_currentParcelGeoJSON.type==="Polygon"?_currentParcelGeoJSON.coordinates
        :_currentParcelGeoJSON.type==="MultiPolygon"?_currentParcelGeoJSON.coordinates.flat(1):[];
      let min=Infinity;
      for(const ring of rings)for(let i=0;i<ring.length-1;i++){
        const d=ptSeg(px,py,ring[i][0],ring[i][1],ring[i+1][0],ring[i+1][1]);
        if(d<min)min=d;
      }
      return min;
    };
    // partition: near ≤20m from boundary, far = rest; each sorted by centroid distance
    const near=[],far=[];
    for(const img of imgs){
      const c=img.computed_geometry.coordinates;
      const d=distToBoundary(c[0],c[1]);
      (d<=20?near:far).push({img,distCentroid:(c[0]-lng)**2+(c[1]-lat)**2});
    }
    near.sort((a,b)=>a.distCentroid-b.distCentroid);
    far.sort((a,b)=>a.distCentroid-b.distCentroid);
    const pool=[...near,...far].map(x=>x.img);
    const selected=[];
    for(const img of pool){
      const c=img.computed_geometry.coordinates;
      if(selected.every(s=>mDist(c,s.computed_geometry.coordinates)>=20)){
        selected.push(img);
        if(selected.length===4)break;
      }
    }
    return {images:selected,hasNear:near.length>0};
  }catch(e){return{images:[],hasNear:false};}
}

function renderMapillaryCard({images,hasNear}={}){
  if(!images||!images.length)return;
  _mapillaryImages=images;_currentImageIdx=0;
  const gallery=document.getElementById("mapillary-gallery");
  const thumbsEl=document.getElementById("mapillary-thumbs");
  const label=document.getElementById("lbl-mapillary-gallery");
  if(label)label.textContent=hasNear?t().mapillaryNear:t().mapillaryFar;
  thumbsEl.innerHTML=images.map((img,i)=>
    `<img class="mapillary-thumb" src="${img.thumb_256_url}" data-idx="${i}" alt="Street view">`
  ).join("");
  thumbsEl.querySelectorAll(".mapillary-thumb").forEach((el,i)=>{
    el.addEventListener("click",()=>openMapillaryLightbox(i));
    el.addEventListener("mouseenter",()=>mapillaryHighlight(i));
    el.addEventListener("mouseleave",()=>mapillaryUnhighlight());
  });
  gallery.style.display="flex";
  requestAnimationFrame(()=>requestAnimationFrame(()=>gallery.classList.add("visible")));
}

function mapillaryHighlight(idx){
  const img=_mapillaryImages[idx];
  if(!img?.computed_geometry||!mapReady)return;
  map.getSource("mapillary-active")?.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:img.computed_geometry,properties:{}}]});
}
function mapillaryUnhighlight(){
  if(mapReady)map.getSource("mapillary-active")?.setData({type:"FeatureCollection",features:[]});
}

function openMapillaryLightbox(idx){
  _currentImageIdx=idx;
  const lb=document.getElementById("mapillary-lightbox");
  lb.style.display="flex";
  requestAnimationFrame(()=>requestAnimationFrame(()=>lb.classList.add("open")));
  _renderLightboxImage();
}

function _renderLightboxImage(){
  const img=_mapillaryImages[_currentImageIdx];
  const imgEl=document.getElementById("lightbox-img");
  imgEl.src=img.thumb_1024_url||img.thumb_256_url;
  document.getElementById("lightbox-counter").textContent=`${_currentImageIdx+1} / ${_mapillaryImages.length}`;
  document.getElementById("lightbox-prev").disabled=_currentImageIdx===0;
  document.getElementById("lightbox-next").disabled=_currentImageIdx===_mapillaryImages.length-1;
  const lbl=document.getElementById("lbl-lightbox-open");if(lbl)lbl.textContent=t().mapillaryOpen;
  mapillaryHighlight(_currentImageIdx);
}

function mapillaryLightboxNav(dir){
  _currentImageIdx=Math.max(0,Math.min(_mapillaryImages.length-1,_currentImageIdx+dir));
  _renderLightboxImage();
}

function mapillaryLightboxOpenMapillary(){
  const img=_mapillaryImages[_currentImageIdx];
  if(img)window.open(`https://www.mapillary.com/app/?pKey=${img.id}`,"_blank");
}

function mapillaryLightboxBgClick(e){
  if(e.target===document.getElementById("mapillary-lightbox"))closeMapillaryLightbox();
}

function closeMapillaryLightbox(){
  const lb=document.getElementById("mapillary-lightbox");
  if(!lb||lb.style.display==="none")return;
  lb.classList.remove("open");
  setTimeout(()=>{lb.style.display="none";},260);
  mapillaryUnhighlight();
}

// ── Score rendering ───────────────────────────────────────────────────────────
function verdictFor(score){const idx=Math.min(5,Math.floor(score/17));return{text:t().verdicts[idx],color:["#ef4444","#f97316","#eab308","#84cc16","#22c55e","#34d399"][idx]};}

function renderScore(counts){
  const H=shannonIndex(counts);const verdict=verdictFor(H);const circ=169.65;
  _walkData={score:H,counts:{...counts}};
  document.getElementById("score-ring").style.strokeDashoffset=circ*(1-H/100);
  document.getElementById("score-ring").style.stroke=verdict.color;
  document.getElementById("score-num").textContent=H;
  document.getElementById("score-num").style.color=verdict.color;
  document.getElementById("score-verdict").textContent=verdict.text;
  document.getElementById("score-verdict").style.color=verdict.color;
  const total=Object.values(counts).reduce((s,v)=>s+v,0);
  const list=document.getElementById("cat-list");list.innerHTML="";
  for(const key of Object.keys(CAT_COLORS)){
    const info=t().cats[key];const count=counts[key]||0;const pct=total>0?Math.round((count/total)*100):0;
    const row=document.createElement("div");row.className="cat-row";
    row.innerHTML=`<div class="cat-header"><span class="cat-name"><span style="font-size:12px">${info.icon}</span>${info.label}</span><span class="cat-count">${count} · ${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="background:${CAT_COLORS[key]}" data-w="${pct}"></div></div>`;
    list.appendChild(row);
  }
  document.getElementById("score-card").style.display="block";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{list.querySelectorAll(".bar-fill").forEach(b=>{b.style.width=b.dataset.w+"%";});}));
}

function toggleProCat(id){
  const el=document.getElementById(id);
  el.classList.toggle("open");
  const btn=document.getElementById('cat-btn-'+id.replace('pro-cat-',''));
  if(btn) btn.classList.toggle('active', el.classList.contains('open'));
}

var _activeCatKey=null;

function showCatInPanel(catKey,btnEl){
  _closeOtherNavPanels('cat');
  const proCard=document.getElementById('pro-analysis-card');
  const catEl=document.getElementById('pro-cat-'+catKey);
  const alreadyOpen=catEl&&catEl.classList.contains('open')&&proCard&&proCard.style.display!=='none';
  document.querySelectorAll('.pro-cat').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.cat-icon-btn,#nav-cat-group .nav-btn').forEach(b=>b.classList.remove('active'));
  if(alreadyOpen){
    if(proCard)proCard.style.display='none';
    _activeCatKey=null;
    return;
  }
  if(proCard&&btnEl){
    const r=btnEl.getBoundingClientRect();
    const topPx=Math.min(r.top,window.innerHeight-40);
    proCard.style.cssText='display:block;position:fixed;left:68px;top:'+topPx+'px;margin:0;width:262px;max-height:calc(100vh - '+topPx+'px - 12px);overflow-y:auto;scrollbar-width:none;background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:var(--glass-radius);box-shadow:var(--glass-shadow);padding:14px 14px 10px;z-index:28;color:white;font-size:0.8rem;';
  }else if(proCard){proCard.style.display='block';}
  if(catEl)catEl.classList.add('open');
  const catBtn=document.getElementById('cat-btn-'+catKey);
  if(catBtn)catBtn.classList.add('active');
  _activeCatKey=catKey;
  const _contentEl=document.getElementById('pro-cat-'+catKey+'-content');
  if(_contentEl&&!_contentEl.textContent.trim()){
    _contentEl.innerHTML='<div class="nav-flyout-loading"><span class="spinner-sm"></span><span>'+(t().analyzing||'Analyzing…')+'</span></div>';
    if(typeof setupProCard==='function')setupProCard(false);
  }
}

function _returnPopoverContent(){}

function openCatPopover(catKey,btnEl){showCatInPanel(catKey,btnEl);}

function closeCatPopover(){
  const proCard=document.getElementById('pro-analysis-card');
  document.querySelectorAll('.pro-cat').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.cat-icon-btn').forEach(b=>b.classList.remove('active'));
  if(proCard)proCard.style.display='none';
  _activeCatKey=null;
}

function setupProCard(show=false){
  const tr=t();
  const isKa=lang==="ka";
  const isPro=currentUser?.plan==="pro";
  const card=document.getElementById("pro-analysis-card");
  if(show)card.style.display="block";

  // Accessibility — available to all
  const accEl=document.getElementById("pro-cat-accessibility-content");
  if(!accEl.querySelector(".acc-iso-sw")){
    const isKaAcc=lang==="ka";
    accEl.innerHTML=
      `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccIsochrone()"><span class="lp-row-name">${isKaAcc?"ხელმისაწვდომობის ზონა":"Accessibility Zone"}</span><div class="lp-sw" id="acc-iso-sw"></div></div>`+
      `<div id="acc-iso-controls" style="display:none">`+
        `<div class="acc-mode-label" style="margin-top:6px">${tr.accModeLabel}</div>`+
        `<div class="acc-mode-row"><button class="acc-mode-btn" data-mode="walking" onclick="setAccMode('walking')">🚶 ${tr.accModes.walking}</button><button class="acc-mode-btn" data-mode="cycling" onclick="setAccMode('cycling')">🚲 ${tr.accModes.cycling}</button><button class="acc-mode-btn" data-mode="driving" onclick="setAccMode('driving')">🚗 ${tr.accModes.driving}</button></div>`+
        `<div class="acc-mode-label" style="margin-top:6px">${tr.accTimeLabel}</div>`+
        `<div class="acc-time-row"><button class="acc-time-btn" data-min="10" onclick="setAccTime(10)">10<span class="acc-time-unit">min</span></button><button class="acc-time-btn" data-min="15" onclick="setAccTime(15)">15<span class="acc-time-unit">min</span></button><button class="acc-time-btn" data-min="20" onclick="setAccTime(20)">20<span class="acc-time-unit">min</span></button><button class="acc-time-btn" data-min="45" onclick="setAccTime(45)">45<span class="acc-time-unit">min</span></button><button class="acc-time-btn" data-min="60" onclick="setAccTime(60)">60<span class="acc-time-unit">min</span></button></div>`+
        `<div id="acc-iso-result"></div>`+
      `</div>`;
  }
  const isoSw=document.getElementById("acc-iso-sw");if(isoSw)isoSw.classList.toggle("on",_isoActive);
  const isoCtrls=document.getElementById("acc-iso-controls");if(isoCtrls)isoCtrls.style.display=_isoActive?"":"none";
  document.querySelectorAll(".acc-mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===_accMode));
  document.querySelectorAll(".acc-time-btn").forEach(b=>b.classList.toggle("active",b.dataset.min===String(_accMinutes)));

  // Climate — visible to everyone; Pro-lock is a CSS grey-out on the nav
  // button (body.free-tier), not a display:none — it must never disappear.
  document.getElementById("pro-cat-climate").style.display="";
  document.getElementById("cat-btn-climate").style.display="";
  document.getElementById("pro-cat-climate-content").innerHTML=
    `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccCanopy()"><span class="lp-row-name">${isKa?"ხის ვარჯის დაფარვა":"Tree Canopy Coverage"}</span><div class="lp-sw" id="acc-canopy-sw"></div></div>`+
    `<div id="acc-canopy-result"></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccLST()"><span class="lp-row-name">${isKa?"ზედაპირის ტემპ.":"Surface Temperature"}</span><div class="lp-sw" id="acc-lst-sw"></div></div>`+
    `<div id="acc-lst-result"></div>`;

  // Education — available to all
  document.getElementById("pro-cat-education").style.display="";
  document.getElementById("pro-cat-education-content").innerHTML=
    `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccSchools()"><span class="lp-row-name">${tr.proCats.schools.label}</span><div class="lp-sw" id="acc-schools-sw"></div></div>`+
    `<div id="acc-schools-result"></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccKindergartens()"><span class="lp-row-name">${tr.proCats.kindergartens.label}</span><div class="lp-sw" id="acc-kg-sw"></div></div>`+
    `<div id="acc-kg-result"></div>`;

  // Mobility
  document.getElementById("pro-cat-mobility").style.display="";
  document.getElementById("pro-cat-mobility-content").innerHTML=
    `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccMobility()"><span class="lp-row-name">${isKa?"საგზაო ინციდენტები":"Road Incidents"}</span><div class="lp-sw" id="acc-mob-sw"></div></div>`+
    `<div id="acc-mob-result"></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccTransit()"><span class="lp-row-name">${tr.ttcNearby||"Nearby Stops"}</span><div class="lp-sw" id="acc-transit-sw"></div></div>`+
    `<div id="acc-transit-result"></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccParking()"><span class="lp-row-name">${isKa?"🅿 ავტოსადგომები":"🅿 Parking"}</span><div class="lp-sw" id="acc-parking-sw"></div></div>`+
    `<div id="acc-parking-result"></div>`;

  // Urban Morphology — always visible
  const morphEl=document.getElementById("pro-cat-morphology");
  if(morphEl){ morphEl.style.display=""; document.getElementById("cat-btn-morphology").style.display=""; }
  const morphContent=document.getElementById("pro-cat-morphology-content");
  if(morphContent&&!morphContent.querySelector(".acc-toggle-row")){
    morphContent.innerHTML=
      `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccConnectivity()"><span class="lp-row-name">${isKa?"ქუჩის კავშირობა":"Street Connectivity"}</span><div class="lp-sw" id="acc-connectivity-sw"></div></div>`+
      `<div id="syntax-legend" style="display:none"></div>`+
      `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccOrientation()"><span class="lp-row-name">${isKa?"ქუჩის ორიენტაცია":"Street Orientation"}</span><div class="lp-sw" id="acc-orientation-sw"></div></div>`+
      `<div id="orient-rose" style="display:none"></div>`+
      `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccOSM()"><span class="lp-row-name">${isKa?"ურბანული ფუნქციები":"Urban Functions"}</span><div class="lp-sw" id="acc-osm-sw"></div></div>`+
      `<div id="osm-legend" style="display:none"></div>`;
  }

  // Energy and Relief — pro only
  if(isPro){
  // Energy — toggle rows for Solar and Wind
  const energyEl=document.getElementById("pro-cat-energy");
  if(energyEl){
    energyEl.style.display="";
    document.getElementById("cat-btn-energy").style.display="";
    const energyContent=document.getElementById("pro-cat-energy-content");
    if(!energyContent.querySelector(".acc-toggle-row")){
      energyContent.innerHTML=
        `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccSolar()"><span class="lp-row-name">${isKa?"სოლარო ზონა":"Solar Zone"}</span><div class="lp-sw${_solarOverlayCache?" on":""}" id="acc-solar-sw"></div></div>`+
        `<div id="solar-result"></div>`+
        `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccWind()"><span class="lp-row-name">${isKa?"ქარის ანალიზი":"Wind Analysis"}</span><div class="lp-sw${_windData?" on":""}" id="acc-wind-sw"></div></div>`+
        `<div id="acc-wind-result"></div>`;
    }
  }

  // Relief
  document.getElementById("pro-cat-relief").style.display="";
  document.getElementById("cat-btn-relief").style.display="";
  // Report entry point lives in the left icon rail (#nav-report-btn)
  renderReliefButtons();
  } // end isPro
}

async function toggleAccSolar(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON)return;
  if(_solarOverlayCache){
    document.getElementById('acc-solar-sw')?.classList.remove('on');
    clearSolarOverlay();
    return;
  }
  document.getElementById('acc-solar-sw')?.classList.add('on');
  const sres=document.getElementById('solar-result');
  if(sres){
    sres.style.display='block';
    sres.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;color:rgba(255,255,255,0.32);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px;flex-shrink:0"></span><span id="solar-status-label">${lang==='ka'?'DTM…':'Loading DTM…'}</span></div>`;
  }
  await runSolarAnalysis();
  if(!_solarOverlayCache){
    if(sres){sres.style.display='none';sres.innerHTML='';}
    document.getElementById('acc-solar-sw')?.classList.remove('on');
  }
}

async function toggleAccWind(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON)return;
  if(_windData){
    _windData=null;
    stopWindAnimation();
    const wcard=document.getElementById('wind-card');if(wcard)wcard.style.display='none';
    const res=document.getElementById('acc-wind-result');if(res)res.innerHTML='';
    document.getElementById('acc-wind-sw')?.classList.remove('on');
    return;
  }
  document.getElementById('acc-wind-sw')?.classList.add('on');
  const wres=document.getElementById('acc-wind-result');
  if(wres)wres.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;color:rgba(147,197,253,0.4);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px;border-top-color:#93c5fd;flex-shrink:0"></span><span id="wind-status-label">${lang==='ka'?'შემოწმება…':'Checking…'}</span></div>`;
  await runWindAnalysis();
  if(!_windData){
    if(wres)wres.innerHTML='';
    document.getElementById('acc-wind-sw')?.classList.remove('on');
  }
}

async function toggleAccCanopy(){
  const sw=document.getElementById("acc-canopy-sw");
  if(!sw)return;
  const el=document.getElementById("acc-canopy-result");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    if(el)el.innerHTML="";
    clearCanopyOverlay();
    document.getElementById("lp-canopy-sw")?.classList.remove("on");
    if(_climateData)_climateData.canopyPct=null;
    return;
  }
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON)return;
  sw.classList.add("on");
  if(el)el.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;
  if(!window.GeoTIFF){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }
  try{
    const result=await fetchTreeCanopy(_currentParcelGeoJSON);
    _canopyRawData=result.raw;
    _canopyPct=result.pct;
    if(_isDrawnArea)_drawnAreaProps.tree_canopy_pct=_canopyPct;
    if(!_climateData)_climateData={canopyPct:null,lst:null};
    _climateData.canopyPct=_canopyPct;
    const pct=_canopyPct;
    const color=pct>40?"#22c55e":pct>20?"#84cc16":pct>10?"#eab308":"#f97316";
    if(el)el.innerHTML=`<div style="margin:4px 0 10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span style="font-size:0.65rem;color:rgba(255,255,255,0.25)">ESA WorldCover 2021 · 10m</span><span style="font-size:1rem;font-weight:700;color:${color}">${pct}%</span></div><div style="height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden"><div id="acc-canopy-bar" style="height:100%;width:0%;background:${color};border-radius:3px;transition:width 0.9s cubic-bezier(0.23,1,0.32,1)"></div></div></div>`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const b=document.getElementById("acc-canopy-bar");if(b)b.style.width=pct+"%";}));
    renderCanopyOverlay(_canopyRawData,_currentParcelGeoJSON);
    document.getElementById("lp-canopy-sw")?.classList.add("on");
  }catch(e){
    console.warn("Canopy:",e);
    sw.classList.remove("on");
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${isKa?"მონაცემები მიუწვდომელია":"Data unavailable"}</div>`;
  }
}

async function toggleAccLST(){
  const sw=document.getElementById("acc-lst-sw");
  if(!sw)return;
  const el=document.getElementById("acc-lst-result");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    if(el)el.innerHTML="";
    clearLSTOverlay();
    document.getElementById("lp-lst-sw")?.classList.remove("on");
    if(_climateData)_climateData.lst=null;
    return;
  }
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON)return;
  sw.classList.add("on");
  if(el)el.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;
  if(!window.GeoTIFF){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }
  try{
    const result=await fetchLST(_currentParcelGeoJSON);
    _lstRawData=result.raw;
    const lst=result.mean;
    if(!_climateData)_climateData={canopyPct:null,lst:null};
    _climateData.lst=lst;
    const lstColor=lst>40?"#ef4444":lst>35?"#f97316":lst>28?"#eab308":"#22c55e";
    const pct=Math.min(100,Math.max(0,((lst-10)/40)*100));
    if(el)el.innerHTML=`<div style="display:flex;align-items:center;gap:14px;margin:4px 0 10px"><svg width="58" height="58" viewBox="0 0 70 70" style="flex-shrink:0"><circle cx="35" cy="35" r="27" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/><circle cx="35" cy="35" r="27" fill="none" stroke="${lstColor}" stroke-width="7" stroke-linecap="round" stroke-dasharray="169.65" stroke-dashoffset="169.65" transform="rotate(-90 35 35)" style="transition:stroke-dashoffset 1s cubic-bezier(0.23,1,0.32,1)" id="acc-lst-ring"/><text x="35" y="38" text-anchor="middle" fill="${lstColor}" font-size="13" font-weight="700" font-family="-apple-system,sans-serif">${lst}°C</text></svg><div style="font-size:0.65rem;color:rgba(255,255,255,0.25)">Landsat 8 · 30m · 2024</div></div>`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.getElementById("acc-lst-ring");if(r)r.style.strokeDashoffset=169.65*(1-pct/100);}));
    renderLSTOverlay(_lstRawData,_currentParcelGeoJSON);
    document.getElementById("lp-lst-sw")?.classList.add("on");
  }catch(e){
    console.warn("LST:",e);
    sw.classList.remove("on");
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${isKa?"მონაცემები მიუწვდომელია":"Data unavailable"}</div>`;
  }
}

async function toggleAccSchools(){
  const sw=document.getElementById("acc-schools-sw");
  if(!sw)return;
  const el=document.getElementById("acc-schools-result");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){sw.classList.remove("on");if(el)el.innerHTML="";clearSchoolsMapLayer();return;}
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${t().accNoIso}</div>`;return;}
  sw.classList.add("on");
  if(el)el.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;
  try{
    if(!_schoolsGeoJSON){
      const res=await fetch("data/public_schools.geojson");
      if(!res.ok)throw new Error("schools_fetch");
      _schoolsGeoJSON=await res.json();
    }
    const isoGeom=isoFeat?isoFeat.geometry:_getMorphologyGeo();
    const inArea=(_schoolsGeoJSON.features||[]).filter(f=>{
      const g=f.geometry;if(!g)return false;
      const pt=g.type==="Point"?g.coordinates:(g.coordinates?.[0]?.[0]??null);
      if(!pt)return false;
      return pointInPolygon(pt[0],pt[1],isoGeom);
    });
    const count=inArea.length;
    if(_isDrawnArea)_drawnAreaProps.schools_500m=count;
    const totalStudents=inArea.reduce((s,f)=>s+(Number(f.properties.students)||0),0);
    const occArr=inArea.map(f=>Number(f.properties.occupancy)||0).filter(v=>v>0);
    const avgOcc=occArr.length?Math.round(occArr.reduce((a,b)=>a+b,0)/occArr.length):0;
    const overcrowded=inArea.filter(f=>Number(f.properties.occupancy)>100).length;
    const overcrowdedPct=count?Math.round(overcrowded/count*100):0;
    const cond={Good:0,Fair:0,Bad:0,Replacement:0};
    inArea.forEach(f=>{const c=f.properties['Facility condition'];if(c&&cond[c]!==undefined)cond[c]++;});
    const urgSum=inArea.reduce((s,f)=>s+(Number(f.properties.urgent_cost)||0),0);
    const midSum=inArea.reduce((s,f)=>s+(Number(f.properties.non_urg_cost)||0),0);
    const longSum=inArea.reduce((s,f)=>s+(Number(f.properties.long_cost)||0),0);
    const totalCost=urgSum+midSum+longSum;
    const wifiPct=count?Math.round(inArea.filter(f=>{const r=f.properties.wifi;return r==='Good'||r==='Fair';}).length/count*100):0;
    const internetPct=count?Math.round(inArea.filter(f=>{const r=f.properties.internet;return r==='Good'||r==='Fair';}).length/count*100):0;
    const rampPct=count?Math.round(inArea.filter(f=>{const r=f.properties.ramp;return r==='Good'||r==='Fair';}).length/count*100):0;
    const accWcPct=count?Math.round(inArea.filter(f=>{const r=f.properties.acc_wc;return r==='კარგი'||r==='დამაკმაყოფილებელი';}).length/count*100):0;
    const liftPct=count?Math.round(inArea.filter(f=>{const r=f.properties.lifts;return r==='კარგი'||r==='დამაკმაყოფილებელი';}).length/count*100):0;
    const sportPct=count?Math.round(inArea.filter(f=>{const r=f.properties.sport_facility;return r==='Good'||r==='Fair'||r==='Needs repair';}).length/count*100):0;
    const fmtGEL=n=>n>=1000000?`₾${(n/1000000).toFixed(1)}M`:n>=1000?`₾${Math.round(n/1000)}K`:`₾${Math.round(n)}`;
    const fmtN=n=>n>=1000?`${(n/1000).toFixed(1)}K`:String(n);
    const occColor=overcrowdedPct>50?'#ef4444':overcrowdedPct>25?'#f97316':'#22c55e';
    const connColor=p=>p>=60?'#4ade80':p>=30?'#fbbf24':'#f87171';
    const accColor=p=>p>=50?'#4ade80':p>=15?'#fbbf24':'#f87171';
    const featRow=(icon,lbl,pct,col)=>`<div class="school-feat-row"><span class="school-feat-icon">${icon}</span><span class="school-feat-lbl">${lbl}</span><div class="school-feat-track"><div class="school-feat-fill" style="background:${col};width:0%" data-w="${pct}"></div></div><span class="school-feat-pct">${pct}%</span></div>`;
    const condTotal=cond.Good+cond.Fair+cond.Bad+cond.Replacement||1;
    const cGood=Math.round(cond.Good/condTotal*100);
    const cFair=Math.round(cond.Fair/condTotal*100);
    const cBad=Math.round(cond.Bad/condTotal*100);
    const cRepl=100-cGood-cFair-cBad;
    const isKaL=lang==="ka";
    if(el)el.innerHTML=`<div class="school-stats">`+
      `<div class="school-metrics-row"><div class="school-metric"><span class="school-metric-val">${count}</span><span class="school-metric-lbl">${isKaL?'სკოლა':'Schools'}</span></div><div class="school-metric"><span class="school-metric-val">${fmtN(totalStudents)}</span><span class="school-metric-lbl">${isKaL?'მოსწავლე':'Students'}</span></div><div class="school-metric"><span class="school-metric-val" style="color:${occColor}">${avgOcc}%</span><span class="school-metric-lbl">${isKaL?'დატვირთვა':'Avg Load'}</span></div></div>`+
      `<div class="school-section"><div class="school-section-lbl">${isKaL?'გადატვირთვა':'Overcrowding'}</div><div class="school-occ-bar"><div class="school-occ-fill" id="school-occ-fill" style="background:${occColor};width:0%" data-w="${Math.min(100,overcrowdedPct)}"></div></div><div class="school-occ-meta"><span>${overcrowded} ${isKaL?'სკოლა > 100%':'schools over capacity'}</span><span>${overcrowdedPct}%</span></div></div>`+
      `<div class="school-section"><div class="school-section-lbl">${isKaL?'შენობის მდგომარეობა':'Building Condition'}</div><div class="school-cond-bar">${cGood>0?`<div class="school-cond-seg" style="background:#4ade80;width:${cGood}%"></div>`:''}${cFair>0?`<div class="school-cond-seg" style="background:#fbbf24;width:${cFair}%"></div>`:''}${cBad>0?`<div class="school-cond-seg" style="background:#fb923c;width:${cBad}%"></div>`:''}${cRepl>0?`<div class="school-cond-seg" style="background:#f87171;width:${cRepl}%"></div>`:''}</div><div class="school-cond-legend">${cond.Good?`<span class="school-cond-leg"><span class="school-cond-dot" style="background:#4ade80"></span>${isKaL?'კარგი':'Good'} ${cond.Good}</span>`:''} ${cond.Fair?`<span class="school-cond-leg"><span class="school-cond-dot" style="background:#fbbf24"></span>${isKaL?'დამაკმ.':'Fair'} ${cond.Fair}</span>`:''} ${cond.Bad?`<span class="school-cond-leg"><span class="school-cond-dot" style="background:#fb923c"></span>${isKaL?'ცუდი':'Bad'} ${cond.Bad}</span>`:''} ${cond.Replacement?`<span class="school-cond-leg"><span class="school-cond-dot" style="background:#f87171"></span>${isKaL?'ჯასანაც.':'Replace'} ${cond.Replacement}</span>`:''}</div></div>`+
      `<div class="school-section"><div class="school-section-lbl">${isKaL?'კავშირი':'Connectivity'}</div>${featRow('📶',isKaL?'WiFi':'WiFi',wifiPct,connColor(wifiPct))}${featRow('🌐',isKaL?'ინტერნეტი':'Internet',internetPct,connColor(internetPct))}</div>`+
      `<div class="school-section"><div class="school-section-lbl">${isKaL?'ხელმისაწვდომობა':'Accessibility'}</div>${featRow('♿',isKaL?'პანდუსი':'Ramp',rampPct,accColor(rampPct))}${featRow('🚻',isKaL?'ადაფ. WC':'Adapted WC',accWcPct,accColor(accWcPct))}${featRow('🛗',isKaL?'ლიფტი':'Elevator',liftPct,accColor(liftPct))}${featRow('⚽',isKaL?'სპ. მოედანი':'Sports',sportPct,accColor(sportPct))}</div>`+
      (totalCost>0?`<div class="school-section"><div class="school-section-lbl">${isKaL?'ინფრასტრ. ხარჯები':'Infrastructure Costs'}</div><div class="school-cost-total">${fmtGEL(totalCost)}</div><div class="school-cost-row"><span class="school-cost-lbl">${isKaL?'სასწრაფო':'Urgent'}</span><span class="school-cost-val">${fmtGEL(urgSum)}</span></div><div class="school-cost-row"><span class="school-cost-lbl">${isKaL?'საშ.-ვადიანი':'Mid-term'}</span><span class="school-cost-val">${fmtGEL(midSum)}</span></div><div class="school-cost-row"><span class="school-cost-lbl">${isKaL?'გრძელვადიანი':'Long-term'}</span><span class="school-cost-val">${fmtGEL(longSum)}</span></div></div>`:'')+
      `</div><div id="school-route-info"></div>`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const fill=document.getElementById("school-occ-fill");if(fill)fill.style.width=fill.dataset.w+"%";
      if(el)el.querySelectorAll(".school-feat-fill").forEach(b=>{b.style.width=b.dataset.w+"%";});
    }));
    addSchoolsMapLayer(inArea);
  }catch(e){
    console.error("Schools:",e);sw.classList.remove("on");
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${isKa?"შეცდომა":"Error"}</div>`;
  }
}

async function toggleAccKindergartens(){
  const sw=document.getElementById("acc-kg-sw");
  if(!sw)return;
  const el=document.getElementById("acc-kg-result");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    if(el)el.innerHTML="";
    clearKgMapLayer();
    return;
  }
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){if(el)el.innerHTML='<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">'+t().accNoIso+'</div>';return;}
  sw.classList.add("on");
  if(el)el.innerHTML='<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>';
  try{
    if(!_kgGeoJSON){
      const res=await fetch("data/kindergartens_tbilisi_1.geojson");
      if(!res.ok)throw new Error("kg_fetch");
      _kgGeoJSON=await res.json();
    }
    const isoGeom=isoFeat?isoFeat.geometry:_getMorphologyGeo();
    const inArea=(_kgGeoJSON.features||[]).filter(f=>{
      const g=f.geometry;
      if(!g||g.type!=="Point")return false;
      return pointInPolygon(g.coordinates[0],g.coordinates[1],isoGeom);
    });
    if(_isDrawnArea)_drawnAreaProps.kindergartens_500m=inArea.length;
    addKgMapLayer(inArea);
    if(el)el.innerHTML='<div style="font-size:0.65rem;color:rgba(255,255,255,0.28);padding:4px 0">'+(isKa?inArea.length+' ბაღი — გადაადეთ მაუსი დეტალებისთვის':inArea.length+' kindergartens — hover a point for details')+'</div>';
  }catch(e){
    console.error("Kindergartens:",e);sw.classList.remove("on");
    if(el)el.innerHTML='<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">'+(isKa?"შეცდომა":"Error")+'</div>';
  }
}

function _ensureKgMapSetup(){
  if(map.getSource('kg-pts'))return;
  map.addSource('kg-pts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('kg-hover-pt',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('kg-route-hilly',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('kg-route-short',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('kg-route-waypoint',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const riskColor=['match',['get','risk'],'low','#22c55e','medium','#f97316','high','#ef4444','#818cf8'];
  map.addLayer({id:'kg-route-hilly',type:'line',source:'kg-route-hilly',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#818cf8','line-width':3,'line-opacity':0.72,'line-dasharray':[4,2]}});
  map.addLayer({id:'kg-route-short',type:'line',source:'kg-route-short',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':riskColor,'line-width':4,'line-opacity':0.92}});
  map.addLayer({id:'kg-route-waypoint',type:'circle',source:'kg-route-waypoint',paint:{'circle-radius':7,'circle-color':'#fff','circle-stroke-width':2.5,'circle-stroke-color':'#c026d3','circle-opacity':0.95}});
  map.addLayer({id:'kg-dot',type:'circle',source:'kg-pts',paint:{'circle-radius':5,'circle-color':'#c026d3','circle-opacity':1}});
  map.addLayer({id:'kg-pulse',type:'circle',source:'kg-hover-pt',paint:{'circle-radius':5,'circle-color':'#c026d3','circle-opacity':0,'circle-stroke-width':0}});
  _setupKgRouteDrag();
}

function addKgMapLayer(feats){
  _lastKgFeatures=feats;
  _ensureKgMapSetup();
  map.getSource('kg-pts').setData({type:'FeatureCollection',features:feats.map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.name||'',type:f.properties.type||'',phone:f.properties.phone||'',phone_1:f.properties.phone_1||'',email:f.properties.email||'',facebook_link:f.properties.facebook_link||'',name_location:f.properties.name_location||''}}))});
  map.setLayoutProperty('kg-dot','visibility','visible');
  _kgLayerActive=true;
  map.off('mouseenter','kg-dot',_onKgHover);
  map.off('mouseleave','kg-dot',_onKgLeave);
  map.on('mouseenter','kg-dot',_onKgHover);
  map.on('mouseleave','kg-dot',_onKgLeave);
}

function clearKgMapLayer(){
  _kgLayerActive=false;
  ++_kgPulseGen;
  _lastKgFeatures=null;
  _lastRouteKg=null;
  _kgRouteMode='all';
  const empty={type:'FeatureCollection',features:[]};
  if(map.getSource('kg-pts'))map.getSource('kg-pts').setData(empty);
  if(map.getSource('kg-hover-pt'))map.getSource('kg-hover-pt').setData(empty);
  if(map.getSource('kg-route-short'))map.getSource('kg-route-short').setData(empty);
  if(map.getSource('kg-route-hilly'))map.getSource('kg-route-hilly').setData(empty);
  if(map.getSource('kg-route-waypoint'))map.getSource('kg-route-waypoint').setData(empty);
  if(map.getLayer('kg-dot'))map.setLayoutProperty('kg-dot','visibility','none');
  if(_kgHoverPopup){_kgHoverPopup.remove();_kgHoverPopup=null;}
  map.getCanvas().style.cursor='';
  map.off('mouseenter','kg-dot',_onKgHover);
  map.off('mouseleave','kg-dot',_onKgLeave);
}

function _runKgPulse(){
  const gen=++_kgPulseGen;
  let fr=0;
  (function pulse(){
    if(!_kgLayerActive||_kgPulseGen!==gen||!map.getLayer('kg-pulse'))return;
    fr=(fr+1)%80;const tt=fr/80;const ev=tt<0.5?2*tt*tt:-1+(4-2*tt)*tt;
    map.setPaintProperty('kg-pulse','circle-radius',5+ev*16);
    map.setPaintProperty('kg-pulse','circle-opacity',0.5*(1-ev));
    requestAnimationFrame(pulse);
  })();
}

function _fmtPhone(raw){
  if(!raw)return'';
  const s=String(raw).replace(/\D/g,'');
  if(s.startsWith('00995')){const n=s.slice(5);return'+995 '+n.slice(0,3)+' '+n.slice(3,6)+' '+n.slice(6);}
  return '+'+s;
}

function _showKgContact(props){
  const el=document.getElementById('acc-kg-result');
  if(!el)return;
  const phones=[props.phone,props.phone_1].filter(Boolean);
  let h='<div style="margin:4px 0 2px;padding:7px 8px;background:rgba(192,38,211,0.07);border:1px solid rgba(192,38,211,0.15);border-radius:7px">';
  h+='<div style="font-size:0.72rem;font-weight:600;color:rgba(255,255,255,0.88);margin-bottom:4px;line-height:1.35">'+escapeHtml(props.name)+'</div>';
  if(props.type)h+='<div style="font-size:0.6rem;color:rgba(255,255,255,0.28);margin-bottom:5px">'+escapeHtml(props.type)+'</div>';
  if(props.name_location)h+='<div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:6px"><img src="analysis-logos/pin.svg" width="15" height="15" style="opacity:0.5;flex-shrink:0;margin-top:2px"><span style="font-size:0.63rem;color:rgba(255,255,255,0.45);line-height:1.4">'+escapeHtml(props.name_location)+'</span></div>';
  const _kgIco=(name,href,target)=>'<a href="'+escapeHtml(safeUrl(href))+'"'+(target?' target="'+target+'" rel="noopener"':'')+' style="display:inline-flex;opacity:0.65"><img src="analysis-logos/'+name+'.svg" width="24" height="24"></a>';
  if(phones.length||props.email||props.facebook_link){
    h+='<div style="display:flex;align-items:center;gap:10px;margin-top:2px">';
    phones.forEach(function(p,i){if(i===0)h+=_kgIco('phone','tel:'+p,'');});
    if(props.email)h+=_kgIco('email','mailto:'+props.email,'');
    if(props.facebook_link)h+=_kgIco('facebook',props.facebook_link,'_blank');
    h+='</div>';
  }
  h+='</div><div id="kg-route-info"></div>';
  el.innerHTML=h;
}

function _onKgHover(e){
  if(!e.features?.length)return;
  map.getCanvas().style.cursor='pointer';
  const coords=e.features[0].geometry.coordinates.slice();
  const props=e.features[0].properties;
  if(map.getSource('kg-hover-pt'))map.getSource('kg-hover-pt').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{}}]});
  _runKgPulse();
  if(!_kgHoverPopup)_kgHoverPopup=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:14,className:'school-popup',anchor:'bottom'});
  _kgHoverPopup.setLngLat(coords).setHTML('<div class="school-popup-name">'+escapeHtml(props.name)+'</div>').addTo(map);
  _showKgContact(props);
  if(_lastRouteKg===props.name)return;
  _lastRouteKg=props.name;
  showKgRoute(coords[0],coords[1],props.name);
}

function _onKgLeave(){
  map.getCanvas().style.cursor='';
  if(_kgHoverPopup){_kgHoverPopup.remove();_kgHoverPopup=null;}
}

function _selectKgRoute(mode){
  if(_kgRouteMode===mode)mode='all';
  _kgRouteMode=mode;
  const showShort=mode==='all'||mode==='short';
  const showHilly=mode==='all'||mode==='hilly';
  const shortRow=document.getElementById('kg-route-row-short');
  const hillyRow=document.getElementById('kg-route-row-hilly');
  if(shortRow){shortRow.style.opacity=showShort?'1':'0.4';shortRow.style.background=showShort?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.02)';}
  if(hillyRow){hillyRow.style.opacity=showHilly?'1':'0.4';hillyRow.style.background=showHilly?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.02)';}
  if(map.getLayer('kg-route-short'))map.setPaintProperty('kg-route-short','line-opacity',showShort?0.92:0.12);
  if(map.getLayer('kg-route-hilly'))map.setPaintProperty('kg-route-hilly','line-opacity',showHilly?0.72:0.08);
}

function _setupKgRouteDrag(){
  ['kg-route-short','kg-route-hilly'].forEach(layerId=>{
    map.on('mouseenter',layerId,()=>{if(!_isDraggingKgRoute)map.getCanvas().style.cursor='grab';});
    map.on('mouseleave',layerId,()=>{if(!_isDraggingKgRoute)map.getCanvas().style.cursor='';});
    map.on('mousedown',layerId,(e)=>{
      if(_isDraggingKgRoute)return;
      e.preventDefault();
      _isDraggingKgRoute=true;
      const dragSourceId=e.features?.[0]?.layer?.id||'kg-route-short';
      map.getCanvas().style.cursor='grabbing';
      map.dragPan.disable();
      let lastPos=[e.lngLat.lng,e.lngLat.lat];
      if(map.getSource('kg-route-waypoint'))map.getSource('kg-route-waypoint').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:lastPos},properties:{}}]});
      const onMove=(ev)=>{
        lastPos=[ev.lngLat.lng,ev.lngLat.lat];
        if(map.getSource('kg-route-waypoint'))map.getSource('kg-route-waypoint').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:lastPos},properties:{}}]});
      };
      const onUp=async()=>{
        map.off('mousemove',onMove);
        map.off('mouseup',onUp);
        map.dragPan.enable();
        _isDraggingKgRoute=false;
        map.getCanvas().style.cursor='';
        if(map.getSource('kg-route-waypoint'))map.getSource('kg-route-waypoint').setData({type:'FeatureCollection',features:[]});
        await _rerouteKgWithWaypoint(lastPos,dragSourceId);
      };
      map.on('mousemove',onMove);
      map.on('mouseup',onUp);
    });
  });
}

async function _rerouteKgWithWaypoint(wp,sourceId){
  if(!parcelCentroid||!_lastKgRouteDestination)return;
  const[fromLng,fromLat]=parcelCentroid;
  const[toLng,toLat]=_lastKgRouteDestination;
  const profile=_accMode==='cycling'?'cycling':_accMode==='driving'?'driving':'walking';
  try{
    const url=`https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${wp[0].toFixed(6)},${wp[1].toFixed(6)};${toLng},${toLat}?geometries=geojson&steps=false&overview=full&access_token=${mapboxgl.accessToken}`;
    const res=await fetch(url);const data=await res.json();
    if(!data.routes?.length)return;
    const rc=data.routes[0].geometry.coordinates;
    if(!_crashesGeoJSON){const cr=await fetch('data/car_crashes.geojson');if(cr.ok)_crashesGeoJSON=await cr.json();}
    const allCrashPts=(_crashesGeoJSON?.features||[]).map(f=>f.geometry?.coordinates).filter(Boolean);
    const buf=0.002,lngs=rc.map(c=>c[0]),lats=rc.map(c=>c[1]);
    const bx=[Math.min(...lngs)-buf,Math.min(...lats)-buf,Math.max(...lngs)+buf,Math.max(...lats)+buf];
    const nearby=allCrashPts.filter(cp=>cp[0]>=bx[0]&&cp[0]<=bx[2]&&cp[1]>=bx[1]&&cp[1]<=bx[3]);
    if(map.getSource(sourceId))map.getSource(sourceId).setData(_segmentRouteByRisk(rc,nearby));
  }catch(e){console.error('KgReroute:',e);}
}

async function showKgRoute(toLng,toLat,kgName){
  if(!parcelCentroid)return;
  const[fromLng,fromLat]=parcelCentroid;
  _lastKgRouteDestination=[toLng,toLat];
  try{
    const isCycling=_accMode==='cycling';
    const profile=isCycling?'cycling':_accMode==='driving'?'driving':'walking';
    const url=`https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${toLng},${toLat}?alternatives=true&geometries=geojson&steps=false&overview=full&access_token=${mapboxgl.accessToken}`;
    const res=await fetch(url);const data=await res.json();
    if(!data.routes?.length)throw new Error('no_routes');
    if(!_crashesGeoJSON){const cr=await fetch('data/car_crashes.geojson');if(cr.ok)_crashesGeoJSON=await cr.json();}
    const allCrashPts=(_crashesGeoJSON?.features||[]).map(f=>f.geometry?.coordinates).filter(Boolean);
    const routes=data.routes.map(route=>{
      const rc=route.geometry.coordinates;
      const elevGain=isCycling?_routeElevGain(rc):0;
      const buf=0.002,lngs=rc.map(c=>c[0]),lats=rc.map(c=>c[1]);
      const bx=[Math.min(...lngs)-buf,Math.min(...lats)-buf,Math.max(...lngs)+buf,Math.max(...lats)+buf];
      const nearby=allCrashPts.filter(cp=>cp[0]>=bx[0]&&cp[0]<=bx[2]&&cp[1]>=bx[1]&&cp[1]<=bx[3]);
      return{route,nearby,elevGain};
    });
    const shortE=routes[0];
    let hillyE=null;
    if(isCycling&&routes.length>1){
      hillyE=routes.reduce((a,b)=>b.elevGain<a.elevGain?b:a);
      if(hillyE.route===shortE.route)hillyE=null;
    }
    _ensureKgMapSetup();
    const empty={type:'FeatureCollection',features:[]};
    map.getSource('kg-route-short').setData(_segmentRouteByRisk(shortE.route.geometry.coordinates,shortE.nearby));
    map.getSource('kg-route-hilly').setData(hillyE?_segmentRouteByRisk(hillyE.route.geometry.coordinates,hillyE.nearby):empty);
    const allRC=[...shortE.route.geometry.coordinates,...(hillyE?hillyE.route.geometry.coordinates:[])];
    const rLngs=allRC.map(c=>c[0]),rLats=allRC.map(c=>c[1]);
    map.fitBounds([[Math.min(...rLngs),Math.min(...rLats)],[Math.max(...rLngs),Math.max(...rLats)]],{padding:80,duration:700,maxZoom:16});
    const isKaL=lang==='ka';
    const fmtD=m=>m>=1000?`${(m/1000).toFixed(1)}km`:`${Math.round(m)}m`;
    const fmtT=s=>s>=3600?`${Math.floor(s/3600)}h ${Math.round((s%3600)/60)}min`:s>=60?`${Math.round(s/60)}min`:`${Math.round(s)}s`;
    const fmtG=g=>g>0?`<span style="font-size:0.57rem;color:rgba(255,255,255,0.28);margin-left:4px">↑${Math.round(g)}m</span>`:'';
    const rEl=document.getElementById('kg-route-info');
    _kgRouteMode='all';
    if(rEl)rEl.innerHTML=`<div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:8px;padding-top:8px">`+
      `<div style="font-size:0.58rem;color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px">${isKaL?'მარშრუტი':'Route to'} <span style="color:rgba(255,255,255,0.45);text-transform:none;font-weight:600">${kgName}</span></div>`+
      `<div id="kg-route-row-short" onclick="_selectKgRoute('short')" style="cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:2px;padding:5px 7px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);transition:opacity 0.2s">`+
        `<span style="display:inline-block;width:14px;height:3px;background:linear-gradient(90deg,#22c55e,#f97316,#ef4444);border-radius:2px;flex-shrink:0"></span>`+
        `<span style="font-size:0.63rem;color:rgba(255,255,255,0.55)">${isKaL?'მოკლე':'Shortest'}</span>`+
        `<span style="margin-left:auto;font-size:0.65rem;font-weight:600;color:rgba(255,255,255,0.85)">${fmtD(shortE.route.distance)}</span>`+
        `<span style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-left:5px">${fmtT(shortE.route.duration)}</span>`+
        (isCycling?fmtG(shortE.elevGain):'')+
      `</div>`+
      _buildRouteElevSVG(shortE.route.geometry.coordinates)+
      `<div style="margin-bottom:4px"></div>`+
      (!hillyE?'':`<div id="kg-route-row-hilly" onclick="_selectKgRoute('hilly')" style="cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:2px;padding:5px 7px;border-radius:6px;border:1px solid rgba(129,140,248,0.2);background:rgba(129,140,248,0.05);transition:opacity 0.2s">`+
        `<span style="display:inline-block;width:14px;height:3px;background:#818cf8;border-radius:2px;flex-shrink:0;opacity:0.8"></span>`+
        `<span style="font-size:0.63rem;color:rgba(255,255,255,0.45)">${isKaL?'ნაკლებ ციცაბო':'Less Hilly'}</span>`+
        `<span style="margin-left:auto;font-size:0.65rem;font-weight:600;color:rgba(255,255,255,0.85)">${fmtD(hillyE.route.distance)}</span>`+
        `<span style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-left:5px">${fmtT(hillyE.route.duration)}</span>`+
        fmtG(hillyE.elevGain)+
      `</div>`)+
      (!hillyE?'':_buildRouteElevSVG(hillyE.route.geometry.coordinates))+
      `<div style="display:flex;gap:8px;font-size:0.57rem;color:rgba(255,255,255,0.22);margin-top:5px"><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>${isKaL?'უსაფრთხო':'safe'}</span><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#f97316;display:inline-block"></span>${isKaL?'საშუალო':'moderate'}</span><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span>${isKaL?'სახიფათო':'danger'}</span></div>`+
      `</div>`;
  }catch(e2){
    console.error('KgRoute:',e2);
    _lastRouteKg=null;
  }
}

function _ensureSchoolMapSetup(){
  if(map.getSource('schools-pts'))return;
  map.addSource('schools-pts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('school-route-hilly',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('school-route-safe',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('school-route-short',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addSource('school-hover-pt',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const riskColor=['match',['get','risk'],'low','#22c55e','medium','#f97316','high','#ef4444','#818cf8'];
  map.addSource('school-route-waypoint',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'school-route-hilly',type:'line',source:'school-route-hilly',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#818cf8','line-width':3,'line-opacity':0.72,'line-dasharray':[4,2]}});
  map.addLayer({id:'school-route-safe',type:'line',source:'school-route-safe',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':riskColor,'line-width':3,'line-opacity':0.82}});
  map.addLayer({id:'school-route-short',type:'line',source:'school-route-short',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':riskColor,'line-width':4,'line-opacity':0.92}});
  map.addLayer({id:'school-route-waypoint',type:'circle',source:'school-route-waypoint',paint:{'circle-radius':7,'circle-color':'#fff','circle-stroke-width':2.5,'circle-stroke-color':'#6366f1','circle-opacity':0.95}});
  map.addLayer({id:'schools-dot',type:'circle',source:'schools-pts',paint:{'circle-radius':5,'circle-color':'#f97316','circle-opacity':1}});
  map.addLayer({id:'schools-pulse',type:'circle',source:'school-hover-pt',paint:{'circle-radius':5,'circle-color':'#f97316','circle-opacity':0,'circle-stroke-width':0}});
  _setupRouteDrag();
}

function addSchoolsMapLayer(feats){
  _lastSchoolFeatures=feats;
  _ensureSchoolMapSetup();
  map.getSource('schools-pts').setData({type:'FeatureCollection',features:feats.map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.school_name||f.properties['სკოლა']||'School'}}))});
  map.setLayoutProperty('schools-dot','visibility','visible');
  _schoolsLayerActive=true;
  map.off('mouseenter','schools-dot',_onSchoolHover);
  map.off('mouseleave','schools-dot',_onSchoolLeave);
  map.on('mouseenter','schools-dot',_onSchoolHover);
  map.on('mouseleave','schools-dot',_onSchoolLeave);
}

function clearSchoolsMapLayer(){
  _schoolsLayerActive=false;
  _lastRouteSchool=null;
  ++_schoolPulseGen;
  _schoolRouteMode='both';
  if(map.getSource('schools-pts'))map.getSource('schools-pts').setData({type:'FeatureCollection',features:[]});
  if(map.getSource('school-route-short'))map.getSource('school-route-short').setData({type:'FeatureCollection',features:[]});
  if(map.getSource('school-route-safe'))map.getSource('school-route-safe').setData({type:'FeatureCollection',features:[]});
  if(map.getSource('school-route-waypoint'))map.getSource('school-route-waypoint').setData({type:'FeatureCollection',features:[]});
  if(map.getSource('school-route-hilly'))map.getSource('school-route-hilly').setData({type:'FeatureCollection',features:[]});
  if(map.getSource('school-hover-pt'))map.getSource('school-hover-pt').setData({type:'FeatureCollection',features:[]});
  if(map.getLayer('schools-dot'))map.setLayoutProperty('schools-dot','visibility','none');
  if(_schoolHoverPopup){_schoolHoverPopup.remove();_schoolHoverPopup=null;}
  map.getCanvas().style.cursor='';
  map.off('mouseenter','schools-dot',_onSchoolHover);
  map.off('mouseleave','schools-dot',_onSchoolLeave);
}

function _runSchoolPulse(){
  const gen=++_schoolPulseGen;
  let fr=0;
  (function pulse(){
    if(!_schoolsLayerActive||_schoolPulseGen!==gen||!map.getLayer('schools-pulse'))return;
    fr=(fr+1)%80;const tt=fr/80;const e=tt<0.5?2*tt*tt:-1+(4-2*tt)*tt;
    map.setPaintProperty('schools-pulse','circle-radius',5+e*16);
    map.setPaintProperty('schools-pulse','circle-opacity',0.5*(1-e));
    requestAnimationFrame(pulse);
  })();
}

let _lastRouteSchool=null;
let _lastRouteDestination=null;
let _lastSchoolFeatures=null;
let _schoolPulseGen=0;

function _clearBusStopRoute(){
  if(!_ttcActiveStop) return;
  _lastRouteDestination=null;
  const empty={type:'FeatureCollection',features:[]};
  ['school-route-short','school-route-safe','school-route-hilly','school-route-waypoint'].forEach(id=>{
    if(mapReady&&map.getSource(id)) map.getSource(id).setData(empty);
  });
  const rEl=document.getElementById('school-route-info');
  if(rEl) rEl.innerHTML='';
}
let _isDraggingRoute=false;

function _onSchoolHover(e){
  if(!e.features?.length)return;
  map.getCanvas().style.cursor='pointer';
  const coords=e.features[0].geometry.coordinates.slice();
  const name=e.features[0].properties.name;
  if(map.getSource('school-hover-pt'))map.getSource('school-hover-pt').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{}}]});
  _runSchoolPulse();
  if(!_schoolHoverPopup)_schoolHoverPopup=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:14,className:'school-popup',anchor:'bottom'});
  _schoolHoverPopup.setLngLat(coords).setHTML(`<div class="school-popup-name">${escapeHtml(name)}</div>`).addTo(map);
  if(_lastRouteSchool===name)return;
  _lastRouteSchool=name;
  showSchoolRoute(coords[0],coords[1],name);
}

function _onSchoolLeave(){
  map.getCanvas().style.cursor='';
  if(_schoolHoverPopup){_schoolHoverPopup.remove();_schoolHoverPopup=null;}
  // keep pulse running on last point until user hovers a new one
}

function _segmentRouteByRisk(coords,crashPts){
  const lngF=111320*Math.cos(coords[0][1]*Math.PI/180),latF=110540,R=70;
  const segs=coords.slice(0,-1);
  // crash count per segment midpoint
  const counts=segs.map((a,i)=>{
    const b=coords[i+1],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    let n=0;
    for(const cp of crashPts){const dx=(cp[0]-mid[0])*lngF,dy=(cp[1]-mid[1])*latF;if(Math.sqrt(dx*dx+dy*dy)<R)n++;}
    return n;
  });
  // percentile thresholds within this route's own distribution
  const sorted=[...counts].sort((a,b)=>a-b);
  const p20=sorted[Math.floor(sorted.length*0.20)];
  const p50=sorted[Math.floor(sorted.length*0.50)];
  return{type:'FeatureCollection',features:segs.map((a,i)=>{
    const b=coords[i+1],n=counts[i];
    const risk=n<=p20?'low':n<=p50?'medium':'high';
    return{type:'Feature',geometry:{type:'LineString',coordinates:[a,b]},properties:{risk}};
  })};
}

function _routeElevGain(coords){
  let gain=0,prev=null;
  for(const[lng,lat] of coords){
    const e=map.queryTerrainElevation([lng,lat],{exaggerated:false});
    if(e!=null){if(prev!=null&&e>prev)gain+=e-prev;prev=e;}
  }
  return gain;
}

let _elevSvgCtr=0;
function _buildRouteElevSVG(coords){
  const pts=[];let cumDist=0;
  const lngF0=111320*Math.cos(coords[0][1]*Math.PI/180);
  for(let i=0;i<coords.length;i++){
    const[lng,lat]=coords[i];
    if(i>0){const[pl,pt]=coords[i-1];const dx=(lng-pl)*lngF0,dy=(lat-pt)*110540;cumDist+=Math.sqrt(dx*dx+dy*dy);}
    const e=map.queryTerrainElevation([lng,lat],{exaggerated:false});
    if(e!=null)pts.push({dist:cumDist,elev:e});
  }
  if(pts.length<2)return'';
  const elevs=pts.map(p=>p.elev);
  const totalDist=pts[pts.length-1].dist||1;
  const emin=Math.min(...elevs),emax=Math.max(...elevs),erange=emax-emin||1;
  const W=200,H=44,pL=24,pR=4,pT=4,pB=10;
  const iW=W-pL-pR,iH=H-pT-pB;
  const xS=d=>pL+(d/totalDist)*iW;
  const yS=e=>pT+iH-((e-emin)/erange)*iH;
  const lp=pts.map(p=>`${xS(p.dist).toFixed(1)},${yS(p.elev).toFixed(1)}`).join(' L ');
  const fp=`M${xS(pts[0].dist).toFixed(1)},${pT+iH} L${lp} L${xS(pts[pts.length-1].dist).toFixed(1)},${pT+iH} Z`;
  const gid='rg'+(_elevSvgCtr++);
  let gain=0;for(let i=1;i<pts.length;i++){const d=pts[i].elev-pts[i-1].elev;if(d>0)gain+=d;}
  const gainLabel=gain>0.5?`<text x="${pL+iW}" y="${pT-0.5}" font-size="7" fill="rgba(129,140,248,0.6)" text-anchor="end">↑${Math.round(gain)}m</text>`:'';
  return `<div style="margin-top:3px;padding:4px 6px 3px;background:rgba(0,0,0,0.18);border-radius:5px"><svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#818cf8" stop-opacity="0.4"/><stop offset="100%" stop-color="#818cf8" stop-opacity="0.03"/></linearGradient></defs><path d="${fp}" fill="url(#${gid})"/><path d="M${lp}" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linejoin="round"/><line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+iH}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/><line x1="${pL}" y1="${pT+iH}" x2="${pL+iW}" y2="${pT+iH}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/><text x="${pL-3}" y="${pT+iH}" font-size="6.5" fill="rgba(255,255,255,0.25)" text-anchor="end" dominant-baseline="middle">${Math.round(emin)}</text><text x="${pL-3}" y="${pT+3}" font-size="6.5" fill="rgba(255,255,255,0.25)" text-anchor="end" dominant-baseline="middle">${Math.round(emax)}</text>${gainLabel}</svg></div>`;
}

let _schoolRouteMode='all';
function _selectSchoolRoute(mode){
  if(_schoolRouteMode===mode)mode='all';
  _schoolRouteMode=mode;
  const showShort=mode==='all'||mode==='short';
  const showHilly=mode==='all'||mode==='hilly';
  const shortRow=document.getElementById('school-route-row-short');
  const hillyRow=document.getElementById('school-route-row-hilly');
  if(shortRow){shortRow.style.opacity=showShort?'1':'0.4';shortRow.style.background=showShort?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.02)';}
  if(hillyRow){hillyRow.style.opacity=showHilly?'1':'0.4';hillyRow.style.background=showHilly?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.02)';}
  if(map.getLayer('school-route-short'))map.setPaintProperty('school-route-short','line-opacity',showShort?0.92:0.12);
  if(map.getLayer('school-route-hilly'))map.setPaintProperty('school-route-hilly','line-opacity',showHilly?0.72:0.08);
}

function _setupRouteDrag(){
  ['school-route-short','school-route-hilly'].forEach(layerId=>{
    map.on('mouseenter',layerId,()=>{if(!_isDraggingRoute)map.getCanvas().style.cursor='grab';});
    map.on('mouseleave',layerId,()=>{if(!_isDraggingRoute)map.getCanvas().style.cursor='';});
    map.on('mousedown',layerId,(e)=>{
      if(_isDraggingRoute)return;
      e.preventDefault();
      _isDraggingRoute=true;
      const dragSourceId=e.features?.[0]?.layer?.id||'school-route-short';
      map.getCanvas().style.cursor='grabbing';
      map.dragPan.disable();
      let lastPos=[e.lngLat.lng,e.lngLat.lat];
      if(map.getSource('school-route-waypoint'))map.getSource('school-route-waypoint').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:lastPos},properties:{}}]});
      const onMove=(ev)=>{
        lastPos=[ev.lngLat.lng,ev.lngLat.lat];
        if(map.getSource('school-route-waypoint'))map.getSource('school-route-waypoint').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:lastPos},properties:{}}]});
      };
      const onUp=async()=>{
        map.off('mousemove',onMove);
        map.off('mouseup',onUp);
        map.dragPan.enable();
        _isDraggingRoute=false;
        map.getCanvas().style.cursor='';
        if(map.getSource('school-route-waypoint'))map.getSource('school-route-waypoint').setData({type:'FeatureCollection',features:[]});
        await _rerouteWithWaypoint(lastPos,dragSourceId);
      };
      map.on('mousemove',onMove);
      map.on('mouseup',onUp);
    });
  });
}

async function _rerouteWithWaypoint(wp,sourceId){
  if(!parcelCentroid||!_lastRouteDestination)return;
  const[fromLng,fromLat]=parcelCentroid;
  const[toLng,toLat]=_lastRouteDestination;
  const profile=_accMode==='cycling'?'cycling':_accMode==='driving'?'driving':'walking';
  try{
    const url=`https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${wp[0].toFixed(6)},${wp[1].toFixed(6)};${toLng},${toLat}?geometries=geojson&steps=false&overview=full&access_token=${mapboxgl.accessToken}`;
    const res=await fetch(url);const data=await res.json();
    if(!data.routes?.length)return;
    const route=data.routes[0];
    const rc=route.geometry.coordinates;
    if(!_crashesGeoJSON){const cr=await fetch('data/car_crashes.geojson');if(cr.ok)_crashesGeoJSON=await cr.json();}
    const allCrashPts=(_crashesGeoJSON?.features||[]).map(f=>f.geometry?.coordinates).filter(Boolean);
    const buf=0.002,lngs=rc.map(c=>c[0]),lats=rc.map(c=>c[1]);
    const bx=[Math.min(...lngs)-buf,Math.min(...lats)-buf,Math.max(...lngs)+buf,Math.max(...lats)+buf];
    const nearby=allCrashPts.filter(cp=>cp[0]>=bx[0]&&cp[0]<=bx[2]&&cp[1]>=bx[1]&&cp[1]<=bx[3]);
    if(map.getSource(sourceId))map.getSource(sourceId).setData(_segmentRouteByRisk(rc,nearby));
    // update elevation profile in panel
    const profEl=sourceId==='school-route-short'?document.querySelector('#school-route-row-short+div'):document.querySelector('#school-route-row-hilly+div');
    if(profEl&&profEl.querySelector('svg'))profEl.outerHTML=_buildRouteElevSVG(rc);
  }catch(e){console.error('Reroute:',e);}
}

async function showSchoolRoute(toLng,toLat,schoolName){
  if(!parcelCentroid)return;
  const[fromLng,fromLat]=parcelCentroid;
  _lastRouteDestination=[toLng,toLat];
  try{
    const isCycling=_accMode==='cycling';
    const profile=isCycling?'cycling':_accMode==='driving'?'driving':'walking';
    const url=`https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${toLng},${toLat}?alternatives=true&geometries=geojson&steps=false&overview=full&access_token=${mapboxgl.accessToken}`;
    const res=await fetch(url);const data=await res.json();
    if(!data.routes?.length)throw new Error('no_routes');
    if(!_crashesGeoJSON){const cr=await fetch('data/car_crashes.geojson');if(cr.ok)_crashesGeoJSON=await cr.json();}
    const allCrashPts=(_crashesGeoJSON?.features||[]).map(f=>f.geometry?.coordinates).filter(Boolean);
    const routes=data.routes.map(route=>{
      const rc=route.geometry.coordinates;
      const elevGain=isCycling?_routeElevGain(rc):0;
      // bounding-box pre-filter for crash coloring
      const buf=0.002,lngs=rc.map(c=>c[0]),lats=rc.map(c=>c[1]);
      const bx=[Math.min(...lngs)-buf,Math.min(...lats)-buf,Math.max(...lngs)+buf,Math.max(...lats)+buf];
      const nearby=allCrashPts.filter(cp=>cp[0]>=bx[0]&&cp[0]<=bx[2]&&cp[1]>=bx[1]&&cp[1]<=bx[3]);
      return{route,nearby,elevGain};
    });

    const shortE=routes[0];

    // Less hilly (cycling only): lowest elevation gain, distinct from shortest
    let hillyE=null;
    if(isCycling&&routes.length>1){
      hillyE=routes.reduce((a,b)=>b.elevGain<a.elevGain?b:a);
      if(hillyE.route===shortE.route)hillyE=null;
    }

    _ensureSchoolMapSetup();
    const empty={type:'FeatureCollection',features:[]};
    map.getSource('school-route-short').setData(_segmentRouteByRisk(shortE.route.geometry.coordinates,shortE.nearby));
    map.getSource('school-route-safe').setData(empty);
    map.getSource('school-route-hilly').setData(hillyE?_segmentRouteByRisk(hillyE.route.geometry.coordinates,hillyE.nearby):empty);

    const allRouteCoords=[
      ...shortE.route.geometry.coordinates,
      ...(hillyE?hillyE.route.geometry.coordinates:[])
    ];
    const rLngs=allRouteCoords.map(c=>c[0]),rLats=allRouteCoords.map(c=>c[1]);
    map.fitBounds([[Math.min(...rLngs),Math.min(...rLats)],[Math.max(...rLngs),Math.max(...rLats)]],{padding:80,duration:700,maxZoom:16});

    const isKaL=lang==='ka';
    const fmtD=m=>m>=1000?`${(m/1000).toFixed(1)}km`:`${Math.round(m)}m`;
    const fmtT=s=>s>=3600?`${Math.floor(s/3600)}h ${Math.round((s%3600)/60)}min`:s>=60?`${Math.round(s/60)}min`:`${Math.round(s)}s`;
    const fmtG=g=>g>0?`<span style="font-size:0.57rem;color:rgba(255,255,255,0.28);margin-left:4px">↑${Math.round(g)}m</span>`:'';
    const rEl=document.getElementById('school-route-info');
    _schoolRouteMode='all';
    if(rEl)rEl.innerHTML=`<div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:8px;padding-top:8px">`+
      `<div style="font-size:0.58rem;color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px">${isKaL?'მარშრუტი':'Route to'} <span style="color:rgba(255,255,255,0.45);text-transform:none;font-weight:600">${schoolName}</span></div>`+
      `<div id="school-route-row-short" onclick="_selectSchoolRoute('short')" style="cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:2px;padding:5px 7px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);transition:opacity 0.2s">`+
        `<span style="display:inline-block;width:14px;height:3px;background:linear-gradient(90deg,#22c55e,#f97316,#ef4444);border-radius:2px;flex-shrink:0"></span>`+
        `<span style="font-size:0.63rem;color:rgba(255,255,255,0.55)">${isKaL?'მოკლე':'Shortest'}</span>`+
        `<span style="margin-left:auto;font-size:0.65rem;font-weight:600;color:rgba(255,255,255,0.85)">${fmtD(shortE.route.distance)}</span>`+
        `<span style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-left:5px">${fmtT(shortE.route.duration)}</span>`+
        (isCycling?fmtG(shortE.elevGain):'')+
      `</div>`+
      _buildRouteElevSVG(shortE.route.geometry.coordinates)+
      `<div style="margin-bottom:4px"></div>`+

      (!hillyE?'':`<div id="school-route-row-hilly" onclick="_selectSchoolRoute('hilly')" style="cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:2px;padding:5px 7px;border-radius:6px;border:1px solid rgba(129,140,248,0.2);background:rgba(129,140,248,0.05);transition:opacity 0.2s">`+
        `<span style="display:inline-block;width:14px;height:3px;background:#818cf8;border-radius:2px;flex-shrink:0;opacity:0.8"></span>`+
        `<span style="font-size:0.63rem;color:rgba(255,255,255,0.45)">${isKaL?'ნაკლებ ციცაბო':'Less Hilly'}</span>`+
        `<span style="margin-left:auto;font-size:0.65rem;font-weight:600;color:rgba(255,255,255,0.85)">${fmtD(hillyE.route.distance)}</span>`+
        `<span style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-left:5px">${fmtT(hillyE.route.duration)}</span>`+
        fmtG(hillyE.elevGain)+
      `</div>`)+
      (!hillyE?'':_buildRouteElevSVG(hillyE.route.geometry.coordinates))+
      (!hillyE?'':'<div style="margin-bottom:4px"></div>')+
      `<div style="display:flex;gap:8px;font-size:0.57rem;color:rgba(255,255,255,0.22);margin-top:5px"><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>${isKaL?'უსაფრთხო':'safe'}</span><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#f97316;display:inline-block"></span>${isKaL?'საშუალო':'moderate'}</span><span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span>${isKaL?'სახიფათო':'danger'}</span></div>`+
      `</div>`;
  }catch(e2){
    console.error('Route:',e2);
    _lastRouteSchool=null;
  }
}


async function toggleAccConnectivity(){
  const sw=document.getElementById("acc-connectivity-sw");
  if(!sw)return;
  const lg=document.getElementById("syntax-legend");
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    clearSyntaxLayers();
    if(lg){lg.style.display="none";lg.innerHTML="";}
    return;
  }
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){
    if(lg){lg.style.display="block";lg.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${t().accNoIso}</div>`;}
    return;
  }
  sw.classList.add("on");
  if(lg){lg.style.display="block";lg.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;}
  await runSpaceSyntax(!_isLargeParcel()&&isoFeat?isoFeat.geometry:null);
  if(!_syntaxActive)sw.classList.remove("on");
}

async function toggleAccOrientation(){
  const sw=document.getElementById("acc-orientation-sw");
  if(!sw)return;
  const rose=document.getElementById("orient-rose");
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    clearOrientLayers();
    if(rose){rose.style.display="none";rose.innerHTML="";}
    return;
  }
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){
    if(rose){rose.style.display="block";rose.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${t().accNoIso}</div>`;}
    return;
  }
  sw.classList.add("on");
  if(rose){rose.style.display="block";rose.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;}
  await runStreetOrientation(!_isLargeParcel()&&isoFeat?isoFeat.geometry:null);
  if(!_orientActive)sw.classList.remove("on");
}

async function toggleAccOSM(){
  const sw=document.getElementById("acc-osm-sw");
  if(!sw)return;
  const lg=document.getElementById("osm-legend");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    clearOverpassLayers();
    if(lg){lg.style.display="none";lg.innerHTML="";}
    return;
  }
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){
    if(lg){lg.style.display="block";lg.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${t().accNoIso}</div>`;}
    return;
  }
  sw.classList.add("on");
  if(lg){lg.style.display="block";lg.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;}
  try{
    const _osmGeo=isoFeat?isoFeat.geometry:_getMorphologyGeo();const coords=_osmGeo.type==='Polygon'?_osmGeo.coordinates[0]:_osmGeo.coordinates[0][0];
    const polyStr=coords.map(c=>`${c[1].toFixed(6)} ${c[0].toFixed(6)}`).join(' ');
    const query=`[out:json][timeout:30];(node(poly:"${polyStr}");way(poly:"${polyStr}"););out center tags;`;
    const res=await fetchOverpass(query,2);
    const catCounts={};
    const features=(res.elements||[]).reduce((acc,el)=>{
      const cat=_osmCat(el.tags);if(!cat)return acc;
      const lat=el.lat??el.center?.lat,lng=el.lon??el.center?.lon;if(!lat||!lng)return acc;
      acc.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},
        properties:{cat,name:el.tags?.name||'',type:el.tags?.amenity||el.tags?.shop||el.tags?.office||el.tags?.leisure||''}});
      catCounts[cat]=(catCounts[cat]||0)+1;
      return acc;
    },[]);
    const gj={type:'FeatureCollection',features};
    if(!map.getSource('overpass-pois'))map.addSource('overpass-pois',{type:'geojson',data:gj});
    else map.getSource('overpass-pois').setData(gj);
    if(!map.getLayer('overpass-circles')){
      map.addLayer({id:'overpass-circles',type:'circle',source:'overpass-pois',paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],13,3,17,7],
        'circle-color':['match',['get','cat'],
          'food','#f97316','retail','#ec4899','education','#6366f1',
          'health','#ef4444','public','#14b8a6','leisure','#22c55e',
          'tourism','#eab308','office','#a855f7','rgba(255,255,255,0.3)'],
        'circle-stroke-width':1,'circle-stroke-color':'rgba(0,0,0,0.4)','circle-opacity':0.9}});
      map.addLayer({id:'overpass-labels',type:'symbol',source:'overpass-pois',layout:{
        'text-field':['case',['!=',['get','name'],''],['get','name'],''],'text-size':9,
        'text-offset':[0,1.2],'text-optional':true,'text-max-width':8},
        paint:{'text-color':'rgba(255,255,255,0.75)','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1}});
    }
    _osmActive=true;
    const sdi=shannonIndex(catCounts);
    const verdict=verdictFor(sdi);
    const circ=169.65;
    const offset=(circ*(1-sdi/100)).toFixed(2);
    const total=Object.values(catCounts).reduce((s,v)=>s+v,0);
    const catKeys=Object.keys(OSM_CATS).filter(k=>k!=='other');
    const catBars=catKeys.filter(k=>catCounts[k]>0).sort((a,b)=>(catCounts[b]||0)-(catCounts[a]||0)).map(cat=>{
      const n=catCounts[cat]||0;
      const pct=total>0?Math.round((n/total)*100):0;
      return`<div class="cat-row"><div class="cat-header"><span class="cat-name"><span style="width:8px;height:8px;border-radius:50%;background:${OSM_CATS[cat].color};display:inline-block;flex-shrink:0"></span>${OSM_CATS[cat].label}</span><span class="cat-count">${n} · ${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="background:${OSM_CATS[cat].color};width:0%" data-w="${pct}"></div></div></div>`;
    }).join('');
    if(lg){
      lg.style.display='block';
      lg.innerHTML=
        `<div class="score-wrap" style="margin:6px 0 10px">
          <svg width="58" height="58" viewBox="0 0 70 70" style="flex-shrink:0">
            <circle cx="35" cy="35" r="27" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
            <circle cx="35" cy="35" r="27" fill="none" stroke="${verdict.color}" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="169.65" stroke-dashoffset="${circ}"
              transform="rotate(-90 35 35)" id="osm-sdi-ring"
              style="transition:stroke-dashoffset 1.1s cubic-bezier(0.23,1,0.32,1),stroke 0.4s"/>
          </svg>
          <div class="score-meta">
            <div class="score-num" style="color:${verdict.color};font-size:1.9rem;line-height:1">${sdi}</div>
            <div class="score-sub">${isKa?"შენონის SDI":"Shannon SDI"}</div>
            <div class="score-verdict" style="color:${verdict.color}">${verdict.text}</div>
          </div>
        </div>`
        +`<div class="lu-section-title" style="margin-bottom:6px"><span>${isKa?'ფუნქციები':'Urban functions'}</span><span>${features.length}</span></div>`
        +catBars;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const ring=document.getElementById("osm-sdi-ring");
        if(ring)ring.style.strokeDashoffset=offset;
        lg.querySelectorAll(".bar-fill").forEach(b=>{b.style.width=b.dataset.w+"%";});
      }));
    }
  }catch(e){
    console.error('OSM:',e);
    sw.classList.remove("on");
    if(lg){lg.style.display="none";lg.innerHTML="";}
  }
}

// ── Parking Layer ──────────────────────────────────────────────────────────────
// Fetch in UTM 38N (EPSG:32638) — WGS84 rounds to ~11m, collapsing small parking polygons
// Free parking: msm_z__gis_data_00072 — only zone_id = 'ALL'
const PARKING_FREE_URL = "https://geoserver4.ms.gov.ge/geoserver/ms_maps_main/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms_maps_main:msm_z__gis_data_00072&OUTPUTFORMAT=application/json&SRSNAME=EPSG:32638";
// Paid parking: msm_z__gis_data_00137 — only zone_id = 'A'
const PARKING_PAID_URL = "https://geoserver4.ms.gov.ge/geoserver/ms_maps_main/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms_maps_main:msm_z__gis_data_00137&OUTPUTFORMAT=application/json&SRSNAME=EPSG:32638";
let _parkingFreeCache = null;
let _parkingPaidCache = null;
let _pkHoverMove = null;
let _pkHoverLeave = null;

// Georgian keyboard transliteration helpers
// Uppercase = special Georgian chars: T=თ, S=შ, C=ჩ, Z=ძ, W=ჭ, J=ჟ, R=ღ
const _KA={a:'ა',b:'ბ',g:'გ',d:'დ',e:'ე',v:'ვ',z:'ზ',T:'თ',i:'ი',k:'კ',l:'ლ',m:'მ',n:'ნ',o:'ო',p:'პ',J:'ჟ',r:'რ',s:'ს',t:'ტ',u:'უ',f:'ფ',q:'ქ',R:'ღ',y:'ყ',S:'შ',C:'ჩ',c:'ც',Z:'ძ',w:'წ',W:'ჭ',x:'ხ',j:'ჯ',h:'ჰ'};
const _EN_CH={'T':'t','S':'sh','C':'ch','Z':'dz','W':'ch','J':'zh','R':'gh','c':'ts','w':'ts','q':'k','x':'kh'};

// Georgian keyboard Latin → English dictionary (base forms + common inflected forms)
const _EN_VOCAB={
  // Street types
  'quCa':'Street','gamziri':'Avenue','prospeqti':'Prospect','gza':'Road',
  'moedani':'Square','korpusi':'Building','bloki':'Block','nawili':'Part',
  'raionia':'District','dasaxleba':'Settlement','mikroraioni':'Microdistrict',
  'ezo':'Yard','kvartali':'Quarter','saxli':'House','SesasvleliTan':'Entrance',
  // Physical features – base + common case forms
  'xidi':'Bridge','xidis':'Bridge','xidTan':'Bridge','xidze':'Bridge',
  'mdinare':'River','mdinareTan':'by the River','mdinareze':'on the River',
  'mTa':'Mountain','mTis':'Mountain','mTaze':'on the Mountain',
  'tba':'Lake','tbis':'Lake',
  'tye':'Forest','tyeSi':'in the Forest','tyis':'Forest',
  'veli':'Field','velis':'Field',
  'borcvi':'Hill','xevi':'Gorge','xevis':'Gorge',
  'wyali':'Water','wylis':'Water',
  'sanapiro':'Embankment','sanapiros':'Embankment','sanapiroze':'on the Embankment',
  // Parks / gardens
  'bagi':'Park','bagis':'Park','bagSi':'in the Park',
  'baRi':'Park','baRis':'Park','baRSi':'in the Park',
  'baRCa':'Garden','baRCis':'Garden',
  'baWi':'Garden','baWis':'Garden',
  'parki':'Park','parkis':'Park','parkSi':'in the Park',
  // Adjectives
  'mSrali':'Dry','mSral':'Dry','mSralis':'Dry',
  'axali':'New','axalis':'New',
  'Zveli':'Old','Zvelis':'Old',
  'didi':'Great','didis':'Great',
  'patara':'Small',
  'mTavari':'Main','mTavaris':'Main',
  'centraluri':'Central',
  'saxelmwifo':'State','saxelmwifos':'State',
  'saerTaSoriso':'International',
  'pirveli':'First','meore':'Second','mesame':'Third',
  // Genitive romanization hints (nominative form for proper names that appear inflected)
  'enis':'Ena','dedis':'Deda',
  'asasvleli':'Entrance','asasvlelis':'Entrance',
  'Sesasvleli':'Entrance','Sesasvlelis':'Entrance',
  'Semosvleli':'Entrance',
  'gamosavleli':'Exit','gamosavlelis':'Exit',
  'gamoSveba':'Exit','gamoSvebis':'Exit',
  'mimdebared':'Adjacent','mimdebare':'Adjacent','mиmdebared':'Adjacent',
  'maxloblad':'Nearby','maxlobeli':'Nearby',
  'gverdiT':'Next to',
  // Transport
  'metro':'Metro','metrosTan':'near Metro','metroSi':'in Metro',
  'sadguri':'Station','sadguris':'Station','sadgurTan':'near Station',
  'aeroporti':'Airport','aeroportis':'Airport',
  'rkinigza':'Railway','rkinigzis':'Railway',
  'gaCereba':'Stop','gaCerebis':'Stop',
  'avtostanqia':'Bus Station',
  // Institutions
  'bazari':'Market','bazaris':'Market','bazarSi':'in the Market',
  'bazroba':'Market','bazrobis':'Market',
  'skola':'School','skolis':'School','skolaSi':'in the School',
  'saavadmyofo':'Hospital','saavadmyofos':'Hospital',
  'poliklinika':'Clinic','poliklinikis':'Clinic',
  'universiteti':'University','universitetis':'University',
  'instituti':'Institute','institutis':'Institute',
  'teatri':'Theater','teatris':'Theater',
  'kinoteatro':'Cinema','kinoteatris':'Cinema',
  'stadioni':'Stadium','stadionis':'Stadium','stadionTan':'near Stadium',
  'biblioTeka':'Library','biblioTekis':'Library',
  'muzeumi':'Museum','muzeumis':'Museum',
  'sasamarTlo':'Court','sasamarTlos':'Court',
  'administracia':'Administration',
  'sacxovrebeli':'Residential',
  'sawarmo':'Enterprise','sawarmis':'Enterprise',
  'qarxana':'Factory','qarxnis':'Factory',
  'samsaxuri':'Office','samsaxuris':'Office',
  // Famous Tbilisi streets / districts (already-romanized names)
  'rusTaveli':'Rustaveli','rusTavelis':'Rustaveli',
  'aRmaSenebeli':'Agmashenebeli','aRmaSeneblis':'Agmashenebeli',
  'barataSvili':'Baratashvili','barataSvilis':'Baratashvili',
  'kostava':'Kostava','kostavas':'Kostava',
  'marjaniSvili':'Marjanishvili','marjaniSvilis':'Marjanishvili',
  'tavisuflebis':'Freedom','tavisufleba':'Freedom',
  'navTluRi':'Navtlughi','navTluRis':'Navtlughi',
  'digomi':'Digomi','didube':'Didube','saburtalo':'Saburtalo',
  'gldani':'Gldani','isani':'Isani','vazisubani':'Vazisubani',
  'samgori':'Samgori','ortaCala':'Ortachala','avlabari':'Avlabari',
  'mtatsminda':'Mtatsminda','vera':'Vera','vake':'Vake',
  // Misc common words
  'axalgazrdoba':'Youth','gmiri':'Hero','gmiris':'Hero',
  'xalxis':'People','eri':'Nation',
};

// Case suffixes to try stripping (longest first) with English preposition/postposition gloss
const _GEO_SFXS=[
  ['TanmimdevrobiT',''],['mimdebared','adjacent to'],
  ['Tan','near '],['Si','in '],['ze','on '],['dan','from '],['ad',''],
  ['ared',''],['ebi',''],['is',''],['s',''],['i',''],
];

function _latinToKa(str){
  if(!str) return str;
  return str.split('').map(c=>_KA[c]??c).join('');
}

function _latinToEn(str){
  if(!str) return str;
  const romanize=s=>s.split('').map(c=>_EN_CH[c]??c).join('');
  const title=s=>s?s[0].toUpperCase()+s.slice(1).toLowerCase():s;

  // Look up a word (case-insensitive), returns translation or null
  const lookup=w=>{
    for(const [k,v] of Object.entries(_EN_VOCAB)) if(k.toLowerCase()===w.toLowerCase()) return v;
    return null;
  };

  // Try the word as-is, then strip suffixes and look up the stem
  const translate=w=>{
    const direct=lookup(w);
    if(direct) return direct;
    // Try suffix stripping
    for(const [sfx,pre] of _GEO_SFXS){
      if(w.length<=sfx.length+2) continue;
      const lw=w.toLowerCase(), ls=sfx.toLowerCase();
      if(!lw.endsWith(ls)) continue;
      const stem=w.slice(0,-sfx.length);
      // Try stem, stem+'i', stem+'e', stem+'a'
      for(const end of ['','i','e','a']){
        const t=lookup(stem+end);
        if(t) return pre?pre+t.toLowerCase():t;
      }
    }
    return null;
  };

  // Recover nominative from genitive "-is" for proper names
  const stripGenitive=w=>{
    if(!w.toLowerCase().endsWith('is')||w.length<=3) return w;
    const stem=w.slice(0,-2);  // strip 'is'
    const last=stem.slice(-1);
    if('ZSCTWJR'.includes(last)) return stem+'e';   // doliZe, beridZe…
    if(/[aeiou]/i.test(last))   return w.slice(0,-1); // vowel-stem: strip just 's' (rusTaveli)
    return stem+'a';                                 // consonant-stem: was 'a'-ending (ena, mTa, gza)
  };

  const isKnownStreet=w=>!!lookup(w);
  const words=str.split(' ');

  return words.map((w,i)=>{
    if(!w) return w;
    if(/^[#\d\-\/\.]+$/.test(w)) return w;
    // Try full translation first
    const t=translate(w);
    if(t) return title(t);
    // Strip genitive when next word is a known word
    let base=w;
    const next=words.slice(i+1).find(x=>x&&!/^[#\d\-\/\.]+$/.test(x));
    if(next&&isKnownStreet(next)) base=stripGenitive(w);
    return title(romanize(base));
  }).join(' ');
}

function _utm38nToWgs84(E, N){
  const k0=0.9996,a=6378137,e2=0.00669438,ep2=e2/(1-e2);
  const M=N/k0,mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu);
  const N1=a/Math.sqrt(1-e2*Math.sin(p1)**2),T1=Math.tan(p1)**2,C1=ep2*Math.cos(p1)**2;
  const R1=a*(1-e2)/(1-e2*Math.sin(p1)**2)**1.5,D=(E-500000)/(N1*k0);
  const lat=p1-(N1*Math.tan(p1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24);
  const lon=Math.PI/4+(D-(1+2*T1+C1)*D**3/6)/Math.cos(p1);
  return[lon*180/Math.PI, lat*180/Math.PI];
}
function _parkingConvertGeom(geom){
  const cvtRing=ring=>ring.map(c=>_utm38nToWgs84(c[0],c[1]));
  if(geom.type==='MultiPolygon') return{type:'MultiPolygon',coordinates:geom.coordinates.map(poly=>poly.map(cvtRing))};
  return{type:'Polygon',coordinates:geom.coordinates.map(cvtRing)};
}
function _parkingCentroidOfRing(ring){
  const n=ring.length-1; let x=0,y=0;
  for(let i=0;i<n;i++){x+=ring[i][0];y+=ring[i][1];}
  return[x/n,y/n];
}

function _parkingRemoveLayer(){
  if(_pkHoverMove){try{map.off('mousemove','parking-fill',_pkHoverMove);}catch(_){}_pkHoverMove=null;}
  if(_pkHoverLeave){try{map.off('mouseleave','parking-fill',_pkHoverLeave);}catch(_){}_pkHoverLeave=null;}
  const tip=document.getElementById('parking-tip');if(tip)tip.style.display='none';
  ['parking-hover','parking-labels','parking-icon-taxi','parking-icon-handi','parking-icon-load','parking-icon-ev','parking-fill','parking-line'].forEach(id=>{try{if(map.getLayer(id))map.removeLayer(id);}catch(_){}});
  ['parking','parking-centroids'].forEach(id=>{try{if(map.getSource(id))map.removeSource(id);}catch(_){}});
}

async function toggleAccParking(){
  const sw=document.getElementById('acc-parking-sw');
  const el=document.getElementById('acc-parking-result');
  if(!sw) return;
  const isKa=lang==='ka';
  if(sw.classList.contains('on')){
    sw.classList.remove('on');
    _parkingRemoveLayer();
    if(el) el.innerHTML='';
    return;
  }
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat){
    if(el) el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${t().accNoIso||'Generate an isochrone first'}</div>`;
    return;
  }
  sw.classList.add('on');
  if(el) el.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;color:rgba(255,255,255,0.3);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;
  try{
    if(!_parkingFreeCache){
      const res=await fetch(PARKING_FREE_URL);
      if(!res.ok) throw new Error("HTTP "+res.status);
      _parkingFreeCache=await res.json();
    }
    if(!_parkingPaidCache){
      const res=await fetch(PARKING_PAID_URL);
      if(!res.ok) throw new Error("HTTP "+res.status);
      _parkingPaidCache=await res.json();
    }
    const isoGeom=isoFeat.geometry;
    const polyFeatures=[], centroidFeatures=[];
    let freeAreas=0,paidAreas=0;
    let carsTotal=0,taxiTotal=0,handiTotal=0,loadTotal=0,evTotal=0;
    let carsFree=0,carsPaid=0;

    // Helper: bounding box of first ring
    const _pkBbox=geom=>{
      const ring=geom.type==='MultiPolygon'?geom.coordinates[0][0]:geom.coordinates[0];
      let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
      for(const [x,y] of ring){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
      return{x0,x1,y0,y1};
    };

    // Pass 1: collect all valid paid geometries + bboxes + centroids within isochrone
    const paidWgs=[];
    for(const f of (_parkingPaidCache.features||[])){
      if(f.properties?.zone_id!=='A') continue;
      try{
        const wgsGeom=_parkingConvertGeom(f.geometry);
        const firstRing=wgsGeom.type==='MultiPolygon'?wgsGeom.coordinates[0][0]:wgsGeom.coordinates[0];
        const [lng,lat]=_parkingCentroidOfRing(firstRing);
        if(!pointInPolygon(lng,lat,isoGeom)) continue;
        paidWgs.push({geom:wgsGeom,bbox:_pkBbox(wgsGeom),cx:lng,cy:lat,props:f.properties});
      }catch(_){}
    }

    // Ray-cast point-in-ring test (works on a single coordinate ring, not full GeoJSON geometry)
    const _ptInRing=(x,y,ring)=>{
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
        if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
      }
      return inside;
    };

    // Check if a free geometry overlaps with any paid one:
    // bbox pre-filter → centroid-in-polygon both ways → vertex-in-polygon both ways
    const _overlapsAnyPaid=(freeGeom,fcx,fcy)=>{
      const fb=_pkBbox(freeGeom);
      const freeRing=freeGeom.type==='MultiPolygon'?freeGeom.coordinates[0][0]:freeGeom.coordinates[0];
      for(const pd of paidWgs){
        if(fb.x0>pd.bbox.x1||fb.x1<pd.bbox.x0||fb.y0>pd.bbox.y1||fb.y1<pd.bbox.y0) continue;
        const paidRing=pd.geom.type==='MultiPolygon'?pd.geom.coordinates[0][0]:pd.geom.coordinates[0];
        // Centroid checks
        if(_ptInRing(fcx,fcy,paidRing)) return true;
        if(_ptInRing(pd.cx,pd.cy,freeRing)) return true;
        // Vertex checks — catches partial overlap where neither centroid is inside the other
        for(const [vx,vy] of freeRing){if(_ptInRing(vx,vy,paidRing)) return true;}
        for(const [vx,vy] of paidRing){if(_ptInRing(vx,vy,freeRing)) return true;}
      }
      return false;
    };

    const addFeature=(wgsGeom,lng,lat,p,type)=>{
      const cars=Math.round(p.manqanis_a)||0;
      const taxi=Math.round(p.taxi_adgil)||0;
      const handi=Math.round(p.ssm_adgili)||0;
      const load=Math.round(p.distribuci)||0;
      const ev=Math.round(p.el_damteni)||0;
      const zoneCode=p.zone_code||p.senisvna||'';
      if(type==='free'){freeAreas++;carsFree+=cars;}else{paidAreas++;carsPaid+=cars;}
      carsTotal+=cars; taxiTotal+=taxi; handiTotal+=handi; loadTotal+=load; evTotal+=ev;
      const props={cars,taxi,handi,load,ev,zoneCode,type,name:p.parkirebis||'',_pkId:polyFeatures.length};
      polyFeatures.push({type:'Feature',geometry:wgsGeom,properties:props});
      centroidFeatures.push({type:'Feature',
        geometry:{type:'Point',coordinates:[lng,lat]},
        properties:{...props,label:zoneCode}
      });
    };

    // Pass 2: add all paid features
    for(const pd of paidWgs) addFeature(pd.geom,pd.cx,pd.cy,pd.props,'paid');

    // Pass 3: add free features only if they don't overlap any paid polygon
    for(const f of (_parkingFreeCache.features||[])){
      if(f.properties?.zone_id!=='ALL') continue;
      try{
        const wgsGeom=_parkingConvertGeom(f.geometry);
        const firstRing=wgsGeom.type==='MultiPolygon'?wgsGeom.coordinates[0][0]:wgsGeom.coordinates[0];
        const [lng,lat]=_parkingCentroidOfRing(firstRing);
        if(!pointInPolygon(lng,lat,isoGeom)) continue;
        if(_overlapsAnyPaid(wgsGeom,lng,lat)) continue;
        addFeature(wgsGeom,lng,lat,f.properties,'free');
      }catch(_){}
    }

    _parkingRemoveLayer();
    map.addSource('parking',{type:'geojson',data:{type:'FeatureCollection',features:polyFeatures}});
    map.addLayer({id:'parking-fill',type:'fill',source:'parking',paint:{
      'fill-color':['match',['get','type'],'free','#22c55e','#f97316'],
      'fill-opacity':0.4
    }});
    map.addLayer({id:'parking-line',type:'line',source:'parking',paint:{
      'line-color':['match',['get','type'],'free','#16a34a','#ea580c'],
      'line-width':1,'line-opacity':0.85
    }});
    map.addSource('parking-centroids',{type:'geojson',data:{type:'FeatureCollection',features:centroidFeatures}});
    // Render emoji to canvas and load as Mapbox sprite images — SDF fonts don't support emoji
    const _pkIconDefs=[
      ['pk-taxi', '🚕','taxi',  [-15,-15]],
      ['pk-handi','♿', 'handi', [ 15,-15]],
      ['pk-load', '🚚','load',  [-15,  15]],
      ['pk-ev',   '⚡','ev',    [ 15,  15]],
    ];
    for(const [name,emoji] of _pkIconDefs){
      if(!map.hasImage(name)){
        const sz=24,cv=document.createElement('canvas');
        cv.width=cv.height=sz;
        const ctx=cv.getContext('2d');
        ctx.font=`${sz-2}px serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(emoji,sz/2,sz/2+1);
        map.addImage(name,{width:sz,height:sz,data:new Uint8Array(ctx.getImageData(0,0,sz,sz).data.buffer)});
      }
    }
    for(const [imgName,,key,offset] of _pkIconDefs){
      map.addLayer({id:`parking-icon-${key}`,type:'symbol',source:'parking-centroids',
        minzoom:14,
        filter:['>',['get',key],0],
        layout:{
          'icon-image':imgName,'icon-size':0.65,
          'icon-offset':offset,
          'icon-allow-overlap':true,'icon-ignore-placement':true
        }
      });
    }
    map.addLayer({id:'parking-labels',type:'symbol',source:'parking-centroids',
      minzoom:16,
      layout:{
        'text-field':['get','label'],'text-size':10,
        'text-font':['DIN Pro Medium','Arial Unicode MS Regular'],
        'text-anchor':'center','text-allow-overlap':false,'text-ignore-placement':false
      },
      paint:{
        'text-color':['match',['get','type'],'free','#bbf7d0','#fed7aa'],
        'text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2
      }
    });

    // Hover highlight layer — initially matches nothing
    map.addLayer({id:'parking-hover',type:'fill',source:'parking',
      paint:{'fill-color':['match',['get','type'],'free','#86efac','#fdba74'],'fill-opacity':0.65},
      filter:['==',['get','_pkId'],-1]
    });

    // Tooltip element (created once, reused)
    let pkTip=document.getElementById('parking-tip');
    if(!pkTip){
      pkTip=document.createElement('div');
      pkTip.id='parking-tip';
      pkTip.style.cssText='position:fixed;pointer-events:none;display:none;background:rgba(2,6,23,0.93);color:#e2e8f0;font-size:0.72rem;padding:9px 11px;border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,0.5);line-height:1.65;z-index:9999;border:1px solid rgba(255,255,255,0.1);min-width:140px';
      document.body.appendChild(pkTip);
    }

    _pkHoverMove=e=>{
      if(!e.features||!e.features.length){pkTip.style.display='none';return;}
      const f=e.features[0].properties;
      const isKa=lang==='ka';
      map.setFilter('parking-hover',['==',['get','_pkId'],f._pkId]);
      const isPaid=f.type==='paid';
      let html='';
      if(f.zoneCode) html+=`<div style="font-size:0.78rem;font-weight:700;color:#f8fafc;margin-bottom:5px">${escapeHtml(f.zoneCode)}</div>`;
      html+=`<div style="margin-bottom:${f.name?4:6}px">${isPaid
        ?`<span style="background:rgba(249,115,22,0.2);color:#fb923c;padding:1px 6px;border-radius:3px;font-size:0.67rem;font-weight:600">${isKa?'ფასიანი · Zone A':'Paid · Zone A'}</span>`
        :`<span style="background:rgba(34,197,94,0.15);color:#4ade80;padding:1px 6px;border-radius:3px;font-size:0.67rem;font-weight:600">${isKa?'უფასო':'Free'}</span>`
      }</div>`;
      const displayName=f.name?_latinToKa(f.name):'';
      if(displayName) html+=`<div style="color:rgba(255,255,255,0.4);font-size:0.63rem;margin-bottom:5px">${escapeHtml(displayName)}</div>`;
      html+='<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:5px">';
      if(f.cars>0) html+=`<div>🚗 <b>${f.cars}</b> ${isKa?'ავტომობილი':'cars'}</div>`;
      if(f.taxi>0) html+=`<div>🚕 <b>${f.taxi}</b> ${isKa?'ტაქსი':'taxi'}</div>`;
      if(f.handi>0) html+=`<div>♿ <b>${f.handi}</b> ${isKa?'შეზღ. შეს.':'accessible'}</div>`;
      if(f.load>0) html+=`<div>🚚 <b>${f.load}</b> ${isKa?'დისტ.':'distribution'}</div>`;
      if(f.ev>0) html+=`<div style="color:#fde68a">⚡ <b>${f.ev}</b> ${isKa?'EV დამტენი':'EV charger'}</div>`;
      html+='</div>';
      pkTip.innerHTML=html;
      pkTip.style.display='block';
      const mx=e.originalEvent.clientX,my=e.originalEvent.clientY;
      const tw=pkTip.offsetWidth||160,th=pkTip.offsetHeight||120;
      pkTip.style.left=(mx+16+tw>window.innerWidth?mx-tw-8:mx+16)+'px';
      pkTip.style.top=(my+th+10>window.innerHeight?my-th-8:my+10)+'px';
    };
    _pkHoverLeave=()=>{
      map.setFilter('parking-hover',['==',['get','_pkId'],-1]);
      pkTip.style.display='none';
    };
    map.on('mousemove','parking-fill',_pkHoverMove);
    map.on('mouseleave','parking-fill',_pkHoverLeave);

    const legendFree=`<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#22c55e;margin-right:4px;vertical-align:middle"></span>${isKa?'უფასო':'Free'}`;
    const legendPaid=`<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f97316;margin-right:4px;vertical-align:middle"></span>${isKa?'ფასიანი (A)':'Paid (A)'}`;
    const totalAreas=freeAreas+paidAreas;
    const statRow=(label,val,color='rgba(255,255,255,0.65)')=>
      val>0?`<div style="display:flex;justify-content:space-between"><span>${label}</span><span style="font-weight:600;color:${color}">${val}</span></div>`:'';
    // summary for the report
    window._parkingSummary={totalAreas,freeAreas,paidAreas,cars:carsTotal,taxi:taxiTotal,accessible:handiTotal,distribution:loadTotal,ev:evTotal};
    if(el) el.innerHTML=`
      <div style="padding:5px 0 4px;font-size:0.67rem;color:rgba(255,255,255,0.4);line-height:1.75">
        <div style="display:flex;gap:10px;margin-bottom:6px">${legendFree}&nbsp;&nbsp;${legendPaid}</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.75);font-weight:700;margin-bottom:3px">${totalAreas} ${isKa?'სადგომი':'parking areas'} &nbsp;<span style="font-weight:400;font-size:0.65rem;opacity:0.6">(${freeAreas} ${isKa?'უფ.':'free'} · ${paidAreas} ${isKa?'ფას.':'paid'})</span></div>
        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;margin-top:2px">
          ${statRow('🚗 '+(isKa?'ავტომობილი':'Cars'),carsTotal)}
          ${statRow('🚕 '+(isKa?'ტაქსი':'Taxi'),taxiTotal)}
          ${statRow('♿ '+(isKa?'შეზღ. შეს.':'Accessible'),handiTotal)}
          ${statRow('🚚 '+(isKa?'დისტრიბუცია':'Distribution'),loadTotal)}
          ${evTotal>0?statRow('⚡ '+(isKa?'დამტენი':'EV charger'),evTotal,'#facc15'):''}
        </div>
        <div style="margin-top:4px;font-size:0.6rem;opacity:0.35">${isKa?'ლეიბლები ჩანს zoom 16+':'Labels visible at zoom 16+'}</div>
      </div>`;
  }catch(e){
    sw.classList.remove('on');
    if(el) el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,80,80,0.4);padding:4px 0">${isKa?'შეცდომა':'Error loading data'}</div>`;
  }
}

async function toggleAccMobility(){
  const sw=document.getElementById("acc-mob-sw");
  if(!sw)return;
  const el=document.getElementById("acc-mob-result");
  const isKa=lang==="ka";
  if(sw.classList.contains("on")){sw.classList.remove("on");if(el)el.innerHTML="";return;}
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  const isoFeat=_isoData?.features?.[0];
  if(!isoFeat&&!_isLargeParcel()){
    const msg=isKa?"პირველ გაუშვით სივრცული ანალიზი":"Run Pro Analysis first to get isochrone";
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${msg}</div>`;
    return;
  }
  sw.classList.add("on");
  if(el)el.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0 6px;color:rgba(255,255,255,0.35);font-size:0.7rem"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></div>`;
  try{
    const bbox=isoBbox(isoFeat||{geometry:_getMorphologyGeo()});
    const crashQ=`[out:json][timeout:25];(node[accident](${bbox});node[highway=traffic_signals](${bbox}););out tags;`;
    const res=await fetchOverpass(crashQ,2);
    const crashes=res.elements||[];
    const crashCount=crashes.filter(e=>e.tags?.accident).length;
    if(_isDrawnArea)_drawnAreaProps.crashes_500m=crashCount;
    const tr=t();
    const crashInfo=tr.proCats.crashes;
    const crashPct=Math.min(100,Math.round((crashCount/50)*100));
    if(el)el.innerHTML=`<div style="margin:4px 0 6px"><div class="cat-row"><div class="cat-header"><span class="cat-name"><span style="font-size:12px">${crashInfo.icon}</span>${crashInfo.label}</span><span class="cat-count">${crashCount}</span></div><div class="bar-track"><div class="bar-fill" style="background:#ef4444;width:0%" data-w="${crashPct}"></div></div></div></div>`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(el)el.querySelectorAll(".bar-fill").forEach(b=>{b.style.width=b.dataset.w+"%";});}));
  }catch(e){
    console.error("Mobility:",e);
    sw.classList.remove("on");
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${isKa?"შეცდომა":"Error loading data"}</div>`;
  }
}




// ── Relief Analysis ────────────────────────────────────────────────────────────
const DTM_URL = "https://pub-9071f31b4edc4a15ba28c48f949017fc.r2.dev/tbilisi_dtm_cog.tif";
let _accMode = "walking";
function _getMorphologyGeo(){
  // Always use the isochrone when available — ensures spatially consistent analysis
  if(!_isDrawnArea&&_isoData?.features?.[0]) return _isoData.features[0].geometry;
  return _currentParcelGeoJSON;
}
let _accMinutes = 15;
let _schoolsGeoJSON = null;
let _kgGeoJSON = null;
let _kgLayerActive = false;
let _lastKgFeatures = null;
let _kgPulseGen = 0;
let _kgHoverPopup = null;
let _lastRouteKg = null;
let _lastKgRouteDestination = null;
let _kgRouteMode = 'all';
let _isDraggingKgRoute = false;
let _crashesGeoJSON = null;
let _schoolsLayerActive = false;
let _schoolHoverPopup = null;
let _reliefActiveType = null;
let _reliefOverlayCache = null;
let _dtmCache = null;
let _reliefComputed = new Set();
let _profileMode = false;
let _profileStart = null;
let _profilePts = null;
let _profileTransect = null;
let _canopyOverlayCache = null;
let _lstOverlayCache = null;

function renderReliefButtons(){
  const tr=t();const isKa=lang==="ka";
  const el=document.getElementById("pro-cat-relief-content");
  const hasData=!!_reliefActiveType;
  el.innerHTML=
    `<div class="lp-row acc-toggle-row" style="padding:4px 0" onclick="toggleAccRelief('height')"><span class="lp-row-name">${tr.reliefTypes.height}</span><div class="lp-sw${_reliefActiveType==='height'?' on':''}" id="acc-relief-height-sw"></div></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccRelief('slope')"><span class="lp-row-name">${tr.reliefTypes.slope}</span><div class="lp-sw${_reliefActiveType==='slope'?' on':''}" id="acc-relief-slope-sw"></div></div>`+
    `<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:2px" onclick="toggleAccRelief('aspect')"><span class="lp-row-name">${tr.reliefTypes.aspect}</span><div class="lp-sw${_reliefActiveType==='aspect'?' on':''}" id="acc-relief-aspect-sw"></div></div>`+
    `<div id="relief-status" style="font-size:0.7rem;color:rgba(255,255,255,0.35);min-height:14px;margin-top:4px"></div>`+
    `<div id="relief-stats" style="display:none"><div class="relief-stat-row"><span id="relief-stat-min"></span><span id="relief-stat-mean"></span><span id="relief-stat-max"></span></div><div id="relief-extra-stats"></div></div>`+
    `<div class="relief-legend" id="relief-legend"><canvas class="relief-legend-bar" id="relief-legend-bar" width="240" height="8"></canvas><div class="relief-legend-labels"><span id="relief-legend-lo"></span><span id="relief-legend-mid"></span><span id="relief-legend-hi"></span></div></div>`+
    (hasData?`<div class="lp-row acc-toggle-row" style="padding:4px 0;margin-top:6px;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px" onclick="toggleElevationProfile()"><span class="lp-row-name">${isKa?"სიმაღლის პროფილი":"Elevation Profile"}</span><div class="lp-sw${_profileMode?' on':''}" id="acc-profile-sw"></div></div><div id="elevation-profile-result">${_profileMode?`<div class="profile-hint">${isKa?"რუქაზე ხაზი დაასვით":"Click on map to set start point"}</div>`:''}</div>`+
    `<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px">
      <div style="font-size:0.58rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.22);margin-bottom:6px">${isKa?"გეოTIFF გადმოტვირთვა":"Download GeoTIFF"}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="relief-dl-btn${_reliefComputed.has('height')?'':' disabled'}" ${_reliefComputed.has('height')?'onclick="exportReliefGeoTIFF(\'height\')"':'disabled'}>↓ ${isKa?"სიმაღლე":"Elevation"}</button>
        <button class="relief-dl-btn${_reliefComputed.has('slope')?'':' disabled'}" ${_reliefComputed.has('slope')?'onclick="exportReliefGeoTIFF(\'slope\')"':'disabled'}>↓ ${isKa?"დახრა":"Slope"}</button>
        <button class="relief-dl-btn${_reliefComputed.has('aspect')?'':' disabled'}" ${_reliefComputed.has('aspect')?'onclick="exportReliefGeoTIFF(\'aspect\')"':'disabled'}>↓ ${isKa?"ასპექტი":"Aspect"}</button>
      </div>
    </div>`:'');
}

function renderEnergySection(){
  const el=document.getElementById("pro-cat-energy-content");
  if(!el)return;
  const isKa=lang==="ka";
  el.innerHTML=`<button class="solar-btn${_solarOverlayCache?' active':''}" id="solar-btn" onclick="runSolarAnalysis()">
    ☀ ${isKa?"სოლარო ზონა":"Solar Zone"}
  </button>
  <div class="solar-result" id="solar-result"></div>
  <button class="wind-btn" id="wind-btn" onclick="runWindAnalysis()">
    ${isKa?"ქარის ანალიზი":"Wind Analysis"}
  </button>`;
}


async function fetchDTM(geojson){
  const coords=geojson.type==="Polygon"?geojson.coordinates.flat():
                geojson.type==="MultiPolygon"?geojson.coordinates.flat(3):geojson.coordinates;
  const lngs=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);

  const proxyUrl=`${PROXY}/lst?url=${encodeURIComponent(DTM_URL)}`;_rptRasterSrc.relief_dtm=proxyUrl;
  const tiff=await GeoTIFF.fromUrl(proxyUrl,{allowFullFile:false});
  const image=await tiff.getImage();
  const imgBbox=image.getBoundingBox(); // [minX,minY,maxX,maxY]
  const fullW=image.getWidth(),fullH=image.getHeight();
  const pixW=(imgBbox[2]-imgBbox[0])/fullW, pixH=(imgBbox[3]-imgBbox[1])/fullH;

  const x1=Math.max(0,Math.floor((minLng-imgBbox[0])/pixW));
  const y1=Math.max(0,Math.floor((imgBbox[3]-maxLat)/pixH));
  const x2=Math.min(fullW-1,Math.ceil((maxLng-imgBbox[0])/pixW));
  const y2=Math.min(fullH-1,Math.ceil((imgBbox[3]-minLat)/pixH));

  const rawW=Math.max(1,x2-x1), rawH=Math.max(1,y2-y1);
  const MAX_PX=512;
  const fetchW=Math.min(rawW,MAX_PX);
  const fetchH=Math.min(rawH,Math.max(1,Math.round(rawH*fetchW/rawW)));
  const raster=await image.readRasters({window:[x1,y1,x2,y2],width:fetchW,height:fetchH});
  const w=fetchW, h=fetchH;
  const actualResX=pixW*rawW/w, actualResY=pixH*rawH/h;
  const originX=imgBbox[0]+x1*pixW;
  const originY=imgBbox[3]-y1*pixH;

  const nd=image.fileDirectory?.GDAL_NODATA!=null?parseFloat(image.fileDirectory.GDAL_NODATA):null;
  return { values:raster[0], width:w, height:h, originX, originY, resX:actualResX, resY:actualResY, nodata:nd };
}

function computeSlope(dtm){
  const {values,width,height,resX,resY}=dtm;
  const result=new Float32Array(width*height);
  for(let r=0;r<height;r++){
    for(let c=0;c<width;c++){
      const i=r*width+c;
      const v=values[i];
      if(v===dtm.nodata||isNaN(v)){result[i]=NaN;continue;}
      const dzdx=c>0&&c<width-1?((values[i+1]||v)-(values[i-1]||v))/(2*resX*111320):0;
      const dzdy=r>0&&r<height-1?((values[(r-1)*width+c]||v)-(values[(r+1)*width+c]||v))/(2*resY*111320):0;
      result[i]=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy))*180/Math.PI;
    }
  }
  return result;
}

function computeAspect(dtm){
  const {values,width,height,resX,resY}=dtm;
  const result=new Float32Array(width*height);
  for(let r=0;r<height;r++){
    for(let c=0;c<width;c++){
      const i=r*width+c;
      const v=values[i];
      if(v===dtm.nodata||isNaN(v)){result[i]=NaN;continue;}
      const dzdx=c>0&&c<width-1?((values[i+1]||v)-(values[i-1]||v))/(2*resX*111320):0;
      const dzdy=r>0&&r<height-1?((values[(r-1)*width+c]||v)-(values[(r+1)*width+c]||v))/(2*resY*111320):0;
      let asp=Math.atan2(dzdy,-dzdx)*180/Math.PI;
      if(asp<0)asp+=360;
      result[i]=asp;
    }
  }
  return result;
}

// ── GeoTIFF export ──────────────────────────────────────────────────────────
function _writeFloat32GeoTIFF(values,width,height,originX,originY,resX,resY,nodata){
  const ndStr=nodata!=null?String(nodata)+'\0':null;
  const ndLen=ndStr?ndStr.length:0;
  const numTags=14+(ndStr?1:0);
  const ifdOff=8;
  const ifdSize=2+numTags*12+4;
  const extraOff=ifdOff+ifdSize;
  // Offsets into extra data area
  const mpscaleOff=extraOff;             // 3 doubles = 24 bytes
  const mptieOff=mpscaleOff+24;          // 6 doubles = 48 bytes
  const geokeyOff=mptieOff+48;           // 16 shorts = 32 bytes
  const ndOff=geokeyOff+32;              // nodata string (may be 0 length)
  const pixOff=Math.ceil((ndOff+ndLen)/4)*4; // 4-byte aligned
  const totalSize=pixOff+width*height*4;
  const buf=new ArrayBuffer(totalSize);
  const dv=new DataView(buf);
  const u8=new Uint8Array(buf);
  // TIFF header
  dv.setUint16(0,0x4949,true); // 'II' little-endian
  dv.setUint16(2,42,true);
  dv.setUint32(4,ifdOff,true);
  // IFD
  let p=ifdOff;
  dv.setUint16(p,numTags,true); p+=2;
  function tag(t,type,count,val){
    dv.setUint16(p,t,true);dv.setUint16(p+2,type,true);
    dv.setUint32(p+4,count,true);dv.setUint32(p+8,val,true);
    p+=12;
  }
  // Tags must be in ascending tag-number order
  tag(256,3,1,width);                    // ImageWidth SHORT
  tag(257,3,1,height);                   // ImageLength SHORT
  tag(258,3,1,32);                       // BitsPerSample = 32
  tag(259,3,1,1);                        // Compression = None
  tag(262,3,1,1);                        // PhotometricInterpretation
  tag(273,4,1,pixOff);                   // StripOffsets LONG
  tag(277,3,1,1);                        // SamplesPerPixel
  tag(278,4,1,height);                   // RowsPerStrip
  tag(279,4,1,width*height*4);           // StripByteCounts
  tag(284,3,1,1);                        // PlanarConfiguration
  tag(339,3,1,3);                        // SampleFormat = IEEE Float
  tag(33550,12,3,mpscaleOff);            // ModelPixelScaleTag DOUBLE
  tag(33922,12,6,mptieOff);             // ModelTiepointTag DOUBLE
  tag(34735,3,16,geokeyOff);             // GeoKeyDirectoryTag SHORT
  if(ndStr){
    // TIFF spec: if ASCII value fits in 4 bytes, store inline; otherwise store offset
    let ndVal4=ndOff;
    if(ndLen<=4){ndVal4=0;for(let i=0;i<ndLen;i++)ndVal4|=(ndStr.charCodeAt(i)<<(i*8));}
    tag(42113,2,ndLen,ndVal4);          // GDAL_NODATA ASCII
  }
  dv.setUint32(p,0,true);               // next IFD = 0
  // ModelPixelScaleTag: [scaleX, scaleY, 0]
  dv.setFloat64(mpscaleOff,resX,true);
  dv.setFloat64(mpscaleOff+8,resY,true);
  dv.setFloat64(mpscaleOff+16,0,true);
  // ModelTiepointTag: [I, J, K, X(lon), Y(lat), Z]
  dv.setFloat64(mptieOff,0,true); dv.setFloat64(mptieOff+8,0,true); dv.setFloat64(mptieOff+16,0,true);
  dv.setFloat64(mptieOff+24,originX,true);
  dv.setFloat64(mptieOff+32,originY,true);
  dv.setFloat64(mptieOff+40,0,true);
  // GeoKeyDirectoryTag: header + 3 keys (each = 4 shorts)
  let gp=geokeyOff;
  function ws(v){dv.setUint16(gp,v,true);gp+=2;}
  ws(1);ws(1);ws(0);ws(3);             // version, revision, minor, numKeys=3
  ws(1024);ws(0);ws(1);ws(2);          // GTModelTypeGeoKey = 2 (Geographic)
  ws(1025);ws(0);ws(1);ws(1);          // GTRasterTypeGeoKey = 1 (PixelIsArea)
  ws(2048);ws(0);ws(1);ws(4326);       // GeographicTypeGeoKey = 4326 (WGS84)
  // GDAL_NODATA string
  if(ndStr){for(let i=0;i<ndLen;i++)u8[ndOff+i]=ndStr.charCodeAt(i);}
  // Pixel data: row-major Float32
  new Float32Array(buf,pixOff,width*height).set(values);
  return buf;
}

function exportReliefGeoTIFF(type){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_dtmCache||!_currentParcelGeoJSON)return;
  const {values,width,height,originX,originY,resX,resY,nodata}=_dtmCache;
  let rawVals,filename;
  if(type==='height'){
    rawVals=values instanceof Float32Array?values:new Float32Array(values);
    filename='elevation.tif';
  } else if(type==='slope'){
    rawVals=computeSlope(_dtmCache);
    filename='slope_deg.tif';
  } else {
    rawVals=computeAspect(_dtmCache);
    filename='aspect_deg.tif';
  }
  // Clip to parcel: set pixels outside the parcel boundary to nodata
  const ndVal = nodata ?? -9999;
  const exportVals = new Float32Array(rawVals);
  for(let r=0;r<height;r++) for(let c=0;c<width;c++){
    const pLng=originX+(c+0.5)*resX, pLat=originY-(r+0.5)*resY;
    if(!pointInPolygon(pLng,pLat,_currentParcelGeoJSON)) exportVals[r*width+c]=ndVal;
  }
  const buf=_writeFloat32GeoTIFF(exportVals,width,height,originX,originY,resX,resY,ndVal);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([buf],{type:'image/tiff'}));
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
// ────────────────────────────────────────────────────────────────────────────

function computeSlopeClasses(slopeValues,nodata){
  const bins=[0,0,0,0,0];let total=0;
  for(const v of slopeValues){
    if(isNaN(v)||(nodata!=null&&v===nodata))continue;
    total++;
    if(v<3)bins[0]++;else if(v<8)bins[1]++;else if(v<15)bins[2]++;else if(v<30)bins[3]++;else bins[4]++;
  }
  return total>0?bins.map(b=>Math.round(b/total*100)):bins;
}

function computeAspectDirs(aspectValues,nodata){
  const dirs=new Array(8).fill(0);let total=0;
  for(const v of aspectValues){
    if(isNaN(v)||(nodata!=null&&v===nodata))continue;
    total++;
    dirs[Math.round(v/45)%8]++;
  }
  return total>0?dirs.map(d=>Math.round(d/total*100)):dirs;
}

function computeSolarSuitability(slopeValues,aspectValues,nodata,dtm,geojson){
  let suitable=0,total=0;
  for(let i=0;i<slopeValues.length;i++){
    const s=slopeValues[i],a=aspectValues[i];
    if(isNaN(s)||isNaN(a)||(nodata!=null&&(s===nodata||a===nodata)))continue;
    if(dtm&&geojson){
      const c=i%dtm.width,r=Math.floor(i/dtm.width);
      if(!pointInPolygon(dtm.originX+(c+0.5)*dtm.resX,dtm.originY-(r+0.5)*dtm.resY,geojson))continue;
    }
    total++;
    if(s<=30&&a>=135&&a<=225)suitable++;
  }
  return total>0?Math.round(suitable/total*100):0;
}

function lerpColor(a,b,t){
  return[Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];
}
function colorFromStops(stops,v,vmin,vmax){
  const n=(v-vmin)/(vmax-vmin||1);
  const clamped=Math.max(0,Math.min(1,n));
  const seg=(stops.length-1)*clamped;
  const lo=Math.floor(seg),hi=Math.ceil(seg);
  return lerpColor(stops[lo],stops[hi],seg-lo);
}
function valueToColor(v,type,vmin,vmax){
  if(type==="height") return colorFromStops([[20,80,160],[60,120,200],[80,160,100],[180,220,80],[240,200,100],[220,120,60],[200,80,40],[240,240,240]],v,vmin,vmax);
  if(type==="slope")  return colorFromStops([[40,200,100],[230,230,50],[230,100,30],[200,30,30]],v,vmin,vmax);
  // aspect: circular hue — use a simple 8-direction rainbow
  const hue=(v/360)*360;
  const r=Math.round(128+127*Math.cos((hue)*Math.PI/180));
  const g=Math.round(128+127*Math.cos((hue-120)*Math.PI/180));
  const b=Math.round(128+127*Math.cos((hue-240)*Math.PI/180));
  return[r,g,b];
}

function pointInRing(px,py,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function pointInPolygon(lng,lat,geojson){
  if(geojson.type==="Polygon"){
    if(!pointInRing(lng,lat,geojson.coordinates[0]))return false;
    for(let i=1;i<geojson.coordinates.length;i++){if(pointInRing(lng,lat,geojson.coordinates[i]))return false;}
    return true;
  }
  if(geojson.type==="MultiPolygon"){
    return geojson.coordinates.some(poly=>{
      if(!pointInRing(lng,lat,poly[0]))return false;
      for(let i=1;i<poly.length;i++){if(pointInRing(lng,lat,poly[i]))return false;}
      return true;
    });
  }
  return false;
}

function bilinearSample(values,w,h,fx,fy,nodata){
  const x0=Math.floor(fx),y0=Math.floor(fy);
  const x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1);
  const dx=fx-x0,dy=fy-y0;
  const v00=values[y0*w+x0],v10=values[y0*w+x1],v01=values[y1*w+x0],v11=values[y1*w+x1];
  if([v00,v10,v01,v11].some(v=>isNaN(v)||(nodata!=null&&v===nodata)))return NaN;
  return v00*(1-dx)*(1-dy)+v10*dx*(1-dy)+v01*(1-dx)*dy+v11*dx*dy;
}

function bilinearSampleCircular(values,w,h,fx,fy,nodata){
  const x0=Math.floor(fx),y0=Math.floor(fy);
  const x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1);
  const dx=fx-x0,dy=fy-y0;
  const vs=[values[y0*w+x0],values[y0*w+x1],values[y1*w+x0],values[y1*w+x1]];
  if(vs.some(v=>isNaN(v)||(nodata!=null&&v===nodata)))return NaN;
  const ws=[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy];
  const R=Math.PI/180;
  let sx=0,sy=0;
  for(let i=0;i<4;i++){sx+=Math.sin(vs[i]*R)*ws[i];sy+=Math.cos(vs[i]*R)*ws[i];}
  let deg=Math.atan2(sx,sy)/R;
  return deg<0?deg+360:deg;
}

function renderReliefOverlay(dtm,displayValues,type,geojson,extraStats){
  const {width,height,originX,originY,resX,resY,nodata}=dtm;
  let vmin=Infinity,vmax=-Infinity,vsum=0,vcnt=0;
  for(const v of displayValues){
    if(isNaN(v)||(nodata!=null&&v===nodata))continue;
    if(v<vmin)vmin=v;if(v>vmax)vmax=v;vsum+=v;vcnt++;
  }
  if(!vcnt)return;
  const vmean=vsum/vcnt;

  // Upsample to 512px wide for crisp display (avoids Mapbox scaling blur)
  const TARGET=512;
  const canvasW=TARGET;
  const canvasH=Math.max(1,Math.round(TARGET*(height/width)));

  const canvas=document.createElement("canvas");
  canvas.width=canvasW;canvas.height=canvasH;
  const ctx=canvas.getContext("2d");
  const imgData=ctx.createImageData(canvasW,canvasH);
  const d=imgData.data;

  for(let cy=0;cy<canvasH;cy++){
    for(let cx=0;cx<canvasW;cx++){
      const i=cy*canvasW+cx;
      const fx=(cx/(canvasW-1||1))*(width-1);
      const fy=(cy/(canvasH-1||1))*(height-1);
      const lng=originX+(cx/canvasW)*width*resX;
      const lat=originY-(cy/canvasH)*height*resY;
      if(!pointInPolygon(lng,lat,geojson)){d[i*4+3]=0;continue;}
      const v=type==="aspect"
        ?bilinearSampleCircular(displayValues,width,height,fx,fy,nodata)
        :bilinearSample(displayValues,width,height,fx,fy,nodata);
      if(isNaN(v)||(nodata!=null&&v===nodata)){d[i*4+3]=0;continue;}
      const [r2,g,b]=valueToColor(v,type,vmin,vmax);
      d[i*4]=r2;d[i*4+1]=g;d[i*4+2]=b;d[i*4+3]=200;
    }
  }
  ctx.putImageData(imgData,0,0);
  const dataUrl=canvas.toDataURL("image/png");

  const nw=[originX,originY];
  const ne=[originX+width*resX,originY];
  const se=[originX+width*resX,originY-height*resY];
  const sw=[originX,originY-height*resY];

  if(map.getLayer("relief-overlay-layer"))map.removeLayer("relief-overlay-layer");
  if(map.getSource("relief-overlay"))map.removeSource("relief-overlay");
  map.addSource("relief-overlay",{type:"image",url:dataUrl,coordinates:[nw,ne,se,sw]});
  map.addLayer({id:"relief-overlay-layer",type:"raster",source:"relief-overlay",paint:{"raster-opacity":0.82}});
  _reliefOverlayCache={dataUrl,nw,ne,se,sw};

  const tr=t();
  const u=tr.reliefUnits[type];
  const fmt=v=>type==="height"?v.toFixed(0):v.toFixed(1);
  document.getElementById("relief-stats").style.display="block";
  document.getElementById("relief-stat-min").innerHTML=`<span>${tr.reliefMin}</span> <span class="relief-stat-val">${fmt(vmin)} ${u}</span>`;
  document.getElementById("relief-stat-mean").innerHTML=`<span>${tr.reliefMean}</span> <span class="relief-stat-val">${fmt(vmean)} ${u}</span>`;
  document.getElementById("relief-stat-max").innerHTML=`<span>${tr.reliefMax}</span> <span class="relief-stat-val">${fmt(vmax)} ${u}</span>`;
  drawReliefLegend(type,vmin,vmax);

  const extraEl=document.getElementById("relief-extra-stats");
  if(extraEl){
    if(type==="slope"&&extraStats){
      const classes=extraStats.classes||[];
      let html=classes.map((pct,i)=>{
        const c=tr.slopeClasses[i];
        const col=tr.slopeClassColors[i];
        return`<div class="relief-class-row"><span class="relief-class-label">${c.l} <span style="opacity:0.55;font-size:0.59rem">${c.r}</span></span><div class="relief-class-track"><div class="relief-class-fill" style="background:${col};width:${pct}%"></div></div><span class="relief-class-pct">${pct}%</span></div>`;
      }).join("");
      extraEl.innerHTML=html;
    } else if(type==="aspect"&&extraStats){
      const dirs=extraStats.dirs||[];
      const names=tr.aspectDirs;
      const html=`<div class="aspect-dir-grid">`+dirs.map((pct,i)=>
        `<div class="aspect-dir-cell"><div class="aspect-dir-name">${names[i]}</div><div class="aspect-dir-pct">${pct}%</div></div>`
      ).join("")+`</div>`;
      extraEl.innerHTML=html;
    } else {
      extraEl.innerHTML="";
    }
  }
}

function drawReliefLegend(type,vmin,vmax){
  const canvas=document.getElementById("relief-legend-bar");
  if(!canvas)return;
  const ctx=canvas.getContext("2d");
  const w=canvas.width,h=canvas.height;
  for(let x=0;x<w;x++){
    const v=type==="aspect"?(x/w)*360:vmin+(x/w)*(vmax-vmin);
    const [r,g,b]=valueToColor(v,type,vmin,vmax);
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.fillRect(x,0,1,h);
  }
  const u=t().reliefUnits[type];
  const fmt=v=>type==="height"?v.toFixed(0)+u:v.toFixed(1)+u;
  if(type==="aspect"){
    document.getElementById("relief-legend-lo").textContent="N 0\xb0";
    document.getElementById("relief-legend-mid").textContent="S 180\xb0";
    document.getElementById("relief-legend-hi").textContent="N 360\xb0";
  }else{
    document.getElementById("relief-legend-lo").textContent=fmt(vmin);
    document.getElementById("relief-legend-mid").textContent=fmt((vmin+vmax)/2);
    document.getElementById("relief-legend-hi").textContent=fmt(vmax);
  }
  document.getElementById("relief-legend").style.display="block";
}

// Build directed-edge boundary rings for a boolean raster grid.
// Returns array of rings, each ring is [[i,j], ...] in node-grid coordinates.
// Uses CCW directed-edge toggle: shared edges between same-value cells cancel out,
// leaving only the boundary. At junctions picks the leftmost (most-CCW) outgoing edge.
function _suitableRasterToRings(suitableGrid, width, height){
  const de = new Map();
  const tog = (i1,j1,i2,j2) => {
    const k=`${i1},${j1}>${i2},${j2}`, kr=`${i2},${j2}>${i1},${j1}`;
    de.has(kr) ? de.delete(kr) : de.set(k,[i1,j1,i2,j2]);
  };
  for(let r=0;r<height;r++) for(let c=0;c<width;c++){
    if(!suitableGrid[r*width+c]) continue;
    // CCW directed edges per pixel (j increases southward, so j-up = north in geo)
    tog(c,r+1,c+1,r+1); // bottom W→E
    tog(c+1,r+1,c+1,r); // right  S→N
    tog(c+1,r,c,r);     // top    E→W
    tog(c,r,c,r+1);     // left   N→S
  }
  if(!de.size) return [];

  // from-adjacency: "i,j" → [[i2,j2, edgeKey], ...]
  const fa = new Map();
  for(const [k,[i1,j1,i2,j2]] of de){
    const fk=`${i1},${j1}`;
    if(!fa.has(fk)) fa.set(fk,[]);
    fa.get(fk).push([i2,j2,k]);
  }

  const used = new Set();
  const rings = [];

  for(const [sk, ses] of fa){
    const startEdge = ses.find(([,,k])=>!used.has(k));
    if(!startEdge) continue;
    const [si,sj] = sk.split(',').map(Number);
    const ring = [[si,sj]];
    used.add(startEdge[2]);
    let ci=startEdge[0], cj=startEdge[1], pi=si, pj=sj;

    for(let it=0;it<500000;it++){
      ring.push([ci,cj]);
      if(ci===si && cj===sj) break;
      const nexts = (fa.get(`${ci},${cj}`)||[]).filter(([,,k])=>!used.has(k));
      if(!nexts.length) break;
      const di=ci-pi, dj=cj-pj;
      let best=nexts[0], bc=-Infinity;
      for(const [ni,nj,nk] of nexts){
        // 2-D cross product in geographic space (y-up: geo_dy ∝ -dj)
        const c2 = dj*(ni-ci) - di*(nj-cj);
        if(c2>bc){bc=c2; best=[ni,nj,nk];}
      }
      used.add(best[2]);
      pi=ci; pj=cj; ci=best[0]; cj=best[1];
    }
    if(ring.length>=4) rings.push(ring);
  }
  return rings;
}

function exportSolarGeoJSON(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_solarGeoData||!_currentParcelGeoJSON)return;
  const{dtm,slopeArr,aspectArr,shadowBoundsW}=_solarGeoData;
  const{width,height,originX,originY,resX,resY}=dtm;

  // Use the same 512-px canvas resolution + bilinear sampling as the visual overlay.
  // Raw DEM may be very coarse (10-30 px) for small parcels, producing a rectangular
  // bounding-box polygon. Sampling at canvas resolution gives the actual visible shape.
  const TARGET=512;
  const cW=TARGET, cH=Math.max(1,Math.round(TARGET*(height/width)));
  const suitableGrid = new Uint8Array(cW*cH);
  for(let cy=0;cy<cH;cy++) for(let cx=0;cx<cW;cx++){
    const pLng=originX+(cx/cW)*width*resX;
    const pLat=originY-(cy/cH)*height*resY;
    if(!pointInPolygon(pLng,pLat,_currentParcelGeoJSON)) continue;
    const fx=(cx/(cW-1||1))*(width-1), fy=(cy/(cH-1||1))*(height-1);
    const sl=bilinearSample(slopeArr,width,height,fx,fy,dtm.nodata);
    const asp=bilinearSampleCircular(aspectArr,width,height,fx,fy,dtm.nodata);
    if(isNaN(sl)||isNaN(asp)) continue;
    if(sl<=30&&asp>=135&&asp<=225){
      if(!shadowBoundsW.some(b=>pLng>=b.minLng&&pLng<=b.maxLng&&pLat>=b.minLat&&pLat<=b.maxLat&&pointInRing(pLng,pLat,b.ring)))
        suitableGrid[cy*cW+cx]=1;
    }
  }

  // Trace polygon boundary rings
  const rings = _suitableRasterToRings(suitableGrid, cW, cH);
  if(!rings.length){ alert('No suitable solar area found.'); return; }

  // Convert canvas node coords → geographic coords
  const toGeo = (i,j) => [originX+(i/cW)*width*resX, originY-(j/cH)*height*resY];
  const geoRings = rings.map(r=>{
    const g=r.map(([i,j])=>toGeo(i,j));
    if(g[g.length-1][0]!==g[0][0]||g[g.length-1][1]!==g[0][1]) g.push(g[0]);
    return g;
  });

  // Classify rings: positive signed area (shoelace) = exterior, negative = hole
  const shoelace = ring => {
    let a=0;
    for(let i=0;i<ring.length-1;i++) a+=(ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1]);
    return a;
  };
  const exteriors = geoRings.filter(r=>shoelace(r)>0);
  const holes     = geoRings.filter(r=>shoelace(r)<0);

  if(!exteriors.length) return;

  // Assign holes to their containing exterior ring
  const features = exteriors.map(ext=>{
    const myHoles = holes.filter(h=>pointInRing(h[0][0],h[0][1],ext));
    return {
      type:"Feature",
      properties:{criteria:"solar_suitable",slope_max_deg:30,aspect_range:"135-225°"},
      geometry:{type:"Polygon", coordinates:[ext,...myHoles]}
    };
  });

  const geojson = features.length===1 ? features[0] : {
    type:"Feature",
    properties:{criteria:"solar_suitable"},
    geometry:{type:"MultiPolygon", coordinates:features.map(f=>f.geometry.coordinates)}
  };

  const blob=new Blob([JSON.stringify(geojson)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='solar_suitable.geojson';
  a.click(); URL.revokeObjectURL(a.href);
}

function clearSolarOverlay(){
  _solarOverlayCache=null;
  _solarGeoData=null;
  const sres=document.getElementById('solar-result');
  if(sres){sres.style.display='none';sres.innerHTML='';}
  if(!mapReady)return;
  try{if(map.getLayer("solar-overlay-layer"))map.removeLayer("solar-overlay-layer");}catch(_){}
  try{if(map.getSource("solar-overlay"))map.removeSource("solar-overlay");}catch(_){}
}


// ── Solar shadow helpers ─────────────────────────────────────────────────
// Andrew's monotone chain convex hull on [lng,lat] point array
function convexHull2D(pts){
  pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const n=pts.length; if(n<3)return pts;
  function cx(o,a,b){return(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
  const lo=[],hi=[];
  for(const p of pts){while(lo.length>=2&&cx(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  for(let i=n-1;i>=0;i--){const p=pts[i];while(hi.length>=2&&cx(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p);}
  hi.pop();lo.pop();const hull=lo.concat(hi);hull.push(hull[0]);return hull;
}
// Shadow polygon = convex hull of footprint ∪ footprint shifted north by shadow length
function buildShadowPolygon(ring,heightM,sunElevDeg){
  const lenM=heightM/Math.tan(sunElevDeg*Math.PI/180);
  const dlat=lenM/111320;
  return convexHull2D(ring.map(p=>[p[0],p[1]]).concat(ring.map(p=>[p[0],p[1]+dlat])));
}
// Shoelace polygon area in m²
function polygonAreaM2(ring){
  let a=0;
  for(let i=0;i<ring.length-1;i++){
    const cosLat=Math.cos(ring[i][1]*Math.PI/180);
    const x0=ring[i][0]*111320*cosLat, y0=ring[i][1]*111320;
    const x1=ring[i+1][0]*111320*cosLat, y1=ring[i+1][1]*111320;
    a+=x0*y1-x1*y0;
  }
  return Math.abs(a)/2;
}
async function fetchOSMBuildings(lat,lng,radiusM){
  const q=`[out:json][timeout:15];(way["building"](around:${radiusM},${lat},${lng}););out geom tags;`;
  const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)});
  if(!r.ok)throw new Error('overpass '+r.status);
  const j=await r.json();
  return(j.elements||[]).filter(el=>el.type==='way'&&el.geometry&&el.geometry.length>=3);
}
function osmBuildingHeight(tags){
  if(tags.height){const h=parseFloat(tags.height);if(h>0)return h;}
  if(tags['building:levels']){const l=parseInt(tags['building:levels']);if(l>0)return l*3;}
  return 6;
}
function osmElementRing(el){
  const c=el.geometry.map(n=>[n.lon,n.lat]);
  if(c[0][0]!==c[c.length-1][0]||c[0][1]!==c[c.length-1][1])c.push(c[0]);
  return c;
}

async function runSolarAnalysis(){
  if(!_currentParcelGeoJSON)return;
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(_currentParcelAreaM2!==null&&_currentParcelAreaM2<1000){setStatus(lang==="ka"?"ანალიზისთვის საჭიროა მინ. 1000 კვ.მ.":"Parcel too small — min. 1000 m² required","","status-analysis");return;}
  const btn=document.getElementById("solar-btn");
  if(_solarOverlayCache){
    clearSolarOverlay();
    if(btn){btn.classList.remove("active");btn.disabled=false;btn.innerHTML=`☀ ${lang==="ka"?"სოლარო ზონა":"Solar Zone"}`;}
    const res=document.getElementById("solar-result");if(res)res.style.display="none";
    return;
  }
  if(btn){btn.disabled=true;btn.textContent=lang==="ka"?"იანგარიშება…":"Calculating…";}
  try{
    if(!window.GeoTIFF){
      await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const dtm=await fetchDTM(_currentParcelGeoJSON);
    const slopeArr=computeSlope(dtm);
    const aspectArr=computeAspect(dtm);
    const {width,height,originX,originY,resX,resY}=dtm;

    // ── OSM buildings ──────────────────────────────────────────────────────
    if(btn)btn.textContent=lang==="ka"?"შენობები…":"Buildings…";
    {const _sl=document.getElementById('solar-status-label');if(_sl)_sl.textContent=lang==="ka"?"შენობები…":"Buildings…";}
    const centroid=getCentroid(_currentParcelGeoJSON);
    let buildingCount=0,rooftopAreaM2=0;
    let shadowRingsW=[],shadowRingsE=[],shadowRingsS=[];
    let shadowBoundsW=[];
    try{
      const elems=await fetchOSMBuildings(centroid[1],centroid[0],100);
      buildingCount=elems.length;
      for(const el of elems){
        const ring=osmElementRing(el);
        const h=osmBuildingHeight(el.tags||{});
        const spW=buildShadowPolygon(ring,h,25);
        shadowRingsW.push(spW);
        shadowBoundsW.push({
          minLng:Math.min(...spW.map(p=>p[0])),maxLng:Math.max(...spW.map(p=>p[0])),
          minLat:Math.min(...spW.map(p=>p[1])),maxLat:Math.max(...spW.map(p=>p[1])),
          ring:spW
        });
        // rooftop: buildings whose footprint overlaps parcel
        if(ring.some(p=>pointInPolygon(p[0],p[1],_currentParcelGeoJSON)))
          rooftopAreaM2+=polygonAreaM2(ring)*0.7;
      }
    }catch(eB){console.warn("OSM buildings:",eB);}
    if(btn)btn.textContent=lang==="ka"?"იანგარიშება…":"Calculating…";
    {const _sl=document.getElementById('solar-status-label');if(_sl)_sl.textContent=lang==="ka"?"იანგარიშება…":"Calculating…";}

    // ── Canvas overlay ─────────────────────────────────────────────────────
    const TARGET=512;
    const canvasW=TARGET,canvasH=Math.max(1,Math.round(TARGET*(height/width)));
    const canvas=document.createElement("canvas");
    canvas.width=canvasW;canvas.height=canvasH;
    const ctx=canvas.getContext("2d");
    const imgData=ctx.createImageData(canvasW,canvasH);
    const d=imgData.data;
    for(let cy=0;cy<canvasH;cy++){
      for(let cx=0;cx<canvasW;cx++){
        const i=cy*canvasW+cx;
        const lng=originX+(cx/canvasW)*width*resX;
        const lat=originY-(cy/canvasH)*height*resY;
        if(!pointInPolygon(lng,lat,_currentParcelGeoJSON)){d[i*4+3]=0;continue;}
        const fx=(cx/(canvasW-1||1))*(width-1),fy=(cy/(canvasH-1||1))*(height-1);
        const sl=bilinearSample(slopeArr,width,height,fx,fy,dtm.nodata);
        const asp=bilinearSampleCircular(aspectArr,width,height,fx,fy,dtm.nodata);
        if(isNaN(sl)||isNaN(asp)){d[i*4+3]=0;continue;}
        if(sl<=30&&asp>=135&&asp<=225){
          const inShad=shadowBoundsW.some(b=>lng>=b.minLng&&lng<=b.maxLng&&lat>=b.minLat&&lat<=b.maxLat&&pointInRing(lng,lat,b.ring));
          if(!inShad){d[i*4]=251;d[i*4+1]=191;d[i*4+2]=36;d[i*4+3]=210;}
          else{d[i*4]=100;d[i*4+1]=100;d[i*4+2]=100;d[i*4+3]=130;}
        } else {
          d[i*4]=0;d[i*4+1]=0;d[i*4+2]=0;d[i*4+3]=35;
        }
      }
    }
    ctx.putImageData(imgData,0,0);
    const dataUrl=canvas.toDataURL("image/png");
    const nw=[originX,originY],ne=[originX+width*resX,originY];
    const se=[originX+width*resX,originY-height*resY],sw=[originX,originY-height*resY];
    if(map.getLayer("solar-overlay-layer"))map.removeLayer("solar-overlay-layer");
    if(map.getSource("solar-overlay"))map.removeSource("solar-overlay");
    map.addSource("solar-overlay",{type:"image",url:dataUrl,coordinates:[nw,ne,se,sw]});
    map.addLayer({id:"solar-overlay-layer",type:"raster",source:"solar-overlay",paint:{"raster-opacity":0.88}});
    _solarOverlayCache={dataUrl,nw,ne,se,sw};
    _solarGeoData={dtm,slopeArr,aspectArr,shadowBoundsW};

    // ── DTM-resolution area counting ───────────────────────────────────────
    const latRad=(originY-height/2*resY)*Math.PI/180;
    const pixM2=resX*111320*Math.cos(latRad)*resY*111320;
    let dtmSuitable=0,dtmShadowed=0,dtmTotal=0;
    for(let r=0;r<height;r++){
      for(let c=0;c<width;c++){
        const pLng=originX+(c+0.5)*resX,pLat=originY-(r+0.5)*resY;
        if(!pointInPolygon(pLng,pLat,_currentParcelGeoJSON))continue;
        dtmTotal++;
        const ii=r*width+c,sl=slopeArr[ii],asp=aspectArr[ii];
        if(!isNaN(sl)&&!isNaN(asp)&&sl<=30&&asp>=135&&asp<=225){
          const inShad=shadowBoundsW.some(b=>pLng>=b.minLng&&pLng<=b.maxLng&&pLat>=b.minLat&&pLat<=b.maxLat&&pointInRing(pLng,pLat,b.ring));
          if(!inShad)dtmSuitable++;else dtmShadowed++;
        }
      }
    }
    const pct=dtmTotal>0?Math.round(dtmSuitable/dtmTotal*100):0;
    const fmt=m=>m>=10000?(m/10000).toFixed(2)+" ha":m>0?m.toLocaleString()+" m²":"< 1 m²";
    const areaStr=fmt(Math.round(dtmSuitable*pixM2));
    const shadStr=dtmShadowed>0?fmt(Math.round(dtmShadowed*pixM2)):null;
    const roofStr=rooftopAreaM2>1?fmt(Math.round(rooftopAreaM2)):null;
    if(_isDrawnArea){_drawnAreaProps.solar_ground_suitable_m2=Math.round(dtmSuitable*pixM2);_drawnAreaProps.solar_ground_pct=pct;if(rooftopAreaM2>1)_drawnAreaProps.solar_rooftop_m2=Math.round(rooftopAreaM2);if(buildingCount>0)_drawnAreaProps.solar_buildings_100m=buildingCount;if(dtmShadowed>0)_drawnAreaProps.solar_shadow_loss_m2=Math.round(dtmShadowed*pixM2);}

    if(btn){btn.disabled=false;btn.classList.add("active");btn.innerHTML=`☀ ${lang==="ka"?"სოლარო ზონა":"Solar Zone"}`;}
    const res=document.getElementById("solar-result");
    if(res){
      res.style.display="block";
      const isKa=lang==="ka";
      const tr2=t();
      let html=`<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px"><span style="font-size:0.68rem;color:rgba(251,191,36,0.85);font-weight:600">☀ ${tr2.solarSuitability}</span><span style="font-size:0.95rem;font-weight:700;color:#fbbf24">${pct}%</span></div><div style="font-size:0.61rem;color:rgba(255,255,255,0.28);margin-bottom:7px;padding-bottom:6px;border-bottom:1px solid rgba(251,191,36,0.12)">${tr2.solarDesc}</div>`;
      html+=`<div class="solar-result-row"><span>${isKa?"გამოსადეგი (მიწა)":"Ground suitable"}</span><span class="solar-result-val">${areaStr}</span></div>`;
      if(roofStr)html+=`<div class="solar-result-row"><span>${isKa?"სახურავი (×0.7)":"Rooftop (×0.7)"}</span><span class="solar-result-val">${roofStr}</span></div>`;
      if(shadStr)html+=`<div class="solar-result-row"><span>${isKa?"ჩრდილი (ზამთარი)":"Shadow loss (winter)"}</span><span class="solar-result-val" style="color:rgba(255,255,255,0.4)">${shadStr}</span></div>`;
      const footNote=buildingCount===0
        ?`${isKa?"შენობები არ აღმოჩენილა · მხოლოდ ნიადაგი":"No buildings detected · ground analysis only"}`
        :`${buildingCount} ${isKa?"შენობა 100მ-ში · ზამთრის ჩრდილები · OSM":"buildings within 100m · winter solstice · OSM"}`;
      html+=`<div style="font-size:0.6rem;color:rgba(255,255,255,0.22);margin-top:6px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.06)">${footNote}</div>`;
      html+=`<div style="font-size:0.6rem;color:rgba(255,255,255,0.18);margin-top:2px">${isKa?"კრ: დახრა ≤30° · მიმართ. 135–225°":"Criteria: slope ≤30° · aspect 135–225° (S)"}</div>`;
      html+=`<button class="relief-dl-btn" style="width:100%;margin-top:8px" onclick="exportSolarGeoJSON()">↓ ${isKa?"GeoJSON გადმოტვირთვა":"Download GeoJSON"}</button>`;
      res.innerHTML=html;
    }
    logFeatureUse("solar_analysis").catch(()=>{});
  }catch(e){
    console.error("Solar:",e);
    if(btn){btn.disabled=false;btn.innerHTML=`☀ ${lang==="ka"?"სოლარო ზონა":"Solar Zone"}`;}
  }
}



const GWA_R2={
  'wind-speed':     'GEO_wind-speed_100m_cog.tif',
  'power-density':  'GEO_power-density_100m_cog.tif',
  'combined-Weibull-A': 'GEO_combined-Weibull-A_100m_cog.tif',
  'combined-Weibull-k': 'GEO_combined-Weibull-k_100m_cog.tif',
  'capacity-factor_IEC2': 'GEO_capacity-factor_IEC2_cog.tif'
};
async function gwaPointQuery(variable,height,lat,lng){
  const r2file=GWA_R2[variable];
  if(!r2file)throw new Error('unknown GWA variable: '+variable);
  const url=`${PROXY}/lst?url=${encodeURIComponent('https://pub-9071f31b4edc4a15ba28c48f949017fc.r2.dev/'+r2file)}`;_rptRasterSrc[r2file.replace(/\W+/g,'_')]=url;
  const tiff=await GeoTIFF.fromUrl(url,{allowHttpExceptions:true});
  const image=await tiff.getImage();
  const bbox=image.getBoundingBox();
  const W=image.getWidth(),H=image.getHeight();
  let px,py;
  if(Math.abs(bbox[0])<360){
    px=Math.round((lng-bbox[0])/(bbox[2]-bbox[0])*W);
    py=Math.round((bbox[3]-lat)/(bbox[3]-bbox[1])*H);
  }else{
    const mx=lng*20037508.34/180;
    const my=Math.log(Math.tan((90+lat)*Math.PI/360))/(Math.PI/180)*20037508.34/180;
    px=Math.round((mx-bbox[0])/(bbox[2]-bbox[0])*W);
    py=Math.round((bbox[3]-my)/(bbox[3]-bbox[1])*H);
  }
  px=Math.max(0,Math.min(W-1,px));py=Math.max(0,Math.min(H-1,py));
  const data=await image.readRasters({window:[px,py,px+1,py+1]});
  const val=data[0][0];
  return(val===undefined||val===null||isNaN(val)||val<-1e5)?null:+val.toFixed(3);
}

async function fetchWindRose(lat,lng){
  const r=await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&hourly=windspeed_100m,winddirection_100m&start_date=2023-01-01&end_date=2023-12-31&timezone=UTC&wind_speed_unit=ms`);
  if(!r.ok)throw new Error('open-meteo '+r.status);
  const d=await r.json();
  return processWindRose(d.hourly?.windspeed_100m,d.hourly?.winddirection_100m);
}

async function checkBuildingsNearby(lat,lng,radiusM){
  const q=`[out:json][timeout:15];(way["building"](around:${radiusM},${lat},${lng});relation["building"](around:${radiusM},${lat},${lng}););out count;`;
  const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)});
  if(!r.ok)throw new Error('overpass '+r.status);
  const j=await r.json();
  return parseInt(j.elements?.[0]?.tags?.total||'0',10)>0;
}

function processWindRose(speeds,dirs){
  if(!speeds||!dirs)return null;
  const sectors=Array.from({length:8},()=>({count:0,speedSum:0}));
  let total=0;
  for(let i=0;i<speeds.length;i++){
    const s=speeds[i],d=dirs[i];
    if(s==null||d==null||s<0.5)continue;
    const idx=Math.round(d/45)%8;
    sectors[idx].count++;sectors[idx].speedSum+=s;total++;
  }
  return sectors.map(s=>({freq:total>0?s.count/total:0,meanSpeed:s.count>0?s.speedSum/s.count:0}));
}

function renderWindRoseSVG(sectors,dirLabels){
  const cx=80,cy=80,maxR=58;
  const maxFreq=Math.max(...sectors.map(s=>s.freq),0.001);
  const dirs=dirLabels||['N','NE','E','SE','S','SW','W','NW'];
  let svg='';
  [0.25,0.5,0.75,1].forEach(f=>{svg+=`<circle cx="${cx}" cy="${cy}" r="${(maxR*f).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;});
  svg+=`<line x1="${cx}" y1="${cy-maxR}" x2="${cx}" y2="${cy+maxR}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;
  svg+=`<line x1="${cx-maxR}" y1="${cy}" x2="${cx+maxR}" y2="${cy}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;
  sectors.forEach((s,i)=>{
    const r=Math.max(4,s.freq/maxFreq*maxR);
    const a0=(i*45-90)*Math.PI/180,hw=14*Math.PI/180;
    const a1=a0-hw,a2=a0+hw;
    const x1=(cx+Math.cos(a1)*r).toFixed(2),y1=(cy+Math.sin(a1)*r).toFixed(2);
    const x2=(cx+Math.cos(a2)*r).toFixed(2),y2=(cy+Math.sin(a2)*r).toFixed(2);
    const col=s.meanSpeed>8?'#ef4444':s.meanSpeed>5?'#f97316':s.meanSpeed>3?'#eab308':'#93c5fd';
    svg+=`<path d="M${cx},${cy} L${x1},${y1} A${r.toFixed(2)},${r.toFixed(2)} 0 0,1 ${x2},${y2} Z" fill="${col}" opacity="0.78"/>`;
    const lr=maxR+13,lx=(cx+Math.cos(a0)*lr).toFixed(1),ly=(cy+Math.sin(a0)*lr+3).toFixed(1);
    svg+=`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="7.5" fill="rgba(255,255,255,0.35)" font-family="-apple-system,sans-serif">${dirs[i]}</text>`;
  });
  svg+=`<circle cx="${cx}" cy="${cy}" r="2.5" fill="rgba(255,255,255,0.15)"/>`;
  return`<svg width="160" height="160" viewBox="0 0 160 160" style="overflow:visible">${svg}</svg>`;
}

function calcWindYield(weibullA,weibullK,turbineKW=5,rotorDiam=5){
  const rho=1.225,area=Math.PI*(rotorDiam/2)**2,Cp=0.35;
  let e=0;
  for(let v=0.1;v<=30;v+=0.1){
    const pdf=(weibullK/weibullA)*Math.pow(v/weibullA,weibullK-1)*Math.exp(-Math.pow(v/weibullA,weibullK));
    e+=pdf*Math.min(0.5*rho*area*Cp*Math.pow(v,3),turbineKW*1000)*8760*0.1;
  }
  return Math.round(e/1000);
}

function renderWindCard(data){
  const tr=t();
  document.getElementById('lbl-wind-card-title').textContent=tr.windCardTitle||'Wind Analysis';
  const fmt=(v,dec=1)=>v!=null?v.toFixed(dec):'—';
  const i=(key)=>`<span class="wind-info-icon" onclick="showWindInfo('${key}',event)">ⓘ</span>`;
  let html=`<div class="wind-result">
    <div class="wind-result-row"><span>${tr.windSpeed||'Mean wind speed'}${i('windSpeed')}</span><span class="wind-result-val">${fmt(data.windSpeed)} m/s</span></div>
    <div class="wind-result-row"><span>${tr.windPowerDensity||'Power density'}${i('powerDensity')}</span><span class="wind-result-val">${fmt(data.powerDensity,0)} W/m²</span></div>
    <div class="wind-result-row"><span>${tr.windCapFactor||'Capacity factor'}${i('capFactor')}</span><span class="wind-result-val">${data.capFactor!=null?Math.round(data.capFactor*100)+'%':'—'}</span></div>
    ${data.annualYield!=null?`<div class="wind-result-row"><span>${tr.windYield||'Est. annual yield'}${i('annualYield')}</span><span class="wind-result-val">${data.annualYield.toLocaleString()} kWh/yr</span></div>`:''}
    <div style="font-size:0.6rem;color:rgba(255,255,255,0.18);margin-top:4px">${tr.windRefTurbine||'5 kW ref. turbine · 30m hub'} · GWA 250m</div>
  </div>`;
  if(data.roseData){
    html+=`<div style="font-size:0.65rem;color:rgba(255,255,255,0.28);margin-top:8px;text-align:center">${tr.windRose||'Wind rose'} · ERA5 2023</div>
    <div class="wind-rose-wrap">${renderWindRoseSVG(data.roseData,tr.aspectDirs)}</div>`;
  }
  const accRes=document.getElementById('acc-wind-result');if(accRes)accRes.innerHTML=html;
}

function showWindInfo(key,e){
  e.stopPropagation();
  const texts={
    en:{
      windSpeed:"Average annual wind speed at 100m hub height. Sites above 6 m/s are generally viable for small turbines.",
      powerDensity:"Energy flux per m² of swept rotor area. Accounts for air density — a better site comparison metric than speed alone.",
      capFactor:"Actual energy output as a share of rated power over a full year. 25–35% is typical; above 40% is excellent.",
      annualYield:"Estimated annual electricity generation for a 5 kW reference turbine with a 5m rotor at 30m hub height."
    },
    ka:{
      windSpeed:"ქარის საშუალო წლიური სიჩქარე 100მ სიმაღლეზე. 6 მ/წ-ზე მეტი ნაკვეთები გამოსადეგია მცირე ტურბინებისთვის.",
      powerDensity:"ენერგიის ნაკადი ტურბინის ფრთის ფართობის ყოველ კვ.მ-ზე. სიმჭიდროვეს ითვალისწინებს — შედარების უფრო ზუსტი მეტრიკა.",
      capFactor:"რეალური წლიური გამომუშავება მაქსიმალური სიმძლავრის პროცენტულად. 25–35% ჩვეულებრივია; 40%+ შესანიშნავია.",
      annualYield:"სავარაუდო წლიური გამომუშავება 5 კვტ ეტ. ტურბინისთვის, 5მ ფრთით, 30მ სიმაღლეზე."
    }
  };
  let popup=document.getElementById('wind-info-popup');
  if(!popup){
    popup=document.createElement('div');
    popup.id='wind-info-popup';
    popup.className='wind-info-popup';
    document.body.appendChild(popup);
    document.addEventListener('click',hideWindInfo);
  }
  const t=(texts[lang]||texts.en)[key]||'';
  popup.textContent=t;
  popup.style.display='block';
  const r=e.target.getBoundingClientRect();
  let top=r.bottom+6,left=r.left;
  if(left+230>window.innerWidth)left=window.innerWidth-238;
  if(top+120>window.innerHeight)top=r.top-90;
  popup.style.top=top+'px';popup.style.left=left+'px';
}
function hideWindInfo(){
  const p=document.getElementById('wind-info-popup');if(p)p.style.display='none';
}

// ── WIND PARTICLE ANIMATION ───────────────────────────────────────────────────
let _windAnimId=null,_windParticles=[];

function startWindAnimation(windSpeed,roseData){
  stopWindAnimation();
  const canvas=document.getElementById('wind-canvas');
  if(!canvas)return;
  canvas.style.display='block';
  const ctx=canvas.getContext('2d');

  // Dominant FROM-direction → particle travel direction (add 180°)
  let dirDeg=90;
  if(roseData){
    const mi=roseData.reduce((mi,s,i,a)=>s.freq>a[mi].freq?i:mi,0);
    dirDeg=(mi*45+180)%360;
  }
  const rad=dirDeg*Math.PI/180;
  const vx=Math.cos(rad),vy=Math.sin(rad);
  const spd=Math.max(0.8,Math.min((windSpeed||5)/3.5,3.5));

  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  resize();
  const _rsz=()=>resize();
  window.addEventListener('resize',_rsz);
  canvas._rsz=_rsz;

  // Particles always spawn randomly across the full screen so the animation
  // is continuous everywhere — no need for edge-to-edge traversal.
  function spawn(){
    const w=canvas.width,h=canvas.height;
    return{x:Math.random()*w,y:Math.random()*h,age:0,maxAge:Math.round(Math.random()*160+100)};
  }

  _windParticles=Array.from({length:110},()=>{const p=spawn();p.age=Math.round(Math.random()*p.maxAge);return p;});

  function frame(){
    _windAnimId=requestAnimationFrame(frame);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const W=canvas.width,H=canvas.height;
    for(const p of _windParticles){
      p.x+=vx*spd;p.y+=vy*spd;p.age++;
      const life=p.age/p.maxAge;
      const alpha=(life<0.12?life/0.12:life>0.8?(1-life)/0.2:1)*0.3;
      const trailLen=10+spd*6;
      ctx.beginPath();
      ctx.moveTo(p.x-vx*trailLen,p.y-vy*trailLen);
      ctx.lineTo(p.x,p.y);
      ctx.strokeStyle='rgba(147,197,253,'+alpha.toFixed(3)+')';
      ctx.lineWidth=1;
      ctx.stroke();
      // respawn when lifetime ends OR particle drifts off-screen
      if(p.age>=p.maxAge||p.x<-80||p.x>W+80||p.y<-80||p.y>H+80){
        Object.assign(p,spawn());
      }
    }
  }
  frame();
}

function stopWindAnimation(){
  if(_windAnimId){cancelAnimationFrame(_windAnimId);_windAnimId=null;}
  _windParticles=[];
  const canvas=document.getElementById('wind-canvas');
  if(canvas){
    canvas.style.display='none';
    if(canvas._rsz){window.removeEventListener('resize',canvas._rsz);canvas._rsz=null;}
  }
}

async function runWindAnalysis(){
  if(!_currentParcelGeoJSON)return;
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(_currentParcelAreaM2!==null&&_currentParcelAreaM2<1000){setStatus(lang==='ka'?'ანალიზისთვის საჭიროა მინ. 1000 კვ.მ.':'Parcel too small — min. 1000 m² required','','status-analysis');return;}
  if(!parcelCentroid)return;
  const btn=document.getElementById('wind-btn');

  if(btn){btn.disabled=true;btn.innerHTML=`<span class="spinner-sm" style="vertical-align:middle;margin-right:4px"></span>${lang==='ka'?'შემოწმება…':'Checking…'}`;}
  const tr=t();
  try{
    const _wsl=()=>document.getElementById('wind-status-label');
    setStatus(tr.windChecking||'Checking surroundings…','','status-analysis');
    {const _l=_wsl();if(_l)_l.textContent=lang==='ka'?'შემოწმება…':'Checking surroundings…';}
    const hasBuildings=await checkBuildingsNearby(parcelCentroid[1],parcelCentroid[0],500);
    if(hasBuildings){
      setStatus(tr.windBuildings||'Buildings within 500m — site not suitable for wind turbines','','status-analysis');
      {const _l=_wsl();if(_l)_l.textContent=lang==='ka'?'500მ-ში შენობებია':'Buildings within 500m';}
      if(btn){btn.disabled=false;btn.innerHTML=`${lang==='ka'?'ქარის ანალიზი':'Wind Analysis'}`;}
      return;
    }
    setStatus(lang==='ka'?'GWA მონაცემები…':'Fetching GWA data…','','status-analysis');
    {const _l=_wsl();if(_l)_l.textContent=lang==='ka'?'GWA მონაცემები…':'Fetching GWA data…';}
    const lat=parcelCentroid[1],lng=parcelCentroid[0];
    if(!window.GeoTIFF){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    setStatus(lang==='ka'?'GWA მონაცემები…':'Fetching GWA data…','','status-analysis');
    const[windSpeed,powerDensity,weibullA,weibullK,capFactor]=await Promise.all([
      gwaPointQuery('wind-speed',100,lat,lng).catch(()=>null),
      gwaPointQuery('power-density',100,lat,lng).catch(()=>null),
      gwaPointQuery('combined-Weibull-A',100,lat,lng).catch(()=>null),
      gwaPointQuery('combined-Weibull-k',100,lat,lng).catch(()=>null),
      gwaPointQuery('capacity-factor_IEC2',null,lat,lng).catch(()=>null)
    ]);
    setStatus(lang==='ka'?'ქარის ვარდი…':'Loading wind rose…','','status-analysis');
    {const _l=_wsl();if(_l)_l.textContent=lang==='ka'?'ქარის ვარდი…':'Wind rose…';}
    const roseData=await fetchWindRose(lat,lng).catch(()=>null);
    const annualYield=(weibullA&&weibullK)?calcWindYield(weibullA,weibullK):null;
    _windData={windSpeed,powerDensity,weibullA,weibullK,capFactor,annualYield,roseData};
    renderWindCard(_windData);
    startWindAnimation(_windData.windSpeed,_windData.roseData);

    if(btn){btn.disabled=false;btn.classList.add('active');btn.innerHTML=`${lang==='ka'?'ქარის ანალიზი':'Wind Analysis'}`;}
    setStatus('','','status-analysis');
  }catch(e){
    console.error('Wind:',e);
    setStatus(lang==='ka'?'ქარის ანალიზი ვერ მოხერხდა':'Wind analysis failed','','status-analysis');
    if(btn){btn.disabled=false;btn.innerHTML=`${lang==='ka'?'ქარის ანალიზი':'Wind Analysis'}`;}
  }
}

async function runReliefAnalysis(type){
  if(!_currentParcelGeoJSON)return;
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(_currentParcelAreaM2!==null&&_currentParcelAreaM2<1000){setStatus(lang==="ka"?"ანალიზისთვის საჭიროა მინ. 1000 კვ.მ.":"Parcel too small — min. 1000 m² required","","status-analysis");return;}
  _reliefActiveType=type;
  ['height','slope','aspect'].forEach(tp=>{document.getElementById(`acc-relief-${tp}-sw`)?.classList.toggle('on',tp===type);});
  const statusEl=document.getElementById("relief-status");
  const statsEl=document.getElementById("relief-stats");
  if(statsEl)statsEl.style.display="none";
  statusEl.innerHTML=`<span class="spinner-sm" style="vertical-align:middle;margin-right:5px"></span>${t().reliefLoading}`;
  try{
    if(!window.GeoTIFF){
      await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const dtm=await fetchDTM(_currentParcelGeoJSON);
    _dtmCache=dtm;
    let displayValues,extraStats=null;
    if(type==="height"){
      displayValues=Array.from(dtm.values);
    } else if(type==="slope"){
      const slopeArr=computeSlope(dtm);
      displayValues=Array.from(slopeArr);
      extraStats={classes:computeSlopeClasses(displayValues,dtm.nodata)};
    } else {
      const aspectArr=computeAspect(dtm);
      displayValues=Array.from(aspectArr);
      extraStats={dirs:computeAspectDirs(displayValues,dtm.nodata)};
    }
    if(_isDrawnArea){
      if(type==="slope"&&extraStats&&extraStats.classes){
        const c=extraStats.classes;
        _drawnAreaProps.slope_flat_pct=c[0];_drawnAreaProps.slope_gentle_pct=c[1];
        _drawnAreaProps.slope_moderate_pct=c[2];_drawnAreaProps.slope_steep_pct=c[3];
        _drawnAreaProps.slope_very_steep_pct=c[4];
      }
      if(type==="height"){
        const valid=displayValues.filter(v=>!isNaN(v)&&v!==dtm.nodata&&v>-9999);
        if(valid.length){_drawnAreaProps.elevation_min_m=Math.round(Math.min(...valid));
          _drawnAreaProps.elevation_max_m=Math.round(Math.max(...valid));
          _drawnAreaProps.elevation_mean_m=Math.round(valid.reduce((a,b)=>a+b,0)/valid.length);}
      }
      if(type==="aspect"&&extraStats&&extraStats.dirs){
        const _dn=["N","NE","E","SE","S","SW","W","NW"];
        const _mi=extraStats.dirs.indexOf(Math.max(...extraStats.dirs));
        _drawnAreaProps.aspect_dominant_dir=_dn[_mi];
        _drawnAreaProps.aspect_south_pct=extraStats.dirs[4];
      }
    }
    renderReliefOverlay(dtm,displayValues,type,_currentParcelGeoJSON,extraStats);
    logFeatureUse("relief_analysis").catch(()=>{});
    _reliefComputed.add(type);
    statusEl.textContent="";
    document.getElementById("relief-sw")?.classList.add("on");
    _updateReliefProfileToggle();
    renderReliefButtons();
  }catch(e){
    console.error("Relief:",e);
    statusEl.textContent=t().analysisError;
  }
}

function clearReliefOverlay(){
  _reliefActiveType=null;
  _reliefOverlayCache=null;
  _dtmCache=null;
  _reliefComputed.clear();
  stopProfileDrawing(true);
  if(!mapReady)return;
  try{if(map.getLayer("relief-overlay-layer"))map.removeLayer("relief-overlay-layer");}catch(_){}
  try{if(map.getSource("relief-overlay"))map.removeSource("relief-overlay");}catch(_){}
  try{if(map.getLayer("profile-label"))map.removeLayer("profile-label");}catch(_){}
  try{if(map.getLayer("profile-line"))map.removeLayer("profile-line");}catch(_){}
  try{if(map.getSource("profile-line"))map.removeSource("profile-line");}catch(_){}
}
function toggleAccRelief(type){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON)return;
  if(_reliefActiveType===type){
    clearReliefOverlay();
    renderReliefButtons();
    document.getElementById("relief-sw")?.classList.remove("on");
    return;
  }
  if(_profileMode)stopProfileDrawing(false);
  runReliefAnalysis(type);
}

function _updateReliefProfileToggle(){
  const el=document.getElementById("pro-cat-relief-content");
  if(!el)return;
  // Show/hide the profile toggle row below the legend
  let profileRow=el.querySelector("#acc-profile-sw")?.closest(".lp-row");
  const isKa=lang==="ka";
  if(!profileRow){
    const sep=document.createElement("div");
    sep.className="lp-row acc-toggle-row";
    sep.style.cssText="padding:4px 0;margin-top:6px;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px";
    sep.onclick=toggleElevationProfile;
    sep.innerHTML=`<span class="lp-row-name">${isKa?"სიმაღლის პროფილი":"Elevation Profile"}</span><div class="lp-sw" id="acc-profile-sw"></div>`;
    const resultDiv=document.createElement("div");
    resultDiv.id="elevation-profile-result";
    const legend=el.querySelector("#relief-legend");
    if(legend){legend.after(sep);sep.after(resultDiv);}
    else{el.appendChild(sep);el.appendChild(resultDiv);}
  }
}

function toggleElevationProfile(){
  if(!_dtmCache){return;}
  if(_profileMode){
    stopProfileDrawing(false);
    const sw=document.getElementById("acc-profile-sw");if(sw)sw.classList.remove("on");
    const el=document.getElementById("elevation-profile-result");if(el)el.innerHTML="";
    return;
  }
  _profileMode=true;
  _profileStart=null;
  const sw=document.getElementById("acc-profile-sw");if(sw)sw.classList.add("on");
  const el=document.getElementById("elevation-profile-result");
  const isKa=lang==="ka";
  if(el)el.innerHTML=`<div class="profile-hint">${isKa?"რუქაზე დაწყების წერტილი მონიშნეთ":"Click start point on map"}</div>`;
  map.getCanvas().style.cursor="crosshair";
  map.on("click",_handleProfileClick);
}

function stopProfileDrawing(clearResult){
  _profileMode=false;
  _profileStart=null;
  map.off("click",_handleProfileClick);
  if(mapReady){
    map.getCanvas().style.cursor="";
    try{map.off("mousemove","profile-line",_onMapProfileHover);}catch{}
    try{map.off("mouseleave","profile-line",_onProfileHoverEnd);}catch{}
    try{map.off("mouseenter","profile-line");}catch{}
  }
  _profilePts=null;_profileTransect=null;
  if(mapReady){
    try{if(map.getLayer("profile-cursor"))map.removeLayer("profile-cursor");}catch{}
    try{if(map.getSource("profile-cursor"))map.removeSource("profile-cursor");}catch{}
  }
  if(clearResult){
    const el=document.getElementById("elevation-profile-result");if(el)el.innerHTML="";
    try{if(map.getLayer("profile-label"))map.removeLayer("profile-label");}catch{}
    try{if(map.getLayer("profile-line"))map.removeLayer("profile-line");}catch{}
    try{if(map.getSource("profile-line"))map.removeSource("profile-line");}catch{}
    try{if(map.getLayer("profile-pts"))map.removeLayer("profile-pts");}catch{}
    try{if(map.getSource("profile-pts"))map.removeSource("profile-pts");}catch{}
  }
}

function _handleProfileClick(e){
  if(!_profileMode)return;
  const{lng,lat}=e.lngLat;
  const isKa=lang==="ka";
  if(!_profileStart){
    _profileStart=[lng,lat];
    _renderProfileMarker(_profileStart,null);
    const el=document.getElementById("elevation-profile-result");
    if(el)el.innerHTML=`<div class="profile-hint">${isKa?"დასრულების წერტილი მონიშნეთ":"Click end point on map"}</div>`;
  } else {
    const end=[lng,lat];
    const start=_profileStart;
    stopProfileDrawing(false);
    _renderProfileMarker(start,end);
    _computeAndRenderProfile(start,end);
  }
}

function _renderProfileMarker(start,end){
  const features=[{type:"Feature",geometry:{type:"Point",coordinates:start},properties:{label:"A"}}];
  if(end){
    features.push({type:"Feature",geometry:{type:"Point",coordinates:end},properties:{label:"B"}});
    const _ld=_haversineM(start[0],start[1],end[0],end[1]);
    const _ll=_ld>=1000?`${(_ld/1000).toFixed(2)} km`:`${Math.round(_ld)} m`;
    features.push({type:"Feature",geometry:{type:"LineString",coordinates:[start,end]},properties:{length_label:_ll}});
  }
  const gj={type:"FeatureCollection",features};
  if(!map.getSource("profile-line")){
    map.addSource("profile-line",{type:"geojson",data:gj});
    map.addLayer({id:"profile-line",type:"line",source:"profile-line",filter:["==","$type","LineString"],paint:{"line-color":"#818cf8","line-width":2,"line-opacity":0.85}});
    map.addLayer({id:"profile-pts",type:"circle",source:"profile-line",filter:["==","$type","Point"],paint:{"circle-radius":5,"circle-color":"#818cf8","circle-stroke-width":2,"circle-stroke-color":"rgba(255,255,255,0.7)"}});
    map.addLayer({id:"profile-label",type:"symbol",source:"profile-line",filter:["==","$type","LineString"],layout:{"symbol-placement":"line-center","text-field":["get","length_label"],"text-size":11,"text-font":["DIN Offc Pro Medium","Arial Unicode MS Bold"],"text-anchor":"top","text-offset":[0,0.6]},paint:{"text-color":"#a5b4fc","text-halo-color":"rgba(0,0,0,0.7)","text-halo-width":1.5}});
  } else {
    map.getSource("profile-line").setData(gj);
  }
}

function _computeAndRenderProfile(start,end){
  if(!_dtmCache)return;
  const{values,width,height,originX,originY,resX,resY,nodata}=_dtmCache;
  const N=120;
  const pts=[];
  let cumDist=0;
  for(let i=0;i<=N;i++){
    const t=i/N;
    const lng=start[0]+(end[0]-start[0])*t;
    const lat=start[1]+(end[1]-start[1])*t;
    const fx=((lng-originX)/resX);
    const fy=((originY-lat)/resY);
    const elev=bilinearSample(values,width,height,fx,fy,nodata);
    if(i>0){
      cumDist+=_haversineM(
        start[0]+(end[0]-start[0])*(i-1)/N,
        start[1]+(end[1]-start[1])*(i-1)/N,
        lng,lat);
    }
    if(!isNaN(elev)&&(nodata==null||elev!==nodata)&&elev>-9000)
      pts.push({dist:cumDist,elev});
  }
  if(pts.length<2){
    const el=document.getElementById("elevation-profile-result");
    const isKa=lang==="ka";
    if(el)el.innerHTML=`<div class="profile-hint">${isKa?"მონაცემები ამ ხაზზე ვერ მოიძებნა":"No DTM data along this line"}</div>`;
    return;
  }
  _renderProfileChart(pts,start,end);
}

function _renderProfileChart(pts,start,end){
  const el=document.getElementById("elevation-profile-result");
  if(!el)return;
  const elevs=pts.map(p=>p.elev);
  const dists=pts.map(p=>p.dist);
  const emin=Math.min(...elevs),emax=Math.max(...elevs),erange=emax-emin||1;
  const totalDist=dists[dists.length-1];
  const W=210,H=72,pL=26,pR=6,pT=6,pB=16;
  const iW=W-pL-pR,iH=H-pT-pB;
  const xS=d=>pL+(d/totalDist)*iW;
  const yS=e=>pT+iH-(((e-emin)/erange)*iH);
  const pts2=pts.filter(p=>!isNaN(p.elev));
  const linePts=pts2.map(p=>`${xS(p.dist).toFixed(1)},${yS(p.elev).toFixed(1)}`).join(" L ");
  const fillPts=`M${xS(pts2[0].dist).toFixed(1)},${pT+iH} L${linePts} L${xS(pts2[pts2.length-1].dist).toFixed(1)},${pT+iH} Z`;
  const distLabel=totalDist>=1000?`${(totalDist/1000).toFixed(2)} km`:`${Math.round(totalDist)} m`;
  const isKa=lang==="ka";
  _profilePts=pts;
  _profileTransect={start,end,totalDist,pL,iW,pT,iH,W,H,emin,erange};
  el.innerHTML=`<svg id="profile-svg" viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-top:5px;overflow:visible;cursor:crosshair">
    <defs><linearGradient id="pfg2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#818cf8" stop-opacity="0.04"/>
    </linearGradient></defs>
    <path d="${fillPts}" fill="url(#pfg2)"/>
    <path d="M${linePts}" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+iH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <line x1="${pL}" y1="${pT+iH}" x2="${pL+iW}" y2="${pT+iH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${pL-3}" y="${pT+iH}" font-size="7.5" fill="rgba(255,255,255,0.3)" text-anchor="end" dominant-baseline="middle">${Math.round(emin)}</text>
    <text x="${pL-3}" y="${pT+3}" font-size="7.5" fill="rgba(255,255,255,0.3)" text-anchor="end" dominant-baseline="middle">${Math.round(emax)}</text>
    <text x="${pL}" y="${H-2}" font-size="7.5" fill="rgba(255,255,255,0.25)" text-anchor="start">0</text>
    <text x="${pL+iW}" y="${H-2}" font-size="7.5" fill="rgba(255,255,255,0.25)" text-anchor="end">${distLabel}</text>
    <text x="${pL+iW/2}" y="${H-2}" font-size="7" fill="rgba(255,255,255,0.18)" text-anchor="middle">${isKa?"მ ა.დ.":"m a.s.l."}</text>
    <g id="pcursor" style="display:none;pointer-events:none">
      <line id="pcur-vline" x1="0" y1="${pT}" x2="0" y2="${pT+iH}" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
      <circle id="pcur-dot" cx="0" cy="0" r="3.5" fill="#818cf8" stroke="rgba(255,255,255,0.8)" stroke-width="1.2"/>
      <rect id="pcur-bg" x="0" y="${pT}" width="36" height="13" rx="2.5" fill="rgba(8,8,18,0.82)"/>
      <text id="pcur-txt" x="0" y="${pT+7}" font-size="8" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="600"></text>
    </g>
    <rect id="profile-hz" x="${pL}" y="${pT}" width="${iW}" height="${iH}" fill="transparent"/>
  </svg>
  <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:rgba(255,255,255,0.25);margin-top:1px">
    <span>Δ ${Math.round(emax-emin)} m &nbsp;·&nbsp; ${distLabel}</span>
    <span onclick="stopProfileDrawing(true);document.getElementById('acc-profile-sw')?.classList.remove('on')" style="cursor:pointer;color:rgba(255,255,255,0.2);font-size:0.6rem">${isKa?"გასუფთავება":"Clear"}</span>
  </div>`;
  const hz=el.querySelector("#profile-hz");
  hz.addEventListener("mousemove",_onProfileHover);
  hz.addEventListener("mouseleave",_onProfileHoverEnd);
  if(mapReady&&map.getLayer("profile-line")){
    map.on("mousemove","profile-line",_onMapProfileHover);
    map.on("mouseleave","profile-line",_onProfileHoverEnd);
    map.on("mouseenter","profile-line",()=>map.getCanvas().style.cursor="crosshair");
  }
}

function _showLineElevProfile(coords){
  if(!coords||coords.length<2)return;
  stopProfileDrawing(false);
  // Compute segment lengths for path parameterization
  const segLens=[];let totalLen=0;
  for(let i=0;i<coords.length-1;i++){
    const d=_haversineM(coords[i][0],coords[i][1],coords[i+1][0],coords[i+1][1]);
    segLens.push(d);totalLen+=d;
  }
  if(totalLen<1)return;
  // Sample 150 pts along the polyline using queryTerrainElevation
  const N=150;const pts=[];
  for(let n=0;n<=N;n++){
    const targetDist=(n/N)*totalLen;
    let remaining=targetDist,lng=coords[0][0],lat=coords[0][1];
    for(let s=0;s<segLens.length;s++){
      if(remaining<=segLens[s]||s===segLens.length-1){
        const t=segLens[s]>0?Math.min(remaining/segLens[s],1):0;
        lng=coords[s][0]+(coords[s+1][0]-coords[s][0])*t;
        lat=coords[s][1]+(coords[s+1][1]-coords[s][1])*t;
        break;
      }
      remaining-=segLens[s];
    }
    const elev=map.queryTerrainElevation({lng,lat},{exaggerated:false});
    if(elev!=null&&!isNaN(elev))pts.push({dist:targetDist,elev,lng,lat});
  }
  // Show line on map using profile-line layers
  const distLabel=totalLen>=1000?`${(totalLen/1000).toFixed(2)} km`:`${Math.round(totalLen)} m`;
  const midCoord=coords.length===2
    ?[(coords[0][0]+coords[1][0])/2,(coords[0][1]+coords[1][1])/2]
    :coords[Math.floor(coords.length/2)];
  const features=[
    {type:"Feature",geometry:{type:"LineString",coordinates:coords},properties:{}},
    {type:"Feature",geometry:{type:"Point",coordinates:coords[0]},properties:{pt_type:"ep"}},
    {type:"Feature",geometry:{type:"Point",coordinates:coords[coords.length-1]},properties:{pt_type:"ep"}},
    {type:"Feature",geometry:{type:"Point",coordinates:midCoord},properties:{pt_type:"mid",dist_label:distLabel}}
  ];
  const gj={type:"FeatureCollection",features};
  if(!map.getSource("profile-line")){
    map.addSource("profile-line",{type:"geojson",data:gj});
    map.addLayer({id:"profile-line",type:"line",source:"profile-line",filter:["==","$type","LineString"],paint:{"line-color":"#818cf8","line-width":2,"line-dasharray":[4,3],"line-opacity":0.85}});
    map.addLayer({id:"profile-pts",type:"circle",source:"profile-line",filter:["all",["==","$type","Point"],["==",["get","pt_type"],"ep"]],paint:{"circle-radius":5,"circle-color":"#818cf8","circle-stroke-width":2,"circle-stroke-color":"rgba(255,255,255,0.7)"}});
    map.addLayer({id:"profile-label",type:"symbol",source:"profile-line",filter:["all",["==","$type","Point"],["==",["get","pt_type"],"mid"]],layout:{"text-field":["get","dist_label"],"text-size":12,"text-font":["Open Sans Bold","Arial Unicode MS Bold"],"text-anchor":"center","text-offset":[0,-1.4],"text-allow-overlap":true},paint:{"text-color":"#a5b4fc","text-halo-color":"rgba(0,0,0,0.75)","text-halo-width":1.5}});
  } else {
    map.getSource("profile-line").setData(gj);
  }
  if(pts.length<2){
    document.getElementById('line-profile-panel').style.display='none';
    return;
  }
  // Render chart in #line-profile-panel
  const elevs=pts.map(p=>p.elev);
  const emin=Math.min(...elevs),emax=Math.max(...elevs),erange=emax-emin||1;
  const netChange=pts[pts.length-1].elev-pts[0].elev;
  const W=222,H=72,pL=26,pR=6,pT=6,pB=16;
  const iW=W-pL-pR,iH=H-pT-pB;
  const xS=d=>pL+(d/totalLen)*iW;
  const yS=e=>pT+iH-(((e-emin)/erange)*iH);
  const linePts=pts.map(p=>`${xS(p.dist).toFixed(1)},${yS(p.elev).toFixed(1)}`).join(" L ");
  const fillPts=`M${xS(pts[0].dist).toFixed(1)},${pT+iH} L${linePts} L${xS(pts[pts.length-1].dist).toFixed(1)},${pT+iH} Z`;
  const isKa=lang==="ka";
  _profilePts=pts;
  _profileTransect={start:coords[0],end:coords[coords.length-1],coords,totalDist:totalLen,pL,iW,pT,iH,W,H,emin,erange};
  // Stats row
  const meta=document.getElementById('line-profile-meta');
  if(meta)meta.innerHTML=
    `<div class="lp-elev-stat"><div class="stat-lbl">${isKa?"სიგრძე":"Length"}</div><div class="stat-val">${distLabel}</div></div>`+
    `<div class="lp-elev-stat"><div class="stat-lbl">${isKa?"Δ სიმ.":"Δ Elev"}</div><div class="stat-val">${(netChange>=0?"+":"")+Math.round(netChange)+" m"}</div></div>`+
    `<div class="lp-elev-stat"><div class="stat-lbl">${isKa?"ს.დ.":"Range"}</div><div class="stat-val">${Math.round(emin)}–${Math.round(emax)} m</div></div>`;
  // SVG chart
  const chartEl=document.getElementById('line-profile-chart');
  if(chartEl)chartEl.innerHTML=`<svg id="lp-profile-svg" viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-top:4px;overflow:visible;cursor:crosshair">
    <defs><linearGradient id="lpfg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#818cf8" stop-opacity="0.03"/>
    </linearGradient></defs>
    <path d="${fillPts}" fill="url(#lpfg)"/>
    <path d="M${linePts}" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+iH}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <line x1="${pL}" y1="${pT+iH}" x2="${pL+iW}" y2="${pT+iH}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${pL-3}" y="${pT+iH}" font-size="7.5" fill="rgba(255,255,255,0.28)" text-anchor="end" dominant-baseline="middle">${Math.round(emin)}</text>
    <text x="${pL-3}" y="${pT+3}" font-size="7.5" fill="rgba(255,255,255,0.28)" text-anchor="end" dominant-baseline="middle">${Math.round(emax)}</text>
    <text x="${pL}" y="${H-2}" font-size="7.5" fill="rgba(255,255,255,0.2)" text-anchor="start">0</text>
    <text x="${pL+iW}" y="${H-2}" font-size="7.5" fill="rgba(255,255,255,0.2)" text-anchor="end">${distLabel}</text>
    <g id="pcursor" style="display:none;pointer-events:none">
      <line id="pcur-vline" x1="0" y1="${pT}" x2="0" y2="${pT+iH}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
      <circle id="pcur-dot" cx="0" cy="0" r="3.5" fill="#818cf8" stroke="rgba(255,255,255,0.8)" stroke-width="1.2"/>
      <rect id="pcur-bg" x="0" y="${pT}" width="36" height="13" rx="2.5" fill="rgba(8,8,18,0.82)"/>
      <text id="pcur-txt" x="0" y="${pT+7}" font-size="8" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="600"></text>
    </g>
    <rect id="profile-hz" x="${pL}" y="${pT}" width="${iW}" height="${iH}" fill="transparent"/>
  </svg>`;
  document.getElementById('line-profile-panel').style.display='block';
  const hz=chartEl.querySelector('#profile-hz');
  if(hz){hz.addEventListener('mousemove',_onProfileHover);hz.addEventListener('mouseleave',_onProfileHoverEnd);}
  if(mapReady&&map.getLayer('profile-line')){
    map.on('mousemove','profile-line',_onMapProfileHover);
    map.on('mouseleave','profile-line',_onProfileHoverEnd);
    map.on('mouseenter','profile-line',()=>map.getCanvas().style.cursor='crosshair');
  }
}


// ── TTC Real-time Transit ──────────────────────────────────────────────────────
let _ttcStopsCache    = null;
let _ttcPollTimer     = null;
let _ttcActiveStop    = null;
let _ttcSelectedStopGeo = null; // {coords, mode} of currently selected stop for persistent hl
let _ttcMapClickDeselect = null;
let _ttcRenderedStops = null;   // stops currently shown on map (for basemap restore)
let _ttcActiveRouteColor = '';  // color of the currently displayed route shape
let _ttcVehicleTimer = null;
let _ttcVehiclePulseTimer = null;
let _ttcVehiclePulsePhase = 0;

// Ray-cast point-in-polygon (GeoJSON ring = [[lng,lat],...])
function _ttcPointInPoly(lng, lat, ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

async function _ttcLoadStops(){
  if(_ttcStopsCache) return _ttcStopsCache;
  const res=await fetch(`${PROXY}/ttc/stops`);
  if(!res.ok) throw new Error('TTC '+res.status);
  _ttcStopsCache=await res.json();
  return _ttcStopsCache;
}

// The transit analysis area: the isochrone when one exists; otherwise a
// large-enough (≥5,000 m²) selected parcel / drawn / uploaded AOI polygon.
// Returns outer rings to test stops against ([] = no valid area).
function _transitAreaRings(){
  const isoGeom=_isoData?.features?.[0]?.geometry;
  const geom=isoGeom||((_isLargeParcel()&&_currentParcelGeoJSON&&/Polygon/.test(_currentParcelGeoJSON.type))?_currentParcelGeoJSON:null);
  if(!geom)return[];
  return geom.type==='MultiPolygon'?geom.coordinates.map(p=>p[0]):[geom.coordinates[0]];
}
// Human label for exports: "10 min Walking · 1.84 km²" or "Study area · 8,400 m²"
function _transitAreaLabel(){
  const tr=t();
  try{
    const isoFeat=_isoData?.features?.[0];
    if(isoFeat){
      const km2=(typeof turf!=='undefined'?turf.area(isoFeat):0)/1e6;
      return`${_accMinutes||10} min ${tr.accModes?.[_accMode||'walking']||''}${km2?` · ${km2.toFixed(2)} km²`:''}`;
    }
    if(_isLargeParcel()&&_currentParcelGeoJSON){
      const m2=_currentParcelAreaM2||0;
      return`${tr.ttcAoiLabel} · ${m2>=1e6?(m2/1e6).toFixed(2)+' km²':Math.round(m2).toLocaleString()+' m²'}`;
    }
  }catch(_){}
  return null;
}
function _ttcFilterStops(){
  if(!_ttcStopsCache) return [];
  const rings=_transitAreaRings();
  if(!rings.length) return [];
  const stops=_ttcStopsCache.filter(s=>rings.some(ring=>_ttcPointInPoly(s.lon,s.lat,ring)));
  if(parcelCentroid) stops.forEach(s=>s._dist=_haversineM(parcelCentroid[0],parcelCentroid[1],s.lon,s.lat));
  return stops.sort((a,b)=>(a._dist||0)-(b._dist||0));
}

async function toggleAccTransit(){
  const sw=document.getElementById('acc-transit-sw');
  const el=document.getElementById('acc-transit-result');
  if(!sw||!el) return;
  const isKa=lang==='ka'; const tr=t();
  if(sw.classList.contains('on')){
    _clearBusStopRoute();
    _histCleanup();
    sw.classList.remove('on'); el.innerHTML=''; _ttcClearPoll(); _ttcRemoveFromMap(); _ttcRenderedStops=null; _ttcMode='live'; return;
  }
  if(!_transitAreaRings().length){
    // Small parcel/AOI (<5,000 m²) → isochrone is the meaningful catchment;
    // large areas may run transit directly (isochrone remains optional).
    const smallArea=_currentParcelGeoJSON&&!_isLargeParcel();
    const msg=smallArea?(tr.ttcAreaSmall||'Area under 5,000 m² — generate an isochrone first'):(tr.accNoIso||'Generate an isochrone first');
    if(el)el.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${msg}</div>`;
    return;
  }
  sw.classList.add('on');
  el.innerHTML=`<div style="font-size:0.69rem;color:rgba(255,255,255,0.3);padding:6px 0">${tr.ttcLoading||'Loading...'}</div>`;
  try{
    await _ttcLoadStops();
    const stops=_ttcFilterStops();
    if(!stops.length){
      el.innerHTML=`<div style="font-size:0.69rem;color:rgba(255,255,255,0.25);padding:4px 0">${tr.ttcNoStops||'No stops within range'}</div>`;
      return;
    }
    // Fetch routes for all stops in parallel
    const stopsWithRoutes=await Promise.all(stops.map(async s=>{
      try{
        const r=await fetch(`${PROXY}/ttc/stops/${encodeURIComponent(s.id)}/routes`);
        return{...s,routes:r.ok?await r.json():[]};
      }catch{return{...s,routes:[]};}
    }));
    _ttcRenderedStops=stopsWithRoutes;
    // Plot stops on map
    _ttcShowOnMap(stopsWithRoutes);
    // Render panel in current mode (Live | History)
    _ttcMode='live';
    _ttcRenderPanel();
  }catch(e){
    sw.classList.remove('on');
    el.innerHTML=`<div style="font-size:0.69rem;color:rgba(255,80,80,0.45);padding:4px 0">${isKa?'შეცდომა — დარწმუნდით proxy-ის განახლებაში':'Error — make sure the Worker is deployed'}</div>`;
    console.warn('TTC error:',e);
  }
}

function _ttcRenderStopCard(s, isKa){
  const dist=s._dist!=null?`${Math.round(s._dist)} m · `:'';
  const badges=(s.routes||[]).map(r=>{
    const bg=r.color?`#${r.color}`:'#00B38B';
    const chipBg=r.color&&r.color.toLowerCase()!=='00b38b'?'#3b82f6':bg;
    const sn=r.shortName||r.routeShortName||'';
    return `<span class="ttc-rbtn" title="${sn}" style="display:inline-block;background:${chipBg};color:#fff;border-radius:4px;padding:0 5px;height:15px;line-height:15px;font-size:0.58rem;font-weight:700;margin-right:3px;cursor:pointer;transition:opacity .15s" onmouseenter="this.style.opacity='.75'" onmouseleave="this.style.opacity='1'" onclick="event.stopPropagation();_ttcRouteClick('${s.id}','${s.code}','${sn}','${r.id||''}','${r.color||''}')">${sn}</span>`;
  }).join('');
  const sName=s.name.replace(/'/g,"\'");
  return `<div class="ttc-stop-card" id="ttc-card-${s.code}"
    onclick="_ttcSelectStop('${s.id}','${s.code}',${s.lon},${s.lat},'${sName}')"
    onmouseenter="_ttcCardHover(${s.lon},${s.lat},'${s.vehicleMode||'BUS'}')"
    onmouseleave="_ttcCardHoverEnd()">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="ttc-stop-name">${s.name}</span>
      <span style="font-size:0.6rem;color:rgba(255,255,255,0.28)">${dist}#${s.code}</span>
    </div>
    ${badges?`<div style="margin-top:4px">${badges}</div>`:''}
    <div id="ttc-wait-${s.code}"></div>
    <div id="ttc-arr-${s.code}"></div>
    <div id="ttc-rd-${s.code}"></div>
  </div>`;
}

async function _ttcSelectStop(stopId, code, lon, lat, name){
  _clearBusStopRoute();
  _ttcClearRouteShape();
  _ttcRDState={};
  _ttcClearPoll();
  _ttcActiveStop={id:stopId,code};
  if(lon!=null&&lat!=null){
    _ttcSelectedStopGeo={coords:[lon,lat],mode:'BUS'};
    if(mapReady&&map.getSource('ttc-stops-hl'))
      map.getSource('ttc-stops-hl').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{mode:'BUS'}}]});
  }
  document.querySelectorAll('.ttc-stop-card').forEach(c=>c.classList.remove('active'));
  const card=document.getElementById(`ttc-card-${code}`);
  if(card) card.classList.add('active');
  await _ttcFetchArrivals(stopId,code);
  _ttcPollTimer=setInterval(()=>_ttcFetchArrivals(stopId,code),15000);
  // Draw walking route + safety analysis (reuse school routing infrastructure)
  if(lon!=null&&lat!=null&&parcelCentroid){
    _ensureSchoolMapSetup();
    showSchoolRoute(lon,lat,name||`Stop #${code}`);
  }
}

async function _ttcFetchArrivals(stopId,code){
  const el=document.getElementById(`ttc-arr-${code}`);
  if(!el) return;
  const tr=t(); const isKa=lang==='ka';
  try{
    const res=await fetch(`${PROXY}/ttc/stops/${encodeURIComponent(stopId)}/arrivals`);
    if(!res.ok){el.innerHTML='';return;}
    const arrivals=await res.json();
    console.log('TTC arr[0]:', arrivals[0]);
    if(!Array.isArray(arrivals)||!arrivals.length){
      el.innerHTML=`<div class="ttc-arrivals" style="color:rgba(255,255,255,0.22);font-size:0.63rem;padding:5px 0">${tr.ttcNoArrivals||'No upcoming arrivals'} — <span style="color:rgba(165,180,252,0.5);cursor:pointer" onclick="event.stopPropagation();document.querySelectorAll('#ttc-card-${code} .ttc-rbtn')[0]?.click()">${isKa?'განრიგი ↓':'tap route for schedule ↓'}</span></div>`;
      return;
    }
    el.innerHTML=`<div class="ttc-arrivals">${arrivals.map(a=>{
      const mins=a.realtime?a.realtimeArrivalMinutes:a.scheduledArrivalMinutes;
      const route=a.shortName||'—';
      const head=a.headsign||'';
      let delayHtml='';
      if(a.realtime&&a.realtimeArrivalMinutes!=null&&a.scheduledArrivalMinutes!=null){
        const d=a.realtimeArrivalMinutes-a.scheduledArrivalMinutes;
        if(d>1) delayHtml=`<span class="ttc-late">+${d}${isKa?'წთ':'m'} ${isKa?'გვიან':'late'}</span>`;
        else if(d<-1) delayHtml=`<span class="ttc-early">${Math.abs(d)}${isKa?'წთ':'m'} ${isKa?'ადრე':'early'}</span>`;
        else delayHtml=`<span class="ttc-on-time">✓</span>`;
      }
      const etaTxt=mins!=null?`${mins} ${isKa?'წთ':'min'}`:'—';
      return `<div class="ttc-arr-row" style="cursor:pointer" onclick="event.stopPropagation();_ttcRouteClick('${stopId}','${code}','${route}')">
        <span class="ttc-route-badge" style="background:rgba(129,140,248,0.18)">${route}</span>
        <span class="ttc-headsign">${head}</span>
        <span class="ttc-eta">${etaTxt}</span>
        ${delayHtml}
      </div>`;
    }).join('')}</div>`;
    // refresh wait badge for active stop with live data
    const waitEl=document.getElementById(`ttc-wait-${code}`);
    if(waitEl){const wr=_ttcComputeMedianWait(arrivals);if(wr)_ttcRenderWaitBadge(waitEl,wr);}
  }catch(e){console.warn('TTC fetch err:',e);if(el)el.innerHTML='';}
}

let _ttcRDState={};

async function _ttcRouteClick(stopId,stopCode,routeShortName,routeId,routeColor){
  const el=document.getElementById(`ttc-rd-${stopCode}`);
  if(!el) return;
  const isKa=lang==='ka'; const tr=t();
  // Toggle
  if(_ttcRDState[stopCode]===routeShortName&&el.innerHTML){
    el.innerHTML=''; delete _ttcRDState[stopCode]; _ttcClearRouteShape(); return;
  }
  _ttcRDState[stopCode]=routeShortName;
  el.innerHTML=`<div style="font-size:0.63rem;color:rgba(255,255,255,0.25);padding:4px 0;border-top:1px solid rgba(255,255,255,0.06);margin-top:5px">${tr.ttcLoading||'Loading...'}</div>`;
  try{
    // Auto-resolve routeId if not provided (e.g. when clicking from arrival row)
    if(!routeId){
      try{const rr=await fetch(`${PROXY}/ttc/stops/${encodeURIComponent(stopId)}/routes`);
        if(rr.ok){const routes=await rr.json();const found=routes.find(r=>String(r.shortName)===String(routeShortName));if(found){routeId=found.id;if(!routeColor)routeColor=found.color||'';}}}catch{}
    }
    // Clear walking route to stop, then draw transit route shape
    _clearBusStopRoute();
    _ttcShowRouteShape(routeId, routeColor);
    const res=await fetch(`${PROXY}/ttc/stops/${encodeURIComponent(stopId)}/arrivals`);
    const raw=res.ok?await res.json():[];
    const filtered=(Array.isArray(raw)?raw:[]).filter(a=>String(a.shortName)===String(routeShortName));
    let innerHtml='';
    let headsignToShow='';
    if(filtered.length){
      headsignToShow=filtered[0].headsign||'';
      innerHtml=filtered.map(a=>{
        const rtMins=a.realtimeArrivalMinutes;
        const schMins=a.scheduledArrivalMinutes;
        const head=a.headsign||'';
        const rtDot=a.realtime?`<span style="color:#34d399;font-size:0.55rem">●</span>`:`<span style="color:rgba(255,255,255,0.2);font-size:0.55rem">○</span>`;
        let delayBadge='';
        if(a.realtime&&rtMins!=null&&schMins!=null){
          const d=rtMins-schMins;
          delayBadge=d>5?`<span class="ttc-late">${isKa?'გვიან':'late'}</span>`:
                     d<-5?`<span class="ttc-early">${isKa?'ადრე':'early'}</span>`:
                          `<span class="ttc-on-time">${tr.ttcOnTime||'on time'}</span>`;
        }
        const rtTxt=rtMins!=null?`${rtMins} ${isKa?'წთ':'min'}`:'';
        const schTxt=schMins!=null?`(${isKa?'განრ.':'sch.'} ${schMins>=0?'+':''}${schMins}${isKa?'წთ':'m'})`:'';
        return `<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:5px;padding:3px 0;font-size:0.65rem">
          <div style="display:flex;align-items:center;gap:3px">${rtDot}</div>
          <span style="color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${head}</span>
          <div style="text-align:right;flex-shrink:0">
            ${rtTxt?`<span style="font-weight:700;color:rgba(255,255,255,0.9)">${rtTxt}</span> `:''}
            ${schTxt&&a.realtime?`<span style="color:rgba(255,255,255,0.22);font-size:0.58rem">${schTxt}</span>`:''}
            ${delayBadge}
          </div>
        </div>`;
      }).join('');
    } else {
      const schedResult=await _ttcFetchSchedule(stopId,routeId,routeShortName,isKa,tr);
      innerHtml=schedResult.html;
      headsignToShow=schedResult.headsign||'';
    }
    if(_ttcRDState[stopCode]===routeShortName)
      el.innerHTML=`<div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:5px;padding-top:5px">
        <div style="font-size:0.59rem;color:rgba(165,180,252,0.7);font-weight:600;margin-bottom:4px;letter-spacing:.03em">${isKa?'მარშ.':'Route'} ${routeShortName}${headsignToShow?` <span style="font-weight:400;color:rgba(255,255,255,0.4);font-size:0.57rem">→ ${headsignToShow}</span>`:''}</div>
        ${innerHtml}</div>`;
  }catch(e){console.warn('Route click err:',e);if(el)el.innerHTML='';}
}

async function _ttcFetchSchedule(stopId,routeId,routeShortName,isKa,tr){
  const noSched={html:`<div style="font-size:0.63rem;color:rgba(255,255,255,0.2);padding:3px 0">${isKa?'განრიგი მიუწვდომელია':'Schedule unavailable'}</div>`,headsign:''};
  if(!routeId) return noSched;
  try{
    const res=await fetch(`${PROXY}/ttc/routes/${encodeURIComponent(routeId)}/schedule`);
    if(!res.ok) throw new Error(res.status);
    const data=await res.json();
    const DAY_ORDER=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const todayIdx=new Date().getDay();
    const schedules=data.weekdaySchedules||[];
    const sched=schedules.find(s=>{
      const fi=DAY_ORDER.indexOf(s.fromDay), ti=DAY_ORDER.indexOf(s.toDay);
      return todayIdx>=fi&&todayIdx<=ti;
    })||schedules[0];
    if(!sched) throw new Error('no schedule');
    // Last stop in the route = terminus/destination
    const lastStop=sched.stops?.length?sched.stops[sched.stops.length-1]:null;
    const headsign=lastStop?.name||'';
    const stopEntry=sched.stops?.find(s=>s.id===stopId);
    if(!stopEntry) throw new Error('stop not in route');
    const allTimes=(stopEntry.arrivalTimes||'').split(',').map(t=>t.trim()).filter(Boolean);
    const now=new Date(), nowMins=now.getHours()*60+now.getMinutes();
    const upcoming=allTimes.filter(t=>{const[h,m]=t.split(':').map(Number);return h*60+m>nowMins;}).slice(0,4);
    const display=upcoming.length?upcoming:allTimes.slice(0,4);
    const rows=display.map(t=>`<span style="display:inline-block;background:rgba(255,255,255,0.07);border-radius:4px;padding:1px 6px;font-weight:600;color:rgba(255,255,255,0.82);font-size:0.65rem;margin:0 3px 3px 0">${t}</span>`).join('');
    const lbl=upcoming.length?(isKa?'შემდეგი':'Next'):(isKa?'ხვალ პირველი':'Tomorrow first');
    return {html:`<div style="font-size:0.58rem;color:rgba(255,255,255,0.28);margin-bottom:4px">${lbl}</div><div>${rows}</div>`,headsign};
  }catch(e){
    console.log('schedule err:',e.message);
    return {html:`<div style="font-size:0.63rem;color:rgba(255,255,255,0.2);padding:3px 0">${isKa?'ამ ეტაპზე მოძრაობა არ არის':'No active service right now'}</div>`,headsign:''};
  }
}

function _ttcClearPoll(){
  if(_ttcPollTimer){clearInterval(_ttcPollTimer);_ttcPollTimer=null;}
  _ttcActiveStop=null;
  _ttcSelectedStopGeo=null;
}

function _ttcComputeMedianWait(arrivals){
  if(!Array.isArray(arrivals)||!arrivals.length) return null;
  const valid=arrivals.filter(a=>a.realtime
    && a.realtimeArrivalMinutes!=null
    && a.scheduledArrivalMinutes!=null);
  if(valid.length){
    const delays=valid.map(a=>a.realtimeArrivalMinutes-a.scheduledArrivalMinutes);
    const avgAbsDev=Math.round(delays.reduce((s,d)=>s+Math.abs(d),0)/delays.length);
    const lateCount=delays.filter(d=>d>1).length;
    const earlyCount=delays.filter(d=>d<-1).length;
    const onTimeCount=delays.filter(d=>Math.abs(d)<=1).length;
    return {type:'live',avgAbsDev,lateCount,earlyCount,onTimeCount,count:valid.length};
  }
  // Fallback: compute service interval from scheduled times
  const schTimes=arrivals
    .map(a=>a.scheduledArrivalMinutes)
    .filter(t=>t!=null&&t>=0&&t<180)
    .sort((a,b)=>a-b);
  if(schTimes.length>=2){
    const gaps=[];
    for(let i=1;i<schTimes.length;i++){const g=schTimes[i]-schTimes[i-1];if(g>0)gaps.push(g);}
    if(gaps.length){
      gaps.sort((a,b)=>a-b);
      return {type:'sched',freq:Math.round(gaps[Math.floor(gaps.length/2)]),count:schTimes.length};
    }
  }
  return null;
}

function _ttcRenderWaitBadge(el, result){
  if(!el||!result) return;
  const isKa=lang==='ka';
  if(result.type==='live'){
    const {avgAbsDev,lateCount,earlyCount,onTimeCount}=result;
    const color=avgAbsDev<=2?'#34d399':avgAbsDev<=5?'#fbbf24':avgAbsDev<=10?'#f97316':'#ef4444';
    const bigVal=avgAbsDev<=2?(isKa?'განრიგზე':'on schedule'):`±${avgAbsDev}${isKa?'წთ':'m'}`;
    const subLabel=avgAbsDev<=2?'':(isKa?'გადახრა':'avg deviation');
    const parts=[];
    if(lateCount>0) parts.push(`<span style="color:#f87171">${lateCount} ${isKa?'გვიან':'late'}</span>`);
    if(earlyCount>0) parts.push(`<span style="color:#60a5fa">${earlyCount} ${isKa?'ადრე':'early'}</span>`);
    if(onTimeCount>0) parts.push(`<span style="color:#34d399">${onTimeCount} ${isKa?'განრიგზე':'on time'}</span>`);
    el.innerHTML=`<div class="school-metrics-row" style="margin-top:5px;margin-bottom:0">
      <div class="school-metric">
        <span class="school-metric-val" style="font-size:1.0rem;color:${color}">${bigVal}</span>
        ${subLabel?`<span class="school-metric-lbl" style="margin-top:1px">${subLabel}</span>`:''}
        ${parts.length?`<span class="school-metric-lbl" style="margin-top:3px">${parts.join(' · ')}</span>`:''}
      </div>
    </div>`;
  } else {
    el.innerHTML=`<div class="school-metrics-row" style="margin-top:5px;margin-bottom:0">
      <div class="school-metric">
        <span class="school-metric-val" style="font-size:1.0rem;color:rgba(255,255,255,0.45)">~${result.freq}m</span>
        <span class="school-metric-lbl">${isKa?'ინტერვალი (განრ.)':'interval (sched.)'}</span>
      </div>
    </div>`;
  }
}

async function _ttcLoadAllWaitTimes(stops){
  for(let i=0;i<stops.length;i+=5){
    const batch=stops.slice(i,i+5);
    await Promise.all(batch.map(async s=>{
      try{
        const r=await fetch(`${PROXY}/ttc/stops/${encodeURIComponent(s.id)}/arrivals`);
        if(!r.ok) return;
        const arr=await r.json();
        const result=_ttcComputeMedianWait(arr);
        if(!result) return;
        const el=document.getElementById(`ttc-wait-${s.code}`);
        if(el) _ttcRenderWaitBadge(el,result);
      }catch(_){}
    }));
  }
}

function _ttcCardHover(lng,lat,mode){
  if(!mapReady)return;
  const src=map.getSource('ttc-stops-hl');
  if(src)src.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{mode:mode||'BUS'}}]});
}
function _ttcCardHoverEnd(){
  if(!mapReady)return;
  const src=map.getSource('ttc-stops-hl');
  if(src)src.setData({type:'FeatureCollection',features:[]});
}

function _ttcAddBusIcon(cb){
  if(map.hasImage('ttc-bus')){cb();return;}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <rect width="30" height="30" rx="6" fill="#3b82f6"/>
    <rect x="10.5" y="5.5" width="9" height="3" rx="1.5" fill="white"/>
    <rect x="5.5" y="7.5" width="19" height="13" rx="3" fill="white"/>
    <rect x="8" y="9.5" width="14" height="8" rx="1.5" fill="#3b82f6"/>
    <circle cx="10.5" cy="22" r="3.5" fill="white"/>
    <circle cx="10.5" cy="22" r="1.8" fill="#3b82f6"/>
    <circle cx="19.5" cy="22" r="3.5" fill="white"/>
    <circle cx="19.5" cy="22" r="1.8" fill="#3b82f6"/>
  </svg>`;
  const img=new Image(30,30);
  img.onload=()=>{try{map.addImage('ttc-bus',img,{pixelRatio:2});}catch(_){}cb();};
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function _ttcAddBusIconOrange(cb){
  if(map.hasImage('ttc-bus-orange')){cb();return;}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <rect width="30" height="30" rx="6" fill="#f97316"/>
    <rect x="10.5" y="5.5" width="9" height="3" rx="1.5" fill="white"/>
    <rect x="5.5" y="7.5" width="19" height="13" rx="3" fill="white"/>
    <rect x="8" y="9.5" width="14" height="8" rx="1.5" fill="#f97316"/>
    <circle cx="10.5" cy="22" r="3.5" fill="white"/>
    <circle cx="10.5" cy="22" r="1.8" fill="#f97316"/>
    <circle cx="19.5" cy="22" r="3.5" fill="white"/>
    <circle cx="19.5" cy="22" r="1.8" fill="#f97316"/>
  </svg>`;
  const img=new Image(30,30);
  img.onload=()=>{try{map.addImage('ttc-bus-orange',img,{pixelRatio:2});}catch(_){}cb();};
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function _ttcMetroSVG(bg, fg){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <rect width="30" height="30" rx="6" fill="${bg}"/>
    <polygon points="2,26 4,5 11,7 15,20 12,26" fill="${fg}"/>
    <polygon points="28,26 26,5 19,7 15,20 18,26" fill="${fg}"/>
  </svg>`;
}
function _ttcAddMetroIcon(cb){
  if(map.hasImage('ttc-metro')){cb();return;}
  const img=new Image(30,30);
  img.onload=()=>{try{map.addImage('ttc-metro',img,{pixelRatio:2});}catch(_){}cb();};
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(_ttcMetroSVG('#dc2626','white'));
}
function _ttcAddMetroIconOrange(cb){
  if(map.hasImage('ttc-metro-orange')){cb();return;}
  const img=new Image(30,30);
  img.onload=()=>{try{map.addImage('ttc-metro-orange',img,{pixelRatio:2});}catch(_){}cb();};
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(_ttcMetroSVG('white','#dc2626'));
}

function _ttcShowOnMap(stops){
  if(!mapReady) return;
  const gj={type:'FeatureCollection',features:stops.map(s=>({
    type:'Feature',
    geometry:{type:'Point',coordinates:[s.lon,s.lat]},
    properties:{id:s.id,code:s.code,name:s.name,mode:s.vehicleMode||'BUS'}
  }))};
  _ttcAddBusIcon(()=>_ttcAddBusIconOrange(()=>_ttcAddMetroIcon(()=>_ttcAddMetroIconOrange(()=>{
    const iconExpr=['match',['get','mode'],'SUBWAY','ttc-metro','ttc-bus'];
    const iconExprOrange=['match',['get','mode'],'SUBWAY','ttc-metro-orange','ttc-bus-orange'];
    if(!map.getSource('ttc-stops')){
      map.addSource('ttc-stops',{type:'geojson',data:gj});
      if(!map.getSource('ttc-stops-hl')){
        map.addSource('ttc-stops-hl',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      }
      map.addLayer({id:'ttc-stops',type:'symbol',source:'ttc-stops',layout:{
        'icon-image':iconExpr,'icon-size':1.0,'icon-allow-overlap':true,'icon-anchor':'center'
      }});
      // Highlight layer added AFTER stops so it renders on top
      if(!map.getLayer('ttc-stops-hl')){
        map.addLayer({id:'ttc-stops-hl',type:'symbol',source:'ttc-stops-hl',layout:{
          'icon-image':iconExprOrange,'icon-size':1.1,'icon-allow-overlap':true,'icon-anchor':'center'
        }});
      }
      map.on('click','ttc-stops',e=>{
        e.originalEvent._ttcHandled=true; // suppress parcel click
        const f=e.features[0].properties;
        const sw=document.getElementById('acc-transit-sw');
        if(!sw?.classList.contains('on'))return;
        const coords=e.features[0].geometry.coordinates;
        _ttcSelectStop(f.id,f.code,coords[0],coords[1],f.name);
        setTimeout(()=>{
          const card=document.getElementById(`ttc-card-${f.code}`);
          if(card)card.scrollIntoView({block:'nearest',behavior:'smooth'});
        },80);
      });
      map.on('mouseenter','ttc-stops',e=>{
        map.getCanvas().style.cursor='pointer';
        const code=String(e.features[0].properties.code);
        document.querySelectorAll('.ttc-stop-card').forEach(c=>c.classList.remove('map-hover'));
        const card=document.getElementById(`ttc-card-${code}`);
        if(card){card.classList.add('map-hover');card.scrollIntoView({block:'nearest',behavior:'smooth'});}
        const coords=e.features[0].geometry.coordinates;
        const mode=e.features[0].properties.mode||'BUS';
        if(map.getSource('ttc-stops-hl'))
          map.getSource('ttc-stops-hl').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{mode}}]});
      });
      map.on('mouseleave','ttc-stops',()=>{
        map.getCanvas().style.cursor='';
        document.querySelectorAll('.ttc-stop-card').forEach(c=>c.classList.remove('map-hover'));
        if(map.getSource('ttc-stops-hl'))
          map.getSource('ttc-stops-hl').setData(_ttcSelectedStopGeo
            ?{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:_ttcSelectedStopGeo.coords},properties:{mode:_ttcSelectedStopGeo.mode}}]}
            :{type:'FeatureCollection',features:[]});
      });
      // Deselect when clicking anywhere on the map outside a stop
      _ttcMapClickDeselect=e=>{
        if(e.originalEvent?._ttcHandled||!_ttcActiveStop) return;
        _ttcSelectedStopGeo=null;
        _clearBusStopRoute();
        _ttcClearRouteShape();
        _ttcClearPoll();
        _ttcRDState={};
        if(map.getSource('ttc-stops-hl'))
          map.getSource('ttc-stops-hl').setData({type:'FeatureCollection',features:[]});
        document.querySelectorAll('.ttc-stop-card').forEach(c=>c.classList.remove('active'));
      };
      map.on('click',_ttcMapClickDeselect);
    } else {
      map.getSource('ttc-stops').setData(gj);
    }
  }))));
}

function _ttcRemoveFromMap(){
  if(!mapReady)return;
  _ttcSelectedStopGeo=null;
  if(_ttcMapClickDeselect){map.off('click',_ttcMapClickDeselect);_ttcMapClickDeselect=null;}
  _ttcClearRouteShape();
  ['ttc-stops-hist','ttc-stops-hist-ring','ttc-stops-hist-hover','hist-trace','ttc-stops','ttc-stops-hl','ttc-route-shape','ttc-route-shape-halo','ttc-vehicles-dot','ttc-vehicles-pulse'].forEach(id=>{try{if(map.getLayer(id))map.removeLayer(id);}catch(_){}});
  ['hist-trace','ttc-stops','ttc-stops-hl','ttc-route-shape','ttc-vehicles'].forEach(id=>{try{if(map.getSource(id))map.removeSource(id);}catch(_){}});
}

// ── Route polyline display ──────────────────────────────────────────
let _ttcActiveRouteShape=null;

function _decodePolyline(enc){
  const coords=[];let i=0,lat=0,lng=0;
  while(i<enc.length){
    let b,shift=0,result=0;
    do{b=enc.charCodeAt(i++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lat+=(result&1)?~(result>>1):(result>>1);
    shift=0;result=0;
    do{b=enc.charCodeAt(i++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lng+=(result&1)?~(result>>1):(result>>1);
    coords.push([lng/1e5,lat/1e5]);
  }
  return coords;
}

function _ttcEnsureRouteLayer(){
  if(!mapReady||map.getSource('ttc-route-shape')) return;
  map.addSource('ttc-route-shape',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'ttc-route-shape-halo',type:'line',source:'ttc-route-shape',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':['get','color'],'line-width':16,'line-opacity':0.25,'line-blur':4}
  });
  map.addLayer({id:'ttc-route-shape',type:'line',source:'ttc-route-shape',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':['get','color'],'line-width':3.5,'line-opacity':0.9}
  });
}

async function _ttcShowRouteShape(routeId,routeColor){
  if(!mapReady||!routeId) return;
  _ttcEnsureRouteLayer();
  if(_ttcActiveRouteShape===routeId){_ttcClearRouteShape();return;}
  _ttcActiveRouteShape=routeId;
  _ttcActiveRouteColor=routeColor||'';
  const color=routeColor?`#${routeColor}`:'#818cf8';
  try{
    const res=await fetch(`${PROXY}/ttc/routes/${encodeURIComponent(routeId)}/polyline`);
    if(!res.ok) return;
    const data=await res.json();
    const encoded=typeof data==='string'?data:data.encodedValue||data.encoded||'';
    if(!encoded) return;
    const coords=_decodePolyline(encoded);
    if(coords.length<2) return;
    const src=map.getSource('ttc-route-shape');
    if(src) src.setData({type:'FeatureCollection',features:[{
      type:'Feature',
      geometry:{type:'LineString',coordinates:coords},
      properties:{color}
    }]});
    const lngs=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
    map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:60,maxZoom:15,duration:800});
    _ttcStartVehiclePolling(routeId, routeColor);
  }catch(e){console.warn('Route polyline err:',e);}
}

function _ttcClearRouteShape(){
  _ttcActiveRouteShape=null;
  _ttcActiveRouteColor='';
  _ttcStopVehiclePolling();
  if(!mapReady) return;
  const src=map.getSource('ttc-route-shape');
  if(src) src.setData({type:'FeatureCollection',features:[]});
}

function _ttcEnsureVehicleLayer(){
  if(!mapReady||map.getSource('ttc-vehicles')) return;
  map.addSource('ttc-vehicles',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'ttc-vehicles-pulse',type:'circle',source:'ttc-vehicles',paint:{
    'circle-radius':10,'circle-color':'#ffffff','circle-opacity':0.25,'circle-stroke-width':0
  }});
  map.addLayer({id:'ttc-vehicles-dot',type:'circle',source:'ttc-vehicles',paint:{
    'circle-radius':6,'circle-color':'#ffffff','circle-opacity':1,'circle-stroke-width':0
  }});
}

async function _ttcFetchVehicles(routeId){
  try{
    // Resolve patternSuffixes once per route (cached)
    if(!_ttcRoutePatterns[routeId]){
      const rRes=await fetch(`${PROXY}/ttc/v3/routes/${encodeURIComponent(routeId)}`);
      if(!rRes.ok){_ttcVehiclesSupported=false;return;}
      const rData=await rRes.json();
      const ps=(rData.patterns||[]).map(p=>p.patternSuffix).filter(Boolean);
      if(!ps.length) return;
      _ttcRoutePatterns[routeId]=ps;
    }
    const suffixes=_ttcRoutePatterns[routeId].join(',');
    const res=await fetch(`${PROXY}/ttc/v3/routes/${encodeURIComponent(routeId)}/positions?patternSuffixes=${encodeURIComponent(suffixes)}`);
    if(!res.ok) return;
    const data=await res.json();
    // Response is keyed by patternSuffix → flatten all directions
    const vehicles=Object.values(data).flat();
    const src=map.getSource('ttc-vehicles');
    if(!src) return;
    src.setData({type:'FeatureCollection',features:vehicles
      .filter(v=>v.lat&&v.lon)
      .map(v=>({type:'Feature',
        geometry:{type:'Point',coordinates:[v.lon,v.lat]},
        properties:{heading:v.heading||0}}))
    });
  }catch(e){console.warn('[TTC vehicles] error:',e);}
}

let _ttcVehiclesSupported = true;
let _ttcRoutePatterns = {}; // cache: routeId → patternSuffix[]

function _ttcStartVehiclePolling(routeId, routeColor){
  _ttcVehiclesSupported=true;
  _ttcStopVehiclePolling();
  _ttcEnsureVehicleLayer();
  if(mapReady){
    try{map.setPaintProperty('ttc-vehicles-dot','circle-color','#ffffff');}catch(_){}
    try{map.setPaintProperty('ttc-vehicles-pulse','circle-color','#ffffff');}catch(_){}
  }
  _ttcFetchVehicles(routeId);
  _ttcVehicleTimer=setInterval(()=>_ttcFetchVehicles(routeId),15000);
  _ttcVehiclePulsePhase=0;
  _ttcVehiclePulseTimer=setInterval(()=>{
    if(!mapReady||!map.getLayer('ttc-vehicles-pulse')) return;
    _ttcVehiclePulsePhase=(_ttcVehiclePulsePhase+5)%360;
    const s=(1-Math.cos(_ttcVehiclePulsePhase*Math.PI/180))/2;
    try{
      map.setPaintProperty('ttc-vehicles-pulse','circle-radius',7+9*s);
      map.setPaintProperty('ttc-vehicles-pulse','circle-opacity',0.3*(1-s));
    }catch(_){}
  },50);
}

function _ttcStopVehiclePolling(){
  if(_ttcVehicleTimer){clearInterval(_ttcVehicleTimer);_ttcVehicleTimer=null;}
  if(_ttcVehiclePulseTimer){clearInterval(_ttcVehiclePulseTimer);_ttcVehiclePulseTimer=null;}
  if(mapReady){
    const src=map.getSource('ttc-vehicles');
    if(src) try{src.setData({type:'FeatureCollection',features:[]});}catch(_){}
  }
}


function _clearLineProfile(){
  document.getElementById('line-profile-panel').style.display='none';
  _profilePts=null;_profileTransect=null;
  stopProfileDrawing(false);
  if(mapReady){
    try{map.off('mousemove','profile-line',_onMapProfileHover);}catch(_){}
    try{map.off('mouseleave','profile-line',_onProfileHoverEnd);}catch(_){}
    ['profile-label','profile-pts','profile-line'].forEach(id=>{try{if(map.getLayer(id))map.removeLayer(id);}catch(_){}});
    try{if(map.getSource('profile-line'))map.removeSource('profile-line');}catch(_){}
    try{if(map.getSource('profile-cursor'))map.getSource('profile-cursor').setData({type:'FeatureCollection',features:[]});}catch(_){}
  }
}

function _applyProfileFrac(frac){
  if(!_profileTransect||!_profilePts)return;
  const{start,end,totalDist,pL,iW,pT,iH,emin,erange}=_profileTransect;
  const targetDist=frac*totalDist;
  let nearest=_profilePts[0],minDiff=Math.abs(_profilePts[0].dist-targetDist);
  for(const p of _profilePts){const d=Math.abs(p.dist-targetDist);if(d<minDiff){minDiff=d;nearest=p;}}
  const cx=pL+frac*iW;
  const cy=pT+iH-((nearest.elev-emin)/(erange||1))*iH;
  const cursor=document.getElementById("pcursor");if(!cursor)return;
  cursor.style.display="";
  document.getElementById("pcur-vline").setAttribute("x1",cx.toFixed(1));
  document.getElementById("pcur-vline").setAttribute("x2",cx.toFixed(1));
  document.getElementById("pcur-dot").setAttribute("cx",cx.toFixed(1));
  document.getElementById("pcur-dot").setAttribute("cy",cy.toFixed(1));
  const lbW=36,lbX=frac>0.8?cx-lbW-2:cx+2;
  document.getElementById("pcur-bg").setAttribute("x",lbX.toFixed(1));
  document.getElementById("pcur-txt").setAttribute("x",(lbX+lbW/2).toFixed(1));
  document.getElementById("pcur-txt").textContent=`${Math.round(nearest.elev)} m`;
  const lng=(nearest.lng!==undefined)?nearest.lng:start[0]+(end[0]-start[0])*frac;
  const lat=(nearest.lat!==undefined)?nearest.lat:start[1]+(end[1]-start[1])*frac;
  _updateProfileMapCursor(lng,lat);
}

function _onProfileHover(e){
  if(!_profileTransect)return;
  const{pL,iW,W}=_profileTransect;
  const svg=e.target.closest("svg");if(!svg)return;
  const rect=svg.getBoundingClientRect();
  const svgX=((e.clientX-rect.left)/rect.width)*W;
  _applyProfileFrac(Math.max(0,Math.min(1,(svgX-pL)/iW)));
}

function _onMapProfileHover(e){
  if(!_profileTransect)return;
  const{coords,totalDist}=_profileTransect;
  const{lng,lat}=e.lngLat;
  // Project hover point onto each segment and find closest point
  let bestDist2=Infinity,bestFracAlongTotal=0,accLen=0;
  const segs=coords?coords.length-1:0;
  for(let s=0;s<segs;s++){
    const ax=coords[s][0],ay=coords[s][1],bx=coords[s+1][0],by=coords[s+1][1];
    const dx=bx-ax,dy=by-ay,segLen2=dx*dx+dy*dy;
    const t=segLen2===0?0:Math.max(0,Math.min(1,((lng-ax)*dx+(lat-ay)*dy)/segLen2));
    const px=ax+t*dx,py=ay+t*dy;
    const d2=(lng-px)*(lng-px)+(lat-py)*(lat-py);
    const segLenM=_haversineM(ax,ay,bx,by);
    if(d2<bestDist2){bestDist2=d2;bestFracAlongTotal=(accLen+t*segLenM)/totalDist;}
    accLen+=segLenM;
  }
  _applyProfileFrac(Math.max(0,Math.min(1,bestFracAlongTotal)));
}

function _onProfileHoverEnd(){
  const cursor=document.getElementById("pcursor");if(cursor)cursor.style.display="none";
  if(mapReady){
    try{if(map.getSource("profile-cursor"))map.getSource("profile-cursor").setData({type:"FeatureCollection",features:[]});}catch{}
  }
}

function _updateProfileMapCursor(lng,lat){
  if(!mapReady)return;
  const gj={type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"Point",coordinates:[lng,lat]},properties:{}}]};
  if(!map.getSource("profile-cursor")){
    map.addSource("profile-cursor",{type:"geojson",data:gj});
    map.addLayer({id:"profile-cursor",type:"circle",source:"profile-cursor",paint:{"circle-radius":5,"circle-color":"white","circle-stroke-width":2,"circle-stroke-color":"#818cf8","circle-opacity":0.9}});
  }else{map.getSource("profile-cursor").setData(gj);}
}


// ── Free analysis ─────────────────────────────────────────────────────────────
async function runAnalysis(){
  if(!parcelCentroid)return;
  const tr=t();const btn=document.getElementById("analyse-btn");
  btn.disabled=true;btn.style.opacity="";
  btn.innerHTML=`<span class="spinner"></span><span class="btn-step">${tr.analysingIso}</span>`;
  setStatus("","","status-analysis");
  try{
    const isoData=await fetchIsochrone(parcelCentroid[0],parcelCentroid[1],10);
    const isoFeat=isoData.features?.[0];
    if(!isoFeat)throw new Error("no_isochrone");
    _isoData=isoData;
    map.getSource("isochrone").setData(isoData);
    const isoCoords=isoFeat.geometry.coordinates[0];
    const iLngs=isoCoords.map(c=>c[0]),iLats=isoCoords.map(c=>c[1]);
    map.fitBounds([[Math.min(...iLngs),Math.min(...iLats)],[Math.max(...iLngs),Math.max(...iLats)]],{padding:60,duration:800});
    btn.innerHTML=`<span class="spinner"></span><span class="btn-step">${tr.analysingOsm}</span>`;
    const counts=await fetchAllCategories(isoBbox(isoFeat));
    renderScore(counts);
    logFeatureUse("free_analysis").catch(()=>{});
    setStatus("","","status-analysis");
    btn.innerHTML=`<span style="font-size:14px">✓</span><span>${tr.done}</span>`;
    btn.style.opacity="0.5";
    // report export now lives in the left-rail menu
  }catch(e){
    console.error("Analysis:",e);
    setStatus(tr.analysisError,"error","status-analysis");
    btn.disabled=false;btn.style.opacity="";
    const _abL=document.getElementById("analyse-btn-label");if(_abL)_abL.textContent=tr.analyseBtn;
    const _fbL=document.getElementById("free-badge");if(_fbL)_fbL.textContent=tr.freeBadge;
  }
}


async function fetchTreeCanopy(geojson){
  let allCoords=[];
  if(geojson.type==="Polygon")allCoords=geojson.coordinates.flat();
  else if(geojson.type==="MultiPolygon")allCoords=geojson.coordinates.flat(3);
  else allCoords=geojson.coordinates;
  const lngs=allCoords.map(c=>c[0]);const lats=allCoords.map(c=>c[1]);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const tileLat=Math.floor(minLat/3)*3;
  const tileLng=Math.floor(minLng/3)*3;
  const latStr=(tileLat>=0?"N":"S")+String(Math.abs(tileLat)).padStart(2,"0");
  const lngStr=(tileLng>=0?"E":"W")+String(Math.abs(tileLng)).padStart(3,"0");
  const url=`https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${latStr}${lngStr}_Map.tif`;
  const proxyUrl=`${PROXY}/worldcover?url=${encodeURIComponent(url)}`;_rptRasterSrc.canopy_worldcover=proxyUrl;
  const tiff=await GeoTIFF.fromUrl(proxyUrl,{allowFullFile:false});
  const image=await tiff.getImage();
  const bbox=image.getBoundingBox();
  const width=image.getWidth();const height=image.getHeight();
  const pixW=(bbox[2]-bbox[0])/width;const pixH=(bbox[3]-bbox[1])/height;
  const x1=Math.max(0,Math.floor((minLng-bbox[0])/pixW));
  const y1=Math.max(0,Math.floor((bbox[3]-maxLat)/pixH));
  const x2=Math.min(width-1,Math.ceil((maxLng-bbox[0])/pixW));
  const y2=Math.min(height-1,Math.ceil((bbox[3]-minLat)/pixH));
  const raster=await image.readRasters({window:[x1,y1,x2,y2]});
  const pixels=raster[0];
  if(!pixels.length)throw new Error("no_pixels");
  const winW=x2-x1, winH=y2-y1;
  const originX=bbox[0]+x1*pixW;
  const originY=bbox[3]-y1*pixH;
  let treePx=0,totalPx=0;const classCounts={};
  for(let py=0;py<winH;py++){
    for(let px=0;px<winW;px++){
      const lng=originX+(px+0.5)*pixW;
      const lat=originY-(py+0.5)*pixH;
      if(!pointInPolygon(lng,lat,geojson))continue;
      totalPx++;
      const cls=pixels[py*winW+px];
      classCounts[cls]=(classCounts[cls]||0)+1;
      if(cls===10)treePx++;
    }
  }
  const pct=totalPx>0?Math.round((treePx/totalPx)*100):0;
  return {pct, classCounts, raw:{pixels,width:winW,height:winH,originX,originY,resX:pixW,resY:pixH}};
}

async function fetchLST(geojson) {
  const LST_URL = "https://pub-9071f31b4edc4a15ba28c48f949017fc.r2.dev/lst_tbilisi_cog.tif";  
  const proxyUrl = `${PROXY}/lst?url=${encodeURIComponent(LST_URL)}`;_rptRasterSrc.lst=proxyUrl;

  let allCoords = [];
  if(geojson.type==="Polygon") allCoords=geojson.coordinates.flat();
  else if(geojson.type==="MultiPolygon") allCoords=geojson.coordinates.flat(3);
  else allCoords=geojson.coordinates;

  const lngs=allCoords.map(c=>c[0]), lats=allCoords.map(c=>c[1]);
  const minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
  const minLat=Math.min(...lats), maxLat=Math.max(...lats);

  const tiff = await GeoTIFF.fromUrl(proxyUrl, {allowFullFile:false});
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox(); // [minX,minY,maxX,maxY] in WGS84
  const width = image.getWidth(), height = image.getHeight();
  const pixW = (bbox[2]-bbox[0])/width, pixH = (bbox[3]-bbox[1])/height;

  const x1 = Math.max(0, Math.floor((minLng-bbox[0])/pixW));
  const y1 = Math.max(0, Math.floor((bbox[3]-maxLat)/pixH));
  const x2 = Math.min(width-1,  Math.ceil((maxLng-bbox[0])/pixW));
  const y2 = Math.min(height-1, Math.ceil((bbox[3]-minLat)/pixH));

  const raster = await image.readRasters({window:[x1,y1,x2,y2]});
  const pixels = raster[0];
  const nodata = -3.4028235e+38;
  const lstWinW=x2-x1, lstWinH=y2-y1;
  const lstOriginX=bbox[0]+x1*pixW, lstOriginY=bbox[3]-y1*pixH;
  let lstSum=0,lstCount=0;
  for(let py=0;py<lstWinH;py++){
    for(let px=0;px<lstWinW;px++){
      const v=pixels[py*lstWinW+px];
      if(!isFinite(v)||v<-200||v>100)continue;
      const lng=lstOriginX+(px+0.5)*pixW;
      const lat=lstOriginY-(py+0.5)*pixH;
      if(!pointInPolygon(lng,lat,geojson))continue;
      lstSum+=v;lstCount++;
    }
  }
  if(!lstCount)throw new Error("no_data");
  const mean=lstSum/lstCount;
  return {mean:Math.round(mean*10)/10,raw:{pixels,width:lstWinW,height:lstWinH,originX:lstOriginX,originY:lstOriginY,resX:pixW,resY:pixH,nodata}};
}

function renderCanopyOverlay(raw,geojson){
  const {pixels,width,height,originX,originY,resX,resY}=raw;
  // Build mask at source-pixel resolution — only tree pixels inside the polygon
  const mask=new Uint8Array(width*height);
  let treePainted=0;
  for(let py=0;py<height;py++){
    for(let px=0;px<width;px++){
      if(pixels[py*width+px]!==10)continue;
      const lng=originX+(px+0.5)*resX;
      const lat=originY-(py+0.5)*resY;
      if(!pointInPolygon(lng,lat,geojson))continue;
      mask[py*width+px]=1;
      treePainted++;
    }
  }
  if(!treePainted)return;
  const TARGET=512;
  const canvasW=TARGET;
  const canvasH=Math.max(1,Math.round(TARGET*(height/width)));
  const canvas=document.createElement("canvas");
  canvas.width=canvasW;canvas.height=canvasH;
  const ctx=canvas.getContext("2d");
  const imgData=ctx.createImageData(canvasW,canvasH);
  const d=imgData.data;
  for(let cy=0;cy<canvasH;cy++){
    for(let cx=0;cx<canvasW;cx++){
      const px=Math.min(width-1,Math.round((cx/(canvasW-1||1))*(width-1)));
      const py=Math.min(height-1,Math.round((cy/(canvasH-1||1))*(height-1)));
      if(mask[py*width+px]){
        const i=cy*canvasW+cx;
        d[i*4]=34;d[i*4+1]=197;d[i*4+2]=94;d[i*4+3]=200;
      }
    }
  }
  if(!treePainted)return;
  ctx.putImageData(imgData,0,0);
  const dataUrl=canvas.toDataURL("image/png");
  const nw=[originX,originY];
  const ne=[originX+width*resX,originY];
  const se=[originX+width*resX,originY-height*resY];
  const sw=[originX,originY-height*resY];
  if(map.getLayer("canopy-overlay-layer"))map.removeLayer("canopy-overlay-layer");
  if(map.getSource("canopy-overlay"))map.removeSource("canopy-overlay");
  map.addSource("canopy-overlay",{type:"image",url:dataUrl,coordinates:[nw,ne,se,sw]});
  map.addLayer({id:"canopy-overlay-layer",type:"raster",source:"canopy-overlay",paint:{"raster-opacity":0.82}});
  _canopyOverlayCache={dataUrl,nw,ne,se,sw};
}

function clearCanopyOverlay(){
  _canopyOverlayCache=null;
  if(!mapReady)return;
  try{if(map.getLayer("canopy-overlay-layer"))map.removeLayer("canopy-overlay-layer");}catch(_){}
  try{if(map.getSource("canopy-overlay"))map.removeSource("canopy-overlay");}catch(_){}
}

function renderLSTOverlay(raw,geojson){
  const{pixels,width,height,originX,originY,resX,resY,nodata}=raw;
  const inPoly=new Uint8Array(width*height);
  let painted=0;
  for(let py=0;py<height;py++){for(let px=0;px<width;px++){
    const v=pixels[py*width+px];
    if(v<=nodata+1)continue;
    const lng=originX+(px+0.5)*resX,lat=originY-(py+0.5)*resY;
    if(!pointInPolygon(lng,lat,geojson))continue;
    inPoly[py*width+px]=1;painted++;
  }}
  if(!painted)return;
  const tMin=20,tMax=45;
  const ramp=[[0,[96,165,250]],[0.3,[52,211,153]],[0.5,[251,191,36]],[0.75,[249,115,22]],[1.0,[239,68,68]]];
  function tempToRGB(t){
    const n=Math.max(0,Math.min(1,(t-tMin)/(tMax-tMin)));
    for(let i=1;i<ramp.length;i++){
      if(n<=ramp[i][0]){const lo=ramp[i-1],hi=ramp[i],f=(n-lo[0])/(hi[0]-lo[0]);return lo[1].map((c,j)=>Math.round(c+f*(hi[1][j]-c)));}
    }
    return ramp[ramp.length-1][1];
  }
  const TARGET=512;
  const canvasW=TARGET,canvasH=Math.max(1,Math.round(TARGET*(height/width)));
  const canvas=document.createElement("canvas");canvas.width=canvasW;canvas.height=canvasH;
  const ctx=canvas.getContext("2d");
  const imgData=ctx.createImageData(canvasW,canvasH);const d=imgData.data;
  for(let cy=0;cy<canvasH;cy++){for(let cx=0;cx<canvasW;cx++){
    const px=Math.min(width-1,Math.round((cx/(canvasW-1||1))*(width-1)));
    const py=Math.min(height-1,Math.round((cy/(canvasH-1||1))*(height-1)));
    if(!inPoly[py*width+px])continue;
    const v=pixels[py*width+px];
    const[r,g,b]=tempToRGB(v);
    const idx=cy*canvasW+cx;
    d[idx*4]=r;d[idx*4+1]=g;d[idx*4+2]=b;d[idx*4+3]=180;
  }}
  ctx.putImageData(imgData,0,0);
  const dataUrl=canvas.toDataURL("image/png");
  const nw=[originX,originY],ne=[originX+width*resX,originY];
  const se=[originX+width*resX,originY-height*resY],sw=[originX,originY-height*resY];
  if(map.getLayer("lst-overlay-layer"))map.removeLayer("lst-overlay-layer");
  if(map.getSource("lst-overlay"))map.removeSource("lst-overlay");
  map.addSource("lst-overlay",{type:"image",url:dataUrl,coordinates:[nw,ne,se,sw]});
  map.addLayer({id:"lst-overlay-layer",type:"raster",source:"lst-overlay",paint:{"raster-opacity":0.75}});
  _lstOverlayCache={dataUrl,nw,ne,se,sw};
}

function clearLSTOverlay(){
  _lstOverlayCache=null;
  if(!mapReady)return;
  try{if(map.getLayer("lst-overlay-layer"))map.removeLayer("lst-overlay-layer");}catch(_){}
  try{if(map.getSource("lst-overlay"))map.removeSource("lst-overlay");}catch(_){}
}

function onClimateAnalysisClick(){
  if(!_currentParcelGeoJSON)return;
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(_currentParcelAreaM2!==null&&_currentParcelAreaM2<1000){setStatus(lang==="ka"?"ანალიზისთვის საჭიროა მინ. 1000 კვ.მ.":"Parcel too small — min. 1000 m² required","","status-analysis");return;}
  runClimateAnalysis(_currentParcelGeoJSON);
}

async function runClimateAnalysis(geojson){
  const proCard=document.getElementById("pro-analysis-card");
  if(proCard)proCard.style.display="block";
  document.getElementById("pro-cat-climate")?.classList.add("open");
  const content=document.getElementById("pro-cat-climate-content");
  if(!content)return;
  content.innerHTML=`<div style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.5);font-size:0.78rem"><span class="spinner"></span><span>${lang==="ka"?"მონაცემები იტვირთება…":"Loading climate data…"}</span></div>`;

  if(!window.GeoTIFF){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }

  const[canopyResult,lstResult]=await Promise.allSettled([
    fetchTreeCanopy(geojson),
    fetchLST(geojson)
  ]);

  _climateData={
    canopyPct:canopyResult.status==="fulfilled"?canopyResult.value.pct:null,
    lst:lstResult.status==="fulfilled"?lstResult.value.mean:null
  };

  let html="";

  if(canopyResult.status==="fulfilled"){
    const pct=canopyResult.value.pct;
    const color=pct>40?"#22c55e":pct>20?"#84cc16":pct>10?"#eab308":"#f97316";
    html+=`<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:0.78rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px">${lang==="ka"?"ხის ვარჯის დაფარვა":"Tree Canopy Coverage"}</span>
        <span style="font-size:1.1rem;font-weight:700;color:${color}">${pct}%</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden">
        <div id="canopy-bar" style="height:100%;width:0%;background:${color};border-radius:4px;transition:width 0.9s cubic-bezier(0.23,1,0.32,1)"></div>
      </div>
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:4px">ESA WorldCover 2021 · 10m</div>
    </div>`;
  }else{
    html+=`<div style="font-size:0.75rem;color:rgba(255,255,255,0.25);margin-bottom:12px">${lang==="ka"?"ვარჯის მონაცემები მიუწვდომელია":"Canopy data unavailable"}</div>`;
  }

  if(canopyResult.status==="fulfilled"&&lstResult.status==="fulfilled"){
    html+=`<div style="height:1px;background:rgba(255,255,255,0.07);margin-bottom:12px"></div>`;
  }

  if(lstResult.status==="fulfilled"){
    const lst=lstResult.value.mean;
    const lstColor=lst>40?"#ef4444":lst>35?"#f97316":lst>28?"#eab308":"#22c55e";
    // Scale 10–50°C to 0–100 for ring
    const pct=Math.min(100,Math.max(0,((lst-10)/40)*100));
    const circ=69.12; // 2π × 11
    const offset=circ*(1-pct/100);
    html+=`<div>
      <div style="display:flex;align-items:center;gap:16px">
        <svg width="70" height="70" viewBox="0 0 70 70" style="flex-shrink:0">
          <circle cx="35" cy="35" r="27" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
          <circle cx="35" cy="35" r="27" fill="none" stroke="${lstColor}" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="169.65" stroke-dashoffset="169.65"
            transform="rotate(-90 35 35)"
            style="transition:stroke-dashoffset 1s cubic-bezier(0.23,1,0.32,1)"
            id="lst-ring"/>
          <text x="35" y="38" text-anchor="middle" fill="${lstColor}" font-size="13" font-weight="700" font-family="-apple-system,sans-serif">${lst}°C</text>
        </svg>
        <div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;margin-bottom:2px">
            ${lang==="ka"?"ზედაპირის ტემპ. (ზაფხული)":"Surface Temp. (Summer)"}
          </div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.25)">Landsat 8 · 30m · 2024</div>
        </div>
      </div>
    </div>`;
  }else{
    html+=`<div style="font-size:0.75rem;color:rgba(255,255,255,0.25)">${lang==="ka"?"ტემპერატურის მონაცემები მიუწვდომელია":"LST data unavailable"}</div>`;
  }

  if(canopyResult.status==="fulfilled"||lstResult.status==="fulfilled"){
    html+=`<div style="height:1px;background:rgba(255,255,255,0.07);margin:8px 0 5px"></div>`;
    if(canopyResult.status==="fulfilled")html+=`<div class="lp-row" style="padding:3px 0" onclick="toggleCanopyLayer()"><span class="lp-row-name" style="font-size:0.69rem">${lang==="ka"?"ხის ვარჯი":"Tree Canopy"}</span><div class="lp-sw" id="lp-canopy-sw"></div></div>`;
    if(lstResult.status==="fulfilled")html+=`<div class="lp-row" style="padding:3px 0" onclick="toggleLSTLayer()"><span class="lp-row-name" style="font-size:0.69rem">${lang==="ka"?"ზედ. ტემპ.":"Surface Temp."}</span><div class="lp-sw" id="lp-lst-sw"></div></div>`;
  }
  content.innerHTML=html;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const cb=document.getElementById("canopy-bar");
    if(cb&&canopyResult.status==="fulfilled")cb.style.width=canopyResult.value.pct+"%";
    const ring=document.getElementById("lst-ring");
    if(ring&&lstResult.status==="fulfilled"){
      const pct=Math.min(100,Math.max(0,((lstResult.value.mean-10)/40)*100));
      ring.style.strokeDashoffset=169.65*(1-pct/100);
    }
  }));
  _canopyRawData=canopyResult.status==="fulfilled"?canopyResult.value.raw:null;
  _lstRawData=lstResult.status==="fulfilled"?lstResult.value.raw:null;
  document.getElementById("climate-sw")?.classList.add("on");
}

async function toggleCanopyLayer(){
  const sw=document.getElementById("lp-canopy-sw");
  const v=document.getElementById("canopy-val");
  const chart=document.getElementById("canopy-chart");
  if(sw&&sw.classList.contains("on")){
    sw.classList.remove("on");
    clearCanopyOverlay();
    if(v)v.textContent="";
    if(chart){chart.style.display="none";chart.innerHTML="";}
    return;
  }
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON||!mapReady)return;
  if(sw)sw.classList.add("on");
  function _showCanopyChart(pct){
    const color=pct>40?"#22c55e":pct>20?"#84cc16":pct>10?"#eab308":"#f97316";
    if(v)v.innerHTML=`<span style="color:${color};font-weight:600">${pct}%</span>`;
    if(chart){
      chart.style.display="block";
      chart.innerHTML=`<div style="height:6px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden"><div id="canopy-bar" style="height:100%;width:0%;background:${color};border-radius:4px;transition:width 0.9s cubic-bezier(0.23,1,0.32,1)"></div></div><div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:4px">ESA WorldCover 2021 · 10m</div>`;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{const b=document.getElementById("canopy-bar");if(b)b.style.width=pct+"%";}));
    }
  }
  if(_canopyRawData&&_canopyPct!==null){
    renderCanopyOverlay(_canopyRawData,_currentParcelGeoJSON);
    _showCanopyChart(_canopyPct);
    return;
  }
  if(v)v.innerHTML=`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>`;
  if(!window.GeoTIFF){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }
  try{
    const result=await fetchTreeCanopy(_currentParcelGeoJSON);
    _canopyRawData=result.raw;
    _canopyPct=result.pct;
    if(_isDrawnArea)_drawnAreaProps.tree_canopy_pct=_canopyPct;
    renderCanopyOverlay(_canopyRawData,_currentParcelGeoJSON);
    _showCanopyChart(_canopyPct);
  }catch(e){
    console.warn(e);
    if(sw)sw.classList.remove("on");
    if(v)v.textContent="–";
  }
}

async function toggleLSTLayer(){
  const sw=document.getElementById("lp-lst-sw");
  const v=document.getElementById("lst-val");
  const chart=document.getElementById("lst-chart");
  if(sw&&sw.classList.contains("on")){
    sw.classList.remove("on");
    clearLSTOverlay();
    if(v)v.textContent="";
    if(chart){chart.style.display="none";chart.innerHTML="";}
    return;
  }
  if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
  if(!_currentParcelGeoJSON||!mapReady)return;
  if(_currentParcelAreaM2!==null&&_currentParcelAreaM2<1000){setStatus(lang==="ka"?"ანალიზისთვის საჭიროა მინ. 1000 კვ.მ.":"Parcel too small — min. 1000 m² required","","status-analysis");return;}
  if(sw)sw.classList.add("on");
  function _showLSTChart(lst){
    const lstColor=lst>40?"#ef4444":lst>35?"#f97316":lst>28?"#eab308":"#22c55e";
    if(v)v.innerHTML=`<span style="color:${lstColor};font-weight:600">${lst}°C</span>`;
    if(chart){
      chart.style.display="block";
      chart.innerHTML=`<div style="display:flex;align-items:center;gap:16px"><svg width="70" height="70" viewBox="0 0 70 70" style="flex-shrink:0"><circle cx="35" cy="35" r="27" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/><circle cx="35" cy="35" r="27" fill="none" stroke="${lstColor}" stroke-width="7" stroke-linecap="round" stroke-dasharray="169.65" stroke-dashoffset="169.65" transform="rotate(-90 35 35)" style="transition:stroke-dashoffset 1s cubic-bezier(0.23,1,0.32,1)" id="lst-ring"/><text x="35" y="38" text-anchor="middle" fill="${lstColor}" font-size="13" font-weight="700" font-family="-apple-system,sans-serif">${lst}°C</text></svg><div><div style="font-size:0.78rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;margin-bottom:2px">${lang==="ka"?"ზედაპირის ტემპ. (ზაფხული)":"Surface Temp. (Summer)"}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.25)">Landsat 8 · 30m · 2024</div></div></div>`;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{const ring=document.getElementById("lst-ring");if(ring){const pct=Math.min(100,Math.max(0,((lst-10)/40)*100));ring.style.strokeDashoffset=169.65*(1-pct/100);}}));
    }
  }
  if(_lstRawData&&_lstMean!==null){
    renderLSTOverlay(_lstRawData,_currentParcelGeoJSON);
    _showLSTChart(_lstMean);
    return;
  }
  if(v)v.innerHTML=`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>`;
  if(!window.GeoTIFF){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  }
  try{
    const result=await fetchLST(_currentParcelGeoJSON);
    _lstRawData=result.raw;
    _lstMean=result.mean;
    if(_isDrawnArea)_drawnAreaProps.lst_celsius=Math.round(_lstMean*10)/10;
    renderLSTOverlay(_lstRawData,_currentParcelGeoJSON);
    _showLSTChart(_lstMean);
  }catch(e){
    console.warn(e);
    if(sw)sw.classList.remove("on");
    if(v)v.textContent="–";
  }
}

function showLPAnalysis(){
  ['lp-analysis-sep','lbl-lp-analysis','lp-relief-row','lp-climate-row'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.removeProperty('display');
  });
  renderLPReliefSub();
}

function hideLPAnalysis(){
  ['lp-analysis-sep','lbl-lp-analysis','lp-relief-row','lp-relief-sub','lp-climate-row','lp-climate-sub'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  document.getElementById("relief-sw")?.classList.remove("on");
  document.getElementById("climate-sw")?.classList.remove("on");
}

function renderLPReliefSub(){
  const el=document.getElementById("lp-relief-sub");if(!el)return;
  const tr=t();
  el.innerHTML=['height','slope','aspect'].map(type=>{
    const active=_reliefActiveType===type;
    return`<div class="lp-row lp-sub-item" onclick="runReliefFromLP('${type}')"><span class="lp-row-name">${tr.reliefTypes[type]}</span><div class="lp-sw${active?' on':''}"></div></div>`;
  }).join('');
}

function renderLPClimateSub(){
  const el=document.getElementById("lp-climate-sub");if(!el)return;
  let html='';
  if(_canopyRawData){
    const on=_canopyOverlayCache?'on':'';
    html+=`<div class="lp-row lp-sub-item" onclick="toggleCanopyLayer()"><span class="lp-row-name">${lang==="ka"?"ხის ვარჯი":"Tree Canopy"}</span><div class="lp-sw${on?' '+on:''}" id="lp-canopy-sw"></div></div>`;
  }
  if(_lstRawData){
    const on=_lstOverlayCache?'on':'';
    html+=`<div class="lp-row lp-sub-item" onclick="toggleLSTLayer()"><span class="lp-row-name">${lang==="ka"?"ზედ. ტემპ.":"Surface Temp."}</span><div class="lp-sw${on?' '+on:''}" id="lp-lst-sw"></div></div>`;
  }
  el.innerHTML=html;
}

function toggleLPRelief(){
  const sw=document.getElementById("relief-sw");
  const sub=document.getElementById("lp-relief-sub");
  if(!sw)return;
  const isOn=sw.classList.contains("on");
  if(isOn){
    sw.classList.remove("on");
    if(sub)sub.style.display="none";
    clearReliefOverlay();_reliefActiveType=null;renderLPReliefSub();
  }else{
    sw.classList.add("on");
    if(sub){sub.style.display="block";renderLPReliefSub();}
    runReliefFromLP(_reliefActiveType||'slope');
  }
}

function runReliefFromLP(type){
  const card=document.getElementById("pro-analysis-card");
  if(card&&card.style.display==="none"){
    setupProCard();
  }
  runReliefAnalysis(type);
  // Update active state in sub immediately
  document.querySelectorAll('#lp-relief-sub .lp-row').forEach((r,i)=>{
    const t=['height','slope','aspect'][i];
    r.querySelector('.lp-sw').classList.toggle('on',t===type);
  });
}

function toggleLPClimate(){
  const sw=document.getElementById("climate-sw");
  const sub=document.getElementById("lp-climate-sub");
  if(!sw)return;
  const isOn=sw.classList.contains("on");
  if(isOn){
    sw.classList.remove("on");
    if(sub)sub.style.display="none";
    const _clcc=document.getElementById("pro-cat-climate-content");if(_clcc)_clcc.innerHTML="";
    document.getElementById("pro-cat-climate")?.classList.remove("open");
    clearCanopyOverlay();clearLSTOverlay();
  }else{
    sw.classList.add("on");
    if(!_climateData&&_currentParcelGeoJSON){
      if(!currentUser){openAuthModal('view-signup');sw.classList.remove("on");return;}
      runClimateAnalysis(_currentParcelGeoJSON);
    }else if(_climateData){
      document.getElementById("pro-analysis-card").style.display="block";
      document.getElementById("pro-cat-climate")?.classList.add("open");
      if(sub){sub.style.display="block";renderLPClimateSub();}
    }
  }
}

function toggleClimateAnalysis(){
  const sw=document.getElementById("climate-sw");
  if(!sw)return;
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    clearCanopyOverlay();clearLSTOverlay();
    const cc=document.getElementById("pro-cat-climate-content");if(cc)cc.innerHTML="";
    document.getElementById("pro-cat-climate")?.classList.remove("open");
    _climateData=null;_canopyRawData=null;_lstRawData=null;
  }else{
    if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
    if(_currentParcelGeoJSON)runClimateAnalysis(_currentParcelGeoJSON);
  }
}

function toggleReliefOverlay(){
  const sw=document.getElementById("relief-sw");
  if(!sw)return;
  if(sw.classList.contains("on")){
    sw.classList.remove("on");
    clearReliefOverlay();_reliefActiveType=null;
    document.querySelectorAll(".relief-type-btn").forEach(b=>b.classList.remove("active"));
  }else{
    if(!currentUser||currentUser.plan!=='pro'){openPaywall();return;}
    runReliefAnalysis(_reliefActiveType||"slope");
  }
}

// ── Pro analysis ──────────────────────────────────────────────────────────────
let _isoRegenTimer=null;
let _isoActive=false;
function _scheduleIsoRegen(){clearTimeout(_isoRegenTimer);_isoRegenTimer=setTimeout(()=>runAccessibilityAnalysis(),250);}

function toggleAccIsochrone(){
  _isoActive=!_isoActive;
  const sw=document.getElementById("acc-iso-sw");
  const ctrl=document.getElementById("acc-iso-controls");
  if(sw)sw.classList.toggle("on",_isoActive);
  if(ctrl)ctrl.style.display=_isoActive?"":"none";
  if(_isoActive){
    if(parcelCentroid)runAccessibilityAnalysis();
  }else{
    map.getSource("isochrone")?.setData({type:"FeatureCollection",features:[]});
    _isoData=null;
    _clearBusStopRoute();
    const res=document.getElementById("acc-iso-result");if(res)res.innerHTML="";
  }
}

function setAccMode(mode){
  _accMode=mode;
  document.querySelectorAll(".acc-mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  if(parcelCentroid&&_isoActive)_scheduleIsoRegen();
}

function setAccTime(min){
  _accMinutes=min;
  document.querySelectorAll(".acc-time-btn").forEach(b=>b.classList.toggle("active",b.dataset.min===String(min)));
  if(parcelCentroid&&_isoActive)_scheduleIsoRegen();
}

async function runAccessibilityAnalysis(){
  if(!parcelCentroid)return;
  const isKa=lang==="ka";
  const resultEl=document.getElementById("acc-iso-result");
  if(resultEl)resultEl.innerHTML=`<div style="display:flex;align-items:center;gap:6px;font-size:0.7rem;color:rgba(255,255,255,0.3);padding:5px 0 2px"><span class="spinner" style="border-top-color:#a5b4fc;width:10px;height:10px;border-width:2px"></span>${isKa?"ითვლება…":"Generating…"}</div>`;
  try{
    const isoData=await fetchIsochrone(parcelCentroid[0],parcelCentroid[1],_accMinutes,_accMode);
    const isoFeat=isoData.features?.[0];
    if(!isoFeat)throw new Error("no_isochrone");
    _isoData=isoData;
    map.getSource("isochrone").setData(isoData);
    _clearBusStopRoute();
    // Re-run every active isochrone-dependent layer with the new isochrone
    const _rerunActive=async(swId,fn,pre)=>{
      const s=document.getElementById(swId);
      if(!s||!s.classList.contains('on')) return;
      await fn();       // turn off (cleans up old layers)
      if(pre) pre();    // any pre-actions before re-running
      await fn();       // turn on again with new isochrone
    };
    await Promise.allSettled([
      _rerunActive('acc-schools-sw',  toggleAccSchools,         ()=>{_lastRouteSchool=null;}),
      _rerunActive('acc-kg-sw',       toggleAccKindergartens),
      _rerunActive('acc-parking-sw',  toggleAccParking),
      _rerunActive('acc-mob-sw',      toggleAccMobility),
      _rerunActive('acc-transit-sw',  toggleAccTransit),
    ]);
    const modeIcon={walking:"🚶",cycling:"🚲",driving:"🚗"}[_accMode];
    const modeLabel=t().accModes[_accMode];
    const isoCoords=isoFeat.geometry.coordinates[0];
    const iLngs=isoCoords.map(c=>c[0]),iLats=isoCoords.map(c=>c[1]);
    map.fitBounds([[Math.min(...iLngs),Math.min(...iLats)],[Math.max(...iLngs),Math.max(...iLats)]],{padding:60,duration:800});
    if(resultEl)resultEl.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.35);padding:5px 0 2px">${modeIcon} ${_accMinutes} min · ${modeLabel} — ${isKa?"ზონა გენერირებულია":"Zone generated"}</div>`;
    logFeatureUse("accessibility_isochrone").catch(()=>{});
  }catch(e){
    console.error("Accessibility:",e);
    if(resultEl)resultEl.innerHTML=`<div style="font-size:0.7rem;color:rgba(255,255,255,0.25);padding:4px 0">${isKa?"შეცდომა":"Error generating isochrone"}</div>`;
  }
}



async function runProAnalysis(){
  if(!parcelCentroid)return;
  const tr=t();const btn=document.getElementById("pro-analyse-btn");
  setStatus("","","status-analysis");
  try{
    const isoData=await fetchIsochrone(parcelCentroid[0],parcelCentroid[1],15);
    const isoFeat=isoData.features?.[0];
    if(!isoFeat)throw new Error("no_isochrone");
    _isoData=isoData;
    map.getSource("isochrone").setData(isoData);
    const isoCoords=isoFeat.geometry.coordinates[0];
    const iLngs=isoCoords.map(c=>c[0]),iLats=isoCoords.map(c=>c[1]);
    map.fitBounds([[Math.min(...iLngs),Math.min(...iLats)],[Math.max(...iLngs),Math.max(...iLats)]],{padding:60,duration:800});
    setupProCard();
    const _rerunActive=async(swId,fn,pre)=>{const s=document.getElementById(swId);if(!s||!s.classList.contains('on'))return;await fn();if(pre)pre();await fn();};
    await Promise.allSettled([
      _rerunActive('acc-schools-sw', toggleAccSchools, ()=>{_lastRouteSchool=null;}),
      _rerunActive('acc-kg-sw',      toggleAccKindergartens),
      _rerunActive('acc-parking-sw', toggleAccParking),
      _rerunActive('acc-mob-sw',     toggleAccMobility),
      _rerunActive('acc-transit-sw', toggleAccTransit),
    ]);
    logFeatureUse("pro_analysis").catch(()=>{});
    setStatus("","","status-analysis");
    if(btn){btn.innerHTML=`<span style="font-size:14px">✓</span><span>${tr.proDone}</span>`;btn.style.opacity="0.5";}
    // GeoData export moved to the Generate Report menu (left rail)
  }catch(e){
    console.error("Pro analysis:",e);
    setStatus(tr.analysisError,"error","status-analysis");
    if(btn){btn.disabled=false;btn.style.opacity="";}
  }
}


// ── Search ────────────────────────────────────────────────────────────────────
async function loadParcel(lbl, code){
  // Usage limits
  if(!currentUser){setStatus("","");openAuthModal("view-signup");return;}
  if(currentUser.plan==="pro"){
    if(_proParcelCount>=_parcelLimit()){setStatus("","");_openPaywallLimit(_isTrialing()?"trial_parcel":"pro_parcel");return;}
    _proParcelCount++;_saveProCounts(currentUser.id);
  } else {
    if(_freeParcelCount>=_parcelLimit()){setStatus("","");_openPaywallLimit("free_parcel");return;}
    _freeParcelCount++;_saveFreeCounts(currentUser.id);
  }
  const tr=t();
  try{resetAnalysis();}catch(_){}
  const[hRes,shpRes]=await Promise.all([
    fetch(`https://maps.gov.ge/lr/bo/mg/getinfo.alpha?lbl=${lbl}&lang=ka`),
    fetch(`https://maps.gov.ge/lr/bo/mg/getinfo.alpha?lbl=${lbl}&res=shp&lang=ka`)
  ]);
  if(!hRes.ok||!shpRes.ok)throw new Error("fetch_fail");
  const html=await hRes.text();const shpData=await shpRes.json();
  const shape=shpData.data?.[0]?.shape;const name=shpData.data?.[0]?.name||code;const pid=shpData.data?.[0]?.id;
  if(!shape){console.log("no_shape — full shpData:",JSON.stringify(shpData));throw new Error("no_shape");}
  const attrs=parseAttrs(html);const geojson=wktToGeoJSON(shape);
  _currentParcelGeoJSON=geojson;_dbParcelGeoJSON=geojson;
  const isLine=geojson.type==="LineString"||geojson.type==="MultiLineString";
  {const _r=!isLine&&(geojson.type==="Polygon"?geojson.coordinates[0]:geojson.type==="MultiPolygon"?geojson.coordinates[0][0]:null);_currentParcelAreaM2=_r?Math.round(computePolygonAreaM2(_r)):null;}
  transitionToSide(name);
  if(!mapReady)await new Promise(res=>map.once("load",res));
  map.getSource("parcel").setData({type:"FeatureCollection",features:[{type:"Feature",geometry:geojson,properties:{}}]});
  const flat=geojson.type==="Polygon"?geojson.coordinates.flat():geojson.type==="MultiPolygon"?geojson.coordinates.flat(2):geojson.type==="MultiLineString"?geojson.coordinates.flat():geojson.coordinates;
  const lngs=flat.map(c=>c[0]).filter(Number.isFinite),lats=flat.map(c=>c[1]).filter(Number.isFinite);
  if(lngs.length)map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:80,duration:800,essential:true});
  parcelCentroid=getCentroid(geojson);
  fetchMapillaryImages(parcelCentroid[0],parcelCentroid[1]).then(imgs=>renderMapillaryCard(imgs)).catch(()=>{});
  // restore info rows hidden by drawn-area mode
  const _cardLbl=document.getElementById("lbl-parcel-info");if(_cardLbl)_cardLbl.textContent=tr.parcelInfo;
  document.getElementById("lbl-code").textContent=tr.code||"Cadastral";
  document.getElementById("val-area").closest('.info-row').style.display='';
  ["val-type","val-addr","val-owner"].forEach(id=>{const row=document.getElementById(id)?.closest('.info-row');if(row)row.style.display='';});
  document.getElementById("val-code").textContent=name;
  document.getElementById("lbl-area").textContent=isLine?tr.lineDesc:tr.area;
  document.getElementById("val-area").textContent=isLine?(attrs.objectDesc||"—"):attrs.area?Number(attrs.area).toLocaleString()+" "+tr.sqm:"—";
  document.getElementById("val-type").textContent=isLine?(attrs.objectType||"—"):attrs.parcelType||"—";
  document.getElementById("lbl-addr").textContent=isLine?tr.lineCoverage:tr.addr;
  document.getElementById("val-addr").textContent=isLine?(attrs.coverageZone||attrs.address||"—"):attrs.address||"—";
  document.getElementById("val-owner").textContent=attrs.owners||"—";
  document.getElementById("lbl-ownership").textContent=tr.lineOwnership;
  document.getElementById("val-ownership").textContent=isLine?(attrs.ownershipType||"—"):"—";
  document.getElementById("row-line-ownership").style.display=isLine?"flex":"none";
  document.getElementById("lbl-extra").textContent=tr.lineExtra;
  document.getElementById("val-extra").textContent=isLine?(attrs.extraFeatures||"—"):"—";
  document.getElementById("row-line-extra").style.display=(isLine&&!!attrs.extraFeatures)?"flex":"none";
  document.getElementById("info-card").style.display="none";
  document.getElementById("analyse-btn").style.display="none"; // walkability (free analysis) removed
  _updateMapInfoBadge();
  if(!isLine){
    setupProCard();
  }
  showParcelPopup(parcelCentroid);
  setStatus(tr.found,"success");
  const htmlOwners=parseOwners(attrs.owners);
  // Full parcel record for the report (ownership can be multi-owner)
  window._rptParcel={code:name,area:attrs.area||null,type:attrs.parcelType||attrs.type||null,
    address:attrs.address||null,ownersRaw:attrs.owners||null,owners:htmlOwners,
    ownershipType:attrs.ownershipType||null,registryDocUrl:attrs.registryDocUrl||null,
    regDate:attrs.regDate||null};
  saveToSupabase(pid,name,attrs,shape,htmlOwners.length?htmlOwners:null);
  if(attrs.registryDocUrl){
    fetchOwnerIds(attrs.registryDocUrl)
      .then(pdfOwners=>{ if(pdfOwners.length) saveToSupabase(pid,name,attrs,shape,pdfOwners); })
      .catch(e=>console.warn("fetchOwnerIds failed:",e));
  }
  logSearch(name).then(()=>updateSearchCounter()).catch(()=>{});
  logFeatureUse("map_click").catch(()=>{});
}

function isPersonalNumber(code){ return /^\d{9,11}$/.test(code.trim()); }

function getGeoBounds(geo){
  let c=geo.type==="Polygon"?geo.coordinates.flat():geo.type==="MultiPolygon"?geo.coordinates.flat(2):geo.type==="MultiLineString"?geo.coordinates.flat():geo.coordinates;
  return{lngs:c.map(x=>x[0]),lats:c.map(x=>x[1])};
}

async function searchByOwnerId(ownerId){
  setStatus(lang==="ka"?"მფლობელის ID იძიება…":"Looking up owner ID…","");
  try{
    const ownerRes=await fetch(`${SUPABASE_URL}/rest/v1/owner_ids?owner_id=eq.${encodeURIComponent(ownerId)}&select=cadastral,owner_name`,{headers:{"apikey":SUPABASE_ANON_KEY}});
    const ownerRows=await ownerRes.json();
    if(!Array.isArray(ownerRows)||!ownerRows.length){setStatus(lang==="ka"?"ამ ID-ზე ნაკვეთი ვერ მოიძებნა.":"No parcels found for this ID.","error");return;}
    const cadastrals=[...new Set(ownerRows.map(r=>r.cadastral))];
    const ownerName=ownerRows[0]?.owner_name||"";
    const encoded=cadastrals.map(c=>`"${c}"`).join(",");
    const parcelRes=await fetch(`${SUPABASE_URL}/rest/v1/parcels?cadastral=in.(${encoded})&select=cadastral,shape_wkt,address,area`,{headers:{"apikey":SUPABASE_ANON_KEY}});
    const parcelRows=await parcelRes.json();
    if(!Array.isArray(parcelRows)||!parcelRows.length){setStatus(lang==="ka"?"ნაკვეთების ფორმები ვერ მოიძებნა.":"No parcel shapes found.","error");return;}
    const features=[],validParcels=[];
    for(const p of parcelRows){
      if(!p.shape_wkt)continue;
      try{const geo=wktToGeoJSON(p.shape_wkt);features.push({type:"Feature",geometry:geo,properties:{cadastral:p.cadastral,selected:false}});validParcels.push({cadastral:p.cadastral,address:p.address||"",area:p.area||"",geo});}catch(e){}
    }
    if(!features.length){setStatus(lang==="ka"?"ვალიდური ფორმები ვერ მოიძებნა.":"No valid shapes found.","error");return;}
    _ownerParcels=validParcels;
    if(!mapReady)await new Promise(res=>map.once("load",res));
    map.getSource("parcel").setData({type:"FeatureCollection",features});
    const allLngs=features.flatMap(f=>getGeoBounds(f.geometry).lngs);
    const allLats=features.flatMap(f=>getGeoBounds(f.geometry).lats);
    map.fitBounds([[Math.min(...allLngs),Math.min(...allLats)],[Math.max(...allLngs),Math.max(...allLats)]],{padding:80,duration:800});
    if(!hasSearched){hasSearched=true;document.getElementById("input-side").value=ownerId;document.getElementById("center-search").classList.add("hidden");document.getElementById("map-blur").classList.add("hidden");document.getElementById("side-panel").classList.add("visible");}
    const list=document.getElementById("owner-results-list");
    document.getElementById("lbl-owner-results").textContent=`${lang==="ka"?"ნაპოვნი ნაკვეთები":"Parcels found"}${ownerName?" · "+ownerName:""} · ${features.length}`;
    list.innerHTML=validParcels.map((p,i)=>`<div class="owner-result-item" id="oi-${i}" onclick="zoomToOwnerParcel(${i})"><div><div class="owner-result-code">${p.cadastral}</div><div class="owner-result-meta">${p.address||p.area||"—"}</div></div><span class="owner-result-arrow">›</span></div>`).join("");
    document.getElementById("owner-results-card").style.display="block";
    document.getElementById("info-card").style.display="none";
    setStatus("","");
  }catch(e){console.error(e);setStatus(t().error,"error");}
}

async function searchByOwnerName(query){
  setStatus(lang==="ka"?"მფლობელი იძიება…":"Searching owner name…","");
  const norm=query.replace(/[“”„‘’«»"'\-–—]/g," ").replace(/\s+/g," ").trim();
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/parcels?owners=ilike.*${encodeURIComponent(norm)}*&shape_wkt=not.is.null&select=cadastral,shape_wkt,address,area,owners&limit=500`,{headers:{"apikey":SUPABASE_ANON_KEY,"Prefer":"count=exact"}});
    const rows=await res.json();
    if(!Array.isArray(rows)||!rows.length)return false;
    const features=[],validParcels=[];
    for(const p of rows){
      if(!p.shape_wkt)continue;
      try{const geo=wktToGeoJSON(p.shape_wkt);features.push({type:"Feature",geometry:geo,properties:{cadastral:p.cadastral,selected:false}});validParcels.push({cadastral:p.cadastral,address:p.address||"",area:p.area||"",owners:p.owners||"",geo});}catch(e){}
    }
    if(!features.length)return false;
    _ownerParcels=validParcels;
    if(!mapReady)await new Promise(res=>map.once("load",res));
    map.getSource("parcel").setData({type:"FeatureCollection",features});
    const allLngs=features.flatMap(f=>getGeoBounds(f.geometry).lngs);
    const allLats=features.flatMap(f=>getGeoBounds(f.geometry).lats);
    map.fitBounds([[Math.min(...allLngs),Math.min(...allLats)],[Math.max(...allLngs),Math.max(...allLats)]],{padding:80,duration:800});
    if(!hasSearched){hasSearched=true;document.getElementById("input-side").value=query;document.getElementById("center-search").classList.add("hidden");document.getElementById("map-blur").classList.add("hidden");document.getElementById("side-panel").classList.add("visible");}
    const totalCount=parseInt(res.headers.get("content-range")?.split("/")?.[1])||features.length;
    const overflowMsg=totalCount>features.length?` (${features.length} / ${totalCount})`:`${features.length}`;
    document.getElementById("lbl-owner-results").textContent=`${lang==="ka"?"ნაპოვნი ნაკვეთები":"Parcels found"} · ${query} · ${overflowMsg}`;
    const MAX_VIS=10;
    const renderItem=(p,i)=>`<div class="owner-result-item" id="oi-${i}" onclick="zoomToOwnerParcel(${i})"><div><div class="owner-result-code">${p.cadastral}</div><div class="owner-result-meta">${p.address||p.area||"—"}</div></div><span class="owner-result-arrow">›</span></div>`;
    const visibleHtml=validParcels.slice(0,MAX_VIS).map((p,i)=>renderItem(p,i)).join("");
    const hiddenCount=validParcels.length-MAX_VIS;
    const overflowHtml=hiddenCount>0?`<div id="owner-overflow-toggle" onclick="toggleOwnerOverflow(this)" style="text-align:center;padding:6px 0;font-size:0.7rem;color:rgba(255,255,255,0.35);cursor:pointer;user-select:none">▾ ${lang==="ka"?"კიდევ "+hiddenCount+" ნაკვეთი":"Show "+hiddenCount+" more"}</div><div id="owner-overflow-list" style="display:none">${validParcels.slice(MAX_VIS).map((p,i)=>renderItem(p,i+MAX_VIS)).join("")}</div>`:"";
    document.getElementById("owner-results-list").innerHTML=visibleHtml+overflowHtml;
    document.getElementById("owner-results-card").style.display="block";
    document.getElementById("info-card").style.display="none";
    setStatus("","");
    return true;
  }catch(e){console.error(e);setStatus(t().error,"error");return false;}
}

function toggleOwnerOverflow(btn){
  const list=document.getElementById("owner-overflow-list");
  if(!list||!btn)return;
  const open=list.style.display!=="none";
  list.style.display=open?"none":"block";
  btn.innerHTML=open?`▾ ${lang==="ka"?"კიდევ...":"Show more"}`:'▴ '+(lang==="ka"?"დამალვა":"Show less");
}
function zoomToOwnerParcel(idx){
  const p=_ownerParcels[idx];if(!p)return;
  try{resetAnalysis();}catch(_){}
  const src=map.getSource("parcel")._data;
  src.features=src.features.map(f=>({...f,properties:{...f.properties,selected:f.properties.cadastral===p.cadastral}}));
  map.getSource("parcel").setData(src);
  document.querySelectorAll(".owner-result-item").forEach((el,i)=>el.classList.toggle("active",i===idx));
  const{lngs,lats}=getGeoBounds(p.geo);
  map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:{top:50,bottom:50,left:360,right:50},maxZoom:20,duration:700});
  parcelCentroid=getCentroid(p.geo);
  const isLine=p.geo.type==="LineString"||p.geo.type==="MultiLineString";
  document.getElementById("val-code").textContent=p.cadastral;
  {const _r=!isLine&&p.geo?(p.geo.type==="Polygon"?p.geo.coordinates[0]:p.geo.type==="MultiPolygon"?p.geo.coordinates[0][0]:null):null;_currentParcelAreaM2=_r?Math.round(computePolygonAreaM2(_r)):null;}
  document.getElementById("val-area").textContent=isLine?"—":p.area?Number(p.area).toLocaleString()+" "+t().sqm:"—";
  document.getElementById("val-type").textContent="—";
  document.getElementById("val-addr").textContent=p.address||"—";
  document.getElementById("val-owner").textContent="—";
  document.getElementById("info-card").style.display="none";
  document.getElementById("analyse-btn").style.display="none"; // walkability (free analysis) removed
  _updateMapInfoBadge();
  showParcelPopup(parcelCentroid);
}

async function loadParcelFromDB(cadastral){
  try{resetAnalysis();}catch(_){}
  const{data,error}=await sb.from("parcels").select("*").eq("cadastral",cadastral).maybeSingle();
  if(error||!data||!data.shape_wkt)throw new Error("not_in_db");
  const geojson=wktToGeoJSON(data.shape_wkt);
  _currentParcelGeoJSON=geojson;_dbParcelGeoJSON=geojson;
  const isLine=geojson.type==="LineString"||geojson.type==="MultiLineString";
  {const _r=!isLine&&(geojson.type==="Polygon"?geojson.coordinates[0]:geojson.type==="MultiPolygon"?geojson.coordinates[0][0]:null);_currentParcelAreaM2=_r?Math.round(computePolygonAreaM2(_r)):null;}
  transitionToSide(data.cadastral);
  if(!mapReady)await new Promise(res=>map.once("load",res));
  map.getSource("parcel").setData({type:"FeatureCollection",features:[{type:"Feature",geometry:geojson,properties:{}}]});
  const flat=geojson.type==="Polygon"?geojson.coordinates.flat():geojson.type==="MultiPolygon"?geojson.coordinates.flat(2):geojson.type==="MultiLineString"?geojson.coordinates.flat():geojson.coordinates;
  const lngs=flat.map(c=>c[0]).filter(Number.isFinite),lats=flat.map(c=>c[1]).filter(Number.isFinite);
  if(lngs.length)map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:80,duration:800,essential:true});
  parcelCentroid=getCentroid(geojson);
  const tr=t();
  document.getElementById("val-code").textContent=data.cadastral;
  document.getElementById("lbl-area").textContent=tr.area;
  document.getElementById("val-area").textContent=data.area?Number(data.area).toLocaleString()+" "+tr.sqm:"—";
  document.getElementById("val-type").textContent=data.parcel_type||"—";
  document.getElementById("lbl-addr").textContent=tr.addr;
  document.getElementById("val-addr").textContent=data.address||"—";
  document.getElementById("val-owner").textContent=data.owners||"—";
  document.getElementById("lbl-ownership").textContent=tr.lineOwnership;
  document.getElementById("val-ownership").textContent="—";
  document.getElementById("row-line-ownership").style.display="none";
  document.getElementById("lbl-extra").textContent=tr.lineExtra;
  document.getElementById("val-extra").textContent="—";
  document.getElementById("row-line-extra").style.display="none";
  document.getElementById("info-card").style.display="none";
  document.getElementById("owner-results-card").style.display="none";
  document.getElementById("analyse-btn").style.display="none"; // walkability (free analysis) removed
  _updateMapInfoBadge();
  if(!isLine){
    setupProCard();
  }
  showParcelPopup(parcelCentroid);
  setStatus(tr.found,"success");
  logFeatureUse("map_click").catch(()=>{});
}

async function search(){
  const code=getCode();if(!code)return;const tr=t();
  try{resetAnalysis();}catch(_){}
  setLoading(true);setStatus(tr.searching,"");
  try{
    if(/^\d{9,11}$/.test(code.trim())){
      await searchByOwnerId(code);
    }else{
      let nameFound=false;
      if(code.trim().length>=2&&!/^\d/.test(code.trim())&&!code.includes(".")){
        nameFound=await searchByOwnerName(code.trim());
      }
      if(!nameFound){
        let govGeOk=false;
        try{
          const form=new FormData();form.append("keyword",code);form.append("keyword_description[lang]",lang);
          const sRes=await fetch("https://maps.gov.ge/map/portal/search",{method:"POST",body:form});
          if(!sRes.ok)throw new Error("search_fail");
          const sData=await sRes.json();
          if(!sData.status||!sData.result?.length)throw new Error("not_found");
          const lbl=sData.result[0].details?.info_link?.split("lbl=")[1];if(!lbl)throw new Error("no_lbl");
          govGeOk=true;
          await loadParcel(lbl,code);
        }catch(govErr){
          if(govErr.message==="not_found"||govErr.message==="no_shape"||govGeOk)throw govErr;
          await loadParcelFromDB(code.trim());
        }
      }
    }
  }catch(e){
    console.error(e);
    const msg=e.message==="not_found"?tr.notFound
      :e.message==="not_in_db"?(lang==="ka"?"maps.gov.ge მიუწვდომელია და ნაკვეთი მონაცემთა ბაზაში ვერ მოიძებნა.":"maps.gov.ge unavailable and parcel not found in database.")
      :e.message==="no_shape"?(lang==="ka"?"ამ ნაკვეთისთვის საზღვრის მონაცემები მიუწვდომელია.":"No boundary data available for this parcel.")
      :tr.error+` (${e.message})`;
    setStatus(msg,"error");
  }
  finally{setLoading(false);}
}

// ── Search limit ──────────────────────────────────────────────────────────────
let _limitCache={allowed:true,ts:0};
async function checkSearchLimit(){
  if(!currentUser)return true;
  if(Date.now()-_limitCache.ts<120000)return _limitCache.allowed;
  try{
    const check=Promise.all([fetchSearchUsage(),fetchUserMonthlyLimit()]).then(([used,{limit}])=>used<limit);
    const allowed=await Promise.race([check,new Promise(r=>setTimeout(()=>r(true),4000))]);
    _limitCache={allowed,ts:Date.now()};
    return allowed;
  }catch(e){return true;}
}

async function logSearch(cadastral){
  if(!currentUser){_pendingLogs.push({type:"search",cadastral});return;}
  const{error}=await sb.rpc("log_search",{p_user_id:currentUser.id,p_cadastral:cadastral});
  if(error)console.error("logSearch failed:",error.message,"(cadastral:",cadastral,")");
}

async function logFeatureUse(type){
  if(!currentUser){_pendingLogs.push({type:"feature",event_type:type});return;}
  const{error}=await sb.from("feature_usage").insert({user_id:currentUser.id,event_type:type});
  if(error)console.warn("logFeatureUse:",error.message);
}

async function flushPendingLogs(){
  if(!currentUser||!_pendingLogs.length)return;
  const pending=[..._pendingLogs];_pendingLogs=[];
  for(const log of pending){
    if(log.type==="search")await logSearch(log.cadastral);
    else if(log.type==="feature")await logFeatureUse(log.event_type);
  }
}

async function logSearchBatch(cadastrals){
  if(!currentUser||!cadastrals.length)return;
  const{error}=await sb.rpc("log_search_batch",{p_user_id:currentUser.id,p_cadastrals:cadastrals});
  if(error)console.warn("logSearchBatch:",error.message);
}

// ── PDF Export ────────────────────────────────────────────────────────────────
function onExportClick(){
  if(!currentUser||currentUser.plan!=="pro"){alert(t().exportProOnly);return;}
  generatePDF();
}

async function generatePDF(){
  const tr=t();
  const btn=document.getElementById("export-btn");
  btn.disabled=true;
  btn.innerHTML=`<span class="spinner" style="border-top-color:#fbbf24;border-color:rgba(251,191,36,0.3)"></span><span>${tr.exportGenerating}</span>`;
  try{
    const{jsPDF}=window.jspdf||window;
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const W=210,M=16;let y=M;

    // ── Load Noto Sans Georgian font ──
    let georgianFontLoaded = false;
    try {
    // Try multiple CDN sources for the font
    const fontUrls = [
        "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansGeorgian/hinted/ttf/NotoSansGeorgian-Regular.ttf",
        "https://fonts.gstatic.com/s/notosansgeorgian/v28/PlIaFke5O6RzLfvNNVSitxkr76PRHBC4Ytyq-Gof7PagevKo6oFpog.ttf"
    ];
    let fontBuf = null;
    for (const url of fontUrls) {
        try {
        const fontRes = await fetch(url);
        if (fontRes.ok) { fontBuf = await fontRes.arrayBuffer(); break; }
        } catch(e) { /* try next */ }
    }
    if (fontBuf) {
        const fontBytes = new Uint8Array(fontBuf);
        let binary = "";
        for (let i = 0; i < fontBytes.length; i += 8192)
        binary += String.fromCharCode(...fontBytes.subarray(i, i + 8192));
        const fontB64 = btoa(binary);
        doc.addFileToVFS("NotoSansGeorgian.ttf", fontB64);
        doc.addFont("NotoSansGeorgian.ttf", "NotoSansGeorgian", "normal");
        georgianFontLoaded = true;
    }
    } catch(e) { console.warn("Georgian font load failed:", e); }

    // FIX: single drawText helper — sets correct font, draws, always resets to helvetica
    const hasGeo = (s) => /[\u10D0-\u10FF\u2D00-\u2D2F]/.test(s||"");
    function drawText(text, x, yy, size, color, opts={}) {
      doc.setFontSize(size); setTxt(color);
      doc.setFont(hasGeo(text) && georgianFontLoaded ? "NotoSansGeorgian" : "helvetica", "normal");
      doc.text(String(text||"—"), x, yy, opts);
      doc.setFont("helvetica", "normal"); // always reset so next call is never contaminated
    }

    

    // ── Color helpers ──
    const toRgb=(c)=>{
      if(!c||c==="")return[52,100,80];
      if(c.startsWith("#"))return[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
      const m=c.match(/\d+/g);if(m&&m.length>=3)return[+m[0],+m[1],+m[2]];
      return[100,100,100];
    };
    const setFill=(c)=>{const[r,g,b]=toRgb(c);doc.setFillColor(r,g,b);};
    const setStroke=(c)=>{const[r,g,b]=toRgb(c);doc.setDrawColor(r,g,b);};
    const setTxt=(c)=>{const[r,g,b]=toRgb(c);doc.setTextColor(r,g,b);};

    // ── Layout helpers ──
    function txt(text,x,yy,size,color,font){
      drawText(text,x,yy,size,color);
    }
    function row(label,value){
      // label is always latin — safe direct draw
      doc.setFontSize(8);setTxt("#999999");doc.setFont("helvetica","normal");
      doc.text(label,M,y);
      drawText(value||"—",W-M,y,8,"#222222",{align:"right",maxWidth:W-M*2-32});
      y+=5.5;
    }
    function divider(){
      setStroke("#e5e5e5");doc.setLineWidth(0.2);
      doc.line(M,y,W-M,y);y+=5;
    }
    function sectionLabel(text){
      drawText(text.toUpperCase(),M,y,7,"#aaaaaa");y+=4.5;
    }
    function checkPage(needed=20){
      if(y+needed>285){doc.addPage();y=M;
        // Light bg on new page
        setFill("#ffffff");doc.rect(0,0,210,297,"F");
      }
    }

    // ── White background ──
    setFill("#ffffff");doc.rect(0,0,210,297,"F");

    // ── Header ──
    setFill("#f7f7f7");doc.rect(0,0,210,26,"F");
    setStroke("#e5e5e5");doc.setLineWidth(0.3);doc.line(0,26,210,26);
    doc.setFontSize(12);setTxt("#111111");doc.setFont("helvetica","bold");
    doc.text("URBANYX",M,11);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);setTxt("#999999");
    doc.text(tr.pdfTitle,M,18);
    doc.text(new Date().toLocaleDateString(lang==="ka"?"ka-GE":"en-GB",{day:"2-digit",month:"long",year:"numeric"}),W-M,11,{align:"right"});
    doc.text(tr.pdfGenerated,W-M,18,{align:"right"});
    y=34;

    // ── Parcel info — 2 column grid ──
    sectionLabel(tr.parcelInfo);
    const fields=[
      [tr.code, document.getElementById("val-code").textContent],
      [tr.area, document.getElementById("val-area").textContent],
      [tr.type, document.getElementById("val-type").textContent],
      [tr.addr, document.getElementById("val-addr").textContent],
      [tr.owner, document.getElementById("val-owner").textContent],
    ];
    const colW=(W-M*2)/2-4;
    for(let i=0;i<fields.length;i+=2){
      const [l1,v1]=fields[i]; const pair=fields[i+1];
      doc.setFontSize(7.5);
      // Left
      setTxt("#999999");doc.setFont("helvetica","normal");doc.text(l1,M,y);
      drawText(v1||"—",M+colW,y,7.5,"#222222",{align:"right",maxWidth:colW});
      // Right
      if(pair){
        const [l2,v2]=pair;
        const rx=M+colW+8;
        setTxt("#999999");doc.setFont("helvetica","normal");doc.text(l2,rx,y);
        drawText(v2||"—",W-M,y,7.5,"#222222",{align:"right",maxWidth:colW});
      }
      y+=5.5;
    }
    y+=2;divider();

    // ── Map screenshot at 3:2 ratio ──
    checkPage(70);
    sectionLabel(tr.isoTitle);
    try{
      const canvas=map.getCanvas();
      if(canvas){
        map.triggerRepaint();
        await new Promise(r=>setTimeout(r,250));
        const imgData=canvas.toDataURL("image/jpeg",0.88);
        const imgW=W-(M*2);
        const imgH=imgW*(1.75/3); // 3:2 width:height ratio
        doc.addImage(imgData,"JPEG",M,y,imgW,imgH);
        y+=imgH+4;
      }
    }catch(e){
      setTxt("#aaaaaa");doc.setFontSize(8);doc.text("Map capture unavailable",M,y);y+=8;
    }
    divider();

    // ── SDI Score ──
    checkPage(50);
    sectionLabel(tr.pdfWalkability);
    const scoreEl=document.getElementById("score-num");
    const verdictEl=document.getElementById("score-verdict");
    if(scoreEl&&scoreEl.textContent!=="—"){
      const score=parseInt(scoreEl.textContent)||0;
      const verdictText=verdictEl.textContent||"";
      const ringColor=verdictEl?.style.color||"#34d399";

      // Score ring
      setStroke("#eeeeee");doc.setLineWidth(4);doc.circle(M+10,y+10,9,"S");
      setStroke(ringColor);doc.setLineWidth(4);
      const angle=(score/100)*360;
      for(let i=0;i<angle;i+=4){
        const a1=(i-90)*(Math.PI/180);const a2=(Math.min(i+4,angle)-90)*(Math.PI/180);
        doc.line(M+10+9*Math.cos(a1),y+10+9*Math.sin(a1),M+10+9*Math.cos(a2),y+10+9*Math.sin(a2));
      }
      doc.setFontSize(11);setTxt(ringColor);doc.setFont("helvetica","bold");
      doc.text(String(score),M+10,y+13,{align:"center"});
      doc.setFont("helvetica","normal");
      doc.setFontSize(7);setTxt("#aaaaaa");doc.text(tr.pdfDiversityIndex,M+24,y+7);
      drawText(verdictText,M+24,y+14,10,ringColor);
      y+=26;

      // Category bars — 2 column grid
      const catRows=[...document.querySelectorAll("#cat-list .cat-row")];
      for(let i=0;i<catRows.length;i+=2){
        checkPage(10);
        const renderBar=(catRow,ox,bw)=>{
          const name=catRow.querySelector(".cat-name")?.textContent?.trim()||"";
          const count=catRow.querySelector(".cat-count")?.textContent?.trim()||"";
          const fill=catRow.querySelector(".bar-fill");
          const pct=fill?parseFloat(fill.style.width)||0:0;
          const barColor=fill?fill.style.background:"#cccccc";
          drawText(name,ox,y,7.5,"#888888");
          doc.setFont("helvetica","normal");setTxt("#555555");doc.text(count,ox+bw,y,{align:"right"});
          y+=3.5;
          setFill("#eeeeee");doc.rect(ox,y,bw,2.5,"F");
          if(pct>0){setFill(barColor);doc.rect(ox,y,bw*(pct/100),2.5,"F");}
          y+=5;
        };
        const bw=(W-M*2)/2-4;
        const startY=y;
        renderBar(catRows[i],M,bw);
        if(catRows[i+1]){
          const afterY=y;y=startY;
          renderBar(catRows[i+1],M+bw+8,bw);
          y=Math.max(y,afterY);
        }
      }
    }else{
      setTxt("#aaaaaa");doc.setFontSize(8);doc.text(tr.pdfNoScore,M,y);y+=8;
    }
    divider();

    // ── Mapillary images — all, 2-column grid ──
    checkPage(40);
    sectionLabel(tr.pdfStreetImagery);
    const images=_mapillaryImages||[];
    if(images.length>0){
      const imgW=(W-M*2)/2-3;
      const imgH=imgW*(3/4); // 4:3
      for(let i=0;i<images.length;i+=2){
        checkPage(imgH+6);
        const fetchImg=async(img)=>{
          try{
            const resp=await fetch(img.thumb_256_url);
            const blob=await resp.blob();
            return await new Promise(resolve=>{
              const reader=new FileReader();
              reader.onloadend=()=>resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }catch(e){return null;}
        };
        const [b1,b2]=await Promise.all([fetchImg(images[i]),images[i+1]?fetchImg(images[i+1]):Promise.resolve(null)]);
        if(b1){doc.addImage(b1,"JPEG",M,y,imgW,imgH);}
        if(b2){doc.addImage(b2,"JPEG",M+imgW+6,y,imgW,imgH);}
        y+=imgH+4;
      }
    }else{
      setTxt("#aaaaaa");doc.setFontSize(8);
      drawText(tr.pdfNoImage,M,y,8,"#aaaaaa");y+=8;
    }

    // ── Pro layers ──
    const proCard=document.getElementById("pro-analysis-card");
    if(proCard&&proCard.style.display!=="none"){
      checkPage(30);divider();
      sectionLabel(tr.pdfProAnalysis);

      // Climate
      if(_climateData){
        const fullBw=W-M*2;
        drawText(tr.proCategories.climate.toUpperCase(),M,y,6.5,"#aaaaaa");y+=4.5;
        if(_climateData.canopyPct!==null){
          const pct=_climateData.canopyPct;
          const color=pct>40?"#22c55e":pct>20?"#84cc16":pct>10?"#eab308":"#f97316";
          drawText("Tree Canopy Coverage",M,y,7.5,"#888888");
          doc.setFont("helvetica","normal");setTxt("#555555");doc.text(`${pct}%`,M+fullBw,y,{align:"right"});
          y+=3.5;
          setFill("#eeeeee");doc.rect(M,y,fullBw,2.5,"F");
          if(pct>0){setFill(color);doc.rect(M,y,fullBw*(pct/100),2.5,"F");}
          y+=5;
        }
        if(_climateData.lst!==null){
          const lst=_climateData.lst;
          const lstColor=lst>40?"#ef4444":lst>35?"#f97316":lst>28?"#eab308":"#22c55e";
          drawText("Surface Temp. (Summer)",M,y,7.5,"#888888");
          doc.setFont("helvetica","normal");setTxt(lstColor);doc.text(`${lst}°C`,M+fullBw,y,{align:"right"});
          y+=7;
        }
        y+=3;
      }

      const renderProBar=(proRow,ox,bw)=>{
        const name=proRow.querySelector(".cat-name")?.textContent?.trim()||"";
        const count=proRow.querySelector(".cat-count")?.textContent?.trim()||"";
        const fill=proRow.querySelector(".bar-fill");
        const pct=fill?parseFloat(fill.dataset.w)||0:0;
        const barColor=fill?fill.style.background:"#cccccc";
        drawText(name,ox,y,7.5,"#888888");
        doc.setFont("helvetica","normal");setTxt("#555555");doc.text(count,ox+bw,y,{align:"right"});
        y+=3.5;
        setFill("#eeeeee");doc.rect(ox,y,bw,2.5,"F");
        if(pct>0){setFill(barColor);doc.rect(ox,y,bw*(pct/100),2.5,"F");}
        y+=5;
      };
      const bw=(W-M*2)/2-4;
      const catSections=[
        {id:"pro-cat-education-content",label:tr.proCategories.education},
        {id:"pro-cat-mobility-content",label:tr.proCategories.mobility}
      ];
      for(const {id:secId,label:secLabel} of catSections){
        const secRows=[...document.querySelectorAll(`#${secId} .cat-row`)];
        if(!secRows.length)continue;
        checkPage(12);
        drawText(secLabel.toUpperCase(),M,y,6.5,"#aaaaaa");y+=4.5;
        for(let i=0;i<secRows.length;i+=2){
          checkPage(10);
          const startY=y;
          renderProBar(secRows[i],M,bw);
          if(secRows[i+1]){const afterY=y;y=startY;renderProBar(secRows[i+1],M+bw+8,bw);y=Math.max(y,afterY);}
        }
        y+=2;
      }
    }

    // ── Footer on every page ──
    const pageCount=doc.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      setFill("#f7f7f7");doc.rect(0,287,210,10,"F");
      setStroke("#e5e5e5");doc.setLineWidth(0.3);doc.line(0,287,210,287);
      doc.setFontSize(7);setTxt("#aaaaaa");doc.setFont("helvetica","normal");
      doc.text("urbanyx.zaxis.ge",M,293);
      doc.text(`${i} / ${pageCount}`,W-M,293,{align:"right"});
    }

    // ── Save ──
    const code=document.getElementById("val-code").textContent||"parcel";
    doc.save(`parcel-${code.replace(/\./g,"-")}-${new Date().toISOString().slice(0,10)}.pdf`);
    logFeatureUse("pdf_export").catch(()=>{});

  }catch(e){
    console.error("PDF generation error:",e);
    alert("PDF generation failed. Please try again.");
  }
  btn.disabled=false;
  btn.innerHTML=`<span id="export-btn-label">${t().exportBtn}</span>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init(){
  applyLang();

  // Lightbox keyboard navigation
  document.addEventListener("keydown",e=>{
    const lb=document.getElementById("mapillary-lightbox");
    if(!lb||!lb.classList.contains("open"))return;
    if(e.key==="Escape")closeMapillaryLightbox();
    else if(e.key==="ArrowLeft")mapillaryLightboxNav(-1);
    else if(e.key==="ArrowRight")mapillaryLightboxNav(1);
  });

  // Fade blur and compact search on first interaction with the map/page
  document.addEventListener("click",function(e){
    if(mapMoved||hasSearched)return;
    if(e.target.closest("#auth-modal,#paywall-modal,#dashboard-modal,#center-search"))return;
    mapMoved=true;
    document.getElementById("map-blur").classList.add("hidden");
    document.getElementById("center-search").classList.add("compact");
    document.getElementById("center-search").classList.add("hidden");
  },{passive:true});
  // Password-recovery links land here with a recovery session in the URL. Do NOT
  // sign the user in — show the "set new password" view instead.
  window._recoveryMode=/type=recovery/.test(location.hash)||/type=recovery/.test(location.search);
  const{data:{session}}=await sb.auth.getSession();
  if(window._recoveryMode){
    openAuthModal("view-update-password");
  } else if(session){
    const{data:{user},error:userErr}=await sb.auth.getUser();
    if(userErr||!user){
      // Clear local session only — no API call, avoids 403 on deleted/expired accounts
      await sb.auth.signOut({scope:'local'}).catch(()=>{});
    } else {
      await onAuthSuccess(session);
    }
  }
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      window._recoveryMode=true;
      openAuthModal("view-update-password");
      if(location.hash.includes("access_token"))history.replaceState(null,"",location.pathname);
    }
    else if(event==="SIGNED_IN"&&session){
      if(window._recoveryMode)return; // recovery session must not auto-sign-in
      await onAuthSuccess(session);
      if(location.hash.includes("access_token"))history.replaceState(null,"",location.pathname);
    }
    else if(event==="SIGNED_OUT"){currentUser=null;updateUserUI();}
  });

  // Resume an abandoned Paddle checkout opened from a recovery email (?_ptxn=txn_...)
  const _ptxn=new URLSearchParams(location.search).get("_ptxn");
  if(_ptxn){
    _loadPaddleSDK()
      .then(()=>{if(window.Paddle?.Checkout)Paddle.Checkout.open({transactionId:_ptxn});})
      .catch(e=>console.warn("Paddle recovery checkout:",e));
  }
}
init();

// ── User location ─────────────────────────────────────────────────────────────
let _userLocMarker=null,_userLocWatch=null;
function navLocateUser(){
  const btn=document.getElementById('mzc-locate-btn');
  const icon=document.getElementById('nav-locate-icon');
  if(!navigator.geolocation){setStatus('Geolocation is not supported by your browser','error');return;}
  if(_userLocWatch!==null){
    navigator.geolocation.clearWatch(_userLocWatch);_userLocWatch=null;
    if(_userLocMarker){_userLocMarker.remove();_userLocMarker=null;}
    btn?.classList.remove('active');if(icon)icon.style.opacity='0.55';
    return;
  }
  btn?.classList.add('active');if(icon)icon.style.opacity='1';
  const _onPos=(pos)=>{
    const{longitude:lng,latitude:lat}=pos.coords;
    if(!_userLocMarker){
      const el=document.createElement('div');el.className='user-loc-dot';
      _userLocMarker=new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      map.flyTo({center:[lng,lat],zoom:Math.max(map.getZoom(),15),duration:1200,essential:true});
    }else{
      _userLocMarker.setLngLat([lng,lat]);
    }
  };
  const _onErr=(err)=>{
    const msg=err.code===1?'Location access denied':'Could not get your location';
    setStatus(msg,'error');
    btn?.classList.remove('active');if(icon)icon.style.opacity='0.55';
    if(_userLocWatch!==null){navigator.geolocation.clearWatch(_userLocWatch);_userLocWatch=null;}
  };
  navigator.geolocation.getCurrentPosition(_onPos,_onErr,{enableHighAccuracy:true,timeout:10000});
  _userLocWatch=navigator.geolocation.watchPosition(_onPos,_onErr,{enableHighAccuracy:true,timeout:10000});
}

// ── Transit History mode ──────────────────────────────────────────────────────
// Reads nightly aggregates (transit_stop_daily / transit_segment_weekly via
// supabase RPC) derived from the R2 position archive. Live stays free;
// History is Pro. See supabase/transit-history-rpc.sql.
let _ttcMode='live';
let _histCoverage=null, _histDays=7, _histStats=null, _histHourly=null, _histTraceState=null;
let _histBand='all', _histDaytype='all', _histRange=null, _histTraceBand=null;
const _HIST_OK='#34d399',_HIST_WARN='#fbbf24',_HIST_BAD='#f87171',_HIST_GREY='rgba(255,255,255,0.35)';

function _ttcRenderPanel(){
  const el=document.getElementById('acc-transit-result');
  if(!el||!_ttcRenderedStops)return;
  const h=t().hist,isKa=lang==='ka';
  const isPro=currentUser?.plan==='pro';
  const seg=(m,label)=>{
    const locked=m==='history'&&!isPro; // greyed out; click opens the upgrade paywall
    return `<button onclick="_ttcSetMode('${m}')" style="flex:1;border:0;font-family:inherit;font-size:0.66rem;font-weight:600;padding:5px 0;border-radius:6px;cursor:pointer;${locked?'opacity:0.45;':''}background:${_ttcMode===m?(m==='history'?'rgba(129,140,248,0.16)':'rgba(52,211,153,0.14)'):'none'};color:${_ttcMode===m?(m==='history'?'#818cf8':'#34d399'):'rgba(255,255,255,0.35)'}">${label}</button>`;
  };
  const proTag=currentUser?.plan==='pro'?'':` <span style="font-size:0.5rem;letter-spacing:0.08em;background:rgba(129,140,248,0.14);color:#818cf8;border:1px solid rgba(129,140,248,0.3);border-radius:3px;padding:1px 4px;vertical-align:1px">PRO</span>`;
  el.innerHTML=`<div style="display:flex;gap:2px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:2px;margin:2px 0 8px">${seg('live',h.live)}${seg('history',h.history+proTag)}</div><div id="ttc-panel-body"></div>`;
  if(_ttcMode==='history')_histRender();else _ttcRenderLiveBody();
}

function _ttcRenderLiveBody(){
  const body=document.getElementById('ttc-panel-body');
  if(!body||!_ttcRenderedStops)return;
  const isKa=lang==='ka';
  body.innerHTML=_ttcRenderedStops.map(s=>_ttcRenderStopCard(s,isKa)).join('');
  _ttcLoadAllWaitTimes(_ttcRenderedStops);
  if(_ttcRenderedStops.length){const s0=_ttcRenderedStops[0];_ttcSelectStop(s0.id,s0.code,s0.lon,s0.lat,s0.name);}
}

function _ttcSetMode(m){
  if(m===_ttcMode)return;
  if(m==='history'){
    if(!currentUser){openAuthModal('view-signup');return;}
    if(currentUser.plan!=='pro'){openPaywall(true);return;}
    _ttcClearPoll();_clearBusStopRoute();
    _ttcMode='history';
    _ttcSetIconsVisible(false); // reliability circles replace the bus icons
  }else{
    _histCleanup();
    _ttcMode='live';
    _ttcSetIconsVisible(true);
  }
  _ttcRenderPanel();
}

function _ttcSetIconsVisible(v){
  if(!mapReady)return;
  ['ttc-stops','ttc-stops-hl'].forEach(id=>{
    if(map.getLayer(id))map.setLayoutProperty(id,'visibility',v?'visible':'none');
  });
}

function _histSetDays(d){_histDays=d;_histRender();}
function _histSetBand(b){_histBand=b;_histRender();}
function _histSetDaytype(d){_histDaytype=d;_histRender();}

function _histChip(label,on,onclick){
  return `<button onclick="${onclick}" style="font-family:ui-monospace,monospace;font-size:0.56rem;border:1px solid ${on?'rgba(129,140,248,0.4)':'rgba(255,255,255,0.09)'};background:${on?'rgba(129,140,248,0.14)':'none'};color:${on?'#818cf8':'rgba(255,255,255,0.35)'};border-radius:6px;padding:3px 7px;cursor:pointer;white-space:nowrap">${label}</button>`;
}

async function _histRender(){
  const body=document.getElementById('ttc-panel-body');
  if(!body||!_ttcRenderedStops)return;
  if(_histBand!=='all'&&_histColorBy==='headway')_histColorBy='ontime'; // headway data is all-day only
  const h=t().hist,isKa=lang==='ka';
  const periodChips=[7,30].map(d=>_histChip(d+' d',_histDays===d,`_histSetDays(${d})`)).join('');
  const dayChips=['all','weekday','sat','sun'].map(d=>_histChip(h.days[d],_histDaytype===d,`_histSetDaytype('${d}')`)).join('');
  const bandChips=['all','am_peak','midday','pm_peak','evening'].map(b=>_histChip(h.bands[b],_histBand===b,`_histSetBand('${b}')`)).join('');
  body.innerHTML=`<div style="display:flex;gap:4px;margin-bottom:5px;flex-wrap:wrap">${periodChips}${dayChips}</div>
    <div style="display:flex;gap:4px;margin-bottom:7px;flex-wrap:wrap">${bandChips}</div>
    <div id="hist-coverage" style="font-size:0.6rem;color:rgba(255,255,255,0.3);margin-bottom:8px"></div>
    <div id="hist-content"><div style="font-size:0.66rem;color:rgba(255,255,255,0.3);padding:6px 0"><span class="spinner-sm" style="width:9px;height:9px;border-width:1.5px;display:inline-block;vertical-align:middle;margin-right:6px"></span>${h.loading}</div></div>`;
  try{
    if(!_histCoverage){
      const{data,error}=await sb.rpc('transit_history_coverage');
      if(error)throw error;
      _histCoverage=Array.isArray(data)?data[0]:data;
    }
    const cov=_histCoverage;
    const covEl=document.getElementById('hist-coverage');
    if(!cov?.first_date){if(covEl)covEl.textContent='';document.getElementById('hist-content').innerHTML=`<div style="font-size:0.66rem;color:rgba(255,255,255,0.3)">${h.noData}</div>`;return;}
    const to=cov.last_date;
    const fromD=new Date(Math.max(new Date(cov.first_date),new Date(new Date(to).getTime()-(_histDays-1)*86400000)));
    const from=fromD.toISOString().slice(0,10);
    _histRange={from,to};
    if(covEl)covEl.innerHTML=`<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#34d399;margin-right:5px;vertical-align:1px"></span>${h.coverage(new Date(cov.first_date).toLocaleDateString(isKa?'ka-GE':'en-GB',{day:'numeric',month:'short',year:'numeric'}),cov.days)}`;
    const ids=_ttcRenderedStops.map(s=>s.id);
    // Supabase caps any response at 1000 rows — the stats RPC returns one row
    // per stop, so chunk the stop set to avoid silent truncation on large
    // isochrones (>1000 stops). The hourly RPC groups to ≤24 rows, so it's safe.
    const CH=800;
    const statsChunks=[];
    for(let i=0;i<ids.length;i+=CH)statsChunks.push(ids.slice(i,i+CH));
    const[statsArr,hourlyRes]=await Promise.all([
      Promise.all(statsChunks.map(c=>sb.rpc('transit_history_stats',{p_stop_ids:c,p_from:from,p_to:to,p_daytype:_histDaytype,p_band:_histBand}))),
      sb.rpc('transit_history_hourly',{p_stop_ids:ids,p_from:from,p_to:to,p_daytype:_histDaytype}),
    ]);
    const bad=statsArr.find(r=>r.error);
    if(bad)throw bad.error;
    _histStats=statsArr.flatMap(r=>r.data||[]);
    _histHourly=hourlyRes.error?null:(hourlyRes.data||[]);
    _histRenderContent();
    _histApplyStopColors();
  }catch(e){
    console.warn('hist:',e);
    const c=document.getElementById('hist-content');
    if(c)c.innerHTML=`<div style="font-size:0.66rem;color:rgba(248,113,113,0.6)">${isKa?'ისტორიის ჩატვირთვა ვერ მოხერხდა':'Could not load history'} — ${(e.message||'').slice(0,80)}</div>`;
  }
}

// Classify a stop-aggregate row by the selected map variable.
// Thresholds (shown in the panel legend): ontime ≥80/≥60% · late ≤10/≤25% ·
// |median delay| ≤1.5/≤4 min · scheduled headway ≤10/≤20 min.
function _histClassBy(r,v){
  if(!r)return null;
  if(v==='headway'){
    const hw=r.headway_med_s!=null?Number(r.headway_med_s):null;
    if(hw==null)return null;
    return hw<=600?'ok':hw<=1200?'warn':'bad';
  }
  if(Number(r.n_matched)<30)return null; // insufficient sample
  if(v==='late'){
    const share=Number(r.late)/Number(r.n_matched);
    return share<=0.10?'ok':share<=0.25?'warn':'bad';
  }
  if(v==='delay'){
    if(r.delay_med_s==null)return null;
    const a=Math.abs(Number(r.delay_med_s));
    return a<=90?'ok':a<=240?'warn':'bad';
  }
  const share=Number(r.on_time)/Number(r.n_matched); // default: ontime
  return share>=0.8?'ok':share>=0.6?'warn':'bad';
}
function _histClassOf(r){return _histClassBy(r,'ontime');} // worst-list & tooltip stay OTP-based
// Shared variable definitions: panel legend + PDF map legend read the same source
function _histVarDefs(h){
  const mn=h.chartUnit;
  return [
    {k:'ontime', l:h.varOntime, leg:['≥80%','60–80%','<60%']},
    {k:'late',   l:h.varLate,   leg:['≤10%','10–25%','>25%']},
    {k:'delay',  l:h.varDelay,  leg:['≤1.5 '+mn,'1.5–4 '+mn,'>4 '+mn]},
    {k:'headway',l:h.varHeadway,leg:['≤10 '+mn,'10–20 '+mn,'>20 '+mn]},
  ];
}
let _histColorBy='ontime';
function _histSetColorBy(v){
  _histColorBy=v;
  _histRenderContent(); // refresh chip highlight + legend
  _histApplyStopColors();
}

function _histRenderContent(){
  const c=document.getElementById('hist-content');
  if(!c)return;
  const h=t().hist,isKa=lang==='ka';
  const rows=_histStats;
  if(!rows.length){c.innerHTML=`<div style="font-size:0.66rem;color:rgba(255,255,255,0.3)">${h.noData}</div>`;return;}
  const tot=rows.reduce((a,r)=>({m:a.m+Number(r.n_matched),ot:a.ot+Number(r.on_time),l:a.l+Number(r.late),n:a.n+Number(r.n_obs)}),{m:0,ot:0,l:0,n:0});
  const meds=rows.map(r=>r.delay_med_s).filter(v=>v!=null).map(Number).sort((a,b)=>a-b);
  const p90s=rows.map(r=>r.delay_p90_s).filter(v=>v!=null).map(Number).sort((a,b)=>a-b);
  const med=a=>a.length?a[a.length>>1]:null;
  const ewtW=rows.filter(r=>r.ewt_s!=null);
  const ewt=ewtW.length?ewtW.reduce((a,r)=>a+Number(r.ewt_s)*Number(r.n_obs),0)/ewtW.reduce((a,r)=>a+Number(r.n_obs),0):null;
  const fmtM=s=>s==null?'—':(s>=0?'+':'−')+(Math.abs(s)/60).toFixed(1);
  const tile=(v,unit,label,color)=>`<div style="border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 9px;background:rgba(255,255,255,0.02)"><div style="font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:0.98rem;font-weight:600;${color?`color:${color}`:''}">${v}<span style="font-size:0.56rem;font-weight:500;color:rgba(255,255,255,0.35)"> ${unit}</span></div><div style="font-size:0.54rem;color:rgba(255,255,255,0.32);margin-top:1px">${label}</div></div>`;
  const otPct=tot.m?Math.round(100*tot.ot/tot.m):null;
  // Area reliability grade — weighted on-time share across the isochrone's stops
  let html='';
  if(otPct!=null){
    const grade=otPct>=80?'A':otPct>=70?'B':otPct>=60?'C':otPct>=50?'D':otPct>=40?'E':'F';
    const gCol=otPct>=70?_HIST_OK:otPct>=50?_HIST_WARN:_HIST_BAD;
    html+=`<div style="display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 10px;background:rgba(255,255,255,0.02);margin-bottom:7px">
      <span style="width:26px;height:26px;border-radius:7px;background:${gCol}1f;border:1px solid ${gCol}55;color:${gCol};font-family:ui-monospace,monospace;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${grade}</span>
      <span style="flex:1;font-size:0.62rem;color:rgba(255,255,255,0.55)">${h.scoreLabel} ${_histInfoBtn('infoScore')}</span>
      <span style="font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:0.72rem;font-weight:600;color:${gCol}">${otPct}%</span>
    </div>`;
  }
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px">`
    +tile(otPct==null?'—':otPct,'%',`${h.onTime} · ${h.onTimeSub} ${_histInfoBtn('infoOnTime')}`,otPct==null?null:otPct>=80?_HIST_OK:otPct>=60?_HIST_WARN:_HIST_BAD)
    +tile(fmtM(med(meds)),'min',`${h.medDelay} ${_histInfoBtn('infoMed')}`)
    +tile(fmtM(med(p90s)),'min',`${h.p90} ${_histInfoBtn('infoP90')}`)
    +tile(ewt==null?'—':'+'+(ewt/60).toFixed(1),'min',`${h.ewt} ${_histInfoBtn(_histBand==='all'?'infoEwt':'infoBandEwt')}`)
    +`</div>`;
  // Map color-by selector + threshold legend
  {
    const VARS=_histVarDefs(h);
    const headwayOff=_histBand!=='all'; // headway only exists in the all-day aggregates
    const chips=VARS.map(v=>{
      const dis=v.k==='headway'&&headwayOff;
      const on=_histColorBy===v.k;
      return `<button ${dis?'disabled':''} onclick="_histSetColorBy('${v.k}')" style="font-family:ui-monospace,monospace;font-size:0.54rem;border:1px solid ${on?'rgba(129,140,248,0.4)':'rgba(255,255,255,0.09)'};background:${on?'rgba(129,140,248,0.14)':'none'};color:${on?'#818cf8':'rgba(255,255,255,0.35)'};border-radius:5px;padding:2px 7px;cursor:${dis?'default':'pointer'};opacity:${dis?0.3:1}">${v.l}</button>`;
    }).join('');
    const cur=VARS.find(v=>v.k===_histColorBy)||VARS[0];
    const dot=c=>`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};margin:0 3px 0 8px;vertical-align:0"></span>`;
    html+=`<div style="border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:7px 9px;background:rgba(255,255,255,0.02);margin-bottom:9px">
      <div style="font-family:ui-monospace,monospace;font-size:0.5rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:5px">${h.colorBy}</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">${chips}</div>
      <div style="font-size:0.54rem;color:rgba(255,255,255,0.4);margin-top:5px">${dot(_HIST_OK)}${cur.leg[0]}${dot(_HIST_WARN)}${cur.leg[1]}${dot(_HIST_BAD)}${cur.leg[2]}</div>
    </div>`;
  }
  html+=_histChartHtml();
  // least reliable stops (by late share, needs sample)
  const byStop=new Map(rows.map(r=>[r.stop_id,r]));
  const ranked=rows.filter(r=>Number(r.n_matched)>=30&&Number(r.late)>0)
    .sort((a,b)=>Number(b.late)/Number(b.n_matched)-Number(a.late)/Number(a.n_matched)).slice(0,5);
  if(ranked.length){
    html+=`<div style="font-family:ui-monospace,monospace;font-size:0.52rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin:2px 0 5px">${h.worst}</div>`;
    html+=ranked.map(r=>{
      const s=_ttcRenderedStops.find(x=>x.id===r.stop_id);
      const cls=_histClassOf(r);
      const col=cls==='bad'?_HIST_BAD:cls==='warn'?_HIST_WARN:_HIST_OK;
      const latePct=Math.round(100*Number(r.late)/Number(r.n_matched));
      const chips=(s?.routes||[]).slice(0,4).map(rt=>`<span onclick="event.stopPropagation();_histTrace('${rt.id||''}','${(rt.shortName||'').replace(/'/g,'')}')" style="display:inline-block;background:rgba(129,140,248,0.14);color:#818cf8;border:1px solid rgba(129,140,248,0.3);border-radius:4px;padding:0 4px;height:14px;line-height:14px;font-size:0.54rem;font-weight:700;margin-right:3px;cursor:pointer">${rt.shortName||''}</span>`).join('');
      return `<div style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;background:rgba(255,255,255,0.02)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span style="font-size:0.63rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s?escapeHtml(s.name):r.stop_id}</span>
          <span style="font-family:ui-monospace,monospace;font-size:0.58rem;color:${col};flex-shrink:0"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${col};margin-right:4px;vertical-align:1px"></span>${latePct}% ${h.late}</span>
        </div>
        ${chips?`<div style="margin-top:3px">${chips}</div>`:''}
      </div>`;
    }).join('');
    html+=`<div style="font-size:0.56rem;color:rgba(255,255,255,0.25);margin-top:4px">${h.traceHint}</div>`;
  }
  html+=`<div id="hist-trace-bar"></div>`; // exports live in the Report section below Relief
  c.innerHTML=html;
  _histChartBind();
}

// Color the stops by reliability class — styled per the design mockup:
// compact dots with a dark ring, a soft glow halo on hover, and a tooltip.
function _histApplyStopColors(){
  if(!mapReady||!_histStats)return;
  const expr=['match',['get','id']];
  let any=false;
  for(const r of _histStats){
    const cls=_histClassBy(r,_histColorBy);
    expr.push(r.stop_id,cls==='ok'?_HIST_OK:cls==='warn'?_HIST_WARN:cls==='bad'?_HIST_BAD:_HIST_GREY);
    any=true;
  }
  expr.push(_HIST_GREY);
  if(!any)return;
  if(!map.getSource('ttc-stops'))return;
  // Always-on translucent ring (the "opaque ring" look), a hover-only emphasis
  // ring on top, and the solid core dot — no dark outline.
  if(!map.getLayer('ttc-stops-hist-ring')){
    map.addLayer({id:'ttc-stops-hist-ring',type:'circle',source:'ttc-stops',
      paint:{'circle-radius':11,'circle-color':expr,'circle-opacity':0.3,'circle-blur':0.25}},'ttc-stops');
  }else{
    map.setPaintProperty('ttc-stops-hist-ring','circle-color',expr);
  }
  if(!map.getLayer('ttc-stops-hist-hover')){
    map.addLayer({id:'ttc-stops-hist-hover',type:'circle',source:'ttc-stops',
      filter:['==',['get','id'],''],
      paint:{'circle-radius':15,'circle-color':expr,'circle-opacity':0.45,'circle-blur':0.4}},'ttc-stops');
  }else{
    map.setPaintProperty('ttc-stops-hist-hover','circle-color',expr);
  }
  if(!map.getLayer('ttc-stops-hist')){
    map.addLayer({id:'ttc-stops-hist',type:'circle',source:'ttc-stops',paint:{
      'circle-radius':5.5,'circle-color':expr,'circle-opacity':1
    }},'ttc-stops');
  }else{
    map.setPaintProperty('ttc-stops-hist','circle-color',expr);
  }
  _histBindStopHover();
}

// ── stop hover: glow + tooltip card (name, routes, OTP, delay, worst route) ──
let _histHoverBound=false,_histHoverId=null;
const _histStopRouteCache=new Map();
// Global route index (id → public short name): resolves internal ids like
// "1:R216088" to the rider-facing number ("101"). Fetched once, cached.
let _histRoutesIndexP=null;
function _histLoadRoutesIndex(){
  if(!_histRoutesIndexP)_histRoutesIndexP=(async()=>{
    const idx=new Map();
    try{
      const res=await fetch(`${PROXY}/ttc/v3/routes?modes=BUS,SUBWAY,GONDOLA`);
      if(res.ok)for(const r of await res.json())idx.set(r.id,{shortName:r.shortName||'',color:r.color||'',mode:r.mode||'BUS'});
    }catch(_){}
    return idx;
  })();
  return _histRoutesIndexP;
}
function _histRouteName(idx,rid){
  const hit=idx?.get(rid);
  if(hit?.shortName)return hit.shortName;
  const s=_ttcRenderedStops?.flatMap(x=>x.routes||[]).find(x=>x.id===rid);
  return s?.shortName||rid.split(':').pop().replace(/^R/,'#'); // last-resort: mark as internal id
}
function _histBindStopHover(){
  if(_histHoverBound||!mapReady)return;
  _histHoverBound=true;
  map.on('mousemove','ttc-stops-hist',_histStopMove);
  map.on('mouseleave','ttc-stops-hist',_histStopLeave);
}
function _histStopTipEl(){
  let el=document.getElementById('hist-stop-tip');
  if(!el){
    el=document.createElement('div');el.id='hist-stop-tip';
    el.style.cssText='position:fixed;pointer-events:none;display:none;width:216px;background:rgba(6,6,8,0.94);border:1px solid rgba(255,255,255,0.09);border-radius:9px;padding:10px 12px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,0.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:rgba(255,255,255,0.85)';
    document.body.appendChild(el);
  }
  return el;
}
let _histPulseGen=0;
function _histRunPulse(){ // same 80-frame eased pulse as the kg/school hovers
  const gen=++_histPulseGen;
  let fr=0;
  (function pulse(){
    if(_ttcMode!=='history'||_histPulseGen!==gen||!mapReady||!map.getLayer('ttc-stops-hist-hover'))return;
    fr=(fr+1)%80;const tt=fr/80;const ev=tt<0.5?2*tt*tt:-1+(4-2*tt)*tt;
    map.setPaintProperty('ttc-stops-hist-hover','circle-radius',7+ev*16);
    map.setPaintProperty('ttc-stops-hist-hover','circle-opacity',0.5*(1-ev));
    requestAnimationFrame(pulse);
  })();
}
function _histStopMove(e){
  if(_ttcMode!=='history'||!e.features?.length)return;
  map.getCanvas().style.cursor='pointer';
  const p=e.features[0].properties;
  if(map.getLayer('ttc-stops-hist-hover'))map.setFilter('ttc-stops-hist-hover',['==',['get','id'],p.id]);
  const el=_histStopTipEl();
  if(_histHoverId!==p.id){_histHoverId=p.id;el.innerHTML=_histStopTipHtml(p);_histFetchStopRoutes(p.id);_histRunPulse();}
  el.style.display='block';
  const x=Math.min(e.originalEvent.clientX+14,window.innerWidth-232);
  const y=Math.max(10,Math.min(e.originalEvent.clientY-10,window.innerHeight-(el.offsetHeight||150)-10));
  el.style.left=x+'px';el.style.top=y+'px';
}
function _histStopLeave(){
  map.getCanvas().style.cursor='';
  _histPulseGen++; // stop the pulse loop
  if(map.getLayer('ttc-stops-hist-hover'))map.setFilter('ttc-stops-hist-hover',['==',['get','id'],'']);
  _histHoverId=null;
  const el=document.getElementById('hist-stop-tip');
  if(el)el.style.display='none';
}
function _histStopTipHtml(p,extra){
  const h=t().hist;
  const r=_histStats?.find(x=>x.stop_id===p.id);
  const s=_ttcRenderedStops?.find(x=>x.id===p.id);
  const routes=(s?.routes||[]).map(x=>x.shortName).filter(Boolean).join(' · ');
  const rowStyle='display:flex;justify-content:space-between;font-size:0.62rem;color:rgba(255,255,255,0.7);padding:2.5px 0';
  const monoB='font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600';
  let html=`<div style="font-size:0.7rem;font-weight:650;color:#fff">${escapeHtml(p.name||'')}</div>
    <div style="font-family:ui-monospace,monospace;font-size:0.54rem;color:rgba(255,255,255,0.35);margin-bottom:7px;line-height:1.6">#${escapeHtml(p.code||'')} · <span id="hist-tip-routes">${escapeHtml(routes)}</span></div>`;
  if(r&&Number(r.n_matched)>0){
    const otShare=Number(r.on_time)/Number(r.n_matched);
    const otCol=otShare>=0.8?_HIST_OK:otShare>=0.6?_HIST_WARN:_HIST_BAD;
    const insufficient=Number(r.n_matched)<30;
    html+=`<div style="${rowStyle}"><span>${h.onTime}</span><b style="${monoB};color:${insufficient?_HIST_GREY:otCol}">${Math.round(otShare*100)}%${insufficient?' *':''}</b></div>`;
    html+=`<div style="${rowStyle}"><span>${h.late} · >5 ${h.chartUnit}</span><b style="${monoB}">${Math.round(100*Number(r.late)/Number(r.n_matched))}%</b></div>`;
    if(r.delay_med_s!=null)html+=`<div style="${rowStyle}"><span>${h.medDelay}</span><b style="${monoB}">${(r.delay_med_s>=0?'+':'')}${(Number(r.delay_med_s)/60).toFixed(1)} ${h.chartUnit}</b></div>`;
    if(r.headway_med_s!=null)html+=`<div style="${rowStyle}"><span>${h.schedHeadway}</span><b style="${monoB}">${Math.round(Number(r.headway_med_s)/60)} ${h.chartUnit}</b></div>`;
    html+=`<div id="hist-tip-worst">${extra||''}</div>`;
    const days=Math.max(1,_histCoverage?.days||1);
    html+=`<div style="font-size:0.54rem;color:rgba(255,255,255,0.35);border-top:1px solid rgba(255,255,255,0.09);margin-top:6px;padding-top:6px">${Number(r.n_obs).toLocaleString()} ${h.obs}${insufficient?' — '+h.insufficient:' · '+Math.round(Number(r.n_obs)/days)+h.perDay}</div>`;
  }else{
    html+=`<div style="font-size:0.6rem;color:rgba(255,255,255,0.35)">${h.insufficient}</div>`;
  }
  return html;
}
// Lazy per-stop route breakdown: the "worst route" row + the full list of
// routes actually OBSERVED at this stop in the period (the live per-stop
// route list only covers currently scheduled service and can be incomplete).
async function _histFetchStopRoutes(stopId){
  const key=stopId+'|'+(_histRange?.from||'')+'|'+(_histRange?.to||'');
  const h=t().hist;
  const render=(res)=>{
    if(_histHoverId!==stopId||!res)return;
    const slot=document.getElementById('hist-tip-worst');
    if(slot&&res.worst)slot.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:rgba(255,255,255,0.7);padding:2.5px 0"><span>${h.worstRoute}</span><b style="font-family:ui-monospace,monospace;font-weight:600">${escapeHtml(res.worst.name)} · +${(res.worst.med/60).toFixed(1)} ${h.chartUnit}</b></div>`;
    const rl=document.getElementById('hist-tip-routes');
    if(rl&&res.routes?.length)rl.textContent=res.routes.join(' · ');
  };
  if(_histStopRouteCache.has(key)){render(_histStopRouteCache.get(key));return;}
  try{
    const[idx,{data}]=await Promise.all([
      _histLoadRoutesIndex(),
      sb.from('transit_stop_daily')
        .select('route_id,n_matched,delay_med_s')
        .eq('stop_id',stopId).gte('date',_histRange?.from).lte('date',_histRange?.to).limit(1000),
    ]);
    const byRoute=new Map();
    for(const row of data||[]){
      const b=byRoute.get(row.route_id)||{n:0,s:0,nAll:0};
      b.nAll+=row.n_matched;
      if(row.delay_med_s!=null){b.n+=row.n_matched;b.s+=row.delay_med_s*row.n_matched;}
      byRoute.set(row.route_id,b);
    }
    let worst=null;
    for(const[rid,b]of byRoute){
      if(b.n<10)continue;
      const med=b.s/b.n;
      if(!worst||med>worst.med)worst={name:_histRouteName(idx,rid),med};
    }
    if(worst&&worst.med<=60)worst=null; // only surface genuinely late routes
    // full observed route list, busiest first, resolved to public numbers
    const routes=[...byRoute.entries()].sort((a,b)=>b[1].nAll-a[1].nAll)
      .map(([rid])=>_histRouteName(idx,rid)).filter(Boolean);
    const res={worst,routes:[...new Set(routes)]};
    _histStopRouteCache.set(key,res);
    render(res);
  }catch(_){}
}

// ── Route speed trace (Mapbox line-gradient over archived speeds) ────────────
function _histDecodePolyline(str){
  const pts=[];let lat=0,lon=0,i=0;
  while(i<str.length){
    for(const w of[0,1]){
      let shift=0,res=0,b;
      do{b=str.charCodeAt(i++)-63;res|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
      const d=(res&1)?~(res>>1):(res>>1);
      if(w===0)lat+=d;else lon+=d;
    }
    pts.push([lon/1e5,lat/1e5]); // GeoJSON order
  }
  return pts;
}

async function _histTrace(routeId,shortName){
  if(!routeId||!mapReady)return;
  const h=t().hist;
  try{
    // all segment rows for this route (both directions, all recent weeks)
    const{data:rows,error}=await sb.from('transit_segment_weekly')
      .select('iso_week,direction,bin_idx,band,n,speed_med_kmh')
      .eq('route_id',routeId).order('iso_week',{ascending:false}).limit(1000);
    if(error)throw error;
    if(!rows?.length){showToast(h.insufficient);return;}
    const week=rows[0].iso_week;
    const wk=rows.filter(r=>r.iso_week===week);
    const nByDir=[0,1].map(d=>wk.filter(r=>r.direction===d).reduce((a,r)=>a+r.n,0));
    const dir=_histTraceState?.routeId===routeId&&_histTraceState?.flip?(1-_histTraceState.dir):(nByDir[1]>=nByDir[0]?1:0);
    // merge bands per bin, weighted by n (or a single selected band)
    const bins=new Map();
    for(const r of wk.filter(r=>r.direction===dir&&(!_histTraceBand||r.band===_histTraceBand))){
      const b=bins.get(r.bin_idx)||{w:0,s:0};
      b.w+=r.n;b.s+=r.speed_med_kmh*r.n;bins.set(r.bin_idx,b);
    }
    if(!bins.size){showToast(h.insufficient);return;}
    // polyline for this direction (direction 1 ↔ forward=true per derive convention)
    const res=await fetch(`${PROXY}/ttc/routes/${encodeURIComponent(routeId)}/polyline?forward=${dir===1?'true':'false'}`);
    if(!res.ok)throw new Error('polyline '+res.status);
    const poly=await res.json();
    const pts=_histDecodePolyline(poly.encodedValue||'');
    if(pts.length<2)throw new Error('empty polyline');
    let total=0;const cum=[0];
    for(let i=1;i<pts.length;i++){total+=_haversineM(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);cum.push(total);}
    // build step gradient by 150 m bins
    const grad=['step',['line-progress']];
    const colorOf=v=>v==null?'rgba(255,255,255,0.28)':v<8?_HIST_BAD:v<12?_HIST_WARN:_HIST_OK;
    const nBins=Math.max(1,Math.ceil(total/150));
    const b0=bins.get(0);grad.push(colorOf(b0?b0.s/b0.w:null));
    for(let i=1;i<nBins;i++){
      const b=bins.get(i);
      grad.push(Math.min(0.9999,(i*150)/total),colorOf(b?b.s/b.w:null));
    }
    const gj={type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{}};
    if(map.getLayer('hist-trace'))map.removeLayer('hist-trace');
    if(map.getSource('hist-trace'))map.removeSource('hist-trace');
    map.addSource('hist-trace',{type:'geojson',data:gj,lineMetrics:true});
    map.addLayer({id:'hist-trace',type:'line',source:'hist-trace',
      layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-width':5,'line-opacity':0.95,'line-gradient':grad}},
      map.getLayer('ttc-stops-hist')?'ttc-stops-hist':undefined);
    _histTraceState={routeId,shortName,dir,flip:false};
    const bar=document.getElementById('hist-trace-bar');
    const bandChips=['',...['am_peak','midday','pm_peak','evening']].map(b=>{
      const on=(_histTraceBand||'')===b;
      const lbl=b?h.bands[b]:h.bands.all;
      return `<button onclick="_histTraceBand='${b}'||null;_histTraceBand=_histTraceBand||null;_histTrace('${routeId}','${escapeHtml(shortName||'')}')" style="font-family:ui-monospace,monospace;font-size:0.52rem;border:1px solid ${on?'rgba(129,140,248,0.4)':'rgba(255,255,255,0.09)'};background:${on?'rgba(129,140,248,0.14)':'none'};color:${on?'#818cf8':'rgba(255,255,255,0.35)'};border-radius:5px;padding:2px 6px;cursor:pointer">${lbl}</button>`;
    }).join('');
    if(bar)bar.innerHTML=`<div style="margin-top:7px;border:1px solid rgba(129,140,248,0.25);background:rgba(129,140,248,0.08);border-radius:8px;padding:6px 8px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-family:ui-monospace,monospace;font-size:0.6rem;color:#818cf8;font-weight:700">${escapeHtml(shortName||'')}</span>
        <span style="font-size:0.56rem;color:rgba(255,255,255,0.4);flex:1">${week} · dir ${dir}</span>
        <button onclick="_histTraceState.flip=true;_histTrace('${routeId}','${escapeHtml(shortName||'')}')" style="font-family:inherit;font-size:0.56rem;border:0;background:none;color:#818cf8;cursor:pointer">${h.dirToggle}</button>
        <button onclick="_histClearTrace()" style="font-family:inherit;font-size:0.56rem;border:0;background:none;color:rgba(255,255,255,0.4);cursor:pointer">✕</button>
      </div>
      <div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap">${bandChips}</div>
    </div>`;
  }catch(e){console.warn('trace:',e);showToast((lang==='ka'?'კვალი ვერ ჩაიტვირთა':'Trace failed')+': '+(e.message||''));}
}

function _histClearTrace(){
  if(mapReady){
    if(map.getLayer('hist-trace'))map.removeLayer('hist-trace');
    if(map.getSource('hist-trace'))map.removeSource('hist-trace');
  }
  _histTraceState=null;_histTraceBand=null;
  const bar=document.getElementById('hist-trace-bar');
  if(bar)bar.innerHTML='';
}

function _histCleanup(){
  _histClearTrace();
  if(mapReady){
    ['ttc-stops-hist','ttc-stops-hist-ring','ttc-stops-hist-hover'].forEach(id=>{if(map.getLayer(id))map.removeLayer(id);});
    if(_histHoverBound){map.off('mousemove','ttc-stops-hist',_histStopMove);map.off('mouseleave','ttc-stops-hist',_histStopLeave);_histHoverBound=false;}
  }
  _histInfoHide();
  const tip=document.getElementById('hist-stop-tip');
  if(tip)tip.style.display='none';
  _histHoverId=null;_histStopRouteCache.clear();
  _ttcSetIconsVisible(true);
  _histStats=null;
}

// ── History: delay-by-hour chart ─────────────────────────────────────────────
function _histChartHtml(){
  const h=t().hist;
  if(!_histHourly||!_histHourly.length)return '';
  return `<div style="border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 9px 6px;background:rgba(255,255,255,0.02);margin-bottom:9px">
    <div style="display:flex;justify-content:space-between;font-size:0.56rem;color:rgba(255,255,255,0.45);font-weight:600;margin-bottom:6px"><span>${h.chartTitle}</span><span style="color:rgba(255,255,255,0.28);font-weight:400">${h.days[_histDaytype]} · ${h.chartUnit}</span></div>
    <div id="hist-chart" style="display:flex;align-items:stretch;gap:1.5px;height:56px;position:relative"></div>
    <div style="display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:0.46rem;color:rgba(255,255,255,0.28);margin-top:3px"><span>06</span><span>10</span><span>14</span><span>18</span><span>22</span><span>01</span></div>
  </div>`;
}

function _histChartBind(){
  const el=document.getElementById('hist-chart');
  if(!el||!_histHourly)return;
  const h=t().hist;
  // service-hour order: 06:00 → 00:59
  const order=[...Array(19).keys()].map(i=>(i+6)%24);
  const byHour=new Map(_histHourly.map(r=>[Number(r.hour),r]));
  const vals=order.map(hr=>{const r=byHour.get(hr);return r&&r.delay_med_s!=null?Number(r.delay_med_s)/60:null;});
  const maxAbs=Math.max(1,...vals.filter(v=>v!=null).map(v=>Math.abs(v)));
  el.innerHTML=order.map((hr,i)=>{
    const r=byHour.get(hr);const v=vals[i];
    if(v==null)return `<div style="flex:1"></div>`;
    const hPct=Math.max(4,Math.abs(v)/maxAbs*46);
    const up=v>=0;
    const col=up?'#fbbf24':'#818cf8';
    return `<div class="hist-bar" data-h="${hr}" data-v="${v.toFixed(1)}" data-n="${r?r.n_matched:0}" tabindex="0" style="flex:1;position:relative;cursor:pointer">
      <div style="position:absolute;left:0;right:0;${up?`bottom:50%`:`top:50%`};height:${hPct}%;background:${col};opacity:0.85;border-radius:2px"></div>
      <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,0.12)"></div>
    </div>`;
  }).join('');
  let tip=document.getElementById('hist-tip');
  if(!tip){
    tip=document.createElement('div');tip.id='hist-tip';
    tip.style.cssText='position:fixed;pointer-events:none;display:none;background:rgba(4,4,6,0.95);border:1px solid rgba(255,255,255,0.09);border-radius:7px;padding:6px 9px;font-size:0.6rem;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,0.5);line-height:1.5;color:rgba(255,255,255,0.85)';
    document.body.appendChild(tip);
  }
  el.addEventListener('mousemove',e=>{
    const b=e.target.closest('.hist-bar');
    if(!b){tip.style.display='none';return;}
    const hr=Number(b.dataset.h),v=Number(b.dataset.v);
    tip.innerHTML=`${String(hr).padStart(2,'0')}:00–${String((hr+1)%24).padStart(2,'0')}:00<br><b style="font-family:ui-monospace,monospace">${v>=0?'+':''}${v.toFixed(1)} ${t().hist.chartUnit}</b> · <span style="color:rgba(255,255,255,0.4)">${b.dataset.n} ${t().hist.obs}</span>`;
    tip.style.display='block';
    tip.style.left=Math.min(e.clientX+12,window.innerWidth-150)+'px';
    tip.style.top=(e.clientY-12)+'px';
  });
  el.addEventListener('mouseleave',()=>{tip.style.display='none';});
}

// ── History: methodology popovers (show on hover; tap also works on touch) ────
function _histInfoBtn(key){
  // Same ⓘ treatment as the wind/zoning cards for design consistency
  return `<span class="wind-info-icon" onmouseenter="_histInfoShow('${key}',this)" onmouseleave="_histInfoHide()" onclick="event.stopPropagation();_histInfoShow('${key}',this)">ⓘ</span>`;
}
function _histInfoHide(){const p=document.getElementById('hist-info-pop');if(p)p.remove();}
function _histInfoShow(key,anchor){
  const txt=t().hist[key];if(!txt)return;
  _histInfoHide();
  const pop=document.createElement('div');pop.id='hist-info-pop';pop.dataset.key=key;
  pop.style.cssText='position:fixed;max-width:230px;background:rgba(4,4,6,0.96);border:1px solid rgba(129,140,248,0.3);border-radius:8px;padding:9px 11px;font-size:0.6rem;line-height:1.5;color:rgba(255,255,255,0.75);z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.5);pointer-events:none';
  pop.textContent=txt;
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  pop.style.left=Math.min(r.left,window.innerWidth-245)+'px';
  pop.style.top=Math.min(r.bottom+6,window.innerHeight-pop.offsetHeight-10)+'px';
}

// ── History: exports ─────────────────────────────────────────────────────────
function _histExportCSV(){
  if(!_histStats?.length)return;
  const head='stop_id,stop_name,n_obs,n_matched,on_time,late,early,on_time_share,delay_med_s,delay_p90_s,ewt_s,headway_med_s';
  const rows=_histStats.map(r=>{
    const s=_ttcRenderedStops?.find(x=>x.id===r.stop_id);
    const share=Number(r.n_matched)?(Number(r.on_time)/Number(r.n_matched)).toFixed(3):'';
    return [r.stop_id,'"'+String(s?.name||'').replace(/"/g,'""')+'"',r.n_obs,r.n_matched,r.on_time,r.late,r.early,share,r.delay_med_s??'',r.delay_p90_s??'',r.ewt_s!=null?Math.round(r.ewt_s):'',r.headway_med_s!=null?Math.round(r.headway_med_s):''].join(',');
  });
  const meta=`# Urbanyx transit history · ${_histRange?.from} → ${_histRange?.to} · days=${_histDaytype} band=${_histBand}`;
  const blob=new Blob([meta+'\n'+head+'\n'+rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`transit_history_${_histRange?.from}_${_histRange?.to}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function _histExportGeoJSON(){
  if(!_histStats?.length||!_ttcRenderedStops)return;
  const features=_histStats.map(r=>{
    const s=_ttcRenderedStops.find(x=>x.id===r.stop_id);
    if(!s)return null;
    const share=Number(r.n_matched)?Number(r.on_time)/Number(r.n_matched):null;
    return {type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties:{
      stop_id:r.stop_id,name:s.name,n_obs:Number(r.n_obs),n_matched:Number(r.n_matched),
      on_time_share:share!=null?Math.round(share*1000)/1000:null,
      delay_med_s:r.delay_med_s!=null?Number(r.delay_med_s):null,
      delay_p90_s:r.delay_p90_s!=null?Number(r.delay_p90_s):null,
      ewt_s:r.ewt_s!=null?Math.round(r.ewt_s):null,
      period:`${_histRange?.from}/${_histRange?.to}`,daytype:_histDaytype,band:_histBand,
    }};
  }).filter(Boolean);
  _dlGeoJSON(`transit_history_${_histRange?.from}_${_histRange?.to}.geojson`,{type:'FeatureCollection',features});
}

// Capture the map (with History symbology) and burn a legend card into the
// image so the exported map is fully self-describing.
async function _histCaptureMapImage(){
  if(!mapReady)return null;
  // Frame the study area (isochrone, or the selected/uploaded AOI) so every
  // export is consistently zoomed to the analysis extent, in plan view
  // (bearing/pitch zeroed). The user's camera is restored after capture.
  const prev={center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};
  let framed=false;
  try{
    const geom=arguments[0]?.frameGeom||_isoData?.features?.[0]?.geometry||_currentParcelGeoJSON;
    if(geom?.coordinates){
      const lng=[],lat=[];
      (function walk(c){if(typeof c[0]==='number'){lng.push(c[0]);lat.push(c[1]);}else c.forEach(walk);})(geom.coordinates);
      if(lng.length){
        map.fitBounds([[Math.min(...lng),Math.min(...lat)],[Math.max(...lng),Math.max(...lat)]],
          {padding:{top:60,left:90,right:130,bottom:130},bearing:0,pitch:0,duration:0});
        framed=true;
        await Promise.race([new Promise(r=>map.once('idle',r)),new Promise(r=>setTimeout(r,4000))]);
      }
    }
  }catch(_){}
  try{
    return await _histComposeCapture(arguments[0]||_histLegendSpec());
  }finally{
    if(framed)map.jumpTo(prev);
  }
}

// History-mode legend spec (default when no spec is passed to the capture)
function _histLegendSpec(){
  const h=t().hist;
  const cur=_histVarDefs(h).find(v=>v.k===_histColorBy)||_histVarDefs(h)[0];
  const lines=[];
  const areaLbl=_transitAreaLabel();if(areaLbl)lines.push(areaLbl);
  lines.push(`${_histRange?.from} → ${_histRange?.to} · ${h.days[_histDaytype]} · ${h.bands[_histBand]}`);
  return{
    title:`${h.colorBy}: ${cur.l}`,
    rows:[[_HIST_OK,cur.leg[0]],[_HIST_WARN,cur.leg[1]],[_HIST_BAD,cur.leg[2]],[_HIST_GREY,h.insufficient+' (<30)']],
    lines,
  };
}

async function _histComposeCapture(spec){
  map.triggerRepaint();
  await new Promise(r=>setTimeout(r,300));
  const src=map.getCanvas();
  if(!src||!src.width)return null;
  const W=src.width,H=src.height;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.drawImage(src,0,0);
  // legend card, bottom-right, scaled to capture resolution (spec-driven so
  // any analysis section can reuse this capture with its own symbology)
  const s=Math.max(1,W/1400);
  const pad=12*s,lh=17*s,fs=11*s;
  const rows=spec?.rows||[];
  const ctxFont=w=>ctx.font=`${w?'600':'400'} ${fs}px -apple-system,sans-serif`;
  const title=spec?.title||'';
  ctxFont(0);
  const lines=spec?.lines||[];
  const wMax=Math.max(...lines.map(x=>ctx.measureText(x).width),ctx.measureText(title).width,...rows.map(r=>ctx.measureText(r[1]).width+18*s),40*s);
  const bw=wMax+pad*2+6*s,bh=pad*2+lh*(rows.length+1+lines.length);
  const bx=W-bw-16*s,by=H-bh-16*s;
  const chip=(x,y0,w0,h0)=>{
    const r0=8*s;
    ctx.fillStyle='rgba(6,6,8,0.88)';
    ctx.beginPath();
    ctx.moveTo(x+r0,y0);ctx.arcTo(x+w0,y0,x+w0,y0+h0,r0);ctx.arcTo(x+w0,y0+h0,x,y0+h0,r0);ctx.arcTo(x,y0+h0,x,y0,r0);ctx.arcTo(x,y0,x+w0,y0,r0);
    ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=s;ctx.stroke();
  };
  chip(bx,by,bw,bh);
  let ty=by+pad+fs;
  ctxFont(1);ctx.fillStyle='rgba(255,255,255,0.92)';ctx.fillText(title,bx+pad,ty);ty+=lh;
  ctxFont(0);
  for(const[col,label]of rows){
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(bx+pad+5*s,ty-fs*0.35,5*s,0,7);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.78)';ctx.fillText(label,bx+pad+16*s,ty);ty+=lh;
  }
  lines.forEach((ln,i)=>{
    ctx.fillStyle=i===lines.length-1?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.78)';
    ctx.fillText(ln,bx+pad,ty);ty+=lh;
  });
  // scale bar, bottom-left — meters per canvas pixel from zoom/latitude
  try{
    const lat=map.getCenter().lat*Math.PI/180;
    const mppCss=40075016.686*Math.cos(lat)/(512*Math.pow(2,map.getZoom()));
    const dpr=W/(map.getContainer().clientWidth||W);
    const mpp=mppCss/dpr;
    const target=mpp*170*s;
    const nice=[25,50,100,200,250,500,1000,2000,5000,10000].reduce((a,c)=>c<=target?c:a,25);
    const barPx=nice/mpp;
    const label=nice>=1000?(nice/1000)+' km':nice+' m';
    ctxFont(0);
    const sw=barPx+pad*2,sh=pad*2+lh+8*s;
    const sx=16*s,sy=H-sh-16*s;
    chip(sx,sy,sw,sh);
    const bY=sy+sh-pad;
    ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2*s;
    ctx.beginPath();
    ctx.moveTo(sx+pad,bY-6*s);ctx.lineTo(sx+pad,bY);ctx.lineTo(sx+pad+barPx,bY);ctx.lineTo(sx+pad+barPx,bY-6*s);
    ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillText(label,sx+pad+barPx/2-ctx.measureText(label).width/2,sy+pad+fs*0.8);
  }catch(_){}
  return{url:c.toDataURL('image/jpeg',0.92),w:W,h:H};
}

async function _histExportPDF(){
  if(!_histStats?.length)return;
  try{
    const{jsPDF}=window.jspdf||window;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const M=16,PW=210;let y=M;
    doc.setFontSize(15);doc.setTextColor(20);doc.text('Transit Service Reliability — Historical Assessment',M,y);y+=7;
    doc.setFontSize(8.5);doc.setTextColor(110);
    doc.text(`Period: ${_histRange?.from} to ${_histRange?.to}   ·   Days: ${_histDaytype}   ·   Time band: ${_histBand}   ·   Generated by Urbanyx`,M,y);y+=4;
    const cov=_histCoverage;
    doc.text(`Archive coverage: since ${cov?.first_date} (${cov?.days} service days). Source: vehicle positions sampled every 2 min, arrivals interpolated (±1 min).`,M,y);y+=4;
    try{
      const areaLbl=_transitAreaLabel();
      if(areaLbl)doc.text(`Study area: ${areaLbl} · ${_ttcRenderedStops?.length||0} stops within catchment.`,M,y);y+=4;
    }catch(_){}
    y+=4;
    // headline metrics
    const tot=_histStats.reduce((a,r)=>({m:a.m+Number(r.n_matched),ot:a.ot+Number(r.on_time),l:a.l+Number(r.late)}),{m:0,ot:0,l:0});
    const meds=_histStats.map(r=>r.delay_med_s).filter(v=>v!=null).map(Number).sort((a,b)=>a-b);
    const med=meds.length?meds[meds.length>>1]:null;
    doc.setFontSize(11);doc.setTextColor(20);
    doc.text(`On-time performance: ${tot.m?Math.round(100*tot.ot/tot.m):'—'}%   ·   Late: ${tot.m?Math.round(100*tot.l/tot.m):'—'}%   ·   Median delay: ${med!=null?(med>=0?'+':'')+(med/60).toFixed(1)+' min':'—'}`,M,y);y+=5;
    doc.setFontSize(8);doc.setTextColor(110);
    doc.text(`${tot.m.toLocaleString()} schedule-matched arrival observations across ${_histStats.length} stop-route pairs within the study area.`,M,y);y+=8;
    // high-resolution map with burned-in legend
    try{
      const img=await _histCaptureMapImage();
      if(img){
        const imgW=PW-M*2;
        let imgH=imgW*(img.h/img.w);
        if(imgH>150){imgH=150;} // keep the table on page 1 territory sane
        doc.addImage(img.url,'JPEG',M,y,imgW,imgH);
        doc.setDrawColor(210);doc.rect(M,y,imgW,imgH);
        y+=imgH+3;
        doc.setFontSize(6.5);doc.setTextColor(150);
        doc.text('Stops colored by the selected reliability variable (legend on map). Basemap © Mapbox © OpenStreetMap.',M,y);y+=7;
      }
    }catch(e){console.warn('hist pdf map:',e);}
    if(y>200){doc.addPage();y=M;}
    // worst stops table
    doc.setFontSize(10);doc.setTextColor(20);doc.text('Least reliable stops',M,y);y+=5;
    doc.setFontSize(7.5);
    const ranked=_histStats.filter(r=>Number(r.n_matched)>=30).sort((a,b)=>Number(b.late)/Number(b.n_matched)-Number(a.late)/Number(a.n_matched)).slice(0,12);
    doc.setTextColor(110);doc.text('Stop',M,y);doc.text('Obs',110,y);doc.text('Late %',130,y);doc.text('Median delay',152,y);y+=1.5;
    doc.setDrawColor(200);doc.line(M,y,194,y);y+=4;
    doc.setTextColor(30);
    for(const r of ranked){
      const s=_ttcRenderedStops?.find(x=>x.id===r.stop_id);
      doc.text(String(s?.name||r.stop_id).slice(0,52),M,y);
      doc.text(String(r.n_matched),110,y);
      doc.text(Math.round(100*Number(r.late)/Number(r.n_matched))+'%',130,y);
      doc.text(r.delay_med_s!=null?((r.delay_med_s>=0?'+':'')+(r.delay_med_s/60).toFixed(1)+' min'):'—',152,y);
      y+=4.6;if(y>270)break;
    }
    y+=6;
    doc.setFontSize(7);doc.setTextColor(130);
    const note='Methodology: on-time = arrival within -60s to +300s of schedule. Delays derived from TTC real-time vehicle positions archived at 2-minute cadence; stop arrivals interpolated between consecutive fixes along the route, matched to the service-day timetable (nearest departure within 20 min). Stops with fewer than 30 matched observations are excluded from rankings. Figures are estimates suitable for planning-level assessment.';
    doc.text(doc.splitTextToSize(note,178),M,y);
    doc.save(`transit_history_${_histRange?.from}_${_histRange?.to}.pdf`);
  }catch(e){console.warn('hist pdf:',e);showToast('PDF failed: '+(e.message||''));}
}

// ── History: saved-project restore hook ──────────────────────────────────────
// _buildActionLog records this when a project is saved in History mode.
function _histRestore(days,band,daytype){
  _histDays=days||7;_histBand=band||'all';_histDaytype=daytype||'all';
  if(!currentUser||currentUser.plan!=='pro')return;
  _ttcClearPoll();_clearBusStopRoute();
  _ttcMode='history';
  _ttcRenderPanel();
}

// ── Urban Morphology exports (same styling/machinery as History exports) ─────
let _orientGJ=null,_orientBins=null,_orientDom=null,_syntaxGJ=null;

function _morphHasData(){return !!(_syntaxGJ?.features?.length||_orientGJ?.features?.length);}

function _morphTotalKm(gj){
  let m=0;
  for(const f of gj?.features||[]){
    const c=f.geometry?.coordinates||[];
    for(let i=1;i<c.length;i++)m+=_haversineM(c[i-1][0],c[i-1][1],c[i][0],c[i][1]);
  }
  return m/1000;
}

function _morphExportGeoJSON(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall(true);return;}
  if(!_morphHasData()){showToast(lang==='ka'?'ჯერ გაუშვით მორფოლოგიის ანალიზი':'Run a morphology analysis first');return;}
  const features=[];
  for(const f of _syntaxGJ?.features||[])features.push({...f,properties:{...f.properties,analysis:'space_syntax'}});
  for(const f of _orientGJ?.features||[])features.push({...f,properties:{...f.properties,analysis:'orientation'}});
  const areaGeom=_isoData?.features?.[0]?.geometry||_currentParcelGeoJSON;
  if(areaGeom)features.push({type:'Feature',geometry:areaGeom,properties:{analysis:'study_area',label:_transitAreaLabel()||''}});
  logFeatureUse('geojson_export').catch(()=>{});
  _dlGeoJSON('urban_morphology.geojson',{type:'FeatureCollection',features});
}

function _morphLegendSpec(){
  const isKa=lang==='ka';
  const rows=[];
  if(_syntaxGJ?.features?.length){
    rows.push(['#3b82f6',(isKa?'კავშირობა':'Connectivity')+' ≤1'],['#22c55e','2–3'],['#f97316','4–5'],['#ef4444','≥6']);
  }
  const lines=[];
  if(_orientGJ?.features?.length&&_orientDom)lines.push((isKa?'ორიენტაცია':'Dominant orientation')+': '+_orientDom);
  const areaLbl=_transitAreaLabel();if(areaLbl)lines.push(areaLbl);
  lines.push(new Date().toLocaleDateString(isKa?'ka-GE':'en-GB',{day:'numeric',month:'short',year:'numeric'}));
  return{title:isKa?'ურბანული მორფოლოგია':'Urban Morphology',rows,lines};
}

async function _morphExportPDF(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall(true);return;}
  if(!_morphHasData()){showToast(lang==='ka'?'ჯერ გაუშვით მორფოლოგიის ანალიზი':'Run a morphology analysis first');return;}
  try{
    const{jsPDF}=window.jspdf||window;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const M=16,PW=210;let y=M;
    doc.setFontSize(15);doc.setTextColor(20);doc.text('Urban Morphology — Street Network Assessment',M,y);y+=7;
    doc.setFontSize(8.5);doc.setTextColor(110);
    const areaLbl=_transitAreaLabel();
    doc.text(`Generated by Urbanyx · ${new Date().toISOString().slice(0,10)}${areaLbl?`   ·   Study area: ${areaLbl}`:''}`,M,y);y+=8;
    // headline metrics
    doc.setFontSize(11);doc.setTextColor(20);
    const parts=[];
    if(_syntaxGJ?.features?.length){
      const degs=_syntaxGJ.features.map(f=>Number(f.properties?.connectivity||0));
      const mean=degs.reduce((a,b)=>a+b,0)/Math.max(1,degs.length);
      parts.push(`Street connectivity: ${degs.length} segments · ${_morphTotalKm(_syntaxGJ).toFixed(1)} km · mean degree ${mean.toFixed(2)} · max ${Math.max(...degs)}`);
    }
    if(_orientGJ?.features?.length){
      parts.push(`Street orientation: ${_orientGJ.features.length} ways${_orientDom?` · dominant axis ${_orientDom}`:''}`);
    }
    for(const p of parts){doc.text(p,M,y);y+=5.5;}
    y+=4;
    // high-resolution map with burned-in legend (framed to study area)
    try{
      const img=await _histCaptureMapImage(_morphLegendSpec());
      if(img){
        const imgW=PW-M*2;
        let imgH=imgW*(img.h/img.w);
        if(imgH>170)imgH=170;
        doc.addImage(img.url,'JPEG',M,y,imgW,imgH);
        doc.setDrawColor(210);doc.rect(M,y,imgW,imgH);
        y+=imgH+3;
        doc.setFontSize(6.5);doc.setTextColor(150);
        doc.text('Street network colored by node connectivity; orientation layer colored by segment bearing. Basemap © Mapbox © OpenStreetMap.',M,y);y+=7;
      }
    }catch(e){console.warn('morph pdf map:',e);}
    if(y>250){doc.addPage();y=M;}
    doc.setFontSize(7);doc.setTextColor(130);
    const note='Methodology: street centerlines from OpenStreetMap (Overpass API) within the study area. Connectivity = number of street segments sharing each junction (node degree), a proxy for network integration. Orientation = length-weighted distribution of segment bearings in 10-degree bins. Figures are planning-level estimates; network data completeness depends on OSM coverage. Street data © OpenStreetMap contributors.';
    doc.text(doc.splitTextToSize(note,178),M,y);
    logFeatureUse('pdf_export').catch(()=>{});
    doc.save('urban_morphology.pdf');
  }catch(e){console.warn('morph pdf:',e);showToast('PDF failed: '+(e.message||''));}
}

// ── Unified report export: everything active on the map, in one PDF ──────────
// Two maps: area scale (isochrone/AOI — morphology, mobility, accessibility)
// and parcel scale (zoning, relief, climate), each with merged symbology.
function _rptOn(id){return !!document.getElementById(id)?.classList.contains('on');}
function _rptActive(){
  const a={
    zoning:(!!document.getElementById('nav-zoning-btn')?.classList.contains('active'))||(typeof _maxFootprintM2==='number'&&_maxFootprintM2>0)||(typeof _noDevZone!=='undefined'&&_noDevZone)||!!(map.getLayer?.('zone-overlay-fill')),
    syntax:!!(_syntaxGJ?.features?.length&&map.getLayer?.('syntax-line')),
    orient:!!(_orientGJ?.features?.length&&map.getLayer?.('orient-line')),
    osm:typeof _osmActive!=='undefined'&&!!_osmActive,
    transit:_rptOn('acc-transit-sw'),
    history:_ttcMode==='history'&&!!_histStats?.length,
    schools:typeof _schoolsLayerActive!=='undefined'&&!!_schoolsLayerActive,
    kg:typeof _kgLayerActive!=='undefined'&&!!_kgLayerActive,
    crashes:_rptOn('acc-mob-sw'),
    parking:_rptOn('acc-parking-sw'),
    isochrone:!!_isoData?.features?.[0],
    canopy:_rptOn('acc-canopy-sw'),
    lst:_rptOn('acc-lst-sw'),
    wind:_rptOn('acc-wind-sw'),
    relief:typeof _reliefActiveType!=='undefined'&&!!_reliefActiveType,
    solar:_rptOn('acc-solar-sw')||(typeof _solarOverlayCache!=='undefined'&&!!_solarOverlayCache),
  };
  a.anyArea=a.syntax||a.orient||a.osm||a.transit||a.history||a.schools||a.kg||a.crashes||a.parking||a.isochrone;
  a.anyParcel=a.zoning||a.canopy||a.lst||a.wind||a.relief||a.solar||!!_currentParcelGeoJSON;
  return a;
}

async function exportReportPDF(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall(true);return;}
  const a=_rptActive();
  if(!a.anyArea&&!a.anyParcel){showToast(lang==='ka'?'აქტიური ანალიზი არ არის':'No active analysis layers to export');return;}
  showToast(lang==='ka'?'რეპორტი მზადდება…':'Composing report…');
  try{
    const{jsPDF}=window.jspdf||window;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    // Latin renders in Helvetica (always present). The embedded Noto font is
    // used ONLY for strings that contain Georgian glyphs — the Google Fonts
    // subset has no Latin, so applying it globally blanks all English text.
    const _F=await _rptLoadFonts(doc); // Google Sans (Latin+Georgian) or fallback
    const FAM=_F.ok?'GSans':'helvetica';
    const M=16,PW=210,BOT=272;let y=M;
    const sources=[];
    const src=(s)=>{if(!sources.includes(s))sources.push(s);};
    // Google Sans SemiBold for headings, Regular for body — same family throughout
    const setFor=(str,w)=>doc.setFont(FAM,w==='bold'?'bold':'normal');
    const T=(str,x,yy,opts)=>{setFor(str,opts&&opts.w);doc.text(str,x,yy,opts&&opts.o);};
    const ensure=(need)=>{if(y+need>BOT){doc.addPage();y=M;}};
    const H1=(txt)=>{doc.setFontSize(15);doc.setTextColor(20);T(txt,M,y,{w:'bold'});y+=7;};
    const H2=(txt)=>{ensure(11);y+=2;doc.setFontSize(11);doc.setTextColor(30);T(txt,M,y,{w:'bold'});y+=1.5;doc.setDrawColor(210);doc.line(M,y,PW-M,y);y+=4.5;};
    const H3=(txt)=>{ensure(8);y+=1;doc.setFontSize(9);doc.setTextColor(40);T(txt,M,y,{w:'bold'});y+=4.5;};
    const P=(txt,col)=>{doc.setFontSize(8.5);doc.setTextColor(col??60);setFor(txt);const ls=doc.splitTextToSize(txt,PW-M*2);ensure(ls.length*4+1);ls.forEach(l=>{setFor(l);doc.text(l,M,y);y+=4;});y+=1.5;};
    // color-swatch legend row
    const legend=(pairs)=>{doc.setFontSize(7.5);let lx=M;ensure(7);pairs.forEach(([c,l])=>{const tw=doc.getTextWidth(l)+9;if(lx+tw>PW-M){y+=5;lx=M;}doc.setFillColor(c);doc.circle(lx+2,y-1.2,1.6,'F');doc.setTextColor(70);doc.text(l,lx+5,y);lx+=tw+3;});y+=5;};

    // ── Title ──
    H1('Urbanyx — Site & Area Analysis Report');
    const rp=window._rptParcel||{};
    const areaLbl=_transitAreaLabel();
    doc.setFontSize(8.5);doc.setTextColor(110);
    const ctx=[new Date().toISOString().slice(0,10)];
    if(rp.code&&rp.code!=='—')ctx.push('Parcel '+rp.code);
    if(areaLbl)ctx.push(areaLbl);
    T(ctx.join('   ·   '),M,y);y+=8;

    // ── Maps: area and parcel are two separate, independently captured maps ──
    H2('Maps');
    const addMapBlock=async(caption,spec)=>{
      const img=await _histCaptureMapImage(spec);
      if(!img)return false;
      H3(caption);
      const w=PW-M*2;const hh=Math.min(120,w*(img.h/img.w));ensure(hh+2);
      doc.addImage(img.url,'JPEG',M,y,w,hh);doc.setDrawColor(200);doc.rect(M,y,w,hh);
      y+=hh+2;
      doc.setFontSize(6.5);doc.setTextColor(150);T('Basemap © Mapbox © OpenStreetMap.',M,y);y+=6;
      src('Basemap: © Mapbox, © OpenStreetMap contributors.');
      return true;
    };
    if(a.anyArea&&(_isoData?.features?.[0]||_isLargeParcel())){
      const rows=[],lines=[];
      if(a.history){const h=t().hist;const cur=_histVarDefs(h).find(v=>v.k===_histColorBy)||_histVarDefs(h)[0];
        rows.push([_HIST_OK,cur.leg[0]],[_HIST_WARN,cur.leg[1]],[_HIST_BAD,cur.leg[2]]);lines.push('Transit: '+cur.l);}
      if(a.syntax)rows.push(['#3b82f6','Conn. ≤1'],['#22c55e','2–3'],['#f97316','4–5'],['#ef4444','≥6']);
      const others=[a.orient&&('Orientation'+(_orientDom?' ('+_orientDom+')':'')),a.osm&&'Urban functions',a.transit&&!a.history&&'Transit stops',a.schools&&'Schools',a.kg&&'Kindergartens',a.crashes&&'Road incidents',a.parking&&'Parking'].filter(Boolean);
      if(others.length)lines.push('Layers: '+others.join(' · '));
      if(areaLbl)lines.push(areaLbl);
      await addMapBlock('Area-scale map',{title:'Area analyses',rows:rows.slice(0,8),lines});
    }
    const hasParcelAnalysis=a.zoning||a.canopy||a.lst||a.wind||a.relief||a.solar;
    if(hasParcelAnalysis&&_currentParcelGeoJSON){
      const rows=[],lines=[];
      // Real symbology per active parcel-scale layer — not just a text label
      if(a.zoning&&window._rptZones?.length){
        const seen=new Set();
        for(const z of window._rptZones){
          const info=_zoneInfo(z.kve_zona);const label=z.kve_zona||'Zone';
          const key=info.f+'|'+label;if(seen.has(key))continue;seen.add(key);
          rows.push([info.f,label]);
        }
        lines.push('Zoning'+(_noDevZone?' — no-development area':''));
      }
      if(a.canopy){rows.push(['#22c55e','Tree canopy']);lines.push('Tree canopy overlay');}
      if(a.lst){rows.push(['#f97316','Warmer'],['#3b82f6','Cooler']);lines.push('Land surface temperature');}
      if(a.relief&&(_reliefActiveType==='slope'||_reliefActiveType==='aspect')){
        t().slopeClasses.forEach((c,i)=>rows.push([t().slopeClassColors[i],c.l+' '+c.r]));
        lines.push('Relief · '+_reliefActiveType);
      } else if(a.relief){lines.push('Relief · elevation');}
      if(a.solar){rows.push(['#fbbf24','High irradiation'],['#1e3a8a','Low irradiation']);lines.push('Solar zone');}
      if(a.wind)lines.push('Wind analysis');
      const m2=_currentParcelAreaM2||0;
      if(m2)lines.push('Parcel · '+(m2>=1e6?(m2/1e6).toFixed(2)+' km²':Math.round(m2).toLocaleString()+' m²'));
      await addMapBlock('Parcel-scale map',{title:'Parcel analyses',rows:rows.slice(0,10),lines,frameGeom:_currentParcelGeoJSON});
    }

    // ── Findings ──
    H2('Findings');
    // Ownership analysis — always included when a parcel is selected
    if(_currentParcelGeoJSON){
      H3('Ownership');
      // labelled key/value rows (label in muted ink, value in near-black)
      const kv=(label,val)=>{if(!val||val==='—')return;doc.setFontSize(8.5);ensure(5);
        setFor(label);doc.setTextColor(120);doc.text(label,M,y);
        const vx=M+40,vw=PW-M-vx;const ls=doc.splitTextToSize(String(val),vw);
        setFor(String(val));doc.setTextColor(30);doc.text(ls,vx,y);y+=Math.max(1,ls.length)*4+1.2;};
      kv('Parcel code',rp.code);
      const m2=_currentParcelAreaM2||0;
      kv('Area',m2?Math.round(m2).toLocaleString()+' m²':null);
      kv('Parcel type',rp.type&&rp.type!=='—'?rp.type:null);
      kv('Ownership type',rp.ownershipType&&rp.ownershipType!=='—'?rp.ownershipType:null);
      kv('Address',rp.address&&rp.address!=='—'?rp.address:null);
      kv('Registered',rp.regDate?new Date(rp.regDate).toLocaleDateString(lang==='ka'?'ka-GE':'en-GB',{day:'numeric',month:'long',year:'numeric'}):null);
      const owners=rp.owners&&rp.owners.length?rp.owners:null;
      if(owners){
        kv('Owner(s)',owners.map(o=>o.name).filter(Boolean).join('; ')||rp.ownersRaw);
        const withId=owners.filter(o=>o.id);
        if(withId.length){y+=0.5;withId.forEach(o=>{doc.setFontSize(7.5);setFor(o.name);doc.setTextColor(110);ensure(4);doc.text('   • '+[o.name,o.id&&('ID '+o.id),o.type].filter(Boolean).join(' · '),M,y);y+=3.8;});}
        src('Ownership & registration: National Agency of Public Registry (NAPR), Georgia.');
      } else if(rp.ownersRaw&&rp.ownersRaw!=='—'){kv('Owner(s)',rp.ownersRaw);src('Ownership & registration: National Agency of Public Registry (NAPR), Georgia.');}
    }
    // Zoning
    if(a.zoning){
      H3('Zoning & development limits');
      const zl=_rptCardLines('pfc-zones-list');
      if(zl.length)P(zl.join(' · '));
      const kbits=[];
      if(typeof _maxFootprintM2==='number'&&_maxFootprintM2)kbits.push(`max footprint (K1) ${Math.round(_maxFootprintM2).toLocaleString()} m²`);
      if(typeof _maxFloorAreaM2==='number'&&_maxFloorAreaM2)kbits.push(`max floor area (K2) ${Math.round(_maxFloorAreaM2).toLocaleString()} m²`);
      if(typeof _maxFootprintM2==='number'&&_maxFootprintM2&&typeof _maxFloorAreaM2==='number'&&_maxFloorAreaM2)kbits.push(`max height ${Math.floor(_maxFloorAreaM2/_maxFootprintM2)} floors`);
      if(_noDevZone)kbits.push('area not designated for development');
      if(kbits.length)P('Limits: '+kbits.join(' · ')+'.');
      src('Zoning: Tbilisi Municipality functional-zone WFS; K-coefficient limits per zone.');
    }
    // Morphology
    if(a.syntax||a.orient){
      H3('Street network & morphology');
      if(a.syntax){const degs=_syntaxGJ.features.map(f=>Number(f.properties?.connectivity||0));
        P(`Connectivity: ${degs.length} segments · ${_morphTotalKm(_syntaxGJ).toFixed(1)} km · mean node degree ${(degs.reduce((x,b)=>x+b,0)/Math.max(1,degs.length)).toFixed(2)}, max ${Math.max(...degs)}.`);
        legend([['#3b82f6','≤1'],['#22c55e','2–3'],['#f97316','4–5'],['#ef4444','≥6']]);}
      if(a.orient){P(`Orientation: ${_orientGJ.features.length} street ways${_orientDom?`, dominant axis ${_orientDom}`:''}.`);}
      if(a.osm){const ol=_rptCardLines('osm-legend');if(ol.length)P('Urban functions: '+ol.join(' · '));}
      src('Street network & functions: © OpenStreetMap contributors (Overpass API).');
    }
    // Relief / slope / aspect — only when a relief layer is actually active
    if(a.relief){
      H3('Relief · slope · aspect');
      const typeLbl={height:'Elevation',slope:'Slope',aspect:'Aspect'}[_reliefActiveType]||_reliefActiveType;
      P('Active layer: '+typeLbl+'.');
      const rl=_rptCardLines('relief-legend').concat(_rptCardLines('relief-stats'));
      if(rl.length)P(rl.join(' · '));
      if(_reliefActiveType==='slope'||_reliefActiveType==='aspect')legend(t().slopeClasses.map((c,i)=>[t().slopeClassColors[i],c.l+' '+c.r]));
      src('Elevation: digital terrain model; slope and aspect derived on the fly.');
    }
    // Energy — only sub-analyses actually run
    if(a.solar||a.wind){
      H3('Energy potential');
      if(a.solar){const sl=_rptCardLines('solar-result');if(sl.length)P('Solar: '+sl.join(' · '));src('Solar: slope/aspect irradiation model on the DTM.');}
      if(a.wind){const wd=_windData||{};P('Wind: '+[wd.speed&&wd.speed.toFixed(1)+' m/s mean',wd.powerDensity&&Math.round(wd.powerDensity)+' W/m²',wd.annualYield&&Math.round(wd.annualYield).toLocaleString()+' kWh/yr (5 kW ref.)'].filter(Boolean).join(' · ')+'.');src('Wind: Global Wind Atlas / Open-Meteo.');}
    }
    // Climate — per active layer
    if(a.canopy||a.lst){
      H3('Climate & land cover');
      if(a.canopy){const cl=_rptCardLines('acc-canopy-result');if(cl.length)P('Tree canopy: '+cl.join(' · '));src('Tree canopy: ESA WorldCover 10 m (2021).');}
      if(a.lst){const ll=_rptCardLines('acc-lst-result');if(ll.length)P('Land surface temperature: '+ll.join(' · '));src('Land surface temperature: Landsat-derived raster.');}
    }
    // Mobility & access
    if(a.transit||a.history||a.crashes||a.schools||a.kg||a.parking){
      H3('Mobility & access');
      if(a.history&&_histStats?.length){
        const tot=_histStats.reduce((x,r)=>({m:x.m+Number(r.n_matched),ot:x.ot+Number(r.on_time),l:x.l+Number(r.late)}),{m:0,ot:0,l:0});
        if(tot.m){P(`Transit reliability (${_histRange?.from} → ${_histRange?.to}, ${t().hist.days[_histDaytype]}/${t().hist.bands[_histBand]}): ${Math.round(100*tot.ot/tot.m)}% on-time, ${Math.round(100*tot.l/tot.m)}% late (>5 min), ${tot.m.toLocaleString()} matched arrivals at ${_histStats.length} stop-route pairs.`);
        legend([[_HIST_OK,'≥80%'],[_HIST_WARN,'60–80%'],[_HIST_BAD,'<60%']]);}
        src('Transit reliability: TTC vehicle positions archived every 2 min; arrivals interpolated (±1 min), matched to timetable (on-time −60…+300 s); stops with <30 obs excluded.');
      } else if(a.transit){P(`Public transport: ${_ttcRenderedStops?.length||0} stops within the study area.`);src('Transit stops: Tbilisi Transport Company (TTC).');}
      if(a.crashes){P('Road incidents layer active (see map).');src('Road incidents: Ministry of Internal Affairs crash records.');}
      if(a.parking){
        const ps=window._parkingSummary;
        if(ps){P(`Parking: ${ps.totalAreas} areas (${ps.freeAreas} free · ${ps.paidAreas} paid) · ${ps.cars.toLocaleString()} car spaces${ps.accessible?` · ${ps.accessible} wheelchair-accessible`:''}${ps.ev?` · ${ps.ev} EV chargers`:''}${ps.taxi?` · ${ps.taxi} taxi`:''}${ps.distribution?` · ${ps.distribution} loading`:''}.`);}
        else P('Parking layer active (see map).');
        src('Parking: Tbilisi Municipality on-street parking dataset.');
      }
      if(a.schools||a.kg){P(`Education access: ${[a.schools&&'public schools',a.kg&&'kindergartens'].filter(Boolean).join(' and ')} shown on the area map.`);src('Education facilities: open municipal datasets.');}
    }
    if(a.isochrone)src(`Catchment: ${_accMinutes||10}-minute ${_accMode||'walking'} isochrone (Mapbox Isochrone API).`);

    // ── Sources (ordered by appearance) ──
    if(sources.length){
      H2('Sources');
      doc.setFontSize(7.5);doc.setTextColor(120);
      sources.forEach((s,i)=>{const ls=doc.splitTextToSize(`${i+1}.  ${s}`,PW-M*2);ensure(ls.length*3.6+1);ls.forEach(l=>{setFor(l);doc.text(l,M,y);y+=3.6;});y+=1;});
    }

    // ── Footer: logo (bottom-left) + page number (bottom-right) on every page ──
    const logo=await _svgToPng('analysis-logos/urbanyx-zaxis-logo.svg',260).catch(()=>null);
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){
      doc.setPage(i);
      doc.setDrawColor(225);doc.line(M,283,PW-M,283);
      if(logo){const lw=20,lh=lw*(logo.h/logo.w);doc.addImage(logo.url,'PNG',M,285-lh+2,lw,lh);}
      doc.setFontSize(7);doc.setTextColor(150);setFor('Page');
      doc.text(`Page ${i} / ${n}`,PW-M,289,{align:'right'});
      doc.text('urbanyx.zaxis.ge',PW/2,289,{align:'center'});
    }
    logFeatureUse('pdf_export').catch(()=>{});
    doc.save('urbanyx_report.pdf');
  }catch(e){console.warn('report pdf:',e);showToast('PDF failed: '+(e.message||''));}
}

// ── Report menu + consolidated exports ────────────────────────────────────────
const _rptRasterSrc={}; // name → source url of rasters currently loaded
// Flyout next to the left rail, anchored to the Generate Report nav button
function _rptMenuToggle(btn){
  let m=document.getElementById('rpt-menu');
  if(m){m.remove();document.getElementById('nav-report-icon')?.style.setProperty('opacity','0.55');return;}
  const isKa=lang==='ka';
  const btnS='display:block;width:100%;text-align:left;font-family:inherit;font-size:0.66rem;font-weight:600;padding:8px 11px;border-radius:8px;margin-top:5px;cursor:pointer;';
  m=document.createElement('div');m.id='rpt-menu';
  m.style.cssText='position:fixed;left:64px;z-index:60;width:198px;background:var(--glass-bg,rgba(8,8,8,0.9));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.09);border-radius:11px;padding:9px 10px 11px;box-shadow:0 8px 28px rgba(0,0,0,0.45)';
  m.innerHTML=
    `<div style="font-family:ui-monospace,monospace;font-size:0.52rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.35)">${isKa?'რეპორტი':'Report'}</div>`+
    `<button onclick="_rptMenuToggle();exportReportPDF()" style="${btnS}border:1px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.12);color:#34d399">${isKa?'PDF რეპორტის ექსპორტი':'Export PDF report'}</button>`+
    `<button onclick="_rptMenuToggle();_rptExportGeoJSON()" style="${btnS}border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.6)">${isKa?'აქტიური ფენები · GeoJSON':'Active layers · GeoJSON'}</button>`+
    `<button onclick="_rptMenuToggle();_rptExportGeoTIFF()" style="${btnS}border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.6)">${isKa?'აქტიური რასტრები · GeoTIFF':'Active rasters · GeoTIFF'}</button>`;
  document.body.appendChild(m);
  const r=(btn||document.getElementById('nav-report-btn'))?.getBoundingClientRect();
  m.style.top=Math.max(8,Math.min((r?.top||120)-8,window.innerHeight-m.offsetHeight-10))+'px';
  document.getElementById('nav-report-icon')?.style.setProperty('opacity','1');
  setTimeout(()=>document.addEventListener('click',function _c(e){
    if(!m.contains(e.target)&&!e.target.closest('#nav-report-btn')){
      m.remove();document.getElementById('nav-report-icon')?.style.setProperty('opacity','0.55');
      document.removeEventListener('click',_c);
    }
  }),0);
}

// Georgian (mkhedruli) → Latin, national transliteration system. Helvetica has
// no Georgian glyphs, so PDF text is romanized instead of rendering as boxes.
const _KA2LAT={'ა':'a','ბ':'b','გ':'g','დ':'d','ე':'e','ვ':'v','ზ':'z','თ':'t','ი':'i','კ':"k'",'ლ':'l','მ':'m','ნ':'n','ო':'o','პ':"p'",'ჟ':'zh','რ':'r','ს':'s','ტ':"t'",'უ':'u','ფ':'p','ქ':'k','ღ':'gh','ყ':"q'",'შ':'sh','ჩ':'ch','ც':'ts','ძ':'dz','წ':"ts'",'ჭ':"ch'",'ხ':'kh','ჯ':'j','ჰ':'h'};
function _kaToLat(str){
  if(!str)return str;
  return String(str).replace(/[ა-ჰ]/g,ch=>_KA2LAT[ch]??ch);
}

function _rptExportGeoJSON(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall(true);return;}
  const a=_rptActive();
  const features=[];
  const tag=(gj,name)=>{for(const f of gj?.features||[])features.push({...f,properties:{...f.properties,analysis:name}});};
  if(a.syntax)tag(_syntaxGJ,'space_syntax');
  if(a.orient)tag(_orientGJ,'orientation');
  if((a.transit||a.history)&&_ttcRenderedStops){
    for(const s of _ttcRenderedStops){
      const r=_histStats?.find(x=>x.stop_id===s.id);
      features.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties:{
        analysis:'transit_stop',stop_id:s.id,name:s.name,routes:(s.routes||[]).map(x=>x.shortName).join(','),
        ...(r?{n_matched:Number(r.n_matched),on_time_share:Number(r.n_matched)?Math.round(1000*Number(r.on_time)/Number(r.n_matched))/1000:null,delay_med_s:r.delay_med_s!=null?Number(r.delay_med_s):null}:{}),
      }});
    }
  }
  if(a.isochrone)features.push({type:'Feature',geometry:_isoData.features[0].geometry,properties:{analysis:'isochrone',label:_transitAreaLabel()||''}});
  if(_currentParcelGeoJSON)features.push({type:'Feature',geometry:_currentParcelGeoJSON,properties:{analysis:'parcel',area_m2:Math.round(_currentParcelAreaM2||0)}});
  if(!features.length){showToast(lang==='ka'?'აქტიური ვექტორული ფენა არ არის':'No active vector layers');return;}
  logFeatureUse('geojson_export').catch(()=>{});
  _dlGeoJSON('urbanyx_active_layers.geojson',{type:'FeatureCollection',features});
}

async function _rptExportGeoTIFF(){
  if(!currentUser||currentUser.plan!=='pro'){openPaywall(true);return;}
  const names=Object.keys(_rptRasterSrc);
  if(!names.length){showToast(lang==='ka'?'აქტიური რასტრული ფენა არ არის':'No active raster layers loaded this session');return;}
  showToast((lang==='ka'?'იტვირთება':'Downloading')+` ${names.length} GeoTIFF…`);
  for(const n of names){
    try{
      const res=await fetch(_rptRasterSrc[n]);
      if(!res.ok)continue;
      const blob=await res.blob();
      const aEl=document.createElement('a');
      aEl.href=URL.createObjectURL(blob);aEl.download=`urbanyx_${n}.tif`;aEl.click();
      setTimeout(()=>URL.revokeObjectURL(aEl.href),2000);
    }catch(e){console.warn('geotiff dl:',n,e);}
  }
  logFeatureUse('geojson_export').catch(()=>{});
}

// ── Report helpers: font, logo raster, metric scraping ───────────────────────
async function _fetchB64(url){
  try{const r=await fetch(url);if(!r.ok)return null;const buf=new Uint8Array(await r.arrayBuffer());let bin="";for(let i=0;i<buf.length;i+=8192)bin+=String.fromCharCode(...buf.subarray(i,i+8192));return btoa(bin);}catch(_){return null;}
}
// Google Sans (static weights, incl. Georgian glyphs) from the local fonts/ dir.
// Regular for body, SemiBold for headings — one family covers Latin + Georgian.
const _rptFonts={reg:undefined,semi:undefined};
async function _rptLoadFonts(doc){
  if(_rptFonts.reg===undefined){
    _rptFonts.reg =await _fetchB64('fonts/static/GoogleSans-Regular.ttf');
    _rptFonts.semi=await _fetchB64('fonts/static/GoogleSans-SemiBold.ttf')||_rptFonts.reg;
  }
  let ok=false;
  try{
    if(_rptFonts.reg){
      doc.addFileToVFS('GSans.ttf',_rptFonts.reg);doc.addFont('GSans.ttf','GSans','normal');
      doc.addFileToVFS('GSansSB.ttf',_rptFonts.semi);doc.addFont('GSansSB.ttf','GSans','bold');
      ok=true;
    }
  }catch(e){console.warn('[report] font load:',e);}
  return {ok};
}

// Rasterize an SVG asset to a PNG data URL (jsPDF can't embed SVG directly)
function _svgToPng(url,targetW){
  return new Promise((resolve)=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>{
      const scale=targetW/(img.width||64);
      const c=document.createElement("canvas");
      c.width=targetW;c.height=Math.round((img.height||64)*scale);
      const ctx=c.getContext("2d");
      ctx.drawImage(img,0,0,c.width,c.height);
      try{resolve({url:c.toDataURL("image/png"),w:c.width,h:c.height});}catch(_){resolve(null);}
    };
    img.onerror=()=>resolve(null);
    img.src=url;
  });
}

// Pull the rendered metric lines out of an analysis card (label:value text)
function _rptCardLines(id){
  const el=document.getElementById(id);
  if(!el)return[];
  return (el.innerText||"").split("\n").map(s=>s.trim()).filter(s=>s.length>1);
}
