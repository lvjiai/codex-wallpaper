import {discoverTargets,CdpClient} from '../src/cdp.mjs';
const [target]=await discoverTargets();if(!target)throw new Error('Codex 页面未找到。');const client=new CdpClient(target.webSocketDebuggerUrl);
try{await client.connect();const result=await client.call('Runtime.evaluate',{expression:`(()=>{
const before={state:!!window.__codexWallpaperScene,stage:!!document.getElementById('codex-wallpaper-scene'),markers:document.querySelectorAll('[data-codex-wallpaper-surface]').length};
window.__codexWallpaperScene?.remove();
document.getElementById('codex-wallpaper-scene')?.remove();
for(const el of document.querySelectorAll('[data-codex-wallpaper-surface="codex-wallpaper-scene"]'))el.removeAttribute('data-codex-wallpaper-surface');
document.adoptedStyleSheets=document.adoptedStyleSheets.filter(sheet=>{try{return !Array.from(sheet.cssRules).some(rule=>rule.cssText.includes('[data-codex-wallpaper-surface="codex-wallpaper-scene"]'));}catch{return true;}});
return{before,remainingStage:!!document.getElementById('codex-wallpaper-scene')};
})()`,returnByValue:true});console.log(JSON.stringify(result.result?.value,null,2));}finally{client.close();}
