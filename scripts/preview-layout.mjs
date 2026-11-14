import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, enumerateScenes } from '../src/platform.mjs';
import { discoverTargets, CdpClient } from '../src/cdp.mjs';
import { makeInjection, removeInjection } from '../src/inject.mjs';

const scene = enumerateScenes().find(item => item.title === 'Deep Space');
if (!scene) throw new Error('布局检查用项目未找到。');
const fixture = path.join(path.dirname(scene.project), 'preview.jpg');
const [target] = await discoverTargets();
if (!target) throw new Error('Codex 调试连接不可用。');
const client = new CdpClient(target.webSocketDebuggerUrl);
const directory = path.join(ROOT, 'outputs', 'visual-review'); mkdirSync(directory, {recursive:true});
try {
  await client.connect();
  await client.call('Page.bringToFront');
  await new Promise(resolve=>setTimeout(resolve,300));
  const installed = await client.call('Runtime.evaluate', {expression:makeInjection({dim:0.5}), returnByValue:true});
  if (installed.exceptionDetails || !installed.result?.value?.installed) throw new Error(JSON.stringify(installed.exceptionDetails || installed.result));
  const drawn = await client.call('Runtime.evaluate', {expression:'window.__codexWallpaperScene.pushFrame('+JSON.stringify(readFileSync(fixture).toString('base64'))+')',awaitPromise:true,returnByValue:true});
  if (drawn.exceptionDetails) throw new Error(JSON.stringify(drawn.exceptionDetails));
  await new Promise(resolve=>setTimeout(resolve,300));
  const status = await client.call('Runtime.evaluate', {expression:'window.__codexWallpaperScene.status()',returnByValue:true});
  const screenshot = await client.call('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  writeFileSync(path.join(directory,'layout-preview.png'),Buffer.from(screenshot.data,'base64'));
  const result={layoutPreviewOnly:true,notRealTimeSceneAcceptance:true,fixture,installed:installed.result.value,status:status.result.value};
  writeFileSync(path.join(directory,'layout-preview.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {try{await client.call('Runtime.evaluate',{expression:removeInjection});}finally{client.close();}}
