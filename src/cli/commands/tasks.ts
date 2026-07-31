import { Command } from 'commander';
import pc from 'picocolors';
import { runGet, runList, runCreate, runWrite } from '../lib/actions';
import { printRecord, printNdjsonLine } from '../lib/output';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../lib/uid';
import { listTasks, getTask, createTask, updateTask, deleteTask, completeTask, uncompleteTask } from '../services/tasks';
import { formatDate, formatTags, formatDifficulty, formatDuration, formatRepeat, truncate, formatWeekdayHeader, formatKarmaGain, formatProgressSummary, formatTagsSummary } from '../lib/format';
import { promptForMissing, promptText, promptConfirm, promptSelect, promptMultiSelect } from '../lib/prompts';
import { isInteractive } from '../lib/tty';
import { SYM } from '../lib/symbols';
import { Errors, ExitCode } from '../lib/errors';
import { parseHumanDate, parseHumanDateOnly } from '../lib/parse-date';
import { localDateOnly, localDateOffset, normalizeDueDateInBody, isCompletableDate } from '../lib/task-dates';
import { buildRepeatConfig, parseMonthDays } from '../lib/task-repeat';
import { buildSubtasks } from '../lib/task-subtasks';
import { readStdinLines } from '../lib/stdin';
import type { ApiTask, TaskListResponse, TaskCreateResponse, TaskUpdateResponse, TaskDeleteResponse, TaskCompleteResponse, TaskUncompleteResponse } from '../types/api';

/** Commander collector for a repeatable option — accumulates each occurrence into an array. */
function collectValue(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

async function pickTask(id: string | undefined, actionName: string): Promise<string> {
  if (id) return id;

  if (!isInteractive()) {
    throw Errors.missingArg('Task ID', 'id');
  }

  const today = localDateOnly();
  const { tasks } = await listTasks({ date: today });
  const pending = tasks.filter((t) => !t.completed);

  if (pending.length === 0) {
    throw Errors.invalidInput(`No pending tasks for today (${today}). Use: numo tasks ${actionName} <id>`);
  }

  const selected = await promptSelect({
    message: `Select task to ${actionName}`,
    options: pending.map((t) => ({
      value: t.id,
      label: `${truncate(t.text, 50)}  ${pc.dim(t.id)}`,
    })),
  });

  return selected;
}

function resolveDate(opts: Record<string, unknown>): string | undefined {
  if (opts.backlog) return undefined;
  // Local calendar day to match the API's "today" basis.
  if (opts.yesterday) return localDateOffset(-1);
  if (opts.tomorrow) return localDateOffset(1);
  if (opts.date) {
    const parsed = parseHumanDateOnly(opts.date as string);
    if (!parsed) throw Errors.invalidInput(`Cannot parse date: "${opts.date}". Use YYYY-MM-DD or natural language (tomorrow, next monday, etc.)`);
    return parsed;
  }
  return localDateOnly();
}

function extractTime(dueDate: unknown): string {
  if (typeof dueDate !== 'string') return '';
  const parts = dueDate.split(' ');
  if (parts.length < 2) return '';
  const time = parts[1];
  return time === '00:00' ? '' : time;
}

function isRepeating(t: ApiTask): boolean {
  return !!t.repeat?.type && t.repeat.type !== 'none';
}

function getCheckIndicator(t: ApiTask): string {
  if (t.completed) return pc.green(SYM.check);
  if (isRepeating(t)) return pc.blue(SYM.repeat);
  return pc.dim(SYM.circle);
}

function sortTasksForDisplay(tasks: ApiTask[]): ApiTask[] {
  const repeatOrder: Record<string, number> = { daily: 0, weekly: 1, monthly: 2 };

  return [...tasks].sort((a, b) => {
    const timeA = extractTime(a.dueDate);
    const timeB = extractTime(b.dueDate);
    const repA = isRepeating(a);
    const repB = isRepeating(b);

    // Timed tasks first (sorted by time asc)
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    if (timeA && timeB) return timeA.localeCompare(timeB);

    // Then repeating without time (daily → weekly → monthly)
    if (repA && !repB) return -1;
    if (!repA && repB) return 1;
    if (repA && repB) {
      const ra = a.repeat.type ?? '';
      const rb = b.repeat.type ?? '';
      return (repeatOrder[ra] ?? 99) - (repeatOrder[rb] ?? 99);
    }

    // Regular tasks keep original order
    return 0;
  });
}

function printTaskDetail(t: ApiTask) {
  const dim = pc.dim;
  console.log('');
  printRecord([
    ['ID', dim(t.id)],
    ['Text', t.text],
    ['Due', formatDate(t.dueDate) || dim('none (backlog)')],
    ['Status', t.completed ? pc.green('completed') : pc.yellow('pending')],
    ['Tags', formatTags(t.tags) || dim('none')],
    ['Difficulty', formatDifficulty(t.difficulty) || dim('not set')],
    ['Duration', formatDuration(t.duration) || dim('not set')],
    ['Repeat', formatRepeat(t.repeat) || dim('none')],
    ['Note', t.note || dim('none')],
    ['Public', t.isPublic ? pc.green('yes') : pc.yellow('no')],
    ['Completions', String(t.completions ?? 0)],
    ['Created', formatDate(t.createdAt)],
  ]);
  if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
    console.log(`  ${pc.bold('Subtasks')}`);
    for (const s of t.subtasks) {
      const box = s.completed ? pc.green(SYM.check) : pc.dim(SYM.circle);
      console.log(`    ${box} ${s.completed ? pc.strikethrough(dim(s.text)) : s.text}`);
    }
  }
  console.log('');
}

function printTaskLine(t: ApiTask) {
  const check = getCheckIndicator(t);
  const rawText = truncate(t.text, 50);
  const text = t.completed ? pc.strikethrough(pc.dim(rawText)) : rawText;
  const time = extractTime(t.dueDate);
  const tags = formatTags(t.tags);
  const difficulty = formatDifficulty(t.difficulty);
  const id = pc.dim(t.id);

  const parts = [check, text];
  if (time) parts.push(pc.cyan(time));
  if (tags) parts.push(tags);
  if (difficulty) parts.push(pc.dim(`[${difficulty}]`));
  parts.push(id);

  console.log('  ' + parts.join('  '));
}

/** Notice shown when the API committed the main write but deferred a non-critical side effect (partial/failed). */
function printPartialNotice(failed?: string[]) {
  console.log(`    ${pc.yellow('! some bookkeeping was deferred')} ${pc.dim(`(${(failed ?? []).join(', ')})`)}`);
}

export function registerTasksCommands(program: Command) {
  const tasks = program.command('tasks').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks by date or backlog')
    .option('--date <date>', 'YYYY-MM-DD or natural language ("tomorrow", "next monday")')
    .option('--backlog', 'Show backlog tasks')
    .option('--tag <tag>', 'Filter by tag')
    .option('--yesterday', 'Show yesterday\'s tasks')
    .option('--tomorrow', 'Show tomorrow\'s tasks')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      requireAuth();
      const date = resolveDate(opts);

      await runList({
        global: opts,
        fn: () => listTasks({ date, backlog: opts.backlog, tag: opts.tag }),
        dataKey: 'tasks',
        columns: ['id', 'text', 'dueDate', 'completed', 'tags'],
        spinnerMessage: 'Fetching tasks...',
        onInteractive: (payload: TaskListResponse) => {
          const items = payload.tasks;
          const pending = sortTasksForDisplay(items.filter((t) => !t.completed));
          const completed = items.filter((t) => t.completed);

          console.log('');

          if (opts.backlog) {
            console.log(`  ${pc.bold('Backlog')} ${pc.dim(`(${items.length})`)}`);
          } else {
            const viewDate = date ? new Date(date + 'T00:00:00') : new Date();
            console.log(formatWeekdayHeader(viewDate, completed.length));
          }

          const tagLine = formatTagsSummary(items);
          if (tagLine) console.log(`\n  ${tagLine}`);

          if (items.length === 0) {
            if (!opts.backlog) {
              const viewDate = date ? new Date(date + 'T00:00:00') : new Date();
              const dayName = viewDate.toLocaleDateString('en-US', { weekday: 'long' });
              console.log(`\n  ${pc.dim(`No tasks for ${dayName}. Enjoy your day!`)}`);
              console.log(`  ${pc.dim('--yesterday · --tomorrow · --date YYYY-MM-DD')}`);
            } else {
              console.log(`\n  ${pc.dim('No backlog tasks.')}`);
            }
            console.log('');
            return;
          }

          if (pending.length > 0) {
            console.log(`\n  ${pc.bold('Pending')} ${pc.dim(`(${pending.length})`)}\n`);
            for (const t of pending) {
              printTaskLine(t);
            }
          }

          if (completed.length > 0) {
            console.log(`\n  ${pc.dim(`Completed (${completed.length})`)}\n`);
            for (const t of completed) {
              printTaskLine(t);
            }
          }

          if (!opts.backlog) {
            console.log(`\n  ${formatProgressSummary(completed.length, items.length)}`);
            console.log(`  ${pc.dim('--yesterday · --tomorrow · --date YYYY-MM-DD')}`);
          }
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks list                    # Today's tasks
  $ numo tasks list --yesterday        # Yesterday's tasks
  $ numo tasks list --tomorrow         # Tomorrow's tasks
  $ numo tasks list --date 2026-03-27  # Specific date
  $ numo tasks list --backlog          # Unscheduled tasks
  $ numo tasks list --tag Work         # Filter by tag
  $ numo tasks list --json | jq '.tasks[].text'`);

  tasks
    .command('get [id]')
    .description('Get a task by ID')
    .action(async function (this: Command, id?: string) {
      requireAuth();
      const taskId = await promptForMissing({ value: id, message: 'Task ID' });
      await runGet({
        global: this.optsWithGlobals(),
        fn: () => getTask(taskId),
        spinnerMessage: 'Fetching task...',
        onInteractive: printTaskDetail,
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks get abc123
  $ numo tasks get abc123 --json | jq '.text'`);

  tasks
    .command('create [text...]')
    .description('Create a task — quick via text/flags, or an interactive wizard')
    .option('--text <text>', 'Task text (alternative to positional text)')
    .option('--due <date>', 'Due date: YYYY-MM-DD, "YYYY-MM-DD HH:mm", or natural language')
    .option('--backlog', 'No due date (Someday / backlog)')
    .option('--repeat <type>', 'Recurring routine: daily | weekly | monthly')
    .option('--weekdays <days>', 'For --repeat weekly: comma list e.g. Mon,Wed,Fri')
    .option('--month-days <days>', 'For --repeat monthly: comma list e.g. 1,15')
    .option('--every <n>', 'Repeat interval (every N days/weeks/months)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--public', 'Make task public')
    .option('--private', 'Make task private (default)')
    .option('--note <note>', 'Private note')
    .option('--difficulty <n>', 'Effort 0–3 (S/M/L/XL)')
    .option('--duration <n>', 'Duration in minutes')
    .option('--subtask <text>', 'Add a subtask (repeatable: --subtask "a" --subtask "b")', collectValue, [])
    .option('--client-task-id <id>', 'Idempotency key — retrying with the same id returns the existing task instead of duplicating')
    .action(async function (this: Command, textParts?: string[]) {
      const opts = this.optsWithGlobals();
      requireAuth();

      const providedText = (textParts && textParts.length ? textParts.join(' ') : undefined) ?? opts.text;
      // Any text or creation flag → quick path (no wizard, even in a TTY).
      const hasQuickInput = !!providedText || opts.due || opts.backlog || opts.repeat ||
        opts.tags || opts.note || opts.difficulty !== undefined || opts.duration ||
        opts.public || opts.private || (opts.subtask && opts.subtask.length);
      const useWizard = isInteractive() && !opts.json && !hasQuickInput;

      const body: Record<string, unknown> = {};

      if (useWizard) {
        body.text = await promptForMissing({ value: providedText, message: 'Task text', placeholder: 'What do you need to do?' });

        // Step 1: Schedule — one-off date or recurring routine.
        const fmt = (d: Date) => localDateOnly(d);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const schedule = await promptSelect({
          message: 'When?',
          options: [
            { value: 'today', label: `Today (${fmt(today)})` },
            { value: 'tomorrow', label: `Tomorrow (${fmt(tomorrow)})` },
            { value: 'pick', label: 'Pick a date...' },
            { value: 'someday', label: 'Someday (backlog)' },
            { value: 'daily', label: 'Every day (routine)' },
            { value: 'weekly', label: 'Every week (routine)' },
            { value: 'monthly', label: 'Every month (routine)' },
          ],
        });

        if (schedule === 'today') {
          body.dueDate = fmt(today);
        } else if (schedule === 'tomorrow') {
          body.dueDate = fmt(tomorrow);
        } else if (schedule === 'pick') {
          body.dueDate = await promptText({ message: 'Date', placeholder: fmt(tomorrow), required: true });
        } else if (schedule === 'someday') {
          body.backlog = true;
        } else {
          // daily | weekly | monthly — shape matches the API's repeat config.
          const repeat: Record<string, unknown> = { type: schedule, every: 1, custom: false, monthDays: null, weekDays: null };
          if (schedule === 'weekly') {
            repeat.weekDays = await promptMultiSelect({
              message: 'Days of week',
              options: [
                { value: 'Mon', label: 'Monday' }, { value: 'Tue', label: 'Tuesday' },
                { value: 'Wed', label: 'Wednesday' }, { value: 'Thu', label: 'Thursday' },
                { value: 'Fri', label: 'Friday' }, { value: 'Sat', label: 'Saturday' },
                { value: 'Sun', label: 'Sunday' },
              ],
              required: true,
            });
          } else if (schedule === 'monthly') {
            // Validate inline so a typo re-prompts (clack keeps the prompt open) instead of
            // throwing out of the whole wizard and losing the earlier answers.
            const daysInput = await promptText({
              message: 'Days of month',
              placeholder: '1,15',
              required: true,
              validate: (v) => {
                try { parseMonthDays(v); return undefined; }
                catch (e) { return e instanceof Error ? e.message : 'Use days 1-31, e.g. 1,15'; }
              },
            });
            repeat.monthDays = parseMonthDays(daysInput);
          }
          body.repeat = repeat;
          body.dueDate = fmt(today);
        }

        // Step 2: Visibility — Private first (cursor default), privacy-first per W-121.
        const visibility = await promptSelect({
          message: 'Visibility',
          options: [
            { value: 'private', label: 'Private — only you can see it' },
            { value: 'public', label: 'Public — visible in community' },
          ],
        });
        body.isPublic = visibility === 'public';

        // Step 3: "Add details?" gate (default = No = fast path)
        if (await promptConfirm({ message: 'Add details? (tags, effort, time, note)', initialValue: false })) {
          const tags = await promptMultiSelect({
            message: 'Tags',
            options: [
              { value: 'House', label: 'House' }, { value: 'Work', label: 'Work' },
              { value: 'Study', label: 'Study' }, { value: 'Hobby', label: 'Hobby' },
              { value: 'Health', label: 'Health' }, { value: 'Relationship', label: 'Relationship' },
              { value: 'Self-care', label: 'Self-care' }, { value: 'Relax', label: 'Relax' },
              { value: 'Kids', label: 'Kids' },
            ],
          });
          if (tags.length > 0) body.tags = tags;

          const difficulty = await promptSelect({
            message: 'Effort',
            options: [
              { value: 'skip', label: 'Skip' },
              { value: '0', label: 'S — Tiny' }, { value: '1', label: 'M — Medium' },
              { value: '2', label: 'L — High' }, { value: '3', label: 'XL — Huge' },
            ],
          });
          if (difficulty !== 'skip') body.difficulty = parseInt(difficulty);

          if (body.dueDate && await promptConfirm({ message: 'Add a specific time?', initialValue: false })) {
            const time = await promptText({ message: 'Time', placeholder: '09:30', required: true });
            body.dueDate = `${body.dueDate} ${time}`;
          }

          const note = await promptText({ message: 'Note (enter to skip)', placeholder: 'Private note', required: false });
          if (note) body.note = note;

          const subs = await promptText({ message: 'Subtasks (comma-separated, enter to skip)', placeholder: 'Step 1, Step 2', required: false });
          if (subs) {
            const built = buildSubtasks(subs.split(','));
            if (built.length) body.subtasks = built;
          }
        }
      } else {
        // Quick / non-interactive create.
        const text = providedText ?? (isInteractive() && !opts.json
          ? await promptText({ message: 'Task text', placeholder: 'What do you need to do?', required: true })
          : undefined);
        if (!text) throw Errors.missingArg('Task text', 'text');
        body.text = text;

        if (opts.backlog) {
          body.backlog = true;
        } else if (opts.due) {
          const parsed = parseHumanDate(opts.due);
          if (!parsed) throw Errors.invalidInput(`Cannot parse date: "${opts.due}"`);
          body.dueDate = parsed;
        } else {
          // Default to the LOCAL calendar day (the API's "today" basis).
          body.dueDate = localDateOnly();
        }

        const repeat = buildRepeatConfig(opts);
        if (repeat) body.repeat = repeat;
        if (opts.tags) body.tags = opts.tags.split(',');
        if (opts.note) body.note = opts.note;
        if (opts.difficulty !== undefined) body.difficulty = parseInt(opts.difficulty);
        if (opts.duration) body.duration = parseInt(opts.duration);
        if (opts.subtask && opts.subtask.length) body.subtasks = buildSubtasks(opts.subtask);
        // Privacy-first default (W-121): private unless --public is passed.
        body.isPublic = opts.public ? true : false;
      }

      // Always send an idempotency key so a retried create (network timeout / 5xx) returns
      // the existing task instead of duplicating it.
      body.clientTaskId = opts.clientTaskId ?? randomUUID();
      // Always insert new tasks at the top of the list.
      body.listPosition = 'top';
      // Canonicalize dueDate to the 'YYYY-MM-DD HH:mm' wire format.
      normalizeDueDateInBody(body);

      await runCreate({
        global: opts,
        fn: () => createTask(body),
        dataKey: 'task',
        spinnerMessage: 'Creating task...',
        onInteractive: (_task, payload: TaskCreateResponse) => {
          const { task, karma, idempotentReplay } = payload;
          const check = pc.green(SYM.check);
          console.log(`\n  ${check} ${idempotentReplay ? 'Exists' : 'Created'}  ${task.text}  ${pc.dim(task.id)}`);
          if (karma) console.log(`    ${formatKarmaGain(karma)}`);
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks create                                      # Interactive wizard
  $ numo tasks create "Buy groceries"                      # Quick (today, private, top)
  $ numo tasks create "Meeting" --due "2026-03-27 14:30"   # With a time
  $ numo tasks create "Standup" --repeat weekly --weekdays Mon,Wed,Fri
  $ numo tasks create "Pay rent" --repeat monthly --month-days 1
  $ numo tasks create "Read later" --backlog               # Someday / no due date
  $ numo tasks create "Trip" --subtask "Book hotel" --subtask "Pack"
  $ numo tasks create "Review PR" --tags Work --difficulty 2 --public`);

  tasks
    .command('update [id]')
    .description('Update a task')
    .option('--text <text>', 'Task text')
    .option('--due <date>', 'Due date: YYYY-MM-DD, "YYYY-MM-DD HH:mm", or natural language')
    .option('--clear-time', 'Strip time-of-day; treat task as all-day')
    .option('--no-time', 'Alias of --clear-time')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--public', 'Make task public')
    .option('--private', 'Make task private')
    .option('--note <note>', 'Task note')
    .option('--difficulty <n>', 'Difficulty 0-3 (S/M/L/XL)')
    .option('--duration <n>', 'Duration in minutes')
    .option('--repeat <type>', 'Set recurrence: daily | weekly | monthly | none')
    .option('--weekdays <days>', 'For --repeat weekly: comma list e.g. Mon,Wed')
    .option('--month-days <days>', 'For --repeat monthly: comma list e.g. 1,15')
    .option('--every <n>', 'Repeat interval (every N)')
    .option('--backlog', 'Move to backlog (clear the due date)')
    .option('--subtask <text>', 'Replace subtasks (repeatable: --subtask "a" --subtask "b")', collectValue, [])
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      requireAuth();
      const taskId = await promptForMissing({ value: id, message: 'Task ID' });

      // --no-time is wired through commander negation: opts.time === false when user passed --no-time
      const clearTime = opts.clearTime === true || opts.time === false;

      const body: Record<string, unknown> = {};
      const hasAnyFlag = opts.text || opts.due || opts.tags || opts.public || opts.private ||
        opts.note || opts.difficulty !== undefined || opts.duration || clearTime ||
        opts.repeat !== undefined || opts.backlog || opts.weekdays || opts.monthDays || opts.every ||
        (opts.subtask && opts.subtask.length);

      if (!hasAnyFlag && isInteractive() && !opts.json) {
        const text = await promptText({ message: 'Text (enter to skip)', required: false });
        if (text) body.text = text;

        const due = await promptText({ message: 'Due date (enter to skip)', placeholder: 'YYYY-MM-DD', required: false });
        if (due) body.dueDate = due;

        const tags = await promptText({ message: 'Tags (enter to skip)', placeholder: 'tag1,tag2', required: false });
        if (tags) body.tags = tags.split(',');

        const note = await promptText({ message: 'Note (enter to skip)', required: false });
        if (note) body.note = note;

        const difficulty = await promptText({ message: 'Difficulty (enter to skip)', placeholder: '0–3', required: false });
        if (difficulty) body.difficulty = parseInt(difficulty);

        const duration = await promptText({ message: 'Duration in minutes (enter to skip)', placeholder: '10', required: false });
        if (duration) body.duration = parseInt(duration);
      } else {
        if (opts.text) body.text = opts.text;
        if (opts.due) {
          const parsed = parseHumanDate(opts.due);
          if (!parsed) throw Errors.invalidInput(`Cannot parse date: "${opts.due}"`);
          body.dueDate = parsed;
        }
        if (opts.tags) body.tags = opts.tags.split(',');
        if (opts.public) body.isPublic = true;
        if (opts.private) body.isPublic = false;
        if (opts.note) body.note = opts.note;
        if (opts.difficulty !== undefined) body.difficulty = parseInt(opts.difficulty);
        if (opts.duration) body.duration = parseInt(opts.duration);
        const repeat = buildRepeatConfig(opts);
        if (repeat) body.repeat = repeat;
        // --backlog clears the due date; the API moves the task to backlog.
        if (opts.backlog) body.dueDate = null;
        // --subtask REPLACES the whole subtask list (API stores it verbatim on update).
        if (opts.subtask && opts.subtask.length) body.subtasks = buildSubtasks(opts.subtask);
      }

      if (clearTime) {
        const currentDue = typeof body.dueDate === 'string'
          ? body.dueDate
          : (await getTask(taskId)).dueDate as string | null;
        if (currentDue && currentDue.length >= 10) {
          body.dueDate = `${currentDue.slice(0, 10)} 00:00`;
        }
      }

      // Canonicalize dueDate to the wire format (only when dueDate is changing).
      normalizeDueDateInBody(body);

      await runWrite({
        global: opts,
        fn: () => updateTask(taskId, body),
        dataKey: 'task',
        spinnerMessage: 'Updating task...',
        onInteractive: (payload: TaskUpdateResponse) => {
          console.log(`\n  ${pc.green('Updated!')} ${payload.task.text}  ${pc.dim(payload.task.id)}\n`);
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks update abc123 --text "Updated text"
  $ numo tasks update abc123 --due 2026-03-28
  $ numo tasks update abc123 --no-time          # strip time-of-day; task becomes all-day
  $ numo tasks update abc123 --clear-time       # same as --no-time
  $ numo tasks update abc123 --tags Work,Health
  $ numo tasks update abc123 --difficulty 2 --note "Important"
  $ numo tasks update abc123 --repeat weekly --weekdays Mon,Thu
  $ numo tasks update abc123 --repeat none       # stop repeating
  $ numo tasks update abc123 --backlog           # clear due date
  $ numo tasks update abc123 --subtask "Step 1" --subtask "Step 2"  # replaces subtasks`);

  tasks
    .command('delete [id]')
    .description('Delete a task')
    .option('--yes', 'Skip confirmation prompt')
    .option('--stdin', 'Read task IDs from stdin (one per line)')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      requireAuth();

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await deleteTask(lineId);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            process.exitCode = ExitCode.GENERAL;
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await pickTask(id, 'delete');

      // Confirmation in TTY (unless --yes or non-interactive)
      if (isInteractive() && !opts.yes && !opts.json) {
        let taskText = taskId;
        try {
          const task = await getTask(taskId);
          taskText = task.text ?? taskId;
        } catch { /* use ID if fetch fails */ }

        const confirmed = await promptConfirm({
          message: `Delete "${taskText}"?`,
          initialValue: false,
        });
        if (!confirmed) {
          console.log(pc.dim('  Cancelled.'));
          return;
        }
      }

      await runWrite({
        global: opts,
        fn: () => deleteTask(taskId),
        spinnerMessage: 'Deleting task...',
        onInteractive: (data: TaskDeleteResponse) => {
          const cross = pc.red(SYM.cross);
          console.log(`\n  ${cross} Deleted  ${data.taskText || taskId}`);
          if (data.archived) console.log(`    ${pc.dim('Archived')}`);
          if (data.partial) printPartialNotice(data.failed);
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks delete abc123
  $ numo tasks delete abc123 --yes     # Skip confirmation
  $ numo tasks delete abc123 --json`);

  tasks
    .command('complete [id]')
    .description('Mark task as complete')
    .option('--date <datetime>', 'Completion datetime "YYYY-MM-DD HH:mm"')
    .option('--stdin', 'Read task IDs from stdin (one per line)')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      requireAuth();

      // Match the API guard: completion is allowed only for today or yesterday.
      // Validated client-side (fail fast, applies to the whole --stdin batch too).
      if (opts.date && !isCompletableDate(opts.date)) {
        throw Errors.invalidInput('completion date must be today or yesterday');
      }

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await completeTask(lineId, opts.date);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            process.exitCode = ExitCode.GENERAL;
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await pickTask(id, 'complete');
      await runWrite({
        global: opts,
        fn: () => completeTask(taskId, opts.date),
        spinnerMessage: 'Completing task...',
        onInteractive: (data: TaskCompleteResponse) => {
          const check = pc.green(SYM.check);
          if (data.alreadyCompleted) {
            console.log(`\n  ${check} Already done  ${data.taskText ?? taskId}`);
          } else {
            console.log(`\n  ${check} Done!  ${data.taskText ?? taskId}`);
            if (data.karma) {
              console.log(`    ${formatKarmaGain(data.karma, data.checksInRow)}`);
            }
          }
          if (data.partial) printPartialNotice(data.failed);
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks complete abc123
  $ numo tasks complete abc123 --date "2026-03-26 14:30"`);

  tasks
    .command('uncomplete [id]')
    .description('Mark task as incomplete')
    .option('--stdin', 'Read task IDs from stdin (one per line)')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      requireAuth();

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await uncompleteTask(lineId);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            process.exitCode = ExitCode.GENERAL;
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await promptForMissing({ value: id, message: 'Task ID' });
      await runWrite({
        global: opts,
        fn: () => uncompleteTask(taskId),
        dataKey: 'task',
        spinnerMessage: 'Uncompleting task...',
        onInteractive: (data: TaskUncompleteResponse) => {
          const arrow = SYM.undo;
          console.log(`\n  ${pc.yellow(arrow)} Reverted  ${data.task.text ?? taskId}`);
          console.log(`    ${pc.dim('Karma adjustment applied')}`);
          if (data.partial) printPartialNotice(data.failed);
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks uncomplete abc123-1711500000000`);
}
