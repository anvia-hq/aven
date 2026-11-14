export type Mention = {
  threadId: string;
  title: string;
  authorName: string | null;
  authorImage: string | null;
  excerpt: string;
  createdAt: string;
  read: boolean;
};
