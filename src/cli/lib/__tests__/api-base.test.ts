import { describe, it, expect, beforeEach } from 'vitest';
import { classifyApiBase } from '../api-base';

describe('classifyApiBase', () => {
  beforeEach(() => {
    delete process.env.NUMO_ALLOW_CUSTOM_HOST;
  });

  it('trusts numo.ai hosts over HTTPS', () => {
    expect(classifyApiBase('https://api.numo.ai', true)).toEqual({ ok: true, insecure: false });
    expect(classifyApiBase('https://staging.numo.ai', true)).toEqual({ ok: true, insecure: false });
  });

  it('trusts loopback for local dev (any protocol)', () => {
    expect(classifyApiBase('http://localhost:3000', false)).toEqual({ ok: true, insecure: false });
    expect(classifyApiBase('http://127.0.0.1:3000', true)).toEqual({ ok: true, insecure: false });
  });

  it('refuses a runtime override to an untrusted host without opt-in', () => {
    const v = classifyApiBase('https://evil.example', true);
    expect(v.ok).toBe(false);
  });

  it('allows an untrusted host when NUMO_ALLOW_CUSTOM_HOST=1 (self-host/staging)', () => {
    process.env.NUMO_ALLOW_CUSTOM_HOST = '1';
    expect(classifyApiBase('https://my-numo.internal', true)).toEqual({ ok: true, insecure: false });
    expect(classifyApiBase('http://my-numo.internal', true)).toEqual({ ok: true, insecure: true });
  });

  it('trusts the baked default even for a non-numo host (distributor chose it)', () => {
    expect(classifyApiBase('https://self-hosted.example', false)).toEqual({ ok: true, insecure: false });
  });

  it('rejects an invalid URL or non-http(s) protocol', () => {
    expect(classifyApiBase('not-a-url', true).ok).toBe(false);
    expect(classifyApiBase('ftp://numo.ai', true).ok).toBe(false);
  });
});
