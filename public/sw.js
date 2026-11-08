// The shell is installable; authenticated data and responses are never cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>uchimado</title><body style="font-family:sans-serif;padding:32px"><h1>uchimado</h1><p>サーバーに接続できません。接続後に再読み込みしてください。</p><button style="min-height:48px" onclick="location.reload()">再読み込み</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
