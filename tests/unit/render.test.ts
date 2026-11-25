import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { content } from '../../src/content';
import { renderBody } from '../../src/render/sections';
import { prerender, notFoundPage } from '../../scripts/prerender';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe('renderBody', () => {
  const html = renderBody(content);

  it('renders 8 case entries and 8 work items in content order', () => {
    const entries = html.match(/<article class="case__entry"[^>]*>/g) ?? [];
    expect(entries).toHaveLength(8);
    const lis = html.match(/<li\b[^>]*\bdata-work\b[^>]*>/g) ?? [];
    expect(lis).toHaveLength(8);
    const slugs = content.projects.map((p) => p.slug);
    expect(lis.map((t) => attr(t, 'data-case'))).toEqual(slugs);
    expect(entries.map((t) => attr(t, 'data-case'))).toEqual(slugs);
    expect(entries.every((t) => /\bhidden\b/.test(t))).toBe(true);
  });

  it('escapes < in content', () => {
    const evil = structuredClone(content);
    evil.projects[0].title = 'A <script>x</script> & "q"';
    evil.projects[0].media[0].alt = 'A "wide" diagram & legend';
    const out = renderBody(evil);
    expect(out).not.toContain('<script>x');
    expect(out).toContain('A &lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;');
    expect(out).toContain('alt="A &quot;wide&quot; diagram &amp; legend"');
  });

  it.each(content.projects)('keeps the images and architecture caption for $slug together in its gallery', (project) => {
    const entry = parseHTML(html).document.querySelector(`.case__entry[data-case="${project.slug}"]`)!;
    const gallery = entry.querySelector('.case__media')!;
    expect(entry.querySelector('.case__panel img')).toBeNull();
    const images = Array.from(gallery.querySelectorAll('img')).filter(img => !img.closest('dialog'));
    expect(images.map(img => img.getAttribute('data-src') ?? img.getAttribute('src'))).toEqual([
      ...project.media.map(asset => asset.src),
      ...(project.architecture ? [project.architecture.src] : []),
    ]);
    const diagram = gallery.querySelector('.case__arch');
    if (project.architecture) {
      expect(diagram?.querySelector('figcaption')?.textContent).toContain(project.architecture.caption);
    } else {
      expect(diagram).toBeNull();
    }
  });

  it('carries the structural hooks', () => {
    expect(html).not.toMatch(/<video\b/i);
    expect(parseHTML(html).document.querySelector('.overlay.overlay__grain[aria-hidden="true"]')).toBeTruthy();
    for (const hook of ['class="stage"', 'class="veil"', 'preloader__title film-title', 'data-go="hero"', 'hero__title film-title', 'hero__scroll', 'works__caption', 'about__stage', 'class="about__title"', 'class="turn"', 'data-filter="all"', 'data-view="grid"']) {
      expect(html, hook).toContain(hook);
    }
  });
});

describe('prerender', () => {
  it('recovers work links on a case-sensitive static host without redirecting unrelated 404s', () => {
    const script = parseHTML(notFoundPage(content)).document.querySelector('script')!.textContent!;
    for (const [path, expected] of [
      ['/wORk/PartPilot/', '/work/partpilot?from=cv#case-partpilot'],
      ['/work/no-such-case', '/portfolio?from=cv#case-partpilot'],
      ['/missing-page', undefined],
      ['/work/partpilot', undefined], // No loop if a valid file is missing from the host.
    ]) {
      let next: string | undefined;
      const location = { pathname: path, search: '?from=cv', hash: '#case-partpilot', replace: (url: string) => { next = url; } };
      runInNewContext(script, { location });
      expect(next).toBe(expected);
    }
  });

  it.each([
    ['staging', undefined],
    ['live', 'https://portfolio.rifqisetiawan.my.id'],
  ] as const)('writes every %s route plus 404', async (_target, origin) => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html lang="en"><head><title>Rifqi</title></head><body>x</body></html>');
    const written = await prerender(dist, content, origin);
    expect(written).toHaveLength(14);
    for (const p of written) expect(existsSync(p)).toBe(true);
    expect(existsSync(join(dist, '404.html'))).toBe(true);
    const wm = readFileSync(join(dist, 'work', 'wellmom', 'index.html'), 'utf8');
    expect(wm).toContain('<title>WellMom, ');
    expect(wm).toContain('data-opened="case"');
    const expectedOrigin = origin ?? 'https://v3.rifqisetiawan.my.id';
    expect(wm).toContain(`<link rel="canonical" href="${expectedOrigin}/work/wellmom">`);
    expect(wm).toContain(`property="og:url" content="${expectedOrigin}/work/wellmom"`);
    expect(wm).toContain(`property="og:image" content="${expectedOrigin}/og.jpg"`);
    expect(wm).toContain(`name="twitter:image" content="${expectedOrigin}/og.jpg"`);
    expect(readFileSync(join(dist, 'work', 'index.html'), 'utf8'))
      .toBe(readFileSync(join(dist, 'portfolio', 'index.html'), 'utf8'));
    const missing = readFileSync(join(dist, '404.html'), 'utf8');
    expect(missing).toContain('<h1>Page not found</h1>');
    expect(missing).toContain('content="noindex"');
    expect(missing).not.toMatch(/type="module"|rel="canonical"/);
    expect(readFileSync(join(dist, 'about', 'index.html'), 'utf8')).toContain('data-opened="about"');
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('data-opened="hero"');
  });
});
