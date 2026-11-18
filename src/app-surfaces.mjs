const active = 'body[data-codex-wallpaper-active]';
const main = ':is([data-app-shell-main-surface], main[class*="MainContentSurface-"])';
const frame = ':is([data-app-shell-thread-edge-divider], [class*="MainContentFrame-"])';
const scrollingPage = '[data-app-shell-inline-page-header]';
const pageLayout = '.min-h-full > .mx-auto.bg-surface[class~="max-w-[1440px]"]';
const pageShell = 'div.bg-surface.h-full.min-h-0.flex-col:has(> .contents > .overflow-y-auto > ' + pageLayout + ')';
const pageContent = pageShell + ' > .contents > .overflow-y-auto > ' + pageLayout;
const panel = ':is([data-app-shell-focus-area="right-panel"], [data-app-shell-focus-area="bottom-panel"])';
const tab = '[data-app-shell-tab-panel-controller]';
const paint = ':is(.bg-surface,.bg-surface-canvas,.bg-surface-secondary,.bg-background-artifact-preview,.bg-token-bg-primary)';
const layout = ':is(div,main,section,aside):is(.h-full,.h-screen,.h-dvh,.min-h-svh,.min-h-full)';
const transparent = 'background:transparent !important;';
const glass = 'background:rgba(38,40,46,.65) !important; backdrop-filter:blur(18px) saturate(120%);';
const composerFooter = ':is([data-thread-scroll-footer], [class*="footer-"].pointer-events-none.absolute.inset-x-0):has([data-composer-layout])';

// Surface ownership is shared by the main page, right/bottom docks and portals.
// Match the application's semantic attributes and full-height layout surfaces,
// rather than a particular tab's nesting depth or generated component name.
// Document pages, media, tables, controls and selected rows keep their own paint.
export const surfaceGroups = {
  layout: [
    layout + paint,
    '[data-new-tab-scroll-root]',
    '[data-app-shell-pane-content-viewport]',
    '[data-app-shell-titlebar]',
    '[data-app-shell-titlebar-slot]',
    '[data-app-shell-tabs]',
    tab,
    tab + ' > ' + paint,
    '[data-viewer-header-placement]',
    '[data-testid="viewer-header"]',
    '[data-testid="artifact-pdf-preview-panel"]',
    '[data-testid="docx-preview-panel"]',
    '.codex-docx-preview-wrapper',
    'div.bg-surface[data-theme]',
  ],
  headers: [
    '[data-pane-header-placement]',
    '[data-pane-header-placement] > ' + paint,
    '[data-pane-header-placement] > div > ' + paint,
    '[data-browser-sidebar-toolbar]',
    '.bg-surface:has(> div > [data-browser-sidebar-toolbar])',
    '[data-testid="browser-profile-import"] aside',
  ],
  floating: [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="menu"]',
    '[data-radix-popper-content-wrapper] > [role="listbox"]',
  ],
};

// Match shell roles and layout wrappers. Theme tokens also paint cards and menus,
// so overriding those tokens globally would erase interactive surfaces.
const rules = [
  ['', 'isolation:isolate; background-color:transparent !important;'],
  [main, 'background-color:transparent !important; border-left-color:transparent !important;'],
  [':is([data-sidebar-navigation-root], [data-slate-sidebar-content], .sidebar-navigation[class*="ConversationSidebar-"])', 'background:transparent !important; border-color:transparent !important; box-shadow:none !important; backdrop-filter:none !important;'],
  [scrollingPage + ' > .min-h-full > [data-sticky]::before', 'background:transparent !important;'],
  [main + ' [class*="MainContentTopFade-"]', 'background:none !important;'],
  [main + ' .pointer-events-none.absolute.inset-x-0.from-surface[class*="background-"][class*="fade-"]', 'background-image:none !important;'],
  [main + ' .pointer-events-none.absolute.bottom-0.bg-surface[class*="background-"][class*="surface-"]', 'background-color:transparent !important;'],
  // New clients paint the composer fade in footer pseudo-elements rather than
  // separate background nodes. Clear both layers, including focus mode.
  [composerFooter, transparent],
  [composerFooter + '::before', transparent],
  [composerFooter + '::after', transparent],
  [frame + ' :is(' + [
    'div[class~="electron:bg-surface"][class~="windows:rounded-tl-lg"]:has(> div [class~="group/settings"])',
    pageShell,
    pageContent,
    pageContent + ' > .mx-auto.min-h-full.bg-surface[id]',
    'div.bg-surface.h-full.flex-col:has(> .contents > ' + scrollingPage + ')',
    'div.bg-surface.h-full.flex-col:has(> [data-profile-scroll])',
    'main.bg-surface.h-full.min-h-0.overflow-hidden',
    'div.bg-surface.h-full.items-center.justify-center',
  ].join(', ') + ')', 'background-color:transparent !important;'],
  ...surfaceGroups.layout.map(selector => [selector, transparent]),
  ...surfaceGroups.headers.map(selector => [selector, transparent + ' border-color:transparent !important;']),
  ...surfaceGroups.floating.map(selector => [selector, glass]),
  [panel, '--app-shell-panel-background:transparent !important;'],
  [panel + ' :is(.border-l,.border-r):has([class*="ChatDockPreviewContent-"])', 'border-color:transparent !important;'],
  [':is([data-artifact-search-surface],.codex-docx-preview-wrapper)', '--color-background-artifact-preview:transparent !important;'],
  // Both shadow roots use the host surface color. Keep selection and diff colors on their own tokens.
  [':is(diffs-container,file-tree-container)', 'background-color:transparent !important; --color-surface:transparent !important;'],
  ['diffs-container', '--diffs-bg:transparent !important;'],
  ['[class*="ComposerLayoutRoot-"]', 'background-color:rgba(100,104,116,.22) !important; backdrop-filter:blur(18px) saturate(120%); border-color:rgba(255,255,255,.18);'],
];

export const appSurfaceCss = rules.map(([selector, declarations]) =>
  active + (selector ? ' ' + selector : '') + ' { ' + declarations + ' }',
).join('\n');
