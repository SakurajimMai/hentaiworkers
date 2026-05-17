import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getAnime, getSimilarAnimes } from '@/lib/api';
import type { Anime } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X, Maximize2, AlertCircle } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';

export function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [similar, setSimilar] = useState<Anime[]>([]);
  const [lightBoxImage, setLightBoxImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    // Check if there's history to go back to
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (id) {
      const fetchData = async () => {
        setAnime(null);
        setSimilar([]);
        setError(null);
        try {
          const [animeData, similarData] = await Promise.all([
            getAnime(id),
            getSimilarAnimes(id)
          ]);
          setAnime(animeData);
          setSimilar(similarData);

          // Update SEO meta tags
          const title = animeData.titleEnglish
            ? `${animeData.title} (${animeData.titleEnglish}) - AnimeStream`
            : `${animeData.title} - AnimeStream`;

          const description = animeData.description
            ? animeData.description.substring(0, 155) + '...'
            : `在 AnimeStream 观看 ${animeData.title} 高清动漫视频。${animeData.titleJapanese ? animeData.titleJapanese : ''}`;

          const keywords = animeData.tags
            ? `${animeData.title},${animeData.tags.map(t => t.name).join(',')},动漫,在线观看`
            : `${animeData.title},动漫,在线观看`;

          // Update title
          document.title = title;

          // Update or create meta tags
          const updateOrCreateMeta = (selector: string, attribute: string, content: string) => {
            let meta = document.querySelector(selector);
            if (meta) {
              meta.setAttribute(attribute, content);
            } else {
              meta = document.createElement('meta');
              if (selector.includes('property')) {
                meta.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
              } else {
                meta.setAttribute('name', selector.match(/name="([^"]+)"/)?.[1] || '');
              }
              meta.setAttribute('content', content);
              document.head.appendChild(meta);
            }
          };

          // Basic meta tags
          updateOrCreateMeta('meta[name="description"]', 'content', description);
          updateOrCreateMeta('meta[name="keywords"]', 'content', keywords);

          // Open Graph tags
          updateOrCreateMeta('meta[property="og:title"]', 'content', title);
          updateOrCreateMeta('meta[property="og:description"]', 'content', description);
          updateOrCreateMeta('meta[property="og:type"]', 'content', 'video.other');
          updateOrCreateMeta('meta[property="og:url"]', 'content', `https://anime.ixacg.top/watch/${id}`);
          if (animeData.cover) {
            updateOrCreateMeta('meta[property="og:image"]', 'content', animeData.cover);
          }
          if (animeData.videoUrl) {
            updateOrCreateMeta('meta[property="og:video"]', 'content', animeData.videoUrl);
          }

          // Twitter Card tags
          updateOrCreateMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
          updateOrCreateMeta('meta[name="twitter:title"]', 'content', title);
          updateOrCreateMeta('meta[name="twitter:description"]', 'content', description);
          if (animeData.cover) {
            updateOrCreateMeta('meta[name="twitter:image"]', 'content', animeData.cover);
          }

          // Update canonical URL
          let canonical = document.querySelector('link[rel="canonical"]');
          if (canonical) {
            canonical.setAttribute('href', `https://anime.ixacg.top/watch/${id}`);
          } else {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            canonical.setAttribute('href', `https://anime.ixacg.top/watch/${id}`);
            document.head.appendChild(canonical);
          }
        } catch (error) {
          console.error(error);
          setError(error instanceof Error ? error.message : 'Failed to load anime');
        }
      };

      fetchData();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [id]);

  if (error) return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="gap-2" onClick={handleBack}>
          <ArrowLeft size={16} /> Back to Browse
        </Button>
      </div>
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle size={32} />
          <p className="text-lg font-medium">{error}</p>
        </div>
        <Button variant="outline" onClick={handleBack}>Go Back</Button>
      </div>
    </div>
  );

  if (!anime) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-primary/30 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-muted-foreground text-sm">Loading anime...</p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4">
       <div className="mb-4 sm:mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
         <Button variant="ghost" size="sm" className="gap-2 pl-2 hover:pl-3 transition-all group" onClick={handleBack}>
           <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
           <span>Back to Browse</span>
         </Button>
       </div>

       <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
         <div className="lg:col-span-2 space-y-6 sm:space-y-8">
           {/* Player */}
           <div className="rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 group relative animate-in fade-in slide-in-from-bottom-4 duration-700">
             <AspectRatio ratio={16 / 9}>
               <video
                 src={anime.videoUrl}
                 className="w-full h-full object-contain bg-black"
                 controls
                 autoPlay
                 poster={anime.cover || undefined}
               >
                 Your browser does not support the video tag.
               </video>
             </AspectRatio>
           </div>

           <div className="space-y-6">
             {/* Fanart Gallery */}
             {anime.fanart && (
               <div className="space-y-3 sm:space-y-4">
                 <h3 className="text-lg sm:text-xl font-bold">Gallery</h3>

                 {/* Grid Layout */}
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                   {anime.fanart.split(',').map((url, index) => {
                     const cleanUrl = url.trim();
                     if (!cleanUrl) return null;

                     return (
                      <div 
                        key={index} 
                        className="aspect-video rounded-lg overflow-hidden shadow-md border border-border/50 group relative cursor-pointer hover:shadow-xl hover:border-primary/50 transition-all duration-300"
                        onClick={() => setLightBoxImage(cleanUrl)}
                      >
                        <img
                          src={cleanUrl} 
                          alt={`Fanart ${index + 1}`} 
                          className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                            <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg transform group-hover:scale-110" size={32} />
                         </div>
                      </div>
                     );
                   })}
                 </div>
               </div>
             )}

             {/* Info */}
             <div className="space-y-3 sm:space-y-4">
               <div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2">{anime.title}</h1>
                  {anime.titleJapanese && (
                    <p className="text-base sm:text-lg text-primary font-medium mb-1">{anime.titleJapanese}</p>
                  )}
                  {anime.titleEnglish && (
                    <p className="text-sm sm:text-base text-muted-foreground">{anime.titleEnglish}</p>
                  )}
               </div>

               <div className="bg-card/50 backdrop-blur rounded-lg p-6 border text-sm text-card-foreground shadow-sm">
                 <h3 className="font-semibold mb-2 text-lg">Description</h3>
                 <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
                   {anime.description
                     ? anime.description.replace(/\\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
                     : 'No description available for this anime.'}
                 </p>
               </div>
             </div>

             {/* Similar / Recommendations */}
             {similar.length > 0 && (
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-bold">You might also like</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {similar.map(s => {
                      // Helper function to get random fanart or fallback to cover
                      const getDisplayImage = () => {
                        if (s.fanart) {
                          const fanartUrls = s.fanart.split(',').map(url => url.trim()).filter(url => url);
                          if (fanartUrls.length > 0) {
                            const randomIndex = Math.floor(Math.random() * fanartUrls.length);
                            return fanartUrls[randomIndex];
                          }
                        }
                        return s.cover || '';
                      };

                      return (
                        <Link key={s.id} to={`/watch/${s.id}`} className="group block">
                          <div className="rounded-lg overflow-hidden border bg-card text-card-foreground shadow-sm hover:shadow-lg hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1">
                            <AspectRatio ratio={16/9}>
                              <div className="relative w-full h-full">
                                <img
                                  src={getDisplayImage()}
                                  className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                                  alt={s.title}
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-16">
                                  <h4 className="font-semibold text-white text-sm line-clamp-1 drop-shadow-lg" title={s.title}>{s.title}</h4>
                                </div>
                              </div>
                            </AspectRatio>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
             )}
           </div>
         </div>

         <div className="space-y-6">
           {/* Tags */}
           {anime.tags && anime.tags.length > 0 && (
             <div className="bg-card rounded-lg p-5 border shadow-sm">
               <h3 className="font-semibold mb-4 text-lg">Tags</h3>
               <div className="flex flex-wrap gap-2">
                 {anime.tags.map(tag => (
                   <Link key={tag.id} to={`/?tag=${tag.id}&tagName=${encodeURIComponent(tag.name)}`}>
                     <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                       {tag.name}
                     </div>
                   </Link>
                 ))}
               </div>
             </div>
           )}
         </div>
       </div>
       
       {/* Lightbox Overlay */}
       {lightBoxImage && (
         <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setLightBoxImage(null)}
         >
           <Button 
              className="absolute top-4 right-4 rounded-full" 
              size="icon" 
              variant="secondary"
              onClick={() => setLightBoxImage(null)}
           >
             <X className="h-6 w-6" />
           </Button>
           <img 
             src={lightBoxImage} 
             alt="Full size fanart" 
             className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl"
             referrerPolicy="no-referrer"
             onClick={(e) => e.stopPropagation()} // Prevent close when clicking image
           />
         </div>
       )}
    </div>
  );
}
