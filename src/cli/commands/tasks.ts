import { Command } from 'commander';
import pc from 'picocolors';
import { runGet, runList, runCreate, runWrite } from '../lib/actions';
import { printRecord } from '../lib/output';
import { requireUid } from '../lib/uid';
import { listTasks, getTask, createTask, updateTask, deleteTask, completeTask, uncompleteTask } from '../services/tasks';
import { formatDate, formatTags, formatPriority, formatDifficulty, formatDuration, formatRepeat, truncate, formatWeekdayHeader, formatKarmaGain, formatProgressSummary, formatTagsSummary } from '../lib/format';
import { promptForMissing, promptText, promptConfirm, promptSelect, promptMultiSelect } from '../lib/prompts';
import { isInteractive } from '../lib/tty';
import { SYM } from '../lib/symbols';
import { getCompletedTodayCount } from '../lib/streaks';
import { Errors } from '../lib/errors';
import { parseHumanDate, parseHumanDateOnly } from '../lib/parse-date';
import { readStdinLines } from '../lib/stdin';
import { printNdjsonLine } from '../lib/output';

async function pickTask(uid: string, id: string | undefined, actionName: string): Promise<string> {
  if (id) return id;

  if (!isInteractive()) {
    throw Errors.missingArg('Task ID', 'id');
  }

  const today = new Date().toISOString().slice(0, 10);
  const { tasks } = await listTasks(uid, { date: today });
  const pending = tasks.filter((t) => !t.completed);

  if (pending.length === 0) {
    throw Errors.invalidInput(`No pending tasks for today (${today}). Use: numo tasks ${actionName} <id>`);
  }

  const selected = await promptSelect({
    message: `Select task to ${actionName}`,
    options: pending.map((t) => ({
      value: t.id as string,
      label: `${truncate(String(t.text), 50)}  ${pc.dim(String(t.id))}`,
    })),
  });

  return selected;
}

function resolveDate(opts: Record<string, unknown>): string | undefined {
  if (opts.backlog) return undefined;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  if (opts.yesterday) return fmt(new Date(today.getTime() - 86400000));
  if (opts.tomorrow) return fmt(new Date(today.getTime() + 86400000));
  if (opts.date) {
    const parsed = parseHumanDateOnly(opts.date as string);
    if (!parsed) throw Errors.invalidInput(`Cannot parse date: "${opts.date}". Use YYYY-MM-DD or natural language (tomorrow, next monday, etc.)`);
    return parsed;
  }
  return fmt(today);
}

function extractTime(dueDate: unknown): string {
  if (typeof dueDate !== 'string') return '';
  const parts = dueDate.split(' ');
  if (parts.length < 2) return '';
  const time = parts[1];
  return time === '00:00' ? '' : time;
}

function isRepeating(t: Record<string, unknown>): boolean {
  const repeat = t.repeat as { type?: string } | undefined;
  return !!repeat?.type && repeat.type !== 'none';
}

function getCheckIndicator(t: Record<string, unknown>): string {
  if (t.completed) return pc.green(SYM.check);
  if (isRepeating(t)) return pc.blue(SYM.repeat);
  return pc.dim(SYM.circle);
}

function sortTasksForDisplay(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
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
      const ra = (a.repeat as { type?: string })?.type ?? '';
      const rb = (b.repeat as { type?: string })?.type ?? '';
      return (repeatOrder[ra] ?? 99) - (repeatOrder[rb] ?? 99);
    }

    // Regular tasks keep original order
    return 0;
  });
}

function printTaskDetail(t: Record<string, unknown>) {
  const dim = pc.dim;
  console.log('');
  printRecord([
    ['ID', dim(t.id as string)],
    ['Text', t.text],
    ['Due', formatDate(t.dueDate as number | string | null) || dim('none (backlog)')],
    ['Status', t.completed ? pc.green('completed') : pc.yellow('pending')],
    ['Tags', formatTags(t.tags) || dim('none')],
    ['Difficulty', formatDifficulty(t.difficulty) || dim('not set')],
    ['Duration', formatDuration(t.duration) || dim('not set')],
    ['Repeat', formatRepeat(t.repeat) || dim('none')],
    ['Note', t.note || dim('none')],
    ['Public', t.isPublic ? pc.green('yes') : pc.yellow('no')],
    ['Completions', String(t.completions ?? 0)],
    ['Created', formatDate(t.createdAt as number)],
  ]);
  console.log('');
}

function printTaskLine(t: Record<string, unknown>) {
  const check = getCheckIndicator(t);
  const rawText = truncate(String(t.text ?? ''), 50);
  const text = t.completed ? pc.strikethrough(pc.dim(rawText)) : rawText;
  const time = extractTime(t.dueDate);
  const tags = formatTags(t.tags);
  const difficulty = formatDifficulty(t.difficulty);
  const id = pc.dim(String(t.id ?? ''));

  const parts = [check, text];
  if (time) parts.push(pc.cyan(time));
  if (tags) parts.push(tags);
  if (difficulty) parts.push(pc.dim(`[${difficulty}]`));
  parts.push(id);

  console.log('  ' + parts.join('  '));
}

export function registerTasksCommands(program: Command) {
  const tasks = program.command('tasks').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks by date or backlog')
    .option('--date <date>', 'YYYY-MM-DD')
    .option('--backlog', 'Show backlog tasks')
    .option('--tag <tag>', 'Filter by tag')
    .option('--yesterday', 'Show yesterday\'s tasks')
    .option('--tomorrow', 'Show tomorrow\'s tasks')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const uid = requireUid();
      const date = resolveDate(opts);

      await runList({
        global: opts,
        fn: () => listTasks(uid, { date, backlog: opts.backlog, tag: opts.tag }),
        dataKey: 'tasks',
        columns: ['id', 'text', 'dueDate', 'completed', 'tags', 'priority'],
        spinnerMessage: 'Fetching tasks...',
        onInteractive: (payload) => {
          const items = payload.tasks as Record<string, unknown>[];
          const pending = sortTasksForDisplay(items.filter((t) => !t.completed));
          const completed = items.filter((t) => t.completed);

          console.log('');

          if (opts.backlog) {
            console.log(`  ${pc.bold('Backlog')} ${pc.dim(`(${items.length})`)}`);
          } else {
            const viewDate = date ? new Date(date + 'T00:00:00') : new Date();
            const streakCount = getCompletedTodayCount();
            console.log(formatWeekdayHeader(viewDate, streakCount));
          }

          // Tag summary
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
      const uid = requireUid();
      const taskId = await promptForMissing({ value: id, message: 'Task ID' });
      await runGet({
        global: this.optsWithGlobals(),
        fn: () => getTask(uid, taskId),
        spinnerMessage: 'Fetching task...',
        onInteractive: printTaskDetail,
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks get abc123
  $ numo tasks get abc123 --json | jq '.text'`);

  tasks
    .command('create')
    .description('Create a new task')
    .option('--text <text>', 'Task text')
    .option('--due <date>', 'Due date YYYY-MM-DD')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--public', 'Make task public (default)')
    .option('--private', 'Make task private')
    .option('--note <note>', 'Task note')
    .option('--priority <n>', 'Priority 0.1–1.0')
    .option('--difficulty <n>', 'Difficulty 0–3')
    .option('--duration <n>', 'Duration in minutes')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const uid = requireUid();

      const text = await promptForMissing({ value: opts.text, message: 'Task text', placeholder: 'What do you need to do?' });
      const body: Record<string, unknown> = { text };

      if (isInteractive() && !opts.json) {
        // Step 1: Schedule (merges type + schedule into one select)
        if (!opts.due) {
          const today = new Date();
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const fmt = (d: Date) => d.toISOString().slice(0, 10);

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
            const date = await promptText({ message: 'Date', placeholder: fmt(tomorrow), required: true });
            body.dueDate = date;
          } else if (['daily', 'weekly', 'monthly'].includes(schedule)) {
            const repeat: Record<string, unknown> = {
              type: schedule, every: 1, end: 'never',
              endDate: null, endAfter: null, monthDays: null, weekDays: null,
            };

            if (schedule === 'weekly') {
              const days = await promptMultiSelect({
                message: 'Days of week',
                options: [
                  { value: 'Mon', label: 'Monday' }, { value: 'Tue', label: 'Tuesday' },
                  { value: 'Wed', label: 'Wednesday' }, { value: 'Thu', label: 'Thursday' },
                  { value: 'Fri', label: 'Friday' }, { value: 'Sat', label: 'Saturday' },
                  { value: 'Sun', label: 'Sunday' },
                ],
                required: true,
              });
              repeat.weekDays = days;
            } else if (schedule === 'monthly') {
              const daysInput = await promptText({ message: 'Days of month', placeholder: '1,15', required: true });
              repeat.monthDays = daysInput.split(',').map((s: string) => parseInt(s.trim()));
            }

            body.repeat = repeat;
            body.dueDate = fmt(today);
          }
          // 'someday' -> no dueDate, service handles backlog
        }

        // Step 2: Visibility
        if (!opts.private && !opts.public) {
          const visibility = await promptSelect({
            message: 'Visibility',
            options: [
              { value: 'public', label: 'Public — visible to your squad' },
              { value: 'private', label: 'Private — only you can see it' },
            ],
          });
          if (visibility === 'private') body.isPublic = false;
        }

        // Step 3: "Add details?" gate (default = No = fast path)
        const addDetails = await promptConfirm({
          message: 'Add details? (tags, effort, time, note)',
          initialValue: false,
        });

        if (addDetails) {
          if (!opts.tags) {
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
          }

          if (opts.difficulty === undefined) {
            const difficulty = await promptSelect({
              message: 'Effort',
              options: [
                { value: 'skip', label: 'Skip' },
                { value: '0', label: 'S — Tiny' }, { value: '1', label: 'M — Medium' },
                { value: '2', label: 'L — High' }, { value: '3', label: 'XL — Huge' },
              ],
            });
            if (difficulty !== 'skip') body.difficulty = parseInt(difficulty);
          }

          const addTime = await promptConfirm({ message: 'Add a specific time?', initialValue: false });
          if (addTime && body.dueDate) {
            const time = await promptText({ message: 'Time', placeholder: '09:30', required: true });
            body.dueDate = `${body.dueDate} ${time}`;
          }

          if (!opts.note) {
            const note = await promptText({ message: 'Note (enter to skip)', placeholder: 'Private note', required: false });
            if (note) body.note = note;
          }
        }

        // Apply flag overrides for non-prompted fields
        if (opts.public) body.isPublic = true;
        if (opts.private) body.isPublic = false;
        if (opts.tags && !body.tags) body.tags = opts.tags.split(',');
        if (opts.note && !body.note) body.note = opts.note;
      } else {
        // Non-interactive mode — flags only
        if (opts.due) {
          const parsed = parseHumanDate(opts.due);
          if (!parsed) throw Errors.invalidInput(`Cannot parse date: "${opts.due}"`);
          body.dueDate = parsed;
        }
        if (opts.tags) body.tags = opts.tags.split(',');
        if (opts.note) body.note = opts.note;
        if (opts.priority) body.priority = parseFloat(opts.priority);
        if (opts.difficulty !== undefined) body.difficulty = parseInt(opts.difficulty);
        if (opts.duration) body.duration = parseInt(opts.duration);
        if (opts.public) body.isPublic = true;
        if (opts.private) body.isPublic = false;
      }

      await runCreate({
        global: opts,
        fn: () => createTask(uid, body),
        dataKey: 'task',
        spinnerMessage: 'Creating task...',
        onInteractive: (_task, payload) => {
          const task = payload.task as Record<string, unknown>;
          const check = pc.green(SYM.check);
          console.log(`\n  ${check} Created  ${task.text}`);
          const karma = payload.karma as number | undefined;
          if (karma) {
            console.log(`    ${formatKarmaGain(karma)}${' '.repeat(20)}${pc.dim(task.id as string)}`);
          }
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks create                                    # Interactive wizard
  $ numo tasks create --text "Buy groceries"             # Quick create (today)
  $ numo tasks create --text "Meeting" --due 2026-03-27
  $ numo tasks create --text "Workout" --tags Health --difficulty 2
  $ numo tasks create --text "Review PR" --due 2026-03-27 --tags Work --private`);

  tasks
    .command('update [id]')
    .description('Update a task')
    .option('--text <text>', 'Task text')
    .option('--due <date>', 'Due date YYYY-MM-DD or "YYYY-MM-DD HH:mm"')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--public', 'Make task public')
    .option('--private', 'Make task private')
    .option('--note <note>', 'Task note')
    .option('--priority <n>', 'Priority 0.1-1.0')
    .option('--difficulty <n>', 'Difficulty 0-3 (S/M/L/XL)')
    .option('--duration <n>', 'Duration in minutes')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      const uid = requireUid();
      const taskId = await promptForMissing({ value: id, message: 'Task ID' });

      const body: Record<string, unknown> = {};
      const hasAnyFlag = opts.text || opts.due || opts.tags || opts.public || opts.private ||
        opts.note || opts.priority || opts.difficulty !== undefined || opts.duration;

      if (!hasAnyFlag && isInteractive() && !opts.json) {
        const text = await promptText({ message: 'Text (enter to skip)', required: false });
        if (text) body.text = text;

        const due = await promptText({ message: 'Due date (enter to skip)', placeholder: 'YYYY-MM-DD', required: false });
        if (due) body.dueDate = due;

        const tags = await promptText({ message: 'Tags (enter to skip)', placeholder: 'tag1,tag2', required: false });
        if (tags) body.tags = tags.split(',');

        const note = await promptText({ message: 'Note (enter to skip)', required: false });
        if (note) body.note = note;

        const priority = await promptText({ message: 'Priority (enter to skip)', placeholder: '0.1–1.0', required: false });
        if (priority) body.priority = parseFloat(priority);

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
        if (opts.priority) body.priority = parseFloat(opts.priority);
        if (opts.difficulty !== undefined) body.difficulty = parseInt(opts.difficulty);
        if (opts.duration) body.duration = parseInt(opts.duration);
      }

      await runWrite({
        global: opts,
        fn: () => updateTask(uid, taskId, body),
        dataKey: 'task',
        spinnerMessage: 'Updating task...',
        onInteractive: (task) => {
          console.log(`\n  ${pc.green('Updated!')} ${task.text}  ${pc.dim(task.id as string)}\n`);
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks update abc123 --text "Updated text"
  $ numo tasks update abc123 --due 2026-03-28
  $ numo tasks update abc123 --tags Work,Health
  $ numo tasks update abc123 --difficulty 2 --note "Important"`);

  tasks
    .command('delete [id]')
    .description('Delete a task')
    .option('--yes', 'Skip confirmation prompt')
    .option('--stdin', 'Read task IDs from stdin (one per line)')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      const uid = requireUid();

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await deleteTask(uid, lineId);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await pickTask(uid, id, 'delete');

      // Confirmation in TTY (unless --yes or non-interactive)
      if (isInteractive() && !opts.yes && !opts.json) {
        let taskText = taskId;
        try {
          const task = await getTask(uid, taskId);
          taskText = String(task.text ?? taskId);
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
        fn: () => deleteTask(uid, taskId),
        spinnerMessage: 'Deleting task...',
        onInteractive: (data) => {
          const cross = pc.red(SYM.cross);
          const text = data.taskText || taskId;
          console.log(`\n  ${cross} Deleted  ${text}`);
          if (data.archived) console.log(`    ${pc.dim('Archived')}`);
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
      const uid = requireUid();

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await completeTask(uid, lineId, opts.date);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await pickTask(uid, id, 'complete');
      await runWrite({
        global: opts,
        fn: () => completeTask(uid, taskId, opts.date),
        spinnerMessage: 'Completing task...',
        onInteractive: (data) => {
          const check = pc.green(SYM.check);
          const text = data.taskText ?? taskId;
          console.log(`\n  ${check} Done!  ${text}`);
          const karma = data.karma as number | undefined;
          const checksInRow = data.checksInRow as number | undefined;
          if (karma) {
            console.log(`    ${formatKarmaGain(karma, checksInRow)}`);
          }
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
      const uid = requireUid();

      if (opts.stdin) {
        const ids = readStdinLines();
        for (const lineId of ids) {
          try {
            const result = await uncompleteTask(uid, lineId);
            printNdjsonLine({ id: lineId, ...result });
          } catch (err: any) {
            printNdjsonLine({ id: lineId, error: err.message });
          }
        }
        return;
      }

      const taskId = await promptForMissing({ value: id, message: 'Task ID' });
      await runWrite({
        global: opts,
        fn: () => uncompleteTask(uid, taskId),
        dataKey: 'task',
        spinnerMessage: 'Uncompleting task...',
        onInteractive: (data) => {
          const arrow = SYM.undo;
          const text = data.text ?? taskId;
          console.log(`\n  ${pc.yellow(arrow)} Reverted  ${text}`);
          console.log(`    ${pc.dim('Karma adjustment applied')}`);
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo tasks uncomplete abc123-1711500000000`);
}
