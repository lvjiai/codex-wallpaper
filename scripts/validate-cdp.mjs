import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/platform.mjs';
import { discoverTargets, CdpClient } from '../src/cdp.mjs';

const targets = await discoverTargets();
if (targets.length !== 1) throw new Error(`需要唯一的 Codex 主页面，找到 ${targets.length} 个。`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
try {
  await client.connect();
  const result = await client.call('Runtime.evaluate', {
    expression: '({rootFound:!!document.getElementById("root"),canvas:typeof HTMLCanvasElement,bitmapDecoder:typeof createImageBitmap,constructedStylesheet:typeof CSSStyleSheet,bodyPresent:!!document.body,mainPage:location.href==="app://-/index.html"})', returnByValue: true
  });
  if (result.exceptionDetails || !result.result?.value?.mainPage) throw new Error('主页面能力检查失败。');
  const record = { passed: true, readOnly: true, capabilities: result.result.value, capturedOrReadConversationText: false };
  const directory = path.join(ROOT, 'outputs', 'cdp-validation'); mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
} finally { client.close(); }
