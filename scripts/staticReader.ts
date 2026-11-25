import type { State } from '../src/core/routes';
import type { SiteContent } from '../src/content/types';
import { caseActions } from '../src/content/caseActions';
import { h } from '../src/render/html';

const link = (name: string, href: string) => `<a href="${h(href)}">${h(name)}</a>`;
const list = (items: string[]) => `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
const nav = '<nav aria-label="Main"><a href="/">Home</a> <a href="/portfolio">Portfolio</a> <a href="/about">About</a> <a href="/contacts">Contacts</a></nav>';

export function staticReader(state: State | null, c: SiteContent): string {
  const { profile, about, projects } = c;
  let body: string;
  if (!state) {
    body = `<h1>Page not found</h1><p>This address doesn’t lead to a portfolio page.</p>${link('View all projects', '/portfolio')}`;
  } else if (state.kind === 'case') {
    const p = projects.find(p => p.slug === state.slug)!;
    const links = [
      ...(p.links.live ? [link('Live project', p.links.live)] : []),
      ...(p.links.github ? [link('GitHub', p.links.github)] : []),
      ...p.code.map(item => link(item.label, item.href)),
    ];
    const [cover, ...photos] = p.media.map((m, index) =>
      `<img src="${h(m.src)}" alt="${h(m.alt)}" width="1200" height="${Math.round(1200 / m.aspect)}"${index ? ' loading="lazy"' : ''}>`
    );
    const diagram = p.architecture
      ? `<figure><a href="${h(p.architecture.src)}" aria-label="${caseActions.openDiagram}"><img src="${h(p.architecture.src)}" alt="${h(p.architecture.caption)}" width="1920" height="1080" loading="lazy"></a>
        <figcaption><strong>Architecture</strong> · ${h(p.architecture.caption)}</figcaption></figure>`
      : '';
    body = `<h1>${h(p.title)}</h1><p>${h(p.about)}</p>
      ${cover}
      <p>${h(p.facts.role)} · ${h(p.year)}</p><p>${p.facts.stack.map(h).join(', ')}</p>
      ${p.how.map(step => `<h2>${h(step.heading)}</h2><p>${h(step.body)}</p>`).join('')}
      ${p.metrics.length ? list(p.metrics.map(m => h(m.value + ' ' + m.label))) : ''}
      ${links.length ? list(links) : ''}
      <div class="reader__gallery">${photos.join('')}${diagram}</div>`;
  } else if (state.kind === 'portfolio') {
    body = '<h1>Portfolio</h1>' + list(projects.map(p => link(p.title + ' — ' + p.subtitle, '/work/' + p.slug)));
  } else if (state.kind === 'about') {
    body = `<h1>About ${h(profile.shortName)}</h1><p>${h(about.lead)}</p>
      <h2>What I do</h2>${list(about.doing.map(item => h(item.name + ' — ' + item.body)))}
      <h2>Experience</h2>${list(about.experience.map(e => h(e.role + ', ' + e.org + ' (' + e.dates + '). ' + e.body)))}
      <h2>Awards &amp; certifications</h2>${list(about.awards.map(a => h(a.title + ' — ' + a.issuer + ', ' + a.year)))}
      <h2>Stack</h2><p>${about.stack.map(h).join(', ')}</p>`;
  } else if (state.kind === 'contacts') {
    body = '<h1>Contacts</h1>' + list([link(profile.email, 'mailto:' + profile.email),
      link('LinkedIn', profile.linkedin), link('GitHub', profile.github), link('WhatsApp', profile.whatsapp)]);
  } else {
    body = `<h1>${h(profile.name)}</h1><p>${h([...profile.heroLead, ...profile.heroRole].join(' '))}</p>
      <p>${h(about.lead)}</p>${link('View all projects', '/portfolio')}`;
  }
  return `<div class="reader">${nav}<main>${body}</main></div>`;
}
