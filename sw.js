const CACHE='paint-v1';
const CORE=['./','index.html','manifest.json','favicon/32.png','favicon/96.png','favicon/144.png','favicon/152.png','favicon/180.png','favicon/192.png','favicon/512.png'];
const CDN=['https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js','https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.49.0/dist/tabler-icons.min.css'];

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
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
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
        const res=await fetch(req);
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
    const cache=await caches.open(CACHE);
    const hit=await cache.match(req,{ignoreVary:true});
    if(hit)return hit;
    const res=await fetch(req);
    if(res.ok||res.type==='opaque')cache.put(req,res.clone());
    return res;
  })());
});
