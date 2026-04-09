// API response types for the Numo CLI client.
// These describe the shapes returned by the API server.
// Kept as a standalone file — no shared dependencies.

// ── Common ──────────────────────────────────────────────────────────

export type PostTag = 'general' | 'hack' | 'story' | 'meme' | 'other' | 'question' | 'hack-tip' | 'activity';

export const POST_TAGS: readonly PostTag[] = ['general', 'hack', 'story', 'meme', 'other', 'question', 'hack-tip', 'activity'];

export interface RepeatConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'none';
  every: number | null;
  end: string | null;
  endDate: number | null;
  endAfter: number | null;
  monthDays: number[] | null;
  weekDays: string[] | null;
}

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

// ── Task ────────────────────────────────────────────────────────────

export interface ApiTask {
  id: string;
  text: string;
  isPublic: boolean;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
  dueDate: string | null;
  tags: string[];
  note: string;
  priority: number;
  difficulty: number | null;
  duration: number;
  completions: number;
  repeat: RepeatConfig;
  subtasks: SubTask[];
  backlog?: boolean;
  remindDate?: string | null;
  withTime?: boolean;
  source?: string;
}

export interface TaskListResponse {
  tasks: ApiTask[];
  count: number;
  pendingCount: number;
  completedCount: number;
}

export interface TaskCreateResponse {
  task: ApiTask;
  karma: number;
}

export interface TaskUpdateResponse {
  task: ApiTask;
}

export interface TaskDeleteResponse {
  deleted: true;
  taskText: string;
  archived: boolean;
}

export interface TaskCompleteResponse {
  completed: true;
  taskHistory: Record<string, unknown>;
  karma: number;
  checksInRow: number;
  taskText: string;
}

export interface TaskUncompleteResponse {
  uncompleted: true;
  task: ApiTask;
  karmaReverted: boolean;
}

// ── Post ────────────────────────────────────────────────────────────

export interface ApiPost {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName?: string | null;
  tag: PostTag;
  slug: string;
  commentsCount?: number;
  likesCount?: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
}

export interface PostListResponse {
  posts: ApiPost[];
  nextCursor?: string;
}

export interface PostCreateResponse {
  post: ApiPost;
  karma: number;
}

export interface PostUpdateResponse {
  post: ApiPost;
}

// ── Comment ─────────────────────────────────────────────────────────

export interface ApiComment {
  id: string;
  postId: string;
  userId: string;
  authorName?: string | null;
  createdAt: number;
  updatedAt: number;
  text?: string;
  repliesCount?: number;
}

export interface CommentListResponse {
  comments: ApiComment[];
  nextCursor?: string;
}

export interface CommentCreateResponse {
  comment: ApiComment;
  karma: number;
}

// ── Reply ───────────────────────────────────────────────────────────

export interface ApiReply {
  id: string;
  postId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  text?: string;
  parentCommentId: string;
}

export interface ReplyListResponse {
  replies: ApiReply[];
  nextCursor?: string;
}

export interface ReplyCreateResponse {
  reply: ApiReply;
  karma: number;
}

// ── Profile ─────────────────────────────────────────────────────────

export interface ProfileResponse {
  uid: string;
  email: string | null;
  username: string | null;
  photoURL: string | null;
}
