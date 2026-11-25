import type { Project, SiteContent } from '../content/types';
import { h } from './html';
import { MOBILE_ABOUT } from '../core/timings';
import { caseActions } from '../content/caseActions';
import { contactCopy } from '../content/contacts';
import heroPreset from '../../public/scenes/hero/preset.json';
import aboutPreset from '../../public/scenes/about/preset.json';
import { EYES_WINDOW_ASPECT } from '../gl/preset';

const CATEGORY_LABEL = { backend: 'Backend', data: 'Data', ai: 'AI' } as const;
const pad = (x: number) => String(x).padStart(2, '0');

const arrow = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v17" pathLength="1"/><path d="M5 13l7 7 7-7"/></svg>`;

const lastWord = (s: string) => s.trim().split(/\s+/).pop()!;

function header(c: SiteContent): string {
  return `<header class="header">
  <a class="logo" href="/" data-go="hero" aria-label="${h(c.profile.name)}"><span data-goo>${h(c.profile.shortName)}</span><span data-goo>${h(lastWord(c.profile.name))}</span></a>
  <nav class="nav" aria-label="Main">
    <a class="nav__link" href="/portfolio" data-go="portfolio"><span data-goo>Portfolio</span></a>
    <a class="nav__link" href="/about" data-go="about"><span data-goo>About</span></a>
    <a class="nav__link" href="/contacts" data-go="contacts"><span data-goo>Contacts</span></a>
  </nav>
</header>`;
}

function hero(c: SiteContent): string {
  const [lead, amp] = c.profile.heroLead;
  const [field, role] = c.profile.heroRole;
  return `<section class="hero" aria-label="Introduction">
  <h1 class="hero__title film-title" style="--hero-subject-x:${heroPreset.camera.subjectX * 100}%">
    <span class="hero__lead"><span class="hero__word" data-goo>${h(lead)}</span> <span class="hero__amp" data-goo>${h(amp)}</span></span>
    <span class="hero__tail"><span class="hero__word" data-goo>${h(field)}</span> <span class="hero__role" data-goo>${h(role)}</span></span>
  </h1>
  <a class="hero__scroll" href="/portfolio" data-go="portfolio">
    <span class="hero__hint hero__hint--pointer" data-goo>Scroll to see the work</span>
    <span class="hero__hint hero__hint--touch" data-goo>Swipe up to see the work</span>
    ${arrow('hero__arrow')}
  </a>
</section>`;
}

function portfolio(c: SiteContent): string {
  const first = c.projects[0];
  const filters = [['all', 'All'], ...Object.entries(CATEGORY_LABEL)]
    .map(
      ([k, label]) =>
        `<button class="filters__item${k === 'all' ? ' is-current' : ''}" type="button" data-filter="${k}" aria-pressed="${k === 'all'}" data-goo>${h(label)}</button>`,
    )
    .join('');
  const views = [
    ['strip', '<path d="M1 1h6v12H1zM9 1h6v12H9zM17 1h4v12h-4z"/>'],
    ['grid', '<path d="M1 1h8v5H1zM12 1h8v5h-8zM1 8h8v5H1zM12 8h8v5h-8z"/>'],
  ]
    .map(
      ([k, d]) =>
        `<button class="views__item${k === 'strip' ? ' is-current' : ''}" type="button" data-view="${k}" aria-pressed="${k === 'strip'}" data-goo aria-label="${k} view"><svg viewBox="0 0 22 14" aria-hidden="true">${d}</svg></button>`,
    )
    .join('');
  const items = c.projects
    .map(
      (p) =>
        `<li data-work="${h(p.slug)}" data-category="${h(p.categories.join(' '))}" data-case="${h(p.slug)}"><a href="/work/${h(p.slug)}" data-go="case:${h(p.slug)}"><img class="works__thumbnail" data-src="${h(p.cover)}" alt="" loading="lazy" decoding="async" width="1200" height="675"><span class="works__label"><span class="works__title">${h(p.title)}</span> <span class="works__subtitle">${h(p.subtitle)}</span></span></a></li>`,
    )
    .join('\n      ');
  return `<section class="portfolio" aria-label="Portfolio">
  <div class="portfolio__bar">
    <div class="filters" role="group" aria-label="Filter">${filters}</div>
    <div class="views" role="group" aria-label="View">${views}</div>
  </div>
  <div class="works">
    <div class="works__canvas">
      <ul class="works__list">
        ${items}
      </ul>
    </div>
    <p class="works__caption" aria-live="polite"><span class="works__title" data-goo>${h(first.title)}</span><span class="works__subtitle" data-goo>${h(first.subtitle)}</span></p>
  </div>
</section>`;
}

function caseEntry(p: Project, i: number, all: Project[]): string {
  const n = all.length;
  const prev = all[(i + n - 1) % n];
  const next = all[(i + 1) % n];
  const style = `--panel-bg:${h(p.palette.bg)};--panel-fg:${h(p.palette.fg)};--accent:${h(p.palette.accent)}`;
  const media = p.media
    .map(m => {
      const asset = `<img data-src="${h(m.src)}" alt="${h(m.alt)}" decoding="async">`;
      return `<li data-span="${h(m.span)}" data-aspect="${h(m.aspect)}" style="--case-aspect:${h(m.aspect)}">${asset}</li>`;
    })
    .join('');
  const links = [
    p.links.live ? `<a href="${h(p.links.live)}" target="_blank" rel="noopener">Live ↗</a>` : '',
    p.links.github ? `<a href="${h(p.links.github)}" target="_blank" rel="noopener">GitHub ↗</a>` : '',
  ].filter(Boolean);
  const fact = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const how = p.how.length
    ? `<section class="case__how" data-case-fade><h3 class="case__label">How it works</h3>${p.how
        .map(
          (s, j) =>
            `<div class="case__step"><span class="case__num">${pad(j + 1)}</span><h4>${h(s.heading)}</h4><p>${h(s.body)}</p></div>`,
        )
        .join('')}</section>`
    : '';
  const arch = p.architecture
    ? `<li data-span="full">
      <figure class="case__arch">
        <button class="case__arch-open" type="button" data-zoom aria-haspopup="dialog" aria-label="${caseActions.openDiagram}" aria-describedby="diagram-caption-${h(p.slug)}">
          <img src="${h(p.architecture.src)}" alt="${h(p.architecture.caption)}" width="1920" height="1080" loading="lazy" decoding="async">
        </button>
        <figcaption><strong id="architecture-${h(p.slug)}">Architecture</strong><span id="diagram-caption-${h(p.slug)}">${h(p.architecture.caption)}</span></figcaption>
      </figure>
      <dialog class="case__dialog" aria-labelledby="case-${h(p.slug)} architecture-${h(p.slug)}">
        <form method="dialog"><button type="submit" aria-label="${caseActions.closeDiagram}" autofocus>×</button></form>
        <img data-src="${h(p.architecture.src)}" alt="${h(p.architecture.caption)}" decoding="async">
      </dialog>
    </li>`
    : '';
  const metrics = p.metrics.length
    ? `<section class="case__metrics" data-case-fade><h3 class="case__label">By the numbers</h3><ul>${p.metrics
        .map((m) => `<li><strong data-odometer="${h(m.value)}">${h(m.value)}</strong><span>${h(m.label)}</span></li>`)
        .join('')}</ul></section>`
    : '';
  const code = p.code.length
    ? `<section class="case__code" data-case-fade><h3 class="case__label">Code</h3><ul>${p.code
        .map((l) => `<li><a href="${h(l.href)}" target="_blank" rel="noopener">${h(l.label)} ↗</a></li>`)
        .join('')}</ul></section>`
    : '';
  return `<article class="case__entry" data-case="${h(p.slug)}" style="${style}" hidden>
  <ul class="case__media" tabindex="0" aria-label="${h(p.title)} gallery">${media}${arch}</ul>
  <div class="case__panel" tabindex="-1" aria-labelledby="case-${h(p.slug)}">
    <div class="case__top" data-case-fade>
      <a class="case__back" href="/portfolio" data-go="portfolio">${arrow('case__arrow')}<span>All projects</span></a>
      <span class="case__count"><a href="/work/${h(prev.slug)}" data-go="case:${h(prev.slug)}" rel="prev" aria-label="${caseActions.previous}, ${h(prev.title)}">${pad(i + 1)}</a> / <a href="/work/${h(next.slug)}" data-go="case:${h(next.slug)}" rel="next" aria-label="${caseActions.next}, ${h(next.title)}">${pad(n)}</a></span>
    </div>
    <h2 id="case-${h(p.slug)}" class="case__title" data-goo>${h(p.title)}</h2>
    <p class="case__headline" data-case-fade><span class="case__dim">${h(p.headline.dim)}</span><span class="case__strong">${h(p.headline.strong)}</span></p>
    <p class="case__about" data-case-fade>${h(p.about)}</p>
    <dl class="case__facts" data-case-fade>${fact('Year', String(p.year))}${fact('Context', h(p.facts.context))}${fact('Work', h(p.facts.work))}${fact('Role', h(p.facts.role))}${fact('Stack', p.facts.stack.map(h).join(', '))}${links.length ? fact('Links', links.join(' ')) : ''}</dl>
    ${how}${metrics}${code}
    <nav class="case__nav" data-case-fade aria-label="Projects">
      <a href="/work/${h(prev.slug)}" data-go="case:${h(prev.slug)}" rel="prev">← ${h(prev.title)}</a>
      <a href="/work/${h(next.slug)}" data-go="case:${h(next.slug)}" rel="next">${h(next.title)} →</a>
    </nav>
  </div>
</article>`;
}

function about(c: SiteContent): string {
  const a = c.about;
  const label = (t: string) => `<span class="about__label">${h(t)}</span>`;
  return `<section class="about" aria-label="About" style="--mobile-portrait-height:${MOBILE_ABOUT.portraitHeight};--mobile-panel-start:${MOBILE_ABOUT.panelStart};--mobile-point-fade-end:${MOBILE_ABOUT.pointFadeEnd}">
  <div class="about__stage"></div>
  <div class="about__scroll">
    <div class="about__content">
      <h2 class="about__title"><span class="about__line" data-goo>${h(a.title[0])}</span> <span class="about__line" data-goo>${h(a.title[1])}</span></h2>
      <div class="about__lead" data-about-fade>
        <p>${h(a.lead)}</p>
        <span class="about__signature" aria-hidden="true"></span>
      </div>
      <div class="about__block about__numbers" data-about-fade>${label('Numbers')}${a.numbers.map((n) => `<div class="about__stat"><strong data-odometer="${h(n.value)}">${h(n.value)}</strong><span>${h(n.label)}</span></div>`).join('')}</div>
      <div class="about__block about__items" data-about-fade>${label('What I do')}${a.doing.map((d) => `<div class="about__item"><span class="about__num">${h(d.num)}</span><h3 class="about__name">${h(d.name)}</h3><p>${h(d.body)}</p></div>`).join('')}</div>
      <div class="about__block about__values" data-about-fade>${label('Experience')}${a.experience.map((e) => `<div class="about__value"><h3 class="about__big">${h(e.role)}</h3><p class="about__dim">${h(e.org)}, ${h(e.dates)}</p><p>${h(e.body)}</p></div>`).join('')}</div>
      <div class="about__block about__awards" data-about-fade>${label('Awards & certifications')}<ul class="about__awards-list">${a.awards.map((w) => `<li><span>${h(w.year)}</span><strong>${h(w.title)}</strong><em>${h(w.issuer)}</em></li>`).join('')}</ul></div>
      <div class="about__block about__stack" data-about-fade>${label('Stack')}<ul class="about__list">${a.stack.map((s) => `<li><span>${h(s)}</span></li>`).join(' ')}</ul></div>
      <div class="about__cta" data-about-fade><p class="about__motto">${h(a.cta)}</p><a class="about__button" href="/contacts" data-go="contacts"><span>Get in touch</span></a></div>
    </div>
  </div>
</section>`;
}

function contacts(c: SiteContent): string {
  const p = c.profile;
  const { centerX, centerY, spanX } = aboutPreset.eyesCrop;
  const spanY = spanX * (16 / 9) / EYES_WINDOW_ASPECT;
  const position = (center: number, span: number) => 100 * (center - span / 2) / (1 - span);
  const eyesBackground = `${position(centerX, spanX)}% ${position(centerY, spanY)}% / ${100 / spanX}% ${100 / spanY}%`;
  const links = [
    ['LinkedIn', p.linkedin],
    ['GitHub', p.github],
    ['Email', `mailto:${p.email}`],
    ['WhatsApp', p.whatsapp],
  ]
    .map(
      ([l, href]) =>
        `<a class="contacts__link" href="${h(href)}"${href.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"'}><span class="contacts__liquid" data-goo>${h(l)}</span></a>`,
    )
    .join('');
  return `<section class="contacts" aria-label="Contacts">
  <div class="contacts__inner">
    <div class="contacts__meta"><span>${h(p.location)}</span><span class="contacts__time"><i class="contacts__dot"></i><span data-clock data-tz="${h(p.timezone)}">WIB</span></span></div>
    <div class="contacts__portrait" aria-hidden="true" style="--eyes-aspect:${EYES_WINDOW_ASPECT};--eyes-background:${eyesBackground}">
      <canvas class="contacts__eyes"></canvas>
      <span class="contacts__corners"><i></i><i></i><i></i><i></i></span>
    </div>
    <div class="contacts__links">${links}</div>
    <form class="contacts__form" action="mailto:${h(p.email)}" method="post" enctype="text/plain">
      <div class="contacts__fields">
        <input class="contacts__name" name="name" type="text" aria-label="${h(contactCopy.name)}" placeholder="${h(contactCopy.name)}" autocomplete="name">
        <div>
          <input class="contacts__name" name="reply" type="text" aria-label="${h(contactCopy.reply)}" placeholder="${h(contactCopy.reply)}" aria-describedby="contacts-reply-error" autocomplete="email" required>
          <p class="contacts__error" id="contacts-reply-error" aria-live="polite"></p>
        </div>
      </div>
      <input class="contacts__trap" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
      <textarea class="contacts__box" name="message" aria-label="${h(contactCopy.message)}" placeholder="${h(contactCopy.message)}" aria-describedby="contacts-message-error" rows="5" required></textarea>
      <p class="contacts__error" id="contacts-message-error" aria-live="polite"></p>
      <button class="contacts__send" type="submit"><span>${h(contactCopy.send)}</span></button>
      <p class="contacts__status" data-form-status role="status" aria-live="polite"></p>
    </form>
    <p class="contacts__legal"><span>© ${new Date().getFullYear()} ${h(p.name)}</span><span>${h(p.email)}</span></p>
  </div>
  <div class="contacts__photo" aria-hidden="true"></div>
</section>`;
}

export function renderBody(c: SiteContent): string {
  return `<div class="stage" aria-hidden="true"></div>
<div class="veil" aria-hidden="true"></div>
<div class="preloader" aria-hidden="true"><p class="preloader__title film-title"><span data-goo>${h(c.profile.shortName)}</span><span data-goo>${h(lastWord(c.profile.name))}</span></p></div>
${header(c)}
<main>
${hero(c)}
${portfolio(c)}
<section class="case" aria-label="Case study">
${c.projects.map((p, i, all) => caseEntry(p, i, all)).join('\n')}
</section>
${about(c)}
${contacts(c)}
</main>
<div class="overlay overlay__grain" aria-hidden="true"></div>
<p class="turn">Turn your phone upright</p>`;
}
