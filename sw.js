const C='archcal-d65ac82602';
const CORE=['./','./index.html','./styles.css','./config.js','./app.js','./manifest.webmanifest','./data/events.json','./data/organisations.json','./icons/icon-192.png',
 './img/credits.json','./fonts/Inter-var.woff2','./fonts/BarlowCondensed-SemiBold.woff2','./fonts/BarlowCondensed-Bold.woff2','./fonts/BarlowCondensed-ExtraBold.woff2',
 './img/hero-paralympics-2024-aus.jpg','./img/hero-paralympics-2024-aus-sm.jpg','./img/field-tuscany-2026.jpg','./img/field-tuscany-2026-sm.jpg','./img/3d-longbow-2026.jpg','./img/3d-longbow-2026-sm.jpg','./img/target-dresden-2025.jpg','./img/target-dresden-2025-sm.jpg','./img/indoor-heartland.jpg','./img/indoor-heartland-sm.jpg','./img/nathe-target-face.jpg','./img/nathe-target-face-sm.jpg'];
// All paths are relative to the service worker, so it works at / and under a project subpath like /archery-calendar/.
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
// Network-first for pages, code and data (the site keeps evolving); cache-first for photos, fonts and flyers.
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url); if(u.origin!==location.origin||e.request.method!=='GET') return;
  const media=/\/(img|fonts|icons|flyers)\//.test(u.pathname);
  if(!media){
    // cache:'no-cache' makes the browser revalidate with GitHub Pages, so a new app.js is never hidden behind the 10-min HTTP cache.
    e.respondWith(fetch(u.href,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;})
      .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
  } else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok){const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp));}return n;})));
});
self.addEventListener('notificationclick',e=>{e.notification.close();const id=e.notification.data&&e.notification.data.id;
  e.waitUntil(clients.matchAll({type:'window'}).then(ws=>{const url='./index.html#/shoot/'+(id||'');if(ws[0]){ws[0].navigate(url);return ws[0].focus();}return clients.openWindow(url);}));});
