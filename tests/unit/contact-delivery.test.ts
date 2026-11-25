import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { content } from '../../src/content';
import { renderBody } from '../../src/render/sections';
import { bindContactForm } from '../../src/sections/contacts';

const endpoint = '/api/contact';
const details = { name: 'Nadia', reply: 'nadia@example.invalid', message: 'Build a dashboard.\nWe have sample data.' };
const fieldNames = ['name', 'reply', 'message', 'website'] as const;

function mount() {
  const { document, Event } = parseHTML('<html><body>' + renderBody(content) + '</body></html>');
  const form = document.querySelector<HTMLFormElement>('.contacts__form')!;
  const input = (name: typeof fieldNames[number]) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  for (const [name, value] of Object.entries(details)) input(name as keyof typeof details).value = value;
  // Linkedom has no native reset method. Restore each field's initially empty value.
  form.reset = () => { for (const name of fieldNames) input(name).value = ''; };
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  bindContactForm(form, content.profile, { kind: 'endpoint', url: endpoint });
  return {
    fetch, input, submit: () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    status: form.querySelector<HTMLElement>('[data-form-status]')!,
  };
}

afterEach(() => vi.unstubAllGlobals());

it('POSTs JSON to the configured contact endpoint and clears the fields after delivery', async () => {
  const { fetch, submit, status, input } = mount();
  let finish!: (response: Response) => void;
  fetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  submit();
  submit();
  expect(fetch).toHaveBeenCalledTimes(1);
  finish(new Response(null, { status: 204 }));
  await vi.waitFor(() => expect(status.dataset.state).toBe('success'));
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe(endpoint);
  expect(init?.method).toBe('POST');
  expect(new Headers(init?.headers).get('content-type')).toMatch(/^application\/json\b/i);
  expect(JSON.parse(String(init?.body))).toEqual(details);
  expect(input('message').value).toBe('');
});

it.each(['http', 'network'])('preserves the message after a %s failure and allows retry', async failure => {
  const { fetch, submit, status, input } = mount();
  if (failure === 'http') fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  else fetch.mockRejectedValueOnce(new TypeError('offline'));
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  submit();
  await vi.waitFor(() => expect(status.dataset.state).toBe('error'));
  expect(status.textContent?.trim()).toBeTruthy();
  expect(input('message').value).toBe(details.message);
  expect(input('reply').value).toBe(details.reply);
  submit();
  await vi.waitFor(() => expect(status.dataset.state).toBe('success'));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('suppresses delivery when the hidden website field is filled', async () => {
  const { fetch, submit, input } = mount();
  input('website').value = 'https://example.invalid/';
  submit();
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});
