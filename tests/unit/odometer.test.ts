import { expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { odometer } from '../../src/fx/odometer';

it.each(['100+', '<25ms', '3.80', '8 / 2'])('finishes on the exact original metric %s', target => {
  const { document } = parseHTML('<html><body><strong></strong></body></html>');
  const el = document.querySelector('strong') as HTMLElement;
  el.textContent = target;
  odometer(el, target).progress(1).kill();
  expect(el.textContent).toBe(target);
});
