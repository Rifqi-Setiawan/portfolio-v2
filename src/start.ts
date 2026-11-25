import './styles/tokens.css';
import './styles/base.css';
import './styles/hero.css';
import './styles/portfolio.css';
import './styles/case.css';
import './styles/about.css';
import './styles/contacts.css';
import './styles/overlay.css';
import { withTimeout } from './core/load';
import { LOAD_TIMEOUT } from './core/timings';
import { beginLoader } from './sections/intro';

async function waitForNamePaint(): Promise<void> {
  const paint = 'first-contentful-paint';
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('paint')
    && !performance.getEntriesByName(paint).length) {
    let observer: PerformanceObserver | undefined;
    const painted = new Promise<void>(resolve => {
      observer = new PerformanceObserver(list => {
        if (list.getEntriesByName(paint).length) resolve();
      });
      observer.observe({ type: 'paint', buffered: true });
    });
    try {
      await withTimeout(painted, LOAD_TIMEOUT);
    } catch {
      // Browsers can suppress paint timing for a background or embedded document.
    } finally {
      observer?.disconnect();
    }
    return;
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function start(): Promise<void> {
  const hero = document.documentElement.dataset.opened === 'hero';
  if (hero) {
    // The router normally locks input while the name is visible.
    document.body.inert = true;
    await withTimeout(document.fonts.ready, LOAD_TIMEOUT).catch(() => undefined);
    beginLoader();
    await waitForNamePaint();
  }
  try {
    await import('./main');
  } finally {
    if (hero) document.body.inert = false;
  }
}

void start();
