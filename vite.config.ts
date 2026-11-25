import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { content } from './src/content';
import { renderBody } from './src/render/sections';
import { notFoundPage, prerender, renderPage } from './scripts/prerender';
import { pathFromState, stateFromPath } from './src/core/routes';

// Injects the project slugs into the inline head script so it agrees with
// openedAttr(stateFromPath(path, slugs)) before JS loads.
function headSlugs(): Plugin {
  // Content tests enforce URL-safe lowercase slugs.
  const slugs = content.projects.map(p => p.slug).join('|');
  return {
    name: 'head-slugs',
    transformIndexHtml: (html) => html.replace('__SLUGS__', () => slugs),
  };
}

// Renders every section into the document at build/dev time, then writes one
// index.html per route (plus 404.html) once the bundle is on disk.
function contentPlugin(): Plugin {
  let outDir = 'dist';
  let build = false;
  let origin: string | undefined;
  const slugs = content.projects.map(p => p.slug);
  const htmlRoutes = (preview: boolean): Connect.NextHandleFunction => (req, res, next) => {
    const path = (req.url ?? '/').split('?')[0];
    const acceptsPage = /text\/html|\*\/\*/.test(req.headers.accept ?? '*/*');
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!acceptsPage || path.startsWith('/@') || path.startsWith('/__') || path.startsWith('/node_modules/')) return next();
    if (/\.[^/]+$/.test(path) && !path.endsWith('.html')) return next();
    const state = stateFromPath(path, slugs);
    if (!state) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : notFoundPage(content));
      return;
    }
    if (preview) req.url = pathFromState(state).replace(/\/$/, '') + '/index.html';
    next();
  };
  return {
    name: 'content',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
      build = cfg.command === 'build';
      if (cfg.mode === 'live') origin = 'https://portfolio.rifqisetiawan.my.id';
    },
    configureServer(server) { server.middlewares.use(htmlRoutes(false)); },
    configurePreviewServer(server) { server.middlewares.use(htmlRoutes(true)); },
    transformIndexHtml(html, ctx) {
      const shell = html.replace('<!--app-->', () => renderBody(content));
      if (build) return shell;
      const state = stateFromPath((ctx.originalUrl ?? ctx.path).split('?')[0], slugs);
      return state ? renderPage(shell, state, content, origin) : shell;
    },
    async closeBundle() {
      if (!build) return;
      await prerender(outDir, content, origin);
    },
  };
}

export default defineConfig({
  plugins: [headSlugs(), contentPlugin()],
  build: {
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
  // The source entry is shared by every prerendered route. Raw media and
  // the local Python environment can contain many thousands of other files.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    watch: { ignored: ['**/.venv/**', '**/raw-assets/**', '**/.superpowers/**', '**/compare/**'] },
  },
  preview: { port: 4174, strictPort: true },
});
