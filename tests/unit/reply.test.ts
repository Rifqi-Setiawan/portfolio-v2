import { describe, it, expect } from 'vitest';
import { replyKind, formTarget } from '../../src/sections/contacts';

describe('contact reply and delivery', () => {
  it.each([
    ['rifqi@x.id','email'], ['+62 821-7883-0078','phone'], ['github.com/Rifqi-Setiawan','profile'],
    ['@rifqi','profile'], ['https://example.org/me','profile'], ['hi',null], ['+++---123',null],
  ])('recognizes %s', (value, expected) => expect(replyKind(value!)).toBe(expected));
  it('uses the configured endpoint when one is supplied', () => {
    expect(formTarget('/api/contact')).toEqual({kind:'endpoint',url:'/api/contact'});
    expect(formTarget('')).toEqual({kind:'mailto'});
  });
});
