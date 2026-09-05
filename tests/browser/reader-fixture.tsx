import { createRoot } from 'react-dom/client';
import { MangaReader } from '@/components/manga-reader';

const params = new URLSearchParams(window.location.search);
const run = params.get('run') || 'default';
const pageCount = Number(params.get('count') || 80);
const initialPage = Number(params.get('initial') || 0);
const omittedPages = new Set((params.get('omitted') || '').split(',').filter(Boolean).map(Number));
const session = Promise.resolve({ available: true, authenticated: params.get('guest') !== '1' });
const favorite = Promise.resolve({ available: true, favorited: false });
const readerAds = Promise.resolve({
  topHtml: `<img src="/ad/${run}/top.png" width="640" height="72" alt="Test ad" />`,
  bottomHtml: `<img src="/ad/${run}/bottom.png" width="640" height="72" alt="Test ad" />`,
});
const restored = params.get('restored');
if (restored !== null) localStorage.setItem('manga-progress:42:1', restored);

const root = createRoot(document.getElementById('root')!);
function render(chapterNumber: number) {
  root.render(
    <MangaReader
      title="Reader timing fixture"
      mangaId={42}
      chapterNumber={chapterNumber}
      pageCount={pageCount}
      pages={Array.from({ length: pageCount }, (_, index) => ({
        index,
        imageUrl: `/images/${run}/${chapterNumber}/${index}.png`,
      })).filter((page) => !omittedPages.has(page.index))}
      initialPage={chapterNumber === 1 ? initialPage : 0}
      session={session}
      favorite={favorite}
      readerAds={readerAds}
    />,
  );
}
Object.assign(window, { readerFixture: { changeChapter: render, unmount: () => root.unmount() } });
render(1);
