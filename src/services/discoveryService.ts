import { fileLabel } from "@/lib/api-client";
import { apiOrThrow, categoryName, coverUrl, sheetsUrl, subjectName, type ApiSheet } from "@/services/sheetMappers";
import type { DiscoveryFilters, DiscoveryResponse, DiscoverySheet, DiscoverySort } from "@/types/discovery";

function toDiscoverySheet(sheet: ApiSheet): DiscoverySheet {
  return {
    id: sheet.id,
    title: sheet.title,
    description: sheet.description ?? "",
    subjectName: subjectName(sheet),
    categoryName: categoryName(sheet),
    coverImage: coverUrl(sheet),
    fileType: sheet.file ? fileLabel(sheet.file.mimeType) : "",
    creator: { id: sheet.owner.id, name: sheet.owner.name, avatar: sheet.owner.image },
    views: sheet.viewCount,
    likes: sheet.likeCount,
    createdAt: sheet.createdAt,
  };
}

/** GET /api/v1/sheets?q=&subjectId=&categoryId=&sort=&page=&pageSize= */
export async function getDiscoverySheets(params: {
  keyword?: string;
  filters: DiscoveryFilters;
  sort: DiscoverySort;
  page: number;
  limit: number;
}): Promise<DiscoveryResponse> {
  const { keyword = "", filters, sort, page, limit } = params;
  const result = await apiOrThrow<ApiSheet[]>(
    sheetsUrl({
      q: keyword.trim(),
      subjectId: filters.subjectId,
      categoryId: filters.categoryId,
      sort: sort === "latest" ? "newest" : "popular",
      page,
      pageSize: limit,
    }),
  );
  const pagination = result.pagination ?? { page, pageSize: limit, total: result.data.length, totalPages: 1 };
  return {
    items: result.data.map(toDiscoverySheet),
    total: pagination.total,
    page: pagination.page,
    limit: pagination.pageSize,
    totalPages: pagination.totalPages,
  };
}
