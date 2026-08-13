export type PostTag = 'general' | 'hack' | 'story' | 'meme' | 'other' | 'question' | 'hack-tip' | 'activity';

/** Day-of-week tokens as serialized by the Numo API. */
export type WeekDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/** Origin of a task: 'api', 'app', 'cli', or 'google-calendar'. */
export type TaskSource = 'app' | 'cli' | 'google-calendar' | 'api';

/** Difficulty levels (S/M/L/XL); null when unset. */
export type TaskDifficulty = 0 | 1 | 2 | 3;

export interface RepeatConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'none';
  every: number | null;
  custom?: boolean;
  monthDays: number[] | null;
  weekDays: WeekDay[] | null;
}

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface ApiTask {
  id: string;
  userId: string;
  text: string;
  isPublic: boolean;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
  dueDate: string | null;
  remindDate: string | null;
  tags: string[];
  note: string;
  difficulty: TaskDifficulty | null;
  duration: number;
  completions: number;
  repeat: RepeatConfig;
  subtasks: SubTask[];
  backlog?: boolean;
  withTime?: boolean;
  listPosition?: 'top' | 'bottom' | null;
  source?: TaskSource;
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
  /** True when a clientTaskId matched an existing task — API replied 200 (not 201). */
  idempotentReplay?: boolean;
}

export interface TaskUpdateResponse {
  task: ApiTask;
}

export interface TaskDeleteResponse {
  deleted: true;
  taskText: string;
  archived: boolean;
  /** True when the ID was already archived by a prior delete — idempotent retry, no counters touched. */
  alreadyArchived?: boolean;
  /** Set when a non-critical side effect (ordering/streak) failed but the delete committed. */
  partial?: boolean;
  failed?: string[];
}

export interface TaskCompleteResponse {
  completed: true;
  task?: ApiTask | null;
  taskHistory: Record<string, unknown>;
  karma: number;
  checksInRow: number;
  taskText: string;
  /** True when the completion was already recorded (idempotent replay) — karma is 0. */
  alreadyCompleted?: boolean;
  /** Set when a non-critical side effect (progress/streak/ordering) failed but the complete committed. */
  partial?: boolean;
  failed?: string[];
}

export interface TaskUncompleteResponse {
  uncompleted: true;
  task: ApiTask;
  karmaReverted: boolean;
  /** Set when a non-critical side effect (karma/progress/counter/ordering) failed but the uncomplete committed. */
  partial?: boolean;
  failed?: string[];
}

export interface ApiPost {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName?: string | null;
  tag: PostTag;
  commentsCount?: number;
  likesCount?: number;
  createdAt: number;
  updatedAt: number | null;
}

export interface PostListResponse {
  posts: ApiPost[];
  nextCursor?: string;
}

export interface ApiComment {
  id: string;
  postId: string;
  userId: string;
  authorName?: string | null;
  createdAt: number;
  text?: string;
  repliesCount?: number;
}

export interface CommentListResponse {
  comments: ApiComment[];
  nextCursor?: string;
}

export interface ApiReply {
  id: string;
  postId: string;
  userId: string;
  createdAt: number;
  text?: string;
  parentCommentId: string;
}

export interface ReplyListResponse {
  replies: ApiReply[];
  nextCursor?: string;
}

export interface ProfileResponse {
  uid: string;
  email: string | null;
  username: string | null;
  photoURL: string | null;
}

export interface MeResponse {
  uid: string;
  email: string | null;
  // Optional on purpose: the CLI ships independently of the API, so it routinely
  // talks to a server older than itself. Absent means "not reported", which is not
  // the same as false and must never be rendered as one.
  emailVerified?: boolean;
  canCreateTasks?: boolean;
}
