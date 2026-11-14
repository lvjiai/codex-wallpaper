const active = 'body[data-codex-wallpaper-active]';
const main = ':is([data-app-shell-main-surface], main[class*="MainContentSurface-"])';
const frame = ':is([data-app-shell-thread-edge-divider], [class*="MainContentFrame-"])';
const scrollingPage = '[data-app-shell-inline-page-header]';
const pageLayout = '.min-h-full > .mx-auto.bg-surface[class~="max-w-[1440px]"]';
const pageShell = 'div.bg-surface.h-full.min-h-0.flex-col:has(> .contents > .overflow-y-auto > ' + pageLayout + ')';
const pageContent = pageShell + ' > .contents > .overflow-y-auto > ' + pageLayout;

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
  ['[class*="ComposerLayoutRoot-"]', 'background-color:rgba(100,104,116,.22) !important; backdrop-filter:blur(18px) saturate(120%); border-color:rgba(255,255,255,.18);'],
];

export const appSurfaceCss = rules.map(([selector, declarations]) =>
  active + (selector ? ' ' + selector : '') + ' { ' + declarations + ' }',
).join('\n');
