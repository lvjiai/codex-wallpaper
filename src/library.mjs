import { readFileSync } from 'node:fs';
import { CdpClient, discoverTargets, mainWindowExpression } from './cdp.mjs';
import { enumerateWallpapers, readConfig, saveConfig, wallpaperPreview } from './platform.mjs';
import { showLibrary } from './library-panel.mjs';
import { wallpaperTransitions } from './transitions.mjs';
import { appearanceControls, normalizeAppearance } from './appearance.mjs';

const binding = '__codexWallpaperLibraryAction';
const panelId = 'codex-wallpaper-library';

export async function openLibrary(controller, { visible = true } = {}) {
  const config = readConfig();
  const targets = await discoverTargets(config.cdpPort || 9222);
  if (!targets.length) throw new Error('请先用调试入口打开 Codex。');
  let client;
  for (const target of targets) {
    const candidate = new CdpClient(target.webSocketDebuggerUrl);
    try {
      await candidate.connect();
      const { result } = await candidate.call('Runtime.evaluate', {
        expression: mainWindowExpression,
        returnByValue: true,
      });
      if (result.value) { client = candidate; break; }
    } catch { /* Another Codex window may be opening or closing. */ }
    candidate.close();
  }
  if (!client) throw new Error('Codex 主窗口尚未就绪。');
  const wallpapers = enumerateWallpapers(config);
  const previews = wallpapers.map(item => {
    try { return wallpaperPreview(item); }
    catch { return null; }
  });
  const indexByProject = new Map(wallpapers.map((item, index) => [item.project.toLowerCase(), index]));
  const indexesFor = playlist => (playlist || []).map(project => indexByProject.get(project.toLowerCase())).filter(Number.isInteger);
  const selected = indexesFor(config.playlist);
  const groupOptions = groups => (groups || []).map(group => ({ ...group, playlist: undefined, indexes: indexesFor(group.playlist) }));
  const playbackState = () => {
    const saved = readConfig();
    const active = controller.active;
    const list = controller.activePlaylist || saved;
    const paths = list.playlist || [];
    const groups = saved.wallpaperGroups || [];
    const matches = group => group.playlist.length === paths.length && group.playlist.every((project, i) => project.toLowerCase() === paths[i].toLowerCase());
    const group = groups.find(item => item.name === list.groupName) || groups.find(matches);
    return {
      title: active?.title, index: indexByProject.get(active?.project?.toLowerCase()),
      type: active?.type, groups: groupOptions(groups),
      groupName: group?.name || '', indexes: indexesFor(paths),
      intervalSeconds: list.intervalSeconds || 300, order: list.order || 'sequential',
      transition: list.transition || 'cut', transitionMs: list.transitionMs || 1800,
    };
  };
  let contextId;
  let busy = false;
  let appearanceQueue = Promise.resolve();
  const render = async (method, ...args) => client.call('Runtime.evaluate', {
    expression: 'document.getElementById(' + JSON.stringify(panelId) + ')?.[' + JSON.stringify(method) + '](...' + JSON.stringify(args) + ')',
    contextId,
    returnByValue: true,
  });
  const getSettings = request => {
    const { indexes, intervalSeconds, order, transition, transitionMs } = request;
    if (!Array.isArray(indexes) || !indexes.length ||
        indexes.some(index => !Number.isInteger(index) || !previews[index])) throw new Error('请至少选择一张带预览的壁纸。');
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 2147483 ||
        !['sequential', 'shuffle'].includes(order) || !Object.hasOwn(wallpaperTransitions, transition) ||
        ![600, 1800, 3000].includes(transitionMs)) throw new Error('轮换设置无效。');
    return { playlist: [...new Set(indexes)].map(index => wallpapers[index].project), intervalSeconds, order, transition, transitionMs };
  };
  const listener = async event => {
    const { method, params } = JSON.parse(event.data);
    if (method !== 'Runtime.bindingCalled' || params.name !== binding || params.executionContextId !== contextId) return;
    let request;
    try { request = JSON.parse(params.payload); } catch { return; }
    if (request.action === 'current') {
      await render('syncPlayback', playbackState()).catch(() => {});
      return;
    }
    if (request.action === 'volume') {
      if (!Number.isInteger(request.value) || request.value < 0 || request.value > 100) return;
      try {
        if (request.save === true) saveConfig({ ...readConfig(), volume: request.value });
        await controller.setVolume(request.value);
      } catch (error) { await render('showVolumeError', error.message).catch(() => {}); }
      return;
    }
    if (request.action === 'appearance') {
      appearanceQueue = appearanceQueue.then(async () => {
        const appearance = normalizeAppearance(request.values);
        const applied = await controller.setAppearance(appearance, request.key === 'zoom');
        if (request.save === true) saveConfig({ ...readConfig(), appearance: applied });
        if (request.key === 'zoom') await render('syncZoomPosition', request.revision, applied.x, applied.y);
      }).catch(error => render('showAppearanceError', error.message).catch(() => {}));
      return;
    }
    if (request.action === 'preview') {
      const { index } = request;
      if (!Number.isInteger(index) || !previews[index]) return;
      const { file, type } = previews[index];
      let url = '';
      try { url = 'data:image/' + type + ';base64,' + readFileSync(file).toString('base64'); } catch {}
      await render('setPreview', index, url).catch(() => {});
      return;
    }
    if (busy) return;
    busy = true;
    try {
      const current = readConfig();
      if (request.action === 'stop') {
        await controller.stop();
        await render('showResult', '已关闭 Codex 壁纸。', true, 'stop');
      } else if (request.action === 'choose-wallpaper') {
        const item = Number.isInteger(request.index) && wallpapers[request.index];
        if (!item) throw new Error('请选择壁纸库中的壁纸。');
        const next = await controller.chooseWallpaper(item.project);
        await render('syncPlayback', playbackState());
        await render('showResult', '正在播放 ' + next.title, true, 'choose-wallpaper');
      } else if (request.action === 'start') {
        const groupName = (current.wallpaperGroups || []).find(group => group.name === request.groupName)?.name || '';
        const started = await controller.start({ ...getSettings(request), groupName });
        await render('showResult', '正在播放 ' + started.title, true, 'start', started.title, indexByProject.get(started.project.toLowerCase()));
      } else if (request.action === 'save' || request.action === 'delete') {
        const name = typeof request.name === 'string' ? request.name.trim() : '';
        if (!name || name.length > 60) throw new Error('请输入 1 至 60 个字符的组名。');
        const groups = (current.wallpaperGroups || []).slice();
        const index = groups.findIndex(group => group.name === name);
        if (request.action === 'save') {
          const group = { name, ...getSettings(request) };
          const editing = groups.findIndex(item => item.name === request.editing);
          if (index >= 0 && index !== editing) throw new Error('已有同名壁纸组。');
          if (editing < 0) groups.push(group);
          else groups[editing] = group;
        } else if (index >= 0) groups.splice(index, 1);
        const groupName = current.groupName === request.editing && request.action === 'save' ? name :
          current.groupName === name && request.action === 'delete' ? '' : current.groupName;
        if (controller.activePlaylist?.groupName && controller.activePlaylist.groupName === current.groupName) {
          controller.activePlaylist.groupName = groupName;
        }
        saveConfig({ ...current, groupName, wallpaperGroups: groups });
        await render('showGroups', groupOptions(groups), request.action === 'save' ? name : '');
        await render('showResult', request.action === 'save' ? '已保存壁纸组。' : '已删除壁纸组。', true, request.action);
      }
    } catch (error) { await render('showResult', error.message, false).catch(() => {}); }
    finally { busy = false; }
  };
  try {
    const world = 'codex-wallpaper-library';
    const { frameTree } = await client.call('Page.getFrameTree');
    if (frameTree.frame.url !== 'app://-/index.html') throw new Error('Codex 页面已切换，请重新打开选择器。');
    const result = await client.call('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: world });
    contextId = result.executionContextId;
    const alreadyOpen = await render('reopen');
    if (alreadyOpen.result?.value) {
      client.close();
      return { opened: true, reused: true };
    }
    client.socket.addEventListener('message', listener);
    client.socket.addEventListener('close', () => controller.stop(false).catch(() => {}), { once: true });
    await client.call('Runtime.addBinding', { name: binding, executionContextName: world });
    const { intervalSeconds = 300, order = 'sequential', transition = 'cut', transitionMs = 1800 } = config;
    const options = {
      binding, panelId, selected, intervalSeconds, order, transition, transitionMs, visible,
      appearanceControls, appearance: normalizeAppearance(config.appearance, config.dim),
      volume: config.volume || 0, playback: playbackState(),
      transitions: wallpaperTransitions, current: controller.active?.title || '',
      currentIndex: indexByProject.get(controller.active?.project?.toLowerCase()),
      wallpapers: wallpapers.map(({ title, source, type, workshopId }, i) => ({ title, source, type, workshopId, preview: Boolean(previews[i]) })),
      groups: (config.wallpaperGroups || []).map(group => ({ ...group, playlist: undefined, indexes: indexesFor(group.playlist) })),
    };
    const mounted = await client.call('Runtime.evaluate', { expression: '(' + showLibrary.toString() + ')(' + JSON.stringify(options) + ')', contextId, returnByValue: true });
    if (mounted.exceptionDetails || !mounted.result?.value) throw new Error('壁纸选择器未能打开。');
    return { opened: true, wallpapers: wallpapers.length, previews: previews.filter(Boolean).length, selected: selected.length };
  } catch (error) {
    client.close();
    throw error;
  }
}
