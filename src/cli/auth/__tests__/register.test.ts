import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateEmail,
  validatePassword,
  classifySignUpError,
} from '../register';
import { CliError, ErrorKind } from '../../lib/errors';

// ── Pure function tests ─────────────────────────────────────────────

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('user@example.com')).toBe('user@example.com');
  });

  it('accepts email with subdomains', () => {
    expect(validateEmail('a@b.c.d.com')).toBe('a@b.c.d.com');
  });

  it('trims whitespace', () => {
    expect(validateEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('rejects empty string', () => {
    expect(() => validateEmail('')).toThrow('Invalid email');
  });

  it('rejects email without @', () => {
    expect(() => validateEmail('no-at-sign')).toThrow('Invalid email');
  });

  it('rejects email with spaces', () => {
    expect(() => validateEmail('spaces in@email.com')).toThrow('Invalid email');
  });
});

describe('validatePassword', () => {
  it('accepts 6-char password', () => {
    expect(validatePassword('123456')).toBe('123456');
  });

  it('accepts longer password', () => {
    expect(validatePassword('longpassword123')).toBe('longpassword123');
  });

  it('rejects 5-char password', () => {
    expect(() => validatePassword('12345')).toThrow('min 6 characters');
  });

  it('rejects empty string', () => {
    expect(() => validatePassword('')).toThrow('min 6 characters');
  });
});

describe('classifySignUpError', () => {
  function makeApiError(kind: string, message: string) {
    return { response: { data: { error: { kind, message } } } };
  }

  it('maps CONFLICT / already in use', () => {
    const err = classifySignUpError(makeApiError('CONFLICT', 'Email already in use'));
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toBe('Email already in use');
    expect(err.options.hint).toContain('numo login');
  });

  it('maps Invalid email', () => {
    const err = classifySignUpError(makeApiError('INVALID_INPUT', 'Invalid email address'));
    expect(err.message).toBe('Invalid email address');
  });

  it('maps Password too weak', () => {
    const err = classifySignUpError(
      makeApiError('INVALID_INPUT', 'Password too weak (min 6 characters)'),
    );
    expect(err.message).toContain('min 6 characters');
  });

  it('falls back to classifyError for unknown errors', () => {
    const err = classifySignUpError(new Error('something else'));
    expect(err).toBeInstanceOf(CliError);
  });

  it('returns CliError as-is', () => {
    const original = new CliError(ErrorKind.INTERNAL, 'test', 1);
    expect(classifySignUpError(original)).toBe(original);
  });
});

// ── Integration tests (mocked I/O) ─────────────────────────────────

vi.mock('../../lib/http', () => ({
  http: { post: vi.fn() },
}));

vi.mock('../credentials', () => ({
  saveCredentials: vi.fn(),
  getIdToken: vi.fn().mockResolvedValue('test-id-token'),
}));

vi.mock('../../lib/prompts', () => ({
  promptText: vi.fn(),
  promptPassword: vi.fn(),
}));

vi.mock('../../lib/tty', () => ({
  isInteractive: vi.fn().mockReturnValue(false),
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
  log: { error: vi.fn(), warning: vi.fn() },
}));

describe('register (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('happy path: creates account via API, saves credentials', async () => {
    const { http } = await import('../../lib/http');
    const { saveCredentials } = await import('../credentials');
    const { register } = await import('../register');

    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
        uid: 'uid123abc',
        email: 'test@example.com',
        expiresIn: 3600,
      },
    } as any);

    await register({ email: 'test@example.com', password: 'secret123' });

    // API auth/register called
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/register'),
      expect.objectContaining({ email: 'test@example.com', password: 'secret123' }),
    );

    // Credentials saved
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'test-refresh-token',
        uid: 'uid123abc',
        email: 'test@example.com',
      }),
    );
  });

  it('CONFLICT shows correct error', async () => {
    const { http } = await import('../../lib/http');
    const { register } = await import('../register');
    const p = await import('@clack/prompts');

    vi.mocked(http.post).mockRejectedValueOnce({
      response: { data: { error: { kind: 'CONFLICT', message: 'Email already in use' } } },
    });

    await register({ email: 'taken@example.com', password: 'secret123' });

    expect(p.log.error).toHaveBeenCalledWith('Email already in use');
    expect(p.log.warning).toHaveBeenCalledWith(
      expect.stringContaining('numo login'),
    );
    expect(process.exit).toHaveBeenCalled();
  });

  it('invalid email throws before HTTP call', async () => {
    const { http } = await import('../../lib/http');
    const { register } = await import('../register');

    await register({ email: 'not-an-email', password: 'secret123' });

    expect(http.post).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalled();
  });

  it('short password throws before HTTP call', async () => {
    const { http } = await import('../../lib/http');
    const { register } = await import('../register');

    await register({ email: 'valid@email.com', password: '123' });

    expect(http.post).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalled();
  });
});
