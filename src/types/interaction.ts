/** Comments / reactions / favorites (BE02 Interaction API, via services/interactionService). */

export type Reaction = "like" | "dislike";

export interface SheetComment {
  id: string;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  body: string; // "" when deleted
  deleted: boolean;
  createdAt: string;
  replies: SheetComment[]; // one level only (replies cannot be replied to)
}

export interface ReactionState {
  likes: number;
  dislikes: number;
  mine: Reaction | null;
}
