/** Discovery (search & filter) page data (from GET /api/v1/sheets via services/discoveryService). */

export type DiscoverySheet = {
  id: string;
  title: string;
  description: string;
  subjectName: string;
  categoryName: string;
  coverImage: string | null;
  fileType: string;
  creator: { id: string; name: string; avatar: string | null };
  views: number;
  likes: number;
  createdAt: string;
};

/** Filters the backend supports (one subject and/or one category). */
export type DiscoveryFilters = {
  subjectId: string;
  categoryId: string;
};

export type DiscoverySort = "popular" | "latest";

export type DiscoveryResponse = {
  items: DiscoverySheet[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
