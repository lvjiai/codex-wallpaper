import { discoverTargets, CdpClient } from '../src/cdp.mjs';
const [target] = await discoverTargets();
if (!target) throw new Error('Codex 调试连接不可用。');
const client = new CdpClient(target.webSocketDebuggerUrl);
try {
  await client.connect();
  const result = await client.call('Runtime.evaluate', { expression: `(() => {
    const inspect = (element, depth) => {
      const style = getComputedStyle(element);
      const r=element.getBoundingClientRect();
      return { tag:element.tagName, id:element.id, className:String(element.className).slice(0,240), background:style.backgroundColor,image:style.backgroundImage.slice(0,200), opacity:style.opacity,rect:{x:r.x,y:r.y,width:r.width,height:r.height}, children:depth?Array.from(element.children).filter(child=>{const r=child.getBoundingClientRect();return r.width>200&&r.height>100}).slice(0,4).map(child=>inspect(child,depth-1)):[] };
    };
    const center=document.elementFromPoint(innerWidth/2,innerHeight/2);
    const ancestors=[];for(let el=center;el&&ancestors.length<60;el=el.parentElement)ancestors.push(inspect(el,0));
    return {paintedAncestors:ancestors.filter(el=>el.background!=='rgba(0, 0, 0, 0)'||el.image!=='none'),ancestorCount:ancestors.length,backgroundStatus:window.__codexWallpaperScene?.status(),viewport:{width:innerWidth,height:innerHeight},visibility:document.visibilityState};
  })()`, returnByValue: true });
  console.log(JSON.stringify(result.result?.value, null, 2));
} finally { client.close(); }
