import { isInteractive } from './tty';

// @clack/prompts is ESM-only, use dynamic import
async function loadClack() {
  return await import('@clack/prompts');
}

export async function promptText(opts: {
  message: string;
  placeholder?: string;
  required?: boolean;
}): Promise<string> {
  if (!isInteractive()) {
    throw new Error(`Missing required input: ${opts.message}. Use flags in non-interactive mode.`);
  }

  const p = await loadClack();
  const value = await p.text({
    message: opts.message,
    placeholder: opts.placeholder,
    validate: opts.required ? (v) => ((v ?? '').trim() ? undefined : 'Required') : undefined,
  });

  if (p.isCancel(value)) {
    process.exit(130);
  }

  return value as string;
}

export async function promptPassword(opts: {
  message: string;
}): Promise<string> {
  if (!isInteractive()) {
    throw new Error(`Missing required input: ${opts.message}. Use flags in non-interactive mode.`);
  }

  const p = await loadClack();
  const value = await p.password({
    message: opts.message,
    validate: (v) => (v ? undefined : 'Required'),
  });

  if (p.isCancel(value)) {
    process.exit(130);
  }

  return value as string;
}

export async function promptSelect<T extends string>(opts: {
  message: string;
  options: { value: T; label: string }[];
}): Promise<T> {
  if (!isInteractive()) {
    throw new Error(`Missing required input: ${opts.message}. Use flags in non-interactive mode.`);
  }

  const p = await loadClack();
  const value = await (p.select as Function)({
    message: opts.message,
    options: opts.options,
  });

  if (p.isCancel(value)) {
    process.exit(130);
  }

  return value as T;
}

export async function promptConfirm(opts: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean> {
  if (!isInteractive()) {
    return opts.initialValue ?? false;
  }

  const p = await loadClack();
  const value = await p.confirm({
    message: opts.message,
    initialValue: opts.initialValue,
  });

  if (p.isCancel(value)) {
    process.exit(130);
  }

  return value as boolean;
}

export async function promptMultiSelect<T extends string>(opts: {
  message: string;
  options: { value: T; label: string }[];
  required?: boolean;
}): Promise<T[]> {
  if (!isInteractive()) {
    throw new Error(`Missing required input: ${opts.message}. Use flags in non-interactive mode.`);
  }

  const p = await loadClack();
  const value = await (p.multiselect as Function)({
    message: opts.message,
    options: opts.options,
    required: opts.required ?? false,
  });

  if (p.isCancel(value)) {
    process.exit(130);
  }

  return value as T[];
}

/**
 * Prompt for a value only if not already provided via flag.
 * In non-interactive mode, throws if the value is missing and required.
 */
export async function promptForMissing(opts: {
  value: string | undefined;
  message: string;
  placeholder?: string;
  required?: boolean;
}): Promise<string> {
  if (opts.value !== undefined && opts.value !== '') {
    return opts.value;
  }

  return promptText({
    message: opts.message,
    placeholder: opts.placeholder,
    required: opts.required ?? true,
  });
}
