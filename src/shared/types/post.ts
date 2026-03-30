export type PostTag =
  | 'general'
  | 'hack'
  | 'story'
  | 'meme'
  | 'other'
  | 'question'
  | 'hack-tip'
  | 'activity';

export interface IPost {
  id: string;
  title: string;
  body: string;
  authorId: string;
  tag: PostTag;
  slug: string;
  postPhotoURL?: string | null;
  commentsCount?: number;
  likesCount?: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  squadId?: string | null;
}
