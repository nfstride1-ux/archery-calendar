/* Archery Calendar: 3D globe overlay for the Map link on event pages.
   Loaded on demand by app.js only when Map is tapped (never precached); ported from the /map-test/ demo (e70a469).
   API: ACGlobe.open(target, {pins, from, onClose}); ACGlobe.close(); ACGlobe.isOpen(). */
(function(){
'use strict';
var BASE=(function(){var s=document.currentScript&&document.currentScript.src;return s?s.replace(/[^\/]*$/,''):'globe/'})();
var $=function(i){return document.getElementById(i)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var reduce=function(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches};
var PRESETS={perth:{lat:-31.9505,lng:115.8605,name:'Perth'}};
var D={pins:[]}, OPTS={};
(function(){
  var l=document.createElement('link');l.rel='stylesheet';l.href=BASE+'globe.css';document.head.appendChild(l);
  var w=document.createElement('div');w.innerHTML="<div id=\"gov\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"gtitle\" aria-hidden=\"true\">\n <div id=\"gdlg\">\n  <div id=\"ghead\"><div id=\"gtitle\"></div><button type=\"button\" class=\"gbtn\" id=\"gclose\">Close</button></div>\n  <div id=\"gstage\">\n    <div id=\"gmount\"></div>\n    <div id=\"gsat\" aria-label=\"Satellite view of the venue\"></div>\n    <div id=\"gmsg\" role=\"status\"></div>\n    <svg id=\"gpath\" aria-hidden=\"true\"><polyline id=\"gpath0\" fill=\"none\"/><polyline id=\"gpath1\" fill=\"none\"/></svg>\n    <div id=\"gplane\" aria-hidden=\"true\"><svg viewBox=\"0 0 60 24\" width=\"30\" height=\"12\"><path d=\"M2 5 L12 12 L2 19 L8 19 L18 12 L8 5 Z\" fill=\"#22d3ff\" stroke=\"#fff\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M9 5 L19 12 L9 19\" fill=\"none\" stroke=\"#e11d48\" stroke-width=\"2.4\" stroke-linejoin=\"round\"/><rect x=\"8\" y=\"10\" width=\"40\" height=\"4\" rx=\"1.6\" fill=\"#fff\" stroke=\"#0d1b2a\" stroke-width=\".8\"/><path d=\"M60 12 L45 4.5 L48 12 L45 19.5 Z\" fill=\"#cbd5e1\" stroke=\"#0d1b2a\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/></svg></div>\n    <button type=\"button\" id=\"ginfo\" aria-label=\"Map credits\" aria-expanded=\"false\" aria-controls=\"gcredit\">i</button>\n    <div id=\"gcredit\" role=\"note\">Satellite imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community. Globe: NASA Blue Marble and NASA Visible Earth. Map: Leaflet.</div>\n    <div id=\"gbar\"><div id=\"gchip\"><b id=\"gchipn\"></b><span id=\"gchips\"></span><button type=\"button\" class=\"gbtn gold\" id=\"gchipgo\">Fly here</button></div><div id=\"gstatus\" aria-live=\"polite\"></div><div id=\"gsub\"></div><div id=\"gbtns\"></div></div>\n  </div>\n </div>\n</div>";document.body.appendChild(w.firstElementChild);
})();
var GL_LOST=false, G=null, libP=null, S={tok:0,phase:'idle',start:null,target:null,raf:0}, focusBack=null;

function loadLib(){
  if(libP)return libP;
  libP=new Promise(function(res,rej){
    var s=document.createElement('script');s.src=BASE+'lib/globe.gl.min.js';s.onload=res;s.onerror=function(){libP=null;rej(new Error('lib'))};document.head.appendChild(s);
  });
  return libP;
}
var leafP=null,SM=null,SL=null,SP=null;
function loadLeaflet(){
  if(leafP)return leafP;
  leafP=new Promise(function(res,rej){
    var l=document.createElement('link');l.rel='stylesheet';l.href=BASE+'lib/leaflet.css';document.head.appendChild(l);
    var s=document.createElement('script');s.src=BASE+'lib/leaflet.js';s.onload=res;s.onerror=function(){leafP=null;rej(new Error('leaflet'))};document.head.appendChild(s);
  });
  return leafP;
}
/* The arrival view is a flat satellite map (Esri World Imagery, the same tiles the globe uses) shown in place.
   The globe's own high-zoom tiles stayed blurry on iPhone Safari, so the close-up no longer depends on WebGL. */
function showSat(t,tok){
  return loadLeaflet().then(function(){
    if(tok!==S.tok)return;
    var z=t.prec==='approx'?15:17;
    if(!SM){
      SM=L.map('gsat',{zoomControl:false,attributionControl:false,minZoom:3,maxZoom:19,zoomSnap:1,fadeAnimation:true,inertia:true});
      SL=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19,detectRetina:false,crossOrigin:true,keepBuffer:2}).addTo(SM);
    }
    SM.invalidateSize();SM.setView([t.lat,t.lng],z,{animate:false});
    if(SP)SP.remove();
    SP=L.marker([t.lat,t.lng],{interactive:false,keyboard:false,icon:L.divIcon({className:'',iconSize:[40,52],iconAnchor:[20,50],html:'<div class="satpin">'+SVG_PIN+'<span class="lbl">'+esc(t.venue||t.name)+'</span></div>'})}).addTo(SM);
    return new Promise(function(res){
      var done=false;function go(){if(done)return;done=true;if(tok===S.tok){$('gsat').classList.add('on');S.sat=true;setTimeout(function(){if(S.sat&&G)G.htmlElementsData([])},650)}res()}
      SL.once('load',go);setTimeout(go,2500);
    });
  });
}
function hideSat(){var was=S.sat;tiles(false);$('gsat').classList.remove('on');S.sat=false;if(was)refreshMarkers()}
function webglOK(){try{var c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')))}catch(e){return false}}
function gm(url){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(url)}
function setBar(status,sub,btns){
  $('gstatus').textContent=status||'';$('gsub').textContent=sub||'';
  var h=$('gbtns');h.innerHTML='';
  (btns||[]).forEach(function(b){
    var e=document.createElement(b.href?'a':'button');e.className='gbtn'+(b.gold?' gold':'');e.textContent=b.t;
    if(b.href){e.href=b.href;e.target='_blank';e.rel='noopener noreferrer'}else{e.type='button';e.addEventListener('click',b.fn)}
    h.appendChild(e);
  });
}
function msg(t){$('gmsg').textContent=t||''}

function openOverlay(t,from){
  focusBack=from||document.activeElement;
  S.target=t;
  fitVV();$('gov').classList.add('open');$('gov').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  $('gtitle').innerHTML=esc(t.name)+'<small>'+esc(t.when||t.date||'')+'</small>';
  $('gchip').classList.remove('show');
  $('gclose').focus();
  var tok=++S.tok;S.phase='loading';
  msg('Loading the globe...');setBar('','',[]);
  var oid=S.oid=(S.oid||0)+1;
  setTimeout(function(){ if(S.oid===oid&&$('gov').classList.contains('open')&&/^(loading|spin|flight|zoom)$/.test(S.phase)){if(window.console)console.warn('globe: stalled in '+S.phase);fallback(S.target)} },30000);
  if(GL_LOST||!webglOK()){fallback(t);return}
  loadLib().then(function(){ if(tok!==S.tok)return; return startGlobe(t,tok)}).catch(function(e){if(window.console)console.error('globe failed',e&&e.stack||e);if(tok===S.tok)fallback(t,e)});
}
/* Never close or go blank on a failure: show the flat satellite map of the venue with Directions instead. */
/* Google Maps links always use the map point's coordinates: a bare name ("Red Lodge") can resolve to the wrong place or nowhere.
   Directions for every event, overseas too (no travelmode, Google picks). */
function ll(t){return t.lat.toFixed(6)+','+t.lng.toFixed(6)}
function dirUrl(t){return 'https://www.google.com/maps/dir/?api=1&destination='+ll(t)}
function fallback(t){
  if(!t||S.phase==='fallback'||!$('gov').classList.contains('open'))return;
  var tok=++S.tok;S.phase='fallback';cancelAnimationFrame(S.raf);msg('');
  if(G){try{G.pauseAnimation()}catch(e){}}
  try{clearTrail()}catch(e){}var pl=$('gplane');if(pl)pl.style.display='none';
  var st=$('gstage');if(st)st.classList.add('nogl');
  setBar(t.venue||t.name,(t.where?t.where+'. ':'')+'Showing the satellite map.',[{t:'Directions',gold:true,href:dirUrl(t)}]);
  showSat(t,tok).catch(function(){msg('The map could not load. Directions still works.')});
}
function closeOverlay(silent){
  if(!$('gov').classList.contains('open'))return;
  S.tok++;cancelAnimationFrame(S.raf);S.phase='idle';hideSat();
  if(G){try{G.pauseAnimation()}catch(e){}}
  $('gov').classList.remove('open');$('gov').setAttribute('aria-hidden','true');document.body.style.overflow='';
  if(focusBack&&focusBack.focus){try{focusBack.focus({preventScroll:true})}catch(e){}}
  if(OPTS.onClose)OPTS.onClose(silent===true);
}
$('gclose').addEventListener('click',function(){closeOverlay()});
$('ginfo').addEventListener('click',function(){var c=$('gcredit'),on=!c.classList.contains('show');c.classList.toggle('show',on);this.setAttribute('aria-expanded',on?'true':'false')});
/* size the overlay to the visible part of the screen (iPhone Safari toolbars) */
function fitVV(){var v=window.visualViewport,r=document.documentElement.style,h=v&&v.height>=200?v.height:(window.innerHeight||document.documentElement.clientHeight);r.setProperty('--vvh',h+'px');r.setProperty('--vvt',(v&&v.height>=200?v.offsetTop:0)+'px');if(G)sizeGlobe()}
window.addEventListener('orientationchange',function(){setTimeout(fitVV,300)});window.addEventListener('resize',fitVV);
if(window.visualViewport){visualViewport.addEventListener('resize',fitVV);visualViewport.addEventListener('scroll',fitVV)}
window.addEventListener('orientationchange',function(){setTimeout(fitVV,300)});fitVV();
$('gov').addEventListener('mousedown',function(e){if(e.target===$('gov'))closeOverlay()});
document.addEventListener('keydown',function(e){
  if(!$('gov').classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeOverlay();return}
  if(e.key==='Tab'){ // keep focus inside the dialog
    var f=Array.prototype.filter.call($('gdlg').querySelectorAll('button,a[href],select,[tabindex]:not([tabindex="-1"])'),function(x){return x.offsetParent!==null&&!x.disabled});
    if(!f.length)return;var a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
  }
},true);

/* ---------- math ---------- */
var RAD=Math.PI/180;
function vec(lat,lng){var a=lat*RAD,b=lng*RAD;return [Math.cos(a)*Math.cos(b),Math.cos(a)*Math.sin(b),Math.sin(a)]}
function unvec(v){return {lat:Math.atan2(v[2],Math.hypot(v[0],v[1]))/RAD,lng:Math.atan2(v[1],v[0])/RAD}}
function angDist(a,b){var u=vec(a.lat,a.lng),v=vec(b.lat,b.lng);var d=u[0]*v[0]+u[1]*v[1]+u[2]*v[2];return Math.acos(Math.max(-1,Math.min(1,d)))}
function kmBetween(a,b){return angDist(a,b)*6371}
function slerp(a,b,t){
  var u=vec(a.lat,a.lng),v=vec(b.lat,b.lng),d=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1]+u[2]*v[2])));
  if(d<1e-6)return {lat:a.lat,lng:a.lng};
  var s=Math.sin(d),k1=Math.sin((1-t)*d)/s,k2=Math.sin(t*d)/s;
  return unvec([u[0]*k1+v[0]*k2,u[1]*k1+v[1]*k2,u[2]*k1+v[2]*k2]);
}
function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function sm(t){return t*t*(3-2*t)}
function lerp(a,b,t){return a+(b-a)*t}
function pt(t,A,B,peak){var p=slerp(A,B,t);p.alt=peak*Math.sin(Math.PI*t);return p}

/* ---------- markers ---------- */
var SVG_DIAMOND='<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="#5c4300"/><circle cx="11" cy="11" r="8" fill="#ffc629" stroke="#fff" stroke-width="1.6"/></svg>';
var SVG_PIN='<svg width="40" height="52" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 50C20 50 3 31 3 19a17 17 0 0 1 34 0C37 31 20 50 20 50z" fill="#ffc629" stroke="#fff" stroke-width="3"/><circle cx="20" cy="19" r="6.500" fill="#0d1b2a"/></svg>';
var SVG_YOU='<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="none" stroke="#22d3ff" stroke-width="3"/><circle cx="13" cy="13" r="4" fill="#22d3ff"/></svg>';
/* Phones (iOS Safari especially, tighter still as a home-screen app) get a 2K earth, fewer and lighter markers. */
var MOB=(function(){try{return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||matchMedia('(pointer:coarse)').matches||Math.min(screen.width,screen.height)<700}catch(e){return false}})();
var MOB_PINS=90;
function mkEl(d){
  var b=document.createElement(d.kind==='pin'?'button':'div');b.className='mk '+d.kind;
  if(d.kind==='pin'){
    b.type='button';b.innerHTML=MOB?'<span class="dot"></span>':SVG_DIAMOND;b.setAttribute('aria-label','Event: '+d.name+', '+d.place);
    b.addEventListener('click',function(ev){ev.stopPropagation();pickPin(d)});
  }else if(d.kind==='sel'){
    b.innerHTML='<span class="ring"></span>'+SVG_PIN+'<span class="lbl">'+esc(d.label)+'</span>';b.style.pointerEvents='none';
  }else if(d.kind==='start'){
    b.innerHTML=SVG_YOU+'<span class="lbl">'+esc(d.label)+'</span>';b.style.pointerEvents='none';
  }
  return b;
}
function markers(){
  var t=S.target,out=[];
  var ps=(D.pins||[]).filter(function(p){return !(t&&p.id===t.id)});
  if(MOB&&t&&ps.length>MOB_PINS){ps=ps.map(function(p){return [angDist(t,p),p]}).sort(function(a,b){return a[0]-b[0]}).slice(0,MOB_PINS).map(function(a){return a[1]})}
  ps.forEach(function(p){ out.push({kind:'pin',id:p.id,name:p.name,place:p.place,country:p.country,date:p.date,lat:p.lat,lng:p.lng,p:p.p,cc:p.cc}) });
  if(t)out.push({kind:'sel',lat:t.lat,lng:t.lng,label:t.venue||t.place||t.name});
  if(S.start&&S.showStart)out.push({kind:'start',lat:S.start.lat,lng:S.start.lng,label:S.start.name});
  return out;
}
function refreshMarkers(){if(G)G.htmlElementsData(markers())}

function pickPin(d){
  if(S.sat||(S.phase!=='spin'&&S.phase!=='arrived'&&S.phase!=='globe'))return;
  S.chip=d;$('gchipn').textContent=d.name;
  $('gchips').textContent=d.date+' - '+d.place+', '+d.country+(d.p==='t'?' (town-level map point)':'');
  $('gchip').classList.add('show');
}
$('gchipgo').addEventListener('click',function(){
  var d=S.chip;if(!d)return;$('gchip').classList.remove('show');
  var t={id:d.id,name:d.name,when:d.date,venue:d.place,where:d.place+', '+d.country,lat:d.lat,lng:d.lng,prec:d.p==='v'?'venue':'approx'};
  $('gtitle').innerHTML=esc(t.name)+'<small>'+esc(t.when)+'</small>';
  S.target=t;S.tok++;var tok=S.tok;refreshMarkers();beginTrip(tok);
});

/* ---------- globe ---------- */
function sizeGlobe(){var st=$('gstage');if(G&&st.clientWidth>0&&st.clientHeight>0){G.width(st.clientWidth).height(st.clientHeight)}if(SM){try{SM.invalidateSize()}catch(e){}}}
window.addEventListener('resize',sizeGlobe);
function makeGlobe(){
  var st=$('gmount');
  G=Globe({animateIn:false,rendererConfig:{antialias:true,powerPreference:'high-performance'}})(st)
    .width(st.clientWidth).height(st.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(BASE+(MOB?'img/earth-day-clouds-2048.jpg':'img/earth-day-clouds-4096.jpg')).bumpImageUrl(BASE+'img/earth-bump-2048.jpg')
    .showAtmosphere(true).atmosphereColor('#8ec5ff').atmosphereAltitude(0.18)
    .htmlLat('lat').htmlLng('lng').htmlAltitude(0.0001).htmlTransitionDuration(0)
    .htmlElement(mkEl)
    ;
  try{G.htmlElementVisibilityModifier(function(el,vis){var low=G&&G.pointOfView().altitude<0.1;el.style.visibility=(vis||(low&&el.classList.contains('sel')))?'visible':'hidden'})}catch(e){}
  realism();
  try{G.renderer().setPixelRatio(Math.min(window.devicePixelRatio||1,2))}catch(e){}
  try{G.renderer().domElement.addEventListener('webglcontextlost',function(e){e.preventDefault();GL_LOST=true;if(window.console)console.warn('globe: WebGL context lost');if(S.target&&$('gov').classList.contains('open')&&!S.sat)fallback(S.target)},false)}catch(e){}
  var cam=G.camera();cam.near=0.004;cam.far=1500;cam.updateProjectionMatrix();
  var c=G.controls();c.minDistance=100.06;c.maxDistance=600;c.enablePan=false;c.enableDamping=true;c.dampingFactor=0.08;c.autoRotateSpeed=0.6;
  // lift the Earth a little (default lighting is a touch dim)
  try{G.scene().traverse(function(o){if(o.isAmbientLight){o.intensity=1.5}})}catch(e){}
}
var TILE_URL=function(x,y,l){return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+l+'/'+y+'/'+x};
var tilesAreOn=false;
/* satellite tiles on the globe only while zooming in (the whole-globe view uses the 4K day map) */
function tiles(on){if(!G||tilesAreOn===!!on)return;tilesAreOn=!!on;try{if(on){G.globeTileEngineMaxLevel(14).globeTileEngineUrl(TILE_URL)}else{G.globeTileEngineUrl(null)}}catch(e){}}

function realism(){
  var m=G.globeMaterial();
  try{m.bumpScale=6;m.shininess=18;if(m.specular)m.specular.setRGB(0.18,0.2,0.24)}catch(e){}
  // the bundle does not expose THREE, so borrow the classes from objects the globe already made
  var tries=0;(function wait(){
    var tex=m.map;if(!tex||!tex.image){if(++tries<200)setTimeout(wait,100);return}
    var Tex=tex.constructor,globe=null;
    G.scene().traverse(function(o){if(!globe&&o.isMesh&&o.material===m)globe=o});
    function load(url,cb){var i=new Image();i.crossOrigin='anonymous';i.onload=function(){var t=new Tex(i);t.needsUpdate=true;cb(t)};i.src=url}
    load(BASE+'img/earth-water-1600.jpg',function(t){m.specularMap=t;m.needsUpdate=true});
    // clouds are baked into the day texture (a separate transparent cloud shell rendered with black blocks in testing)
  })();
}
function setUserControl(on){var c=G.controls();c.enabled=!!on;c.enableDamping=!!on;if(!on){try{c.update()}catch(e){}}}
function fitK(){var st=$('gstage'),a=st.clientWidth/Math.max(1,st.clientHeight);return a<1?Math.max(1,0.9/a):1}
// On a tall, narrow phone screen the camera sits further back so the whole globe fits the width.
function scaled(alt){var k=fitK();if(k<=1)return alt;var x=Math.max(0,Math.min(1,(alt-0.02)/0.6));return alt*(1+(k-1)*x*x*(3-2*x))}
function unscaled(alt){if(fitK()<=1)return alt;var lo=0,hi=alt;for(var i=0;i<40;i++){var m=(lo+hi)/2;if(scaled(m)<alt)lo=m;else hi=m}return (lo+hi)/2}
function pov(lat,lng,alt,ms){G.pointOfView({lat:lat,lng:lng,altitude:scaled(alt)},ms||0)}
function rpov(){var p=G.pointOfView();return {lat:p.lat,lng:p.lng,altitude:unscaled(p.altitude)}}

/* same as the demo's default: the flight starts from Perth (no location prompt) */
function getStart(tok){return Promise.resolve(Object.assign({real:false},PRESETS.perth))}

function startGlobe(t,tok){
  var st0=$('gstage');if(st0)st0.classList.remove('nogl');
  if(!G){makeGlobe()}else{G.resumeAnimation();sizeGlobe()}
  S.showStart=false;S.start=null;S.chip=null;
  refreshMarkers();
  var c=G.controls();
  setUserControl(false);c.autoRotate=!reduce();
  pov(t.lat,t.lng,2.6,0); // whole-globe view while we find the start point
  S.phase='spin';
  msg('');setBar('Getting ready...','',[{t:'Skip',fn:skip}]);
  return getStart(tok).then(function(st){ if(tok!==S.tok)return; S.start=st;S.denied=!!st.denied; beginTrip(tok,true)});
}

function skip(){
  if(S.phase==='arrived')return;
  S.tok++;var tok=S.tok;cancelAnimationFrame(S.raf);
  $('gplane').style.display='none';clearTrail();
  var t=S.target;
  zoomIn(tok,true);
}

var VENUE_ALT=0.0007;
/* distance and flight-time estimate (same as the 29 Oct flat-map demo: great-circle distance / 850 km/h + 30 min for takeoff and landing) */
function fmtKm(d){if(d<100)return String(Math.round(d));return (d<1000?Math.round(d/10)*10:Math.round(d/100)*100).toLocaleString('en-AU')}
function fmtTime(h){if(h<1.5)return (Math.round(h*60/5)*5)+' minutes';if(h<10){var r=Math.round(h*2)/2;return (r%1?r.toFixed(1):r)+' hours'}return Math.round(h)+' hours'}
function flightTxt(d){return 'about '+fmtKm(d)+' km, roughly '+fmtTime(d/850+0.5)+' by plane (direct, estimate)'}
function beginTrip(tok,fresh){
  var t=S.target;
  if(!S.start){S.start=Object.assign({real:false},PRESETS.perth)}
  var st=S.start;
  hideSat();S.phase='spin';cancelAnimationFrame(S.raf);G.controls().autoRotate=false;setUserControl(false);
  $('gchip').classList.remove('show');
  var km=kmBetween(st,t);
  var fromTxt=st.real?'your location':(st.denied?'Perth (location not shared)':st.name);
  S.showStart=true;
  var quick=reduce(), near=km<50;
  S.trip=null;
  if(quick||near){
    S.showStart=false;refreshMarkers();
    setBar(near?'Close to you - zooming in':'Zooming in',(near?'The event is about '+Math.round(km)+' km from '+fromTxt+', so there is no flight.':''),[{t:'Skip',fn:skip}]);
    pov(t.lat,t.lng,2.2,quick?0:1200);
    setTimeout(function(){if(tok===S.tok)zoomIn(tok,false)},quick?50:1300);
    return;
  }
  refreshMarkers();
  S.trip={km:km,from:fromTxt};
  setBar('Flying from '+fromTxt,'to '+(t.venue||t.name)+', '+flightTxt(km),[{t:'Skip',fn:skip}]);
  pov(st.lat,st.lng,2.0,1400);
  setTimeout(function(){if(tok===S.tok)fly(tok)},1700);
}

function drawTrail(path,tp,cam){
  var n=path.length,upto=Math.max(1,Math.round(tp*(n-1))),cv=vec(cam.lat,cam.lng),lim=1/(1+cam.alt)-0.02;
  function seg(a,b){
    var out=[],cur=[];
    for(var i=a;i<=b;i++){
      var q=path[i],v=vec(q[0],q[1]),dot=v[0]*cv[0]+v[1]*cv[1]+v[2]*cv[2],sc=dot>lim?G.getScreenCoords(q[0],q[1],q[2]):null;
      if(sc)cur.push(sc.x.toFixed(1)+','+sc.y.toFixed(1));else{if(cur.length>1)out.push(cur.join(' '));cur=[]}
    }
    if(cur.length>1)out.push(cur.join(' '));
    return out;
  }
  // polyline cannot hold gaps, so a path that goes round the back is drawn from its longest visible run
  function best(l){return l.sort(function(a,b){return b.length-a.length})[0]||''}
  $('gpath0').setAttribute('points',best(seg(0,n-1)));
  $('gpath1').setAttribute('points',best(seg(0,upto)));
}
function clearTrail(){$('gpath0').setAttribute('points','');$('gpath1').setAttribute('points','')}
function fly(tok){
  var A=S.start,B=S.target,d=angDist(A,B),peak=0.04+0.22*(d/Math.PI);
  var path=[];for(var i=0;i<=64;i++){var q=pt(i/64,A,B,peak);path.push([q.lat,q.lng,q.alt])}
  var plane=$('gplane');plane.style.display='block';plane.style.opacity=1;S.ang=null;
  var dur=3600,t0=performance.now();S.phase='flight';
  var last={x:0,y:0};
  (function step(now){
    if(tok!==S.tok)return;
    var u=Math.min(1,(now-t0)/dur),tp=ease(u),tc=ease(Math.max(0,(u-0.07)/0.93));
    var p=pt(tp,A,B,peak),p2=pt(Math.min(1,tp+0.01),A,B,peak),cp=slerp(A,B,tc);
    var alt=lerp(1.25,1.25,0)+1.1*Math.sin(Math.PI*u)*Math.min(1,d/1.2)+0.2;
    pov(cp.lat,cp.lng,alt,0);var pov_={lat:cp.lat,lng:cp.lng,alt:scaled(alt)};
    var s1=G.getScreenCoords(p.lat,p.lng,p.alt*1.0),s2=G.getScreenCoords(p2.lat,p2.lng,p2.alt);
    drawTrail(path,tp,pov_);
    if(s1){
      if(s2&&(Math.abs(s2.x-s1.x)+Math.abs(s2.y-s1.y)>0.3))S.ang=Math.atan2(s2.y-s1.y,s2.x-s1.x)*180/Math.PI; // keep the last heading near touchdown
      plane.style.transform='translate('+s1.x+'px,'+s1.y+'px) rotate('+(S.ang||0)+'deg)';
    }
    if(u<1){S.raf=requestAnimationFrame(step)}
    else{parkPlane(1);pov(B.lat,B.lng,alt,0);zoomIn(tok,false)}
  })(performance.now());
}

/* keep the plane sitting on the venue pin (the camera is centred on it from touchdown on) */
function parkPlane(op){
  var t=S.target,plane=$('gplane'),sc=G.getScreenCoords(t.lat,t.lng,0);
  if(!sc||op<=0){plane.style.display='none';return}
  plane.style.display='block';plane.style.opacity=op;
  plane.style.transform='translate('+sc.x+'px,'+sc.y+'px) rotate('+(S.ang||0)+'deg)';
}
function zoomIn(tok,quick){
  var t=S.target;S.phase='zoom';cancelAnimationFrame(S.raf);tiles(true);
  loadLeaflet().catch(function(){});
  S.showStart=false;
  var from=rpov();
  var dur=(quick||reduce())?900:3000,t0=performance.now();
  var a0=Math.max(from.altitude,0.02),a1=VENUE_ALT;
  setBar('Zooming in to '+(t.venue||t.name),'',quick?[]:[{t:'Skip',fn:function(){S.tok++;var k=S.tok;cancelAnimationFrame(S.raf);pov(t.lat,t.lng,VENUE_ALT,0);parkPlane(1);arrive(k)}}]);
  var pathCleared=false;
  (function step(now){
    if(tok!==S.tok)return;
    var u=Math.min(1,(now-t0)/dur),e=ease(u);
    var alt=Math.exp(lerp(Math.log(a0),Math.log(a1),e));
    pov(t.lat,t.lng,alt,0);
    if(!quick)parkPlane(1);
    if(!pathCleared){pathCleared=true;clearTrail()}
    if(u<1)S.raf=requestAnimationFrame(step);else{clearTrail();if(quick)parkPlane(0);arrive(tok)}
  })(performance.now());
}

/* the arrow stays stuck point-first in the venue point after landing, on the globe and then on the satellite map */
function holdArrow(tok){
  var plane=$('gplane');if(plane.style.display==='none')return;
  var t=S.target;
  (function step(){
    if(tok!==S.tok||S.phase!=='arrived'){return}
    if(S.sat&&SM){var p=SM.latLngToContainerPoint([t.lat,t.lng]);plane.style.transform='translate('+p.x+'px,'+p.y+'px) rotate('+(S.ang||0)+'deg)'}
    else parkPlane(1);
    requestAnimationFrame(step);
  })();
}
function arrive(tok){
  if(tok!==S.tok)return;
  var t=S.target;S.phase='arrived';clearTrail();holdArrow(tok);
  showSat(t,tok).catch(function(){});
  setUserControl(true);G.controls().autoRotate=false;
  var approx=t.prec==='approx';
  var q=t.lat.toFixed(6)+','+t.lng.toFixed(6);
  setBar(t.venue||t.name,(t.where?t.where+'. ':'')+(S.trip?'From '+S.trip.from+': '+flightTxt(S.trip.km)+'. ':'')+(approx?'Map point is the town or park area, not the exact range.':'Drag to look around. Pinch or scroll to zoom.'),[
    {t:'Directions',gold:true,href:dirUrl(t)},
    {t:'Back to globe',fn:backToGlobe}
  ]);
}

function backToGlobe(){
  var tok=++S.tok;cancelAnimationFrame(S.raf);setUserControl(false);S.phase='back';$('gplane').style.display='none';hideSat();
  var t=S.target;pov(t.lat,t.lng,VENUE_ALT,0);
  var from=rpov(),t=S.target,t0=performance.now(),dur=reduce()?500:1800;
  setBar('Back to the globe','Tap a circle to see an event, then Fly here.',[{t:'Replay flight',gold:true,fn:function(){S.tok++;var k=S.tok;cancelAnimationFrame(S.raf);beginTrip(k)}}]);
  (function step(now){
    if(tok!==S.tok)return;
    var u=Math.min(1,(now-t0)/dur),e=ease(u);
    pov(from.lat,from.lng,Math.exp(lerp(Math.log(Math.max(from.altitude,0.001)),Math.log(2.4),e)),0);
    if(u<1)S.raf=requestAnimationFrame(step);
    else{S.phase='globe';setUserControl(true);G.controls().autoRotate=!reduce();
      setBar('Back to the globe','Drag to turn it. Tap a circle to see an event, then Fly here.',[{t:'Replay flight',gold:true,fn:function(){S.tok++;var k=S.tok;beginTrip(k)}},{t:'Close',fn:function(){closeOverlay()}}])}
  })(performance.now());
}

window.ACGlobe={
  open:function(t,o){
    OPTS=o||{};D.pins=[];
    var p=OPTS.pins;
    if(p&&typeof p.then==='function')p.then(function(a){D.pins=a||[];if(G&&!S.sat)refreshMarkers()}).catch(function(){});else D.pins=p||[];
    openOverlay(t,OPTS.from);
  },
  close:function(silent){closeOverlay(silent)},
  isOpen:function(){return $('gov').classList.contains('open')},
  state:function(){return {tiles:tilesAreOn,phase:S.phase,pov:G&&G.pointOfView(),start:S.start,sat:!!S.sat,satZoom:SM&&SM.getZoom(),pins:D.pins.length}}
};
})();
