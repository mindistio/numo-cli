import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateEmail,
  validatePassword,
  generateUsername,
  randomAvatar,
  buildUserDoc,
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

describe('generateUsername', () => {
  it('generates from email prefix + uid prefix', () => {
    expect(generateUsername('john@gmail.com', 'xR4kLm9abc')).toBe('john-xR4k');
  });

  it('truncates long email prefix to 7 chars', () => {
    expect(generateUsername('longprefix@x.com', 'abcdefgh')).toBe('longpre-abcd');
  });

  it('keeps short email prefix as-is', () => {
    expect(generateUsername('ab@x.com', '1234abcd')).toBe('ab-1234');
  });
});

describe('randomAvatar', () => {
  it('returns valid avatar path', () => {
    expect(randomAvatar()).toMatch(/^assets\/avatar[1-6]-min\.png$/);
  });
});

describe('buildUserDoc', () => {
  it('returns object with all mandatory fields', () => {
    const now = 1711796400000;
    const doc = buildUserDoc('user@example.com', 'uid123', 'user-uid1', 'assets/avatar1-min.png', now);

    expect(doc).toMatchObject({
      email: 'user@example.com',
      userId: 'uid123',
      signUpTag: 'Numo Sign up',
      createdAt: now,
      username: 'user-uid1',
      defaultAvatar: 'assets/avatar1-min.png',
      reminderPlatform: 'imessage',
      postOnboardingV1Status: 'not-completed',
      onboarding: {},
    });
    expect(doc.fcmToken).toEqual([]);
    expect(doc.badges).toEqual([]);
    expect(doc.preference).toHaveProperty('tz');
    expect((doc.preference as any).tz).toBeTypeOf('string');
    expect((doc.preference as any).timezones).toBeInstanceOf(Array);
    expect((doc.preference as any).timezones[0]).toBeTypeOf('number');
  });

  it('has all expected top-level keys', () => {
    const doc = buildUserDoc('a@b.com', 'uid', 'a-uid', 'assets/avatar1-min.png');
    const keys = Object.keys(doc).sort();
    expect(keys).toEqual([
      'badges', 'createdAt', 'defaultAvatar', 'email', 'fcmToken',
      'onboarding', 'postOnboardingV1Status', 'preference',
      'reminderPlatform', 'signUpTag', 'userId', 'username',
    ]);
  });
});

describe('classifySignUpError', () => {
  function makeFirebaseError(message: string) {
    return { response: { data: { error: { code: 400, message } } } };
  }

  it('maps EMAIL_EXISTS', () => {
    const err = classifySignUpError(makeFirebaseError('EMAIL_EXISTS'));
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toBe('Email already in use');
    expect(err.options.hint).toContain('numo login');
  });

  it('maps INVALID_EMAIL', () => {
    const err = classifySignUpError(makeFirebaseError('INVALID_EMAIL'));
    expect(err.message).toBe('Invalid email address');
  });

  it('maps WEAK_PASSWORD', () => {
    const err = classifySignUpError(
      makeFirebaseError('WEAK_PASSWORD : Password should be at least 6 characters'),
    );
    expect(err.message).toContain('min 6 characters');
  });

  it('maps OPERATION_NOT_ALLOWED', () => {
    const err = classifySignUpError(makeFirebaseError('OPERATION_NOT_ALLOWED'));
    expect(err.message).toBe('Email registration is disabled');
    expect(err.kind).toBe(ErrorKind.AUTH_FORBIDDEN);
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
}));

vi.mock('../../lib/firestore', () => ({
  setDoc: vi.fn().mockResolvedValue({}),
  commit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/config', () => ({
  getFirebaseApiKey: vi.fn().mockReturnValue('test-api-key'),
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
    // Prevent process.exit from actually exiting
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    // Suppress console.log from printSuccess
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('happy path: creates account, saves credentials, sets up profile', async () => {
    const { http } = await import('../../lib/http');
    const { saveCredentials } = await import('../credentials');
    const { setDoc, commit } = await import('../../lib/firestore');
    const { register } = await import('../register');

    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
        localId: 'uid123abc',
        email: 'test@example.com',
        expiresIn: '3600',
      },
    } as any);

    await register({ email: 'test@example.com', password: 'secret123' });

    // Firebase Auth called
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('accounts:signUp'),
      expect.objectContaining({ email: 'test@example.com', password: 'secret123' }),
      expect.any(Object),
    );

    // Credentials saved
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'test-refresh-token',
        uid: 'uid123abc',
        email: 'test@example.com',
      }),
    );

    // User document created with all mandatory fields
    expect(setDoc).toHaveBeenCalledWith(
      'users/uid123abc',
      expect.objectContaining({
        email: 'test@example.com',
        userId: 'uid123abc',
        signUpTag: 'Numo Sign up',
        fcmToken: [],
        badges: [],
        reminderPlatform: 'imessage',
        onboarding: {},
        postOnboardingV1Status: 'not-completed',
      }),
    );

    // Batch write: only appLinks counter (no signup karma — aligned with mobile)
    expect(commit).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'transform',
        path: 'appLinks/users',
        transforms: [{ field: 'count', increment: 1 }],
      }),
    ]);
  });

  it('EMAIL_EXISTS shows correct error', async () => {
    const { http } = await import('../../lib/http');
    const { register } = await import('../register');
    const p = await import('@clack/prompts');

    vi.mocked(http.post).mockRejectedValueOnce({
      response: { data: { error: { code: 400, message: 'EMAIL_EXISTS' } } },
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

  it('credentials saved BEFORE Firestore writes', async () => {
    const { http } = await import('../../lib/http');
    const { saveCredentials } = await import('../credentials');
    const { setDoc } = await import('../../lib/firestore');
    const { register } = await import('../register');

    const callOrder: string[] = [];
    vi.mocked(saveCredentials).mockImplementation(() => { callOrder.push('saveCredentials'); });
    vi.mocked(setDoc).mockImplementation(async () => { callOrder.push('setDoc'); return {}; });

    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        idToken: 'tok', refreshToken: 'ref', localId: 'uid',
        email: 'a@b.com', expiresIn: '3600',
      },
    } as any);

    await register({ email: 'a@b.com', password: 'secret123' });

    expect(callOrder.indexOf('saveCredentials')).toBeLessThan(
      callOrder.indexOf('setDoc'),
    );
  });
});
