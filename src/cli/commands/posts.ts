import { Command } from 'commander';
import pc from 'picocolors';
import { runGet, runList } from '../lib/actions';
import { printRecord } from '../lib/output';
import { printPaginationHint } from '../lib/pagination';
import { SYM } from '../lib/symbols';
import { listPosts, getPost } from '../services/posts';
import { listComments } from '../services/comments';
import { listReplies } from '../services/replies';
import { formatRelativeDate, truncate } from '../lib/format';
import { promptForMissing } from '../lib/prompts';
import type { ApiPost, ApiComment, ApiReply, PostListResponse, CommentListResponse, ReplyListResponse } from '../types/api';

function printPostLine(p: ApiPost) {
  const tag = pc.cyan(p.tag ?? '');
  const title = truncate(p.title, 55);
  const author = p.authorName ?? p.authorId;
  const comments = p.commentsCount ? pc.dim(`${p.commentsCount} comments`) : '';
  const likes = p.likesCount ? pc.dim(`${p.likesCount} likes`) : '';
  const time = formatRelativeDate(p.createdAt);
  const id = pc.dim(p.id);

  const parts = [tag, pc.bold(title)];
  if (author) parts.push(pc.dim(`by ${author}`));
  if (comments) parts.push(comments);
  if (likes) parts.push(likes);
  parts.push(pc.dim(time));
  parts.push(id);

  console.log('  ' + parts.join('  '));
}

function printPostDetail(p: ApiPost) {
  console.log('');
  console.log(`  ${pc.bold(p.title)}`);
  if (p.body) {
    console.log(`  ${pc.dim(SYM.dash.repeat(40))}`);
    console.log(`  ${p.body}`);
  }
  console.log(`  ${pc.dim(SYM.dash.repeat(40))}`);
  printRecord([
    ['ID', pc.dim(p.id)],
    ['Tag', pc.cyan(p.tag ?? '')],
    ['Author', p.authorName ?? p.authorId],
    ['Comments', p.commentsCount != null ? String(p.commentsCount) : null],
    ['Likes', p.likesCount != null ? String(p.likesCount) : null],
    ['Created', formatRelativeDate(p.createdAt)],
  ]);
  console.log('');
}

function printCommentLine(c: ApiComment) {
  const author = pc.bold(c.authorName ?? c.userId ?? '');
  const time = pc.dim(formatRelativeDate(c.createdAt));
  const replies = c.repliesCount ? pc.dim(`· ${c.repliesCount} replies`) : '';
  const text = c.text ?? '';

  console.log(`  ${author}  ${time}${replies}`);
  console.log(`  ${text}`);
  console.log('');
}

function printReplyLine(r: ApiReply) {
  const text = truncate(r.text ?? '', 60);
  const time = formatRelativeDate(r.createdAt);
  const id = pc.dim(r.id);

  console.log(`  ${text}  ${pc.dim(time)}  ${id}`);
}

export function registerPostsCommands(program: Command) {
  const posts = program.command('posts').description('Browse community posts and comments');

  posts
    .command('list')
    .description('List posts')
    .option('--cursor <cursor>')
    .option('--limit <n>', 'Max results (<=50)', '20')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      await runList({
        global: opts,
        fn: () => listPosts({ cursor: opts.cursor, limit: opts.limit ? parseInt(opts.limit) : undefined }),
        dataKey: 'posts',
        columns: ['id', 'tag', 'title', 'authorName', 'commentsCount', 'likesCount', 'createdAt'],
        spinnerMessage: 'Fetching posts...',
        onInteractive: (payload: PostListResponse) => {
          const items = payload.posts;
          if (items.length === 0) {
            console.log(pc.dim('  No posts found.'));
            return;
          }
          console.log('');
          for (const p of items) printPostLine(p);
          console.log('');
          printPaginationHint({
            nextCursor: payload.nextCursor,
            command: 'posts list',
            limit: opts.limit,
          });
        },
      });
    });

  posts
    .command('get [id]')
    .description('Get post details')
    .action(async function (this: Command, id?: string) {
      const opts = this.optsWithGlobals();
      const postId = await promptForMissing({ value: id, message: 'Post ID' });
      await runGet({
        global: opts,
        fn: () => getPost(postId),
        spinnerMessage: 'Fetching post...',
        onInteractive: (post: ApiPost) => printPostDetail(post),
      });
    });

  posts
    .command('comments [postId]')
    .description('List comments on a post')
    .option('--cursor <cursor>')
    .option('--limit <n>', 'Max results (<=50)', '20')
    .action(async function (this: Command, postId?: string) {
      const opts = this.optsWithGlobals();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      await runList({
        global: opts,
        fn: () => listComments(resolvedPostId, { cursor: opts.cursor, limit: opts.limit ? parseInt(opts.limit) : undefined }),
        dataKey: 'comments',
        columns: ['id', 'userId', 'authorName', 'text', 'repliesCount', 'createdAt'],
        spinnerMessage: 'Fetching comments...',
        onInteractive: (payload: CommentListResponse) => {
          const items = payload.comments;
          if (items.length === 0) {
            console.log(pc.dim('  No comments yet.'));
            return;
          }
          console.log(`\n  ${pc.bold('Comments')} ${pc.dim(`(${items.length})`)}\n`);
          for (const c of items) printCommentLine(c);
          printPaginationHint({
            nextCursor: payload.nextCursor,
            command: `posts comments ${resolvedPostId}`,
            limit: opts.limit,
          });
        },
      });
    });

  posts
    .command('replies [postId] [commentId]')
    .description('List replies on a comment')
    .option('--cursor <cursor>')
    .option('--limit <n>', 'Max results (<=50)', '20')
    .action(async function (this: Command, postId?: string, commentId?: string) {
      const opts = this.optsWithGlobals();
      const resolvedPostId = await promptForMissing({ value: postId, message: 'Post ID' });
      const resolvedCommentId = await promptForMissing({ value: commentId, message: 'Comment ID' });
      await runList({
        global: opts,
        fn: () => listReplies(resolvedPostId, resolvedCommentId, { cursor: opts.cursor }),
        dataKey: 'replies',
        columns: ['id', 'userId', 'text', 'createdAt'],
        spinnerMessage: 'Fetching replies...',
        onInteractive: (payload: ReplyListResponse) => {
          const items = payload.replies;
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
}
