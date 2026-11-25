import { contactCopy } from '../content/contacts';
import type { Profile } from '../content/types';
import { CONTACTS } from '../core/timings';

type FormTarget = { kind: 'endpoint'; url: string } | { kind: 'mailto' };

export function replyKind(raw: string): 'email' | 'phone' | 'profile' | null {
  const value = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  if (/^[\d+\s-]+$/.test(value) && value.replace(/\D/g, '').length >= 9) return 'phone';
  if (/^(?:https?:\/\/|@)|(?:linkedin\.com|github\.com|t\.me)/i.test(value)) return 'profile';
  return null;
}

export function formTarget(endpoint: string | undefined = import.meta.env.VITE_CONTACT_ENDPOINT): FormTarget {
  const url = endpoint?.trim();
  return url ? { kind: 'endpoint', url } : { kind: 'mailto' };
}

export function bindContactForm(form: HTMLFormElement, profile: Profile, target = formTarget()): void {
  const name = form.querySelector<HTMLInputElement>('input[name=name]')!;
  const reply = form.querySelector<HTMLInputElement>('input[name=reply]')!;
  const message = form.querySelector<HTMLTextAreaElement>('textarea[name=message]')!;
  const website = form.querySelector<HTMLInputElement>('input[name=website]')!;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  const fields = [reply, message];
  form.noValidate = true;

  function setFieldError(field: HTMLInputElement | HTMLTextAreaElement, error: string): void {
    const description = form.querySelector<HTMLElement>('#' + field.getAttribute('aria-describedby'))!;
    description.textContent = error;
    if (error) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function setStatus(state: string, text: string): void {
    status.dataset.state = state;
    status.textContent = text;
  }

  form.addEventListener('input', event => {
    for (const field of fields) {
      if (event.target === field && field.hasAttribute('aria-invalid')) setFieldError(field, '');
    }
    if (!submit.disabled) setStatus('', '');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || website.value.trim()) return;
    setStatus('', '');
    const payload = { name: name.value.trim(), reply: reply.value.trim(), message: message.value };
    setFieldError(reply, replyKind(payload.reply) ? '' : contactCopy.replyError);
    setFieldError(message, payload.message.trim() ? '' : contactCopy.messageError);
    const invalid = fields.find(field => field.hasAttribute('aria-invalid'));
    if (invalid) {
      invalid.focus();
      return;
    }

    if (target.kind === 'mailto') {
      const sender = payload.name ? payload.name + '\n' : '';
      const body = sender + payload.reply + '\n\n' + payload.message;
      const link = form.ownerDocument.createElement('a');
      link.href = 'mailto:' + profile.email + '?subject=' + encodeURIComponent(contactCopy.subject) + '&body=' + encodeURIComponent(body);
      link.hidden = true;
      form.append(link);
      link.click();
      link.remove();
      setStatus('draft', contactCopy.draft);
      return;
    }

    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('sending', contactCopy.sending);
    try {
      const response = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Contact delivery failed');
      // A visitor can begin another message while the previous request is in flight.
      if (name.value.trim() === payload.name && reply.value.trim() === payload.reply && message.value === payload.message) {
        form.reset();
      }
      setStatus('success', contactCopy.sent);
    } catch {
      setStatus('error', contactCopy.sendError);
    } finally {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}

export function initContacts(profile: Profile): void {
  const form = document.querySelector<HTMLFormElement>('.contacts__form');
  if (form) bindContactForm(form, profile);
  const clock = document.querySelector<HTMLElement>('[data-clock]');
  if (!clock) return;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: profile.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const updateClock = () => { clock.textContent = formatter.format(new Date()) + ' WIB'; };
  updateClock();
  window.setInterval(updateClock, CONTACTS.clockRefresh * 1000);
}
