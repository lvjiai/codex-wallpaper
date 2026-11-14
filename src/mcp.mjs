import readline from 'node:readline';
import { enumerateScenes, enumerateWallpapers } from './platform.mjs';
import { backgroundRequest } from './background.mjs';

const tools = [
  { name: 'wallpaper_status', description: '检查 Codex 调试连接及 WebWallGL 场景实时渲染状态。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'wallpaper_list_scenes', description: '列出本机 Wallpaper Engine 的真实 Scene 项目。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'wallpaper_list', description: '列出本机 Wallpaper Engine 已下载的场景和视频。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'wallpaper_choose', description: '在 Codex 中打开壁纸库，供用户搜索和多选 Wallpaper Engine 壁纸。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'wallpaper_start', description: '按用户给出的列表播放本机 Wallpaper Engine 壁纸。场景由 WebWallGL 在应用内实时渲染。', inputSchema: { type: 'object', properties: { playlist: { type: 'array', items: { type: 'string' }, minItems: 1 }, intervalSeconds: { type: 'number', minimum: 30 }, fps: { type: 'integer', minimum: 1, maximum: 60 }, dim: { type: 'number', minimum: 0, maximum: 0.8 }, cdpPort: { type: 'integer', minimum: 1024, maximum: 65535 } }, required: ['playlist'], additionalProperties: false } },
  { name: 'wallpaper_stop', description: '停止 Codex 壁纸并恢复页面背景。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];
async function invoke(message) {
  if (message.method === 'initialize') return { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'codex-wallpaper', version: '0.1.0' } };
  if (message.method === 'ping') return {};
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    try {
      const name = message.params?.name, args = message.params?.arguments || {};
      let value;
      if (name === 'wallpaper_status') value = await backgroundRequest('status');
      else if (name === 'wallpaper_list_scenes') value = enumerateScenes();
      else if (name === 'wallpaper_list') value = enumerateWallpapers();
      else if (name === 'wallpaper_choose') value = await backgroundRequest('choose');
      else if (name === 'wallpaper_start') value = await backgroundRequest('start', args);
      else if (name === 'wallpaper_stop') value = await backgroundRequest('stop');
      else throw new Error('未知壁纸工具。');
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  }
  throw Object.assign(new Error('Method not found'), { code: -32601 });
}
let queue = Promise.resolve();
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  queue = queue.then(async () => {
    let message;
    try { message = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    if (message.id === undefined) {
      if (message.method === 'notifications/initialized') {
        void backgroundRequest('initialize').catch(error => process.stderr.write(error.message + '\n'));
      }
      return;
    }
    try { const result = await invoke(message); process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n'); }
    catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32603, message: error.message } }) + '\n'); }
  }).catch(error => process.stderr.write(error.message + '\n'));
});
