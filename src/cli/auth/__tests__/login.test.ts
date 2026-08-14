import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  promptSelect: vi.fn(),
}));

vi.mock('../../lib/tty', () => ({
  isInteractive: vi.fn().mockReturnValue(false),
  isUnicodeSupported: false,
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: { error: vi.fn(), warning: vi.fn() },
}));

describe('login (non-interactive env-vars path)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    // Throw so execution stops at process.exit (mirrors production behavior — never returns).
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__test_exit__${code ?? 0}`);
    }) as never);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('uses NUMO_LOGIN_EMAIL + NUMO_LOGIN_PASSWORD env-vars and skips prompts', async () => {
    process.env.NUMO_LOGIN_EMAIL = 'agent@numo.ai';
    process.env.NUMO_LOGIN_PASSWORD = 's3cret123';

    const { http } = await import('../../lib/http');
    const { saveCredentials } = await import('../credentials');
    const { promptText, promptPassword } = await import('../../lib/prompts');
    const { login } = await import('../login');

    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
        uid: 'uid-agent',
        email: 'agent@numo.ai',
        expiresIn: 3600,
      },
    } as any);

    await login({ json: true });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      { email: 'agent@numo.ai', password: 's3cret123' },
    );
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'uid-agent', email: 'agent@numo.ai' }),
    );
    expect(promptText).not.toHaveBeenCalled();
    expect(promptPassword).not.toHaveBeenCalled();
  });

  it('exits with CONFIG_ERROR when non-TTY and no env-vars', async () => {
    delete process.env.NUMO_LOGIN_EMAIL;
    delete process.env.NUMO_LOGIN_PASSWORD;

    const { http } = await import('../../lib/http');
    const { login } = await import('../login');

    await expect(login({ json: true })).rejects.toThrow(/__test_exit__/);

    expect(http.post).not.toHaveBeenCalled();
    // The envelope, not the word. Searching stderr for "CONFIG_ERROR" is satisfied by a
    // plain-text line that merely mentions it — which is the shape a caller in --json mode
    // cannot parse, and the only reason this path reports a kind at all. Both the kind and
    // 78 are published in AGENTS.md, so they are spelled out here rather than imported:
    // changing either is a contract change and has to appear in this diff.
    const envelope = consoleErrorSpy.mock.calls
      .map(([first]: unknown[]) => { try { return JSON.parse(String(first)); } catch { return null; } })
      .find((parsed: { error?: unknown } | null) => parsed?.error);
    expect(envelope?.error).toMatchObject({ kind: 'CONFIG_ERROR', code: 78 });
  });
});
