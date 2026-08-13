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
    new CliError(ErrorKind.NOT_FOUND, `${resource} not found${id ? `: ${id}` : ''}`, ExitCode.NOT_FOUND),

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

const KIND_EXIT: Readonly<Partial<Record<ErrorKind, number>>> = {
  [ErrorKind.AUTH_REQUIRED]: ExitCode.NO_PERM,
  [ErrorKind.AUTH_EXPIRED]: ExitCode.NO_PERM,
  [ErrorKind.AUTH_FORBIDDEN]: ExitCode.NO_PERM,
  [ErrorKind.INVALID_INPUT]: ExitCode.USAGE,
  [ErrorKind.MISSING_ARGUMENT]: ExitCode.USAGE,
  [ErrorKind.NOT_FOUND]: ExitCode.NOT_FOUND,
  [ErrorKind.CONFLICT]: ExitCode.CONFLICT,
  [ErrorKind.RATE_LIMITED]: ExitCode.TEMP_FAIL,
  [ErrorKind.NETWORK_ERROR]: ExitCode.UNAVAILABLE,
  [ErrorKind.TIMEOUT]: ExitCode.TEMP_FAIL,
  [ErrorKind.SERVICE_UNAVAILABLE]: ExitCode.UNAVAILABLE,
  [ErrorKind.CONFIG_ERROR]: ExitCode.CONFIG,
};

const ERROR_KINDS = new Set<string>(Object.values(ErrorKind));

interface HttpErrorShape {
  code?: string;
  response?: {
    status?: number;
    headers?: Record<string, string>;
    data?: { error?: { kind?: string; message?: string; retryable?: boolean; retryAfter?: number } };
  };
  message?: string;
}

function fromStatus(status: number, headers?: Record<string, string>): CliError | null {
  if (status === 400) {
    return new CliError(ErrorKind.INVALID_INPUT, 'Invalid request', ExitCode.USAGE, {
      hint: 'Run with --help to check the accepted arguments.',
    });
  }
  if (status === 401) return Errors.authRequired();
  if (status === 403) {
    return new CliError(ErrorKind.AUTH_FORBIDDEN, 'Access denied', ExitCode.NO_PERM, {
      hint: "You don't have permission for this action.",
    });
  }
  if (status === 404) return Errors.notFound('Resource');
  if (status === 409) return new CliError(ErrorKind.CONFLICT, 'Already exists', ExitCode.CONFLICT);
  if (status === 429) {
    const retryAfter = parseInt(headers?.['retry-after'] ?? '');
    return Errors.rateLimited(isNaN(retryAfter) ? undefined : retryAfter);
  }
  if (status >= 500) {
    return new CliError(ErrorKind.SERVICE_UNAVAILABLE, 'Server error', ExitCode.UNAVAILABLE, {
      hint: 'This is on our end. Try again in a moment.',
      retryable: true,
    });
  }
  return null;
}

/**
 * The single path from any thrown value to the error the user sees.
 *
 * Status first, structured body on top: only the status table carries `suggestion`,
 * `hint` and the Retry-After header, so the body overrides just `kind` and `message`.
 * Showing a generic "Access denied" over a server explanation is the failure this exists to avoid.
 */
export function classifyError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  // `throw` accepts any value, and this is the last stop before the user sees it.
  const httpErr = (typeof err === 'object' && err !== null ? err : { message: String(err ?? '') }) as HttpErrorShape;

  if (httpErr.code === 'ECONNABORTED' || httpErr.code === 'ETIMEDOUT') return Errors.timeout();
  if (httpErr.code === 'ENOTFOUND' || httpErr.code === 'EAI_AGAIN') return Errors.networkError();
  if (httpErr.code === 'ECONNREFUSED' || httpErr.code === 'ECONNRESET') {
    return Errors.networkError('Service may be temporarily down. Try again in a moment.');
  }

  const status = httpErr.response?.status;
  const base = status ? fromStatus(status, httpErr.response?.headers) : null;
  const body = httpErr.response?.data?.error;

  const kind = body?.kind && ERROR_KINDS.has(body.kind) ? (body.kind as ErrorKind) : base?.kind;
  const message = sanitizeErrorMessage(body?.message ?? base?.message ?? httpErr.message ?? 'Unknown error');

  if (!kind) return new CliError(ErrorKind.UNKNOWN, message, ExitCode.GENERAL, { cause: err });

  return new CliError(kind, message, KIND_EXIT[kind] ?? base?.exitCode ?? ExitCode.GENERAL, {
    ...base?.options,
    // A hint in the status table is generic by construction — it is what we can say
    // knowing only the status. Once the server has explained itself, that explanation
    // is the guidance, and "run with --help" over the top of it points the wrong way.
    // A suggestion is a command to run, so it survives.
    hint: body?.message != null ? undefined : base?.options.hint,
    retryable: base?.options.retryable ?? body?.retryable,
    retryAfter: base?.options.retryAfter ?? body?.retryAfter,
    cause: err,
  });
}

const COMMANDER_KIND: Record<string, ErrorKind> = {
  'commander.unknownCommand': ErrorKind.INVALID_INPUT,
  'commander.unknownOption': ErrorKind.INVALID_INPUT,
  'commander.missingArgument': ErrorKind.MISSING_ARGUMENT,
  'commander.optionMissingArgument': ErrorKind.MISSING_ARGUMENT,
  // A command group invoked without a subcommand reports itself as "help was shown".
  'commander.help': ErrorKind.MISSING_ARGUMENT,
};

/**
 * Argument-parsing failures reach the user through the same contract as everything
 * else. The message echoes what was typed, so it is sanitized like any other.
 */
export function commanderToCliError(err: unknown): CliError {
  const code = (err as { code?: string })?.code ?? '';
  const kind = COMMANDER_KIND[code];
  if (!kind) return classifyError(err);

  const message = code === 'commander.help'
    ? 'Missing subcommand'
    : sanitizeErrorMessage((err as Error).message).replace(/^error: /, '');

  return new CliError(kind, message, ExitCode.USAGE, {
    hint: 'Run with --help for available commands and options.',
  });
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
