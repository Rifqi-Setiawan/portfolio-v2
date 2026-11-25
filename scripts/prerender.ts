import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SiteContent } from '../src/content/types';
import { openedAttr, pathFromState, type State } from '../src/core/routes';
import { pageMetadata } from '../src/core/metadata';
import { h } from '../src/render/html';
import { staticReader } from './staticReader';

const SEO_START = '<!--seo-->';
const SEO_END = '<!--/seo-->';
const STAGING_ORIGIN = 'https://v3.rifqisetiawan.my.id';

function setHtmlAttr(html: string, name: string, value: string): string {
  return html.replace(/<html\b([^>]*)>/i, (_m, attrs: string) => {
    const rest = attrs.replace(new RegExp(`\\s${name}="[^"]*"`), '');
    return `<html${rest} ${name}="${value}">`;
  });
}

export function notFoundPage(c: SiteContent): string {
  // Static hosts serve this file at the missing URL. Recover mistyped work links
  // with the same destination as the client router without booting the application.
  const slugs = JSON.stringify(c.projects.map(p => p.slug));
  const workRecovery = `<script>(function(){var p=location.pathname.toLowerCase().replace(/\\/+/g,'/').replace(/\\/index\\.html$/,'').replace(/\\/$/,'');if(p.indexOf('/work/')!==0)return;var target=${slugs}.includes(p.slice(6))?p:'/portfolio';if(location.pathname!==target)location.replace(target+location.search+location.hash)})()</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Page not found — ${h(c.profile.name)}</title><meta name="robots" content="noindex">
    <meta name="description" content="This portfolio page could not be found.">
    <link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/reader.css">${workRecovery}</head><body>${staticReader(null, c)}</body></html>`;
}

export function renderPage(template: string, s: State, c: SiteContent, origin = STAGING_ORIGIN): string {
  const { title, description: desc, url } = pageMetadata(s, c, origin);
  const og = h(`${origin}/og.jpg`);
  const tags = [
    `<meta name="description" content="${h(desc)}">`,
    `<link rel="canonical" href="${h(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${h(c.profile.name)}">`,
    `<meta property="og:title" content="${h(title)}">`,
    `<meta property="og:description" content="${h(desc)}">`,
    `<meta property="og:image" content="${og}">`,
    `<meta property="og:url" content="${h(url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${og}">`,
  ].join('\n');
  let out = template.replace(new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}\\s*`), '');
  out = out.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${h(title)}</title>`);
  out = out.replace('</head>', () => `${SEO_START}\n${tags}\n${SEO_END}\n</head>`);
  out = setHtmlAttr(out, 'data-opened', openedAttr(s));
  out = setHtmlAttr(out, 'data-state', s.kind);
  out = out.replace('</head>', '<noscript><link rel="stylesheet" href="/reader.css"></noscript></head>');
  out = out.replace('</body>', () => `<noscript>${staticReader(s, c)}</noscript></body>`);
  return out;
}

/** Writes an index.html for every route plus 404.html into `dist`; returns the written paths. */
export async function prerender(dist: string, c: SiteContent, origin = STAGING_ORIGIN): Promise<string[]> {
  const template = await readFile(join(dist, 'index.html'), 'utf8');
  const routes: State[] = [
    { kind: 'hero' },
    { kind: 'portfolio' },
    { kind: 'about' },
    { kind: 'contacts' },
    ...c.projects.map((p): State => ({ kind: 'case', slug: p.slug })),
  ];
  const written: string[] = [];
  const write = async (file: string, html: string) => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    written.push(file);
  };
  for (const s of routes) {
    const path = pathFromState(s);
    const html = renderPage(template, s, c, origin);
    await write(join(dist, path === '/' ? '' : path, 'index.html'), html);
    if (s.kind === 'portfolio') await write(join(dist, 'work', 'index.html'), html);
  }
  await write(join(dist, '404.html'), notFoundPage(c));
  return written;
}
