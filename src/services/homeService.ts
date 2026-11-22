import { fileLabel, type Lookup } from "@/lib/api-client";
import { apiOrThrow, categoryName, coverUrl, sheetsUrl, subjectName, type ApiSheet } from "@/services/sheetMappers";
import type { HomeCategory, HomePageData, HomeQuery, HomeSheet } from "@/types/home";

// Icons/colours for category tiles (the backend has none), assigned in order.
const TILE_STYLES = [
  { icon: "▤", color: "pink" },
  { icon: "✎", color: "cream" },
  { icon: "◎", color: "green" },
  { icon: "✓", color: "lavender" },
  { icon: "⚙", color: "rose" },
  { icon: "▣", color: "blue" },
];

export function toHomeSheet(sheet: ApiSheet): HomeSheet {
  return {
    id: sheet.id,
    title: sheet.title,
    subjectName: subjectName(sheet),
    category: categoryName(sheet),
    thumbnailUrl: coverUrl(sheet),
    author: { id: sheet.owner.id, name: sheet.owner.name, avatarUrl: sheet.owner.image },
    views: sheet.viewCount,
    likes: sheet.likeCount,
    fileType: sheet.file ? fileLabel(sheet.file.mimeType) : "",
    updatedAt: sheet.updatedAt,
  };
}

/**
 * Everything the Home page shows, from existing endpoints (there is no single /home endpoint):
 *   GET /api/v1/sheets?sort=popular · ?sort=newest · /subjects · /categories (+ one count per category)
 */
export async function getHomePageData(): Promise<HomePageData> {
  const [popular, latest, subjects, categories] = await Promise.all([
    apiOrThrow<ApiSheet[]>(sheetsUrl({ sort: "popular", pageSize: 4 })),
    apiOrThrow<ApiSheet[]>(sheetsUrl({ sort: "newest", pageSize: 6 })),
    apiOrThrow<Lookup[]>("/api/v1/subjects"),
    apiOrThrow<Lookup[]>("/api/v1/categories"),
  ]);

  // How many published sheets each category has (pagination.total of a 1-item page).
  const counts = await Promise.all(
    categories.data.map((c) => apiOrThrow<ApiSheet[]>(sheetsUrl({ categoryId: c.id, pageSize: 1 })).then((r) => r.pagination?.total ?? 0)),
  );
  const tiles: HomeCategory[] = categories.data.map((c, i) => ({
    id: c.id,
    name: c.name,
    sheetCount: counts[i],
    ...TILE_STYLES[i % TILE_STYLES.length],
  }));

  return {
    stats: {
      totalSheets: latest.pagination?.total ?? latest.data.length,
      totalSubjects: subjects.data.length,
      totalCategories: categories.data.length,
    },
    categories: tiles,
    popularSheets: popular.data.map(toHomeSheet),
    latestSheets: latest.data.map(toHomeSheet),
  };
}

/** GET /api/v1/sheets — search / filter published sheets. */
export async function searchHomeSheets(query: HomeQuery): Promise<HomeSheet[]> {
  const result = await apiOrThrow<ApiSheet[]>(
    sheetsUrl({ q: query.search?.trim(), categoryId: query.categoryId, sort: query.sort, page: query.page, pageSize: query.limit }),
  );
  return result.data.map(toHomeSheet);
}
