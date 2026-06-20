export enum ErrorKind {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CONFIG_ERROR = 'CONFIG_ERROR',
  INTERNAL = 'INTERNAL',
  UNKNOWN = 'UNKNOWN',
}

export const ExitCode = {
  OK: 0,
  GENERAL: 1,
  USAGE: 2,
  UNAVAILABLE: 69,
  TEMP_FAIL: 75,
  NO_PERM: 77,
  CONFIG: 78,
  NOT_FOUND: 100,
  CONFLICT: 101,
} as const;

export class CliError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
    public readonly exitCode: number = ExitCode.GENERAL,
    public readonly options: {
      suggestion?: string;
      hint?: string;
      retryable?: boolean;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'CliError';
  }

  toJSON() {
    return {
      error: {
        kind: this.kind,
        code: this.exitCode,
        message: this.message,
        ...(this.options.suggestion && { suggestion: this.options.suggestion }),
        ...(this.options.hint && { hint: this.options.hint }),
        retryable: this.options.retryable ?? false,
        ...(this.options.retryAfter != null && { retryAfter: this.options.retryAfter }),
      },
    };
  }
}

export const Errors = {
  authRequired: () =>
    new CliError(ErrorKind.AUTH_REQUIRED, 'Not logged in', ExitCode.NO_PERM, {
      suggestion: 'numo login',
    }),

  notFound: (resource: string, id?: string) =>
    new CliError(ErrorKind.NOT_FOUND, `${resource} not found${id ? `: ${id}` : ''}`, ExitCode.NOT_FOUND, {
      suggestion: `numo ${resource.toLowerCase()}s list`,
    }),

  missingArg: (name: string, flag: string) =>
    new CliError(ErrorKind.MISSING_ARGUMENT, `${name} is required`, ExitCode.USAGE, {
      suggestion: `Use --${flag}`,
      hint: 'Run with --help for all options.',
    }),

  invalidInput: (message: string, hint?: string) =>
    new CliError(ErrorKind.INVALID_INPUT, message, ExitCode.USAGE, { hint }),

  configMissing: (key: string) =>
    new CliError(ErrorKind.CONFIG_ERROR, `${key} not set`, ExitCode.CONFIG, {
      suggestion: `export ${key}=<value>`,
    }),

  networkError: (hint?: string) =>
    new CliError(ErrorKind.NETWORK_ERROR, "Can't reach Numo servers", ExitCode.UNAVAILABLE, {
      hint: hint ?? 'Check your internet connection.',
      retryable: true,
    }),

  timeout: () =>
    new CliError(ErrorKind.TIMEOUT, 'Request timed out', ExitCode.TEMP_FAIL, {
      hint: 'The server took too long to respond. Try again.',
      retryable: true,
    }),

  rateLimited: (retryAfter?: number) =>
    new CliError(ErrorKind.RATE_LIMITED, 'Too many requests', ExitCode.TEMP_FAIL, {
      hint: retryAfter ? `Wait ${retryAfter} seconds and try again.` : 'Wait a moment and try again.',
      retryable: true,
      retryAfter,
    }),
};

export function classifyError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  const axiosErr = err as {
    code?: string;
    response?: {
      status?: number;
      headers?: Record<string, string>;
      data?: { error?: { code?: number; message?: string; status?: string } };
    };
    message?: string;
  };

  // Network errors (no response received)
  if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') return Errors.timeout();
  if (axiosErr.code === 'ENOTFOUND' || axiosErr.code === 'EAI_AGAIN') return Errors.networkError();
  if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ECONNRESET') {
    return Errors.networkError('Service may be temporarily down. Try again in a moment.');
  }

  // HTTP status based
  const status = axiosErr.response?.status;
  if (status === 401) return Errors.authRequired();
  if (status === 403) {
    return new CliError(ErrorKind.AUTH_FORBIDDEN, 'Access denied', ExitCode.NO_PERM, {
      hint: "You don't have permission for this action.",
    });
  }
  if (status === 404) return Errors.notFound('Resource');
  if (status === 429) {
    const retryAfter = parseInt(axiosErr.response?.headers?.['retry-after'] ?? '');
    return Errors.rateLimited(isNaN(retryAfter) ? undefined : retryAfter);
  }
  if (status && status >= 500) {
    return new CliError(ErrorKind.SERVICE_UNAVAILABLE, 'Server error', ExitCode.UNAVAILABLE, {
      hint: 'This is on our end. Try again in a moment.',
      retryable: true,
    });
  }

  // Fallback: extract message from error, sanitized
  const body = axiosErr.response?.data;
  const raw = body?.error?.message ?? axiosErr.message ?? 'Unknown error';
  const message = sanitizeErrorMessage(raw);

  return new CliError(ErrorKind.UNKNOWN, message, ExitCode.GENERAL, { cause: err });
}

export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\/(?:Users|home|var|tmp)\/\S+/g, '<path>')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '<jwt>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    // 32+ char threshold avoids masking task IDs (which are shorter, underscore-delimited).
    .replace(/[A-Za-z0-9_=+/-]{32,}/g, '<token>');
}
