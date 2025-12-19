import { useEffect, useState, useCallback } from 'react';
import { getAnimes } from '@/lib/api';
import type { Anime } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

export function Home() {
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  const tagId = searchParams.get('tag') ? parseInt(searchParams.get('tag')!) : undefined;
  const tagName = searchParams.get('tagName');
  const searchQuery = searchParams.get('search');

  // Update page title and meta description dynamically
  useEffect(() => {
    let title = 'AnimeStream - 在线动漫视频播放平台';
    let description = 'AnimeStream 提供高清动漫在线观看服务，海量动漫资源，支持多标签筛选和智能推荐。';

    if (searchQuery) {
      title = `搜索: ${searchQuery} - AnimeStream`;
      description = `搜索 "${searchQuery}" 的动漫结果，在 AnimeStream 观看高清动漫视频。`;
    } else if (tagId && tagName) {
      title = `${tagName} - 动漫标签 - AnimeStream`;
      description = `浏览所有标签为 "${tagName}" 的动漫，在 AnimeStream 观看高清动漫视频。`;
    }

    document.title = title;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    }
  }, [searchQuery, tagId, tagName]);

  // Sync state with URL page param initially
  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) {
      setPage(parseInt(pageParam));
    }
  }, []);

  const loadAnimes = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAnimes(pageNum, 48, tagId, searchQuery || undefined);

      setAnimes(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load animes');
    } finally {
      setLoading(false);
    }
  }, [tagId, searchQuery]);

  useEffect(() => {
    loadAnimes(page);
    // Update URL without reload
    setSearchParams(prev => {
      prev.set('page', page.toString());
      if (tagId) prev.set('tag', tagId.toString());
      if (tagName) prev.set('tagName', tagName);
      if (searchQuery) prev.set('search', searchQuery);
      return prev;
    }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, loadAnimes, setSearchParams, tagId, tagName, searchQuery]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];

    // Mobile: show fewer pages (3 max), Desktop: show more (5 max)
    const isMobile = window.innerWidth < 640; // sm breakpoint
    const maxVisible = isMobile ? 3 : 5;
    const neighbors = isMobile ? 0 : 2; // Mobile: only current page, Desktop: current + 2 neighbors

    let start = Math.max(1, page - neighbors);
    let end = Math.min(totalPages, page + neighbors);

    if (end - start + 1 < maxVisible) {
      if (start === 1) end = Math.min(totalPages, start + maxVisible - 1);
      else if (end === totalPages) start = Math.max(1, end - maxVisible + 1);
    }

    // First Page (only on desktop or when not in range)
    if (start > 1 && !isMobile) {
       pages.push(
         <Button key={1} variant="outline" size="icon" onClick={() => handlePageChange(1)} className="w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm">
            1
         </Button>
       );
       if (start > 2) {
         pages.push(<span key="start-ellipsis" className="px-1 sm:px-2 text-muted-foreground">...</span>);
       }
    }

    for (let i = start; i <= end; i++) {
        pages.push(
          <Button
            key={i}
            variant={i === page ? 'default' : 'outline'}
            size="icon"
            onClick={() => handlePageChange(i)}
            className="w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm"
          >
            {i}
          </Button>
        );
    }

    // Last Page (only on desktop or when not in range)
    if (end < totalPages && !isMobile) {
       if (end < totalPages - 1) {
         pages.push(<span key="end-ellipsis" className="px-1 sm:px-2 text-muted-foreground">...</span>);
       }
       pages.push(
         <Button key={totalPages} variant="outline" size="icon" onClick={() => handlePageChange(totalPages)} className="w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm">
            {totalPages}
         </Button>
       );
    }

    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className="w-8 h-8 sm:w-9 sm:h-9"
        >
          <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
        {pages}
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
          className="w-8 h-8 sm:w-9 sm:h-9"
        >
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
        {/* Mobile: Show page info */}
        {isMobile && (
          <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
            {page}/{totalPages}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
         <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
           {searchQuery ? `Search: "${searchQuery}"` : tagId ? `Tag: ${tagName || 'Unknown'}` : 'Latest Animes'}
         </h1>
         {(tagId || searchQuery) && (
            <Link to="/">
              <Button variant="outline" size="sm">Clear Filter</Button>
            </Link>
         )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle size={32} />
            <p className="text-lg font-medium">{error}</p>
          </div>
          <Button onClick={() => loadAnimes(page)} variant="outline">
            Retry
          </Button>
        </div>
      ) : loading ? (
         <div className="flex justify-center py-20">
             <div className="flex flex-col items-center gap-4">
               <div className="relative w-16 h-16">
                 <div className="absolute inset-0 border-4 border-primary/30 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
               </div>
               <p className="text-muted-foreground text-sm">Loading animes...</p>
             </div>
         </div>
      ): (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6 mb-8">
                {animes.map((anime) => (
                <Link key={anime.id} to={`/watch/${anime.id}`} className="group">
                    <Card className="overflow-hidden border-0 bg-transparent shadow-none group-hover:scale-[1.03] transition-all duration-300 ease-out">
                    <div className="relative rounded-lg overflow-hidden shadow-lg shadow-black/20 group-hover:shadow-xl group-hover:shadow-primary/20 transition-shadow duration-300">
                        <AspectRatio ratio={2 / 3}>
                        <img
                            src={anime.cover || 'https://placehold.co/400x600?text=No+Image'}
                            alt={anime.title}
                            className="object-cover w-full h-full transition-all duration-300 group-hover:scale-110"
                            loading="lazy"
                        />
                        </AspectRatio>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-4px] group-hover:translate-y-0">
                        <Badge variant="secondary" className="backdrop-blur-md bg-black/60 text-white border border-white/20 shadow-lg">HD</Badge>
                        </div>
                    </div>
                    <CardContent className="p-2 sm:p-3 pl-1">
                        <h3 className="font-semibold line-clamp-1 text-sm sm:text-base group-hover:text-primary transition-colors duration-200" title={anime.title}>
                        {anime.title}
                        </h3>
                    </CardContent>
                    </Card>
                </Link>
                ))}
            </div>
            
            <div className="flex justify-center pt-6 sm:pt-8 pb-8 sm:pb-12">
                <div className="flex items-center justify-center">
                  {renderPagination()}
                </div>
            </div>
        </>
      )}
    </div>
  );
}
