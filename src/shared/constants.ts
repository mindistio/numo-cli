export const POST_TAGS = [
  'general',
  'hack',
  'story',
  'meme',
  'other',
  'question',
  'hack-tip',
  'activity',
] as const;

export const MAX_TASKS_PER_REQUEST = 200;

export const KARMA_POINTS = {
  addTask: 2,
  completeTask: 5,
  completeSubtask: [2, 5] as const,
  splitTask: 10,
  createPost: 10,
  addComment: 10,
} as const;

export const DIFFICULTY_BONUS = [0, 5, 15, 45] as const;
export const MAX_KARMA_PER_COMPLETE = 100;

export const MAX_POSTS_PER_REQUEST = 50;
export const MAX_COMMENTS_PER_REQUEST = 100;
export const MAX_REPLIES_PER_REQUEST = 100;
