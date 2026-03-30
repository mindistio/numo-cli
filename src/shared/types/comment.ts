export interface IComment {
  id: string;
  postId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  text?: string;
  photoURL?: string | null;
  likes?: string[];
  repliesCount?: number;
}
