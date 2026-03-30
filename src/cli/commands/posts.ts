import { Command } from 'commander';
import pc from 'picocolors';
import { runGet, runList, runCreate, runWrite, runDelete } from '../lib/actions';
import { printRecord } from '../lib/output';
import { printPaginationHint } from '../lib/pagination';
import { SYM } from '../lib/symbols';
import { requireAdmin, isAdmin } from '../lib/uid';
import { listPosts, getPost, createPost, updatePost, deletePost } from '../services/posts';
import { listComments, createComment, deleteComment } from '../services/comments';
import { listReplies, createReply, deleteReply } from '../services/replies';
import { POST_TAGS } from '../../shared';
import { formatRelativeDate, truncate } from '../lib/format';
import { promptForMissing, promptSelect, promptText } from '../lib/prompts';
import { isInteractive } from '../lib/tty';

async function pickComment(postId: string, commentId: string | undefined): Promise<string> {
  if (commentId) return commentId;
  if (!isInteractive()) throw new Error('Missing required argument: commentId. Use flags in non-interactive mode.');

  const { comments } = await listComments(postId, { limit: 50 });
  if (comments.length === 0) throw new Error('No comments on this post.');

  return promptSelect<string>({
    message: 'Select comment',
    options: comments.map((c) => ({
      value: c.id as string,
      label: `${truncate(String(c.text ?? ''), 60)}  ${pc.dim(String(c.authorName ?? c.userId ?? ''))}`,
    })),
  });
}

async function pickReply(postId: string, commentId: string, replyId: string | undefined): Promise<string> {
  if (replyId) return replyId;
  if (!isInteractive()) throw new Error('Missing required argument: replyId. Use flags in non-interactive mode.');

  const { replies } = await listReplies(postId, commentId, { limit: 50 });
  if (replies.length === 0) throw new Error('No replies on this comment.');

  return promptSelect<string>({
    message: 'Select reply',
    options: replies.map((r) => ({
      value: r.id as string,
      label: `${truncate(String(r.text ?? ''), 60)}  ${pc.dim(String(r.userId ?? ''))}`,
    })),
  });
}

function printPostLine(p: Record<string, unknown>) {
  const tag = pc.cyan(String(p.tag ?? ''));
  const title = truncate(String(p.title ?? ''), 55);
  const comments = p.commentsCount ? pc.dim(`${p.commentsCount} comments`) : '';
  const time = formatRelativeDate(p.createdAt as number);
  const id = pc.dim(String(p.id ?? ''));

  const parts = [tag, pc.bold(title)];
  if (comments) parts.push(comments);
  parts.push(pc.dim(time));
  parts.push(id);

  console.log('  ' + parts.join('  '));
}

function printPostDetail(p: Record<string, unknown>) {
  console.log('');
  console.log(`  ${pc.bold(p.title as string)}`);
  if (p.body) {
    console.log(`  ${pc.dim(SYM.dash.repeat(40))}`);
    console.log(`  ${p.body}`);
  }
  console.log(`  ${pc.dim(SYM.dash.repeat(40))}`);
  printRecord([
    ['ID', pc.dim(p.id as string)],
    ['Tag', pc.cyan(String(p.tag ?? ''))],
    ['Author', p.authorName ?? p.authorId],
    ['Comments', p.commentsCount != null ? String(p.commentsCount) : null],
    ['Likes', p.likesCount != null ? String(p.likesCount) : null],
    ['Created', formatRelativeDate(p.createdAt as number)],
  ]);
  console.log('');
}

function printCommentLine(c: Record<string, unknown>) {
  const author = pc.bold(String(c.authorName ?? c.userId ?? ''));
  const time = pc.dim(formatRelativeDate(c.createdAt as number));
  const replies = c.repliesCount ? pc.dim(`· ${c.repliesCount} replies`) : '';
  const text = String(c.text ?? '');

  console.log(`  ${author}  ${time}${replies}`);
  console.log(`  ${text}`);
  console.log('');
}

function printReplyLine(r: Record<string, unknown>) {
  const text = truncate(String(r.text ?? ''), 60);
  const time = formatRelativeDate(r.createdAt as number);
  const id = pc.dim(String(r.id ?? ''));

  console.log(`  ${text}  ${pc.dim(time)}  ${id}`);
}

export function registerPostsCommands(program: Command) {
  const posts = program.command('posts').description('Manage posts and comments');

  posts
    .command('list')
    .description('List posts')
    .option('--cursor <cursor>')
    .option('--limit <n>', 'Max results (<=50)', '20')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const limit = parseInt(opts.limit);
      await runList({
        global: opts,
        fn: () => listPosts({ cursor: opts.cursor, limit }),
        dataKey: 'posts',
        columns: ['id', 'title', 'tag', 'authorId', 'createdAt'],
        spinnerMessage: 'Fetching posts...',
        onInteractive: (payload) => {
          const items = payload.posts as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(pc.dim('  No posts found.'));
            return;
          }
          console.log(`\n  ${pc.bold('Posts')} ${pc.dim(`(${items.length})`)}\n`);
          for (const p of items) {
            printPostLine(p);
          }
          printPaginationHint({
            nextCursor: payload.nextCursor as string | undefined,
            command: 'posts list',
            limit: opts.limit,
          });
          console.log('');
        },
      });
    })
    .addHelpText('after', `
Examples:
  $ numo posts list
  $ numo posts list --limit 10
  $ numo posts list --json | jq '.posts[].title'`);

  posts
    .command('get [id]')
    .description('Get a post by ID')
    .action(async function (this: Command, id?: string) {
      const postId = await promptForMissing({ value: id, message: 'Post ID' });
      await runGet({
        global: this.optsWithGlobals(),
        fn: () => getPost(postId),
        spinnerMessage: 'Fetching post...',
        onInteractive: printPostDetail,
      });
    })
    .addHelpText('after', `
Examples:
  $ numo posts get abc123
  $ numo posts get abc123 --json`);

  // Comments (read)
  posts
    .command('comments [postId]')
    .description('List comments on a post')
    .option('--cursor <cursor>')
    .action(async function (this: Command, postId?: string) {
      const opts = this.optsWithGlobals();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      await runList({
        global: opts,
        fn: () => listComments(resolvedPostId, { cursor: opts.cursor }),
        dataKey: 'comments',
        columns: ['id', 'userId', 'text', 'createdAt'],
        spinnerMessage: 'Fetching comments...',
        onInteractive: (payload) => {
          const items = payload.comments as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(pc.dim('  No comments yet.'));
            return;
          }
          console.log(`\n  ${pc.bold('Comments')} ${pc.dim(`(${items.length})`)}\n`);
          for (const c of items) {
            printCommentLine(c);
          }
          console.log('');
        },
      });
    });

  // Replies (read)
  posts
    .command('replies [postId] [commentId]')
    .description('List replies to a comment')
    .option('--cursor <cursor>')
    .action(async function (this: Command, postId?: string, commentId?: string) {
      const opts = this.optsWithGlobals();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const resolvedCommentId = await pickComment(resolvedPostId, commentId);
      await runList({
        global: opts,
        fn: () => listReplies(resolvedPostId, resolvedCommentId, { cursor: opts.cursor }),
        dataKey: 'replies',
        columns: ['id', 'userId', 'text', 'createdAt'],
        spinnerMessage: 'Fetching replies...',
        onInteractive: (payload) => {
          const items = payload.replies as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(pc.dim('  No replies yet.'));
            return;
          }
          console.log(`\n  ${pc.bold('Replies')} ${pc.dim(`(${items.length})`)}\n`);
          for (const r of items) {
            printReplyLine(r);
          }
          console.log('');
        },
      });
    });

  // ── Admin-only commands ────────────────────────────────────────────
  if (isAdmin()) {

  posts
    .command('create')
    .description('Create a new post')
    .option('--title <title>')
    .option('--body <body>')
    .option('--tag <tag>', 'general|hack|story|meme|other|question|hack-tip|activity')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const uid = requireAdmin();

      const title = await promptForMissing({ value: opts.title, message: 'Title', placeholder: 'Post title' });
      const postBody = await promptForMissing({ value: opts.body, message: 'Body', placeholder: 'Post body' });

      let tag = opts.tag;
      if (!tag) {
        tag = await promptSelect<string>({
          message: 'Tag',
          options: POST_TAGS.map((t) => ({ value: t, label: t })),
        });
      }

      const body: Record<string, unknown> = { title, body: postBody, tag };

      await runCreate({
        global: opts,
        fn: () => createPost(uid, body),
        dataKey: 'post',
        spinnerMessage: 'Creating post...',
        onInteractive: (post) => {
          console.log(`\n  ${pc.green('Posted!')} ${post.title}  ${pc.dim(post.id as string)}\n`);
        },
      });
    });

  posts
    .command('update [id]')
    .description('Update a post')
    .option('--title <title>')
    .option('--body <body>')
    .option('--tag <tag>')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      const uid = requireAdmin();
      const postId = await promptForMissing({ value: id, message: 'Post ID' });

      const body: Record<string, unknown> = {};
      const hasAnyFlag = opts.title || opts.body || opts.tag;

      if (!hasAnyFlag && isInteractive() && !opts.json) {
        const title = await promptText({ message: 'Title (enter to skip)', required: false });
        if (title) body.title = title;

        const postBody = await promptText({ message: 'Body (enter to skip)', required: false });
        if (postBody) body.body = postBody;

        const changeTag = await promptText({ message: 'Tag (enter to skip)', placeholder: POST_TAGS.join('|'), required: false });
        if (changeTag) body.tag = changeTag;
      } else {
        if (opts.title) body.title = opts.title;
        if (opts.body) body.body = opts.body;
        if (opts.tag) body.tag = opts.tag;
      }

      await runWrite({
        global: opts,
        fn: () => updatePost(uid, postId, body),
        dataKey: 'post',
        spinnerMessage: 'Updating post...',
        onInteractive: (post) => {
          console.log(`\n  ${pc.green('Updated!')} ${post.title}  ${pc.dim(post.id as string)}\n`);
        },
      });
    });

  posts
    .command('delete [id]')
    .description('Delete a post')
    .action(async function (this: Command, id?: string) {
      const uid = requireAdmin();
      const postId = await promptForMissing({ value: id, message: 'Post ID' });
      await runDelete({
        global: this.optsWithGlobals(),
        fn: () => deletePost(uid, postId),
        successMessage: `  ${pc.green('Deleted!')} Post ${pc.dim(postId)}`,
        spinnerMessage: 'Deleting post...',
      });
    });

  posts
    .command('comment [postId]')
    .description('Add a comment to a post')
    .option('--text <text>')
    .action(async function (this: Command, postId?: string) {
      const opts = this.optsWithGlobals();
      const uid = requireAdmin();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const text = await promptForMissing({ value: opts.text, message: 'Comment text', placeholder: 'Your comment' });
      await runCreate({
        global: opts,
        fn: () => createComment(uid, resolvedPostId, text),
        dataKey: 'comment',
        spinnerMessage: 'Adding comment...',
        onInteractive: (comment) => {
          console.log(`\n  ${pc.green('Commented!')} ${truncate(String(comment.text ?? ''), 50)}  ${pc.dim(comment.id as string)}\n`);
        },
      });
    });

  posts
    .command('comment-delete [postId] [commentId]')
    .description('Delete a comment')
    .action(async function (this: Command, postId?: string, commentId?: string) {
      const uid = requireAdmin();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const resolvedCommentId = await pickComment(resolvedPostId, commentId);
      await runDelete({
        global: this.optsWithGlobals(),
        fn: () => deleteComment(uid, resolvedPostId, resolvedCommentId),
        successMessage: `  ${pc.green('Deleted!')} Comment ${pc.dim(resolvedCommentId)}`,
        spinnerMessage: 'Deleting comment...',
      });
    });

  posts
    .command('reply [postId] [commentId]')
    .description('Add a reply to a comment')
    .option('--text <text>')
    .action(async function (this: Command, postId?: string, commentId?: string) {
      const opts = this.optsWithGlobals();
      const uid = requireAdmin();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const resolvedCommentId = await pickComment(resolvedPostId, commentId);
      const text = await promptForMissing({ value: opts.text, message: 'Reply text', placeholder: 'Your reply' });
      await runCreate({
        global: opts,
        fn: () => createReply(uid, resolvedPostId, resolvedCommentId, text),
        dataKey: 'reply',
        spinnerMessage: 'Adding reply...',
        onInteractive: (reply) => {
          console.log(`\n  ${pc.green('Replied!')} ${truncate(String(reply.text ?? ''), 50)}  ${pc.dim(reply.id as string)}\n`);
        },
      });
    });

  posts
    .command('reply-delete [postId] [commentId] [replyId]')
    .description('Delete a reply')
    .action(async function (this: Command, postId?: string, commentId?: string, replyId?: string) {
      const uid = requireAdmin();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const resolvedCommentId = await pickComment(resolvedPostId, commentId);
      const resolvedReplyId = await pickReply(resolvedPostId, resolvedCommentId, replyId);
      await runDelete({
        global: this.optsWithGlobals(),
        fn: () => deleteReply(uid, resolvedPostId, resolvedCommentId, resolvedReplyId),
        successMessage: `  ${pc.green('Deleted!')} Reply ${pc.dim(resolvedReplyId)}`,
        spinnerMessage: 'Deleting reply...',
      });
    });

  } // isAdmin
}
