"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getDiscoverySheets } from "@/services/discoveryService";
import { initials, loadLookups, type Lookup } from "@/lib/api-client";

import type {
    DiscoverySheet,
    DiscoveryFilters,
    DiscoverySort,
} from "@/types/discovery";

import styles from "./Discovery.module.css";

const initialFilters: DiscoveryFilters = { subjectId: "", categoryId: "" };

// Search & filter (FE01 design) — data from GET /api/v1/sheets.
// Hidden until the backend has the data: university, faculty, exam type, "verified PDF", GoodNotes,
// "popular ≥ 1,000 downloads" filters, rating / downloads sorting, rating & favourite on cards,
// satisfaction score in the hero, the "recently opened" promotion.
export default function DiscoveryClient() {
    const [keyword, setKeyword] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState<DiscoveryFilters>(initialFilters);

    const [sort, setSort] = useState<DiscoverySort>("popular");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [page, setPage] = useState(1);

    const [sheets, setSheets] = useState<DiscoverySheet[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [subjects, setSubjects] = useState<Lookup[]>([]);
    const [categories, setCategories] = useState<Lookup[]>([]);

    // Dropdown data + a search passed in the URL (e.g. /discover?q=แคลคูลัส from the home page).
    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get("q") ?? "";
        setSearchInput(q);
        setKeyword(q);
        loadLookups().then((lookups) => {
            setSubjects(lookups.subjects);
            setCategories(lookups.categories);
        });
    }, []);

    const loadSheets = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getDiscoverySheets({ keyword, filters, sort, page, limit: 6 });
            setSheets(result.items);
            setTotal(result.total);
            setTotalPages(result.totalPages);
            setError("");
        } catch (err) {
            setSheets([]);
            setTotal(0);
            setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    }, [keyword, filters, sort, page]);

    useEffect(() => {
        void loadSheets();
    }, [loadSheets]);

    // The API filters by ONE subject and ONE category: clicking the selected one again clears it.
    const pickFilter = (key: keyof DiscoveryFilters, id: string) => {
        setFilters((prev) => ({ ...prev, [key]: prev[key] === id ? "" : id }));
        setPage(1);
    };

    const handleSearch = () => {
        setKeyword(searchInput.trim());
        setPage(1);
    };

    const clearFilters = () => {
        setFilters(initialFilters);
        setSearchInput("");
        setKeyword("");
        setPage(1);
    };

    const activeFilters = useMemo(
        () =>
            [
                subjects.find((s) => s.id === filters.subjectId)?.name,
                categories.find((c) => c.id === filters.categoryId)?.name,
            ].filter((name): name is string => Boolean(name)),
        [filters, subjects, categories],
    );

    const formatCount = (count: number) => new Intl.NumberFormat("th-TH").format(count);

    return (
        <main className={styles.page}>

            {/* Search Hero */}
            <section className={styles.hero}>
                <div className={styles.heroTop}>
                    <div>
                        <span className={styles.heroBadge}>▣ ค้นหาชีทสรุปจากเพื่อน ๆ</span>
                        <h1>ค้นหาและกรองชีทสรุปบทเรียน</h1>
                        <p>รวบรวมโน้ตสรุป เลคเชอร์ และแนวข้อสอบ ที่แบ่งปันโดยนิสิตนักศึกษา</p>
                    </div>

                    <div className={styles.heroStats}>
                        <div>
                            <strong>{formatCount(total)}</strong>
                            <span>{keyword || activeFilters.length ? "ชีทที่ตรงเงื่อนไข" : "ชีทที่เผยแพร่ทั้งหมด"}</span>
                        </div>
                        <div>
                            <strong>{formatCount(subjects.length)}</strong>
                            <span>รายวิชา</span>
                        </div>
                    </div>
                </div>

                <form
                    className={styles.searchBox}
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSearch();
                    }}
                >
                    <span className={styles.searchIcon}>⌕</span>
                    <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="แคลคูลัส อนุพันธ์ สรุปเคมี..."
                    />
                    {searchInput && (
                        <button
                            type="button"
                            className={styles.clearSearch}
                            onClick={() => {
                                setSearchInput("");
                                setKeyword("");
                                setPage(1);
                            }}
                        >
                            ×
                        </button>
                    )}
                    <button type="submit" className={styles.searchButton}>ค้นหาชีทสรุป →</button>
                </form>
            </section>

            {/* Main Content */}
            <div className={styles.mainLayout}>

                {/* Filter Sidebar */}
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarHeading}>
                        <h3>☷ ตัวกรองการค้นหา</h3>
                        <button onClick={clearFilters}>ล้างค่าทั้งหมด</button>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>รายวิชา</label>
                        {subjects.map((item) => (
                            <label key={item.id} className={styles.checkRow}>
                                <input
                                    type="checkbox"
                                    checked={filters.subjectId === item.id}
                                    onChange={() => pickFilter("subjectId", item.id)}
                                />
                                <span>{item.name}</span>
                            </label>
                        ))}
                    </div>

                    <div className={styles.filterGroup}>
                        <label>ประเภทของเนื้อหา</label>
                        {categories.map((item) => (
                            <label key={item.id} className={styles.checkRow}>
                                <input
                                    type="checkbox"
                                    checked={filters.categoryId === item.id}
                                    onChange={() => pickFilter("categoryId", item.id)}
                                />
                                <span>▣ {item.name}</span>
                            </label>
                        ))}
                    </div>

                    <div className={styles.sidebarPromotion}>
                        <div className={styles.promoIcon}>♙</div>
                        <div>
                            <strong>แบ่งปันชีทของคุณวันนี้</strong>
                            <p>อัปโหลดเพื่อแบ่งปันความรู้ให้เพื่อน ๆ</p>
                            <Link href="/upload">เริ่มอัปโหลด ↗</Link>
                        </div>
                    </div>
                </aside>

                {/* Results */}
                <section className={styles.results}>

                    {/* Results Toolbar */}
                    <div className={styles.resultsToolbar}>
                        <div className={styles.resultInfo}>
                            <strong>
                                พบชีทสรุปทั้งหมด
                                <span className={styles.countBadge}>{formatCount(total)} รายการ</span>
                            </strong>
                            <div className={styles.activeFilters}>
                                {activeFilters.map((filter) => (
                                    <span key={filter}>{filter}</span>
                                ))}
                                {keyword && <span>คำค้น: {keyword}</span>}
                            </div>
                        </div>

                        <div className={styles.sortArea}>
                            <label htmlFor="sort">เรียงตาม:</label>
                            <select
                                id="sort"
                                value={sort}
                                onChange={(e) => {
                                    setSort(e.target.value as DiscoverySort);
                                    setPage(1);
                                }}
                            >
                                <option value="popular">ยอดนิยมสูงสุด (เข้าชมมากที่สุด)</option>
                                <option value="latest">ใหม่ล่าสุด (Latest)</option>
                            </select>
                            <button className={viewMode === "grid" ? styles.viewActive : ""} onClick={() => setViewMode("grid")} aria-label="Grid view">▦</button>
                            <button className={viewMode === "list" ? styles.viewActive : ""} onClick={() => setViewMode("list")} aria-label="List view">☰</button>
                        </div>
                    </div>

                    {/* Cards */}
                    {loading ? (
                        <div className={styles.loading}>กำลังค้นหาชีทสรุป...</div>
                    ) : sheets.length === 0 ? (
                        <div className={styles.empty}>
                            <div>⌕</div>
                            <h3>{error ? "โหลดข้อมูลไม่สำเร็จ" : "ไม่พบชีทที่ค้นหา"}</h3>
                            <p>{error || "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองอีกครั้ง"}</p>
                            <button onClick={clearFilters}>ล้างตัวกรอง</button>
                        </div>
                    ) : (
                        <div className={`${styles.sheetGrid} ${viewMode === "list" ? styles.listView : ""}`}>
                            {sheets.map((sheet) => (
                                <article key={sheet.id} className={styles.sheetCard}>
                                    <Link href={`/sheets/${sheet.id}`} className={styles.coverLink}>
                                        {sheet.coverImage ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- image served by our API
                                            <img src={sheet.coverImage} alt={sheet.title} className={styles.coverImage} />
                                        ) : (
                                            <div className={styles.coverImage} style={{ display: "grid", placeItems: "center", background: "#f3eef3", color: "#883d5e", fontSize: 28, fontWeight: 700 }}>
                                                {sheet.fileType || "▧"}
                                            </div>
                                        )}
                                        {sheet.fileType && <span className={styles.pageCount}>▣ {sheet.fileType}</span>}
                                        <span className={styles.categoryBadge}>{sheet.categoryName}</span>
                                    </Link>

                                    <div className={styles.cardContent}>
                                        <div className={styles.cardMeta}>
                                            <span>{sheet.subjectName}</span>
                                            <small>{new Date(sheet.createdAt).toLocaleDateString("th-TH")}</small>
                                        </div>
                                        <Link href={`/sheets/${sheet.id}`} className={styles.cardTitle}>{sheet.title}</Link>
                                        <p className={styles.cardDescription}>{sheet.description}</p>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <div className={styles.creator}>
                                            {sheet.creator.avatar ? (
                                                // eslint-disable-next-line @next/next/no-img-element -- avatar from our API
                                                <img src={sheet.creator.avatar} alt={sheet.creator.name} />
                                            ) : (
                                                <span style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: "#f3eef3", color: "#883d5e", fontSize: 12, fontWeight: 700 }}>
                                                    {initials(sheet.creator.name)}
                                                </span>
                                            )}
                                            <div>
                                                <strong>{sheet.creator.name}</strong>
                                                <span>เข้าชม {formatCount(sheet.views)} ครั้ง · ♥ {formatCount(sheet.likes)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    <div className={styles.pagination}>
                        <span>แสดงหน้า {page} จากทั้งหมด {totalPages} หน้า ({formatCount(total)} รายการ)</span>
                        <div>
                            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1)
                                .map((number, index, array) => (
                                    <span key={number} className={styles.pageNumberWrap}>
                                        {index > 0 && number - array[index - 1] > 1 && <span className={styles.ellipsis}>...</span>}
                                        <button className={page === number ? styles.pageActive : ""} onClick={() => setPage(number)}>{number}</button>
                                    </span>
                                ))}
                            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
