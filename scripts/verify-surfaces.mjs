// Run against the app's Chromium engine without changing the visible page.
// Covers nested tabs and pseudo-elements that previously left opaque strips.
import assert from 'node:assert/strict';
import { discoverTargets, CdpClient } from '../src/cdp.mjs';
import { appSurfaceCss } from '../src/app-surfaces.mjs';

const [target] = await discoverTargets();
assert.ok(target, 'Open ChatGPT with the wallpaper plugin first.');
const client = new CdpClient(target.webSocketDebuggerUrl);
try {
  await client.connect();
  const { result, exceptionDetails } = await client.call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(${function verify(css) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:700px;pointer-events:none;';
      host.setAttribute('aria-hidden', 'true');
      host.inert = true;
      const root = host.attachShadow({ mode: 'open' });
      const base = document.createElement('style');
      base.textContent = '.bg-surface,.bg-surface-canvas{background:rgb(24,24,24)} .card{background:rgb(50,50,50)} .paper{background:white} .selected{background:rgba(255,255,255,.05)} .footer-fixture::before{content:"";background:linear-gradient(transparent,#181818)} .footer-fixture::after{content:"";background:#181818}';
      const theme = document.createElement('style');
      theme.textContent = css.replaceAll('body[data-codex-wallpaper-active]', '[data-fixture-active]');
      root.append(base, theme);
      const fixture = document.createElement('div');
      fixture.setAttribute('data-fixture-active', '');
      fixture.innerHTML = '<section data-app-shell-tab-panel-controller="right"><div><div><div id="newtab" data-new-tab-scroll-root class="bg-surface"><button class="card" id="control">Search</button><div id="selected" class="selected">Selected</div></div></div></div></section>' +
        '<section data-app-shell-tab-panel-controller="bottom"><div><main id="viewer" class="h-full bg-surface-canvas"><article id="paper" class="paper">Document page</article></main></div></section>' +
        '<div class="footer-fixture pointer-events-none absolute inset-x-0" id="footer"><div data-composer-layout="multiline">Input</div></div>' +
        '<div role="menu" id="menu">Options</div>';
      root.append(fixture);
      document.body.append(host);
      try {
        const style = (id, pseudo) => getComputedStyle(root.getElementById(id), pseudo);
        const transparent = 'rgba(0, 0, 0, 0)';
        const checks = {
          nestedNewTab: style('newtab').backgroundColor === transparent,
          bottomViewer: style('viewer').backgroundColor === transparent,
          footerGradient: style('footer', '::before').backgroundImage === 'none',
          footerSolid: style('footer', '::after').backgroundColor === transparent,
          floatingGlass: style('menu').backgroundColor === 'rgba(38, 40, 46, 0.65)',
          controlsPreserved: style('control').backgroundColor === 'rgb(50, 50, 50)',
          selectionPreserved: style('selected').backgroundColor === 'rgba(255, 255, 255, 0.05)',
          documentPreserved: style('paper').backgroundColor === 'rgb(255, 255, 255)',
          textOpaque: style('newtab').opacity === '1',
        };
        fixture.removeAttribute('data-fixture-active');
        checks.disabledRestoresOriginal = style('newtab').backgroundColor === 'rgb(24, 24, 24)' && style('footer', '::after').backgroundColor === 'rgb(24, 24, 24)';
        return checks;
      } finally { host.remove(); }
    }.toString()})(${JSON.stringify(appSurfaceCss)})`,
  });
  assert.equal(exceptionDetails, undefined, JSON.stringify(exceptionDetails));
  for (const [name, passed] of Object.entries(result.value)) assert.equal(passed, true, name);
  console.log(JSON.stringify(result.value, null, 2));
} finally { client.close(); }
