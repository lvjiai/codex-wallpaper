import { readFileSync, realpathSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveEngine } from './platform.mjs';
import { installSceneRenderer } from './scene-renderer.mjs';

const engineSource = readFileSync(new URL('../vendor/webwallgl/webwallgl.global.min.js', import.meta.url), 'utf8');
const readBinding = '__codexWallpaperReadFile';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function inside(root, relative) {
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..' || /[:\\]/.test(part))) return null;
  try {
    // Resolve filesystem links before checking containment so they cannot escape the allowed root.
    const filename = realpathSync(path.join(root, ...relative.split('/')));
    const child = path.relative(root, filename);
    if (!child || child === '..' || child.startsWith('..' + path.sep) || path.isAbsolute(child)) return null;
    return statSync(filename).isFile() ? filename : null;
  } catch { return null; }
}

function sceneAssets(config) {
  try {
    const root = realpathSync(path.join(path.dirname(resolveEngine(config)), 'assets'));
    const names = readdirSync(path.join(root, 'materials'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.tex'))
      .map(entry => path.relative(path.join(root, 'materials'), path.join(entry.parentPath, entry.name))
        .split(path.sep).join('/').slice(0, -4));
    return { root, names };
  } catch { return null; }
}

export async function prepareScene(client, project, fps, config) {
  const root = realpathSync(path.dirname(project));
  const assets = sceneAssets(config);
  const evaluateMain = (expression, extra = {}) => client.call('Runtime.evaluate', { expression, returnByValue: true, ...extra });
  const rootFrame = (await client.call('Page.getFrameTree')).frameTree.frame.id;
  const created = await evaluateMain('window.__codexWallpaperScene.createSceneFrame()');
  const url = created.result?.value;
  if (!url) throw new Error('无法创建场景壁纸图层。');
  let sessionId, contextId, listener, disposed = false, detached = false;
  const call = (method, params) => client.call(method, params, sessionId);
  const evaluate = async (expression, extra = {}) => {
    const result = await call('Runtime.evaluate', { expression, contextId, returnByValue: true, ...extra });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const frameCall = (method, ...args) => evaluateMain(
    'window.__codexWallpaperScene?.' + method + '(' + [url, ...args].map(JSON.stringify).join(',') + ')',
    { awaitPromise: true, userGesture: method === 'activateSceneFrame' },
  );
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    if (listener) client.socket.removeEventListener('message', listener);
    if (sessionId && !detached) {
      const { targetInfos } = await client.call('Target.getTargets', { filter: [{ type: 'iframe' }, { exclude: true }] }).catch(() => ({ targetInfos: [] }));
      detached = !targetInfos.some(info => info.url === url && info.parentFrameId === rootFrame);
    }
    if (contextId && !detached) await evaluate('globalThis.__wallpaperRenderer?.release()').catch(() => {});
    await frameCall('removeSceneFrame').catch(() => {});
    if (sessionId && !detached) await client.call('Target.detachFromTarget', { sessionId }).catch(() => {});
  };
  try {
    // Chromium attaches the sandbox as a separate target. Match both its blob URL and parent frame.
    let target;
    for (let attempt = 0; attempt < 60 && !target; ++attempt) {
      const { targetInfos } = await client.call('Target.getTargets', { filter: [{ type: 'iframe' }, { exclude: true }] });
      target = targetInfos.find(info => info.url === url && info.parentFrameId === rootFrame);
      if (!target) await delay(50);
    }
    if (!target) throw new Error('场景壁纸的沙箱未启动。');
    ({ sessionId } = await client.call('Target.attachToTarget', { targetId: target.targetId, flatten: true }));
    const { frameTree } = await call('Page.getFrameTree');
    ({ executionContextId: contextId } = await call('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id, worldName: 'codex-wallpaper-webwallgl',
    }));
    await call('Runtime.enable');
    await call('Runtime.addBinding', { name: readBinding, executionContextId: contextId });
    listener = async event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Target.detachedFromTarget' && message.params.sessionId === sessionId) detached = true;
      if (disposed || message.sessionId !== sessionId || message.method !== 'Runtime.bindingCalled' ||
          message.params.name !== readBinding || message.params.executionContextId !== contextId) return;
      let objectId, id;
      try {
        const request = JSON.parse(message.params.payload);
        id = request.id;
        const name = request.name;
        if (!Number.isSafeInteger(id) || typeof name !== 'string') return;
        if (assets && name === '/api/local-assets/local/materials/index.json') {
          await evaluate('globalThis.__wallpaperReadResult(' + id + ', new Blob([' + JSON.stringify(JSON.stringify({ names: assets.names })) + ']))');
          return;
        }
        const file = name.startsWith('/project/') ? inside(root, name.slice('/project/'.length)) :
          assets && name.startsWith('/api/local-assets/local/') ? inside(assets.root, name.slice('/api/local-assets/local/'.length)) : null;
        if (!file) { await evaluate('globalThis.__wallpaperReadResult(' + id + ', null)'); return; }
        // Pass a browser File handle to the renderer so large scene packages stay off the CDP wire.
        const input = await call('Runtime.evaluate', {
          contextId, expression: "Object.assign(document.createElement('input'), {type:'file'})",
        });
        objectId = input.result.objectId;
        await call('DOM.setFileInputFiles', { objectId, files: [file] });
        const result = await call('Runtime.callFunctionOn', {
          objectId, functionDeclaration: 'function(id) { globalThis.__wallpaperReadResult(id, this.files[0]); }', arguments: [{ value: id }],
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      } catch {
        if (Number.isSafeInteger(id)) await evaluate('globalThis.__wallpaperReadResult(' + id + ', null)').catch(() => {});
      } finally {
        if (objectId) await call('Runtime.releaseObject', { objectId }).catch(() => {});
      }
    };
    client.socket.addEventListener('message', listener);
    await evaluate('(' + installSceneRenderer.toString() + ')(' + Boolean(assets) + ')');
    // Keep the vendor bundle intact. The sandbox uses the engine's in-memory bake cache.
    await evaluate('(function(fetch, location, caches) {\n' + engineSource + '\n})(globalThis.__wallpaperFetch, globalThis.__wallpaperLocation, undefined)');
    const state = await evaluate('globalThis.__wallpaperRenderer.load(' + fps + ')', { awaitPromise: true });
    if (!state?.width || !state?.height || state.error) throw new Error(state?.error || '场景没有输出首帧。');
    return {
      activate: async effect => {
        const reply = await frameCall('activateSceneFrame', effect ?? null);
        if (reply.exceptionDetails || !reply.result?.value) throw new Error('场景壁纸图层已关闭。');
      },
      status: () => evaluate('globalThis.__wallpaperRenderer.state()'),
      volume: value => evaluate('globalThis.__wallpaperRenderer.volume(' + value / 100 + ')', { userGesture: true }),
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
