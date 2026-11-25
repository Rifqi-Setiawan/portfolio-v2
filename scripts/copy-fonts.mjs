import { copyFileSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@fontsource/plus-jakarta-sans/files';
mkdirSync('public/fonts', { recursive: true });
for (const w of [400, 500, 600, 700]) {
  const f = `plus-jakarta-sans-latin-${w}-normal.woff2`;
  copyFileSync(`${src}/${f}`, `public/fonts/${f}`);
}
console.log('fonts copied');
