export interface IReply {
  id: string;
  postId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  text?: string;
  photoURL?: string | null;
  likes?: string[];
  parentCommentId: string;
}
