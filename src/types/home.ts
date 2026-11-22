/** Data contracts ของหน้า Home (ข้อมูลจริงจาก /api/v1 ผ่าน services/homeService) */

export interface HomeStats {
  totalSheets: number;
  totalSubjects: number;
  totalCategories: number;
}

export interface HomeCategory {
  id: string;
  name: string;
  sheetCount: number;
  icon: string;
  color: string;
}

export interface HomeSheet {
  id: string;
  title: string;
  subjectName: string;
  category: string;
  thumbnailUrl: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  views: number;
  likes: number;
  fileType: string;
  updatedAt: string;
}

export interface HomePageData {
  stats: HomeStats;
  categories: HomeCategory[];
  popularSheets: HomeSheet[];
  latestSheets: HomeSheet[];
}

export interface HomeQuery {
  search?: string;
  categoryId?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}
