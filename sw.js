const CACHE='paint-v3';
const FONT_CACHE='paint-fonts-v1';
const CORE=['./','index.html','manifest.json','favicon/32.png','favicon/96.png','favicon/144.png','favicon/152.png','favicon/180.png','favicon/192.png','favicon/512.png'];
const CDN=['https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js','https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.49.0/dist/tabler-icons.min.css'];
const FONT_FAMILIES=['Noto+Serif+JP:wght@400;700','Zen+Maru+Gothic:wght@400;700','Klee+One:wght@400;600','Yusei+Magic','Hachi+Maru+Pop','Dela+Gothic+One','Potta+One','RocknRoll+One'];
const FONT_CSS=FONT_FAMILIES.map(f=>'https://fonts.googleapis.com/css2?family='+f+'&display=swap');
const isFontHost=h=>h==='fonts.googleapis.com'||h==='fonts.gstatic.com';

async function precacheCdn(cache,url){
  const res=await fetch(url,{mode:'cors'});
  if(!res.ok)return;
  await cache.put(url,res.clone());
  if(!url.endsWith('.css'))return;
  const css=await res.text();
  const urls=[...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m=>m[1]).filter(u=>!u.startsWith('data:')).map(u=>new URL(u,url).href);
  await Promise.allSettled([...new Set(urls)].map(async u=>{
    const r=await fetch(u,{mode:'cors'});
    if(r.ok)await cache.put(u,r);
  }));
}

let fontJob=null;
async function precacheFonts(){
  const cache=await caches.open(FONT_CACHE);
  const files=new Set();
  await Promise.all(FONT_CSS.map(async u=>{
    try{
      let res=await cache.match(u);
      if(!res){
        const r=await fetch(u,{mode:'cors'});
        if(!r.ok)return;
        await cache.put(u,r.clone());
        res=r;
      }
      const css=await res.clone().text();
      for(const m of css.matchAll(/url\(\s*["']?(https:[^"')]+)["']?\s*\)/g))files.add(m[1]);
    }catch(err){}
  }));
  const list=[...files];
  let i=0;
  const worker=async()=>{
    while(i<list.length){
      const u=list[i++];
      try{
        if(await cache.match(u))continue;
        const r=await fetch(u,{mode:'cors'});
        if(r.ok)await cache.put(u,r);
      }catch(err){}
    }
  };
  await Promise.all([worker(),worker(),worker(),worker()]);
}

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async u=>{
      const r=await fetch(u,{cache:'reload'});
      if(r.ok)await cache.put(u,r);
    }));
    await Promise.allSettled(CDN.map(u=>precacheCdn(cache,u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE&&k!==FONT_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',e=>{
  if(e.data!=='precache-fonts')return;
  if(!fontJob)fontJob=precacheFonts().catch(()=>{}).then(()=>{fontJob=null});
  e.waitUntil(fontJob);
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(!/^https?:$/.test(url.protocol))return;

  if(url.origin===location.origin){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const res=await fetch(req,{cache:'no-cache'});
        if(res.ok)cache.put(req,res.clone());
        return res;
      }catch(err){
        const hit=await cache.match(req,{ignoreSearch:true,ignoreVary:true});
        if(hit)return hit;
        if(req.mode==='navigate'){
          const page=await cache.match('index.html')||await cache.match('./');
          if(page)return page;
        }
        throw err;
      }
    })());
    return;
  }

  e.respondWith((async()=>{
    const hit=await caches.match(req,{ignoreVary:true});
    if(hit)return hit;
    const res=await fetch(req);
    if(res.ok||res.type==='opaque'){
      const cache=await caches.open(isFontHost(url.hostname)?FONT_CACHE:CACHE);
      cache.put(req,res.clone());
    }
    return res;
  })());
});
