import { actionToggleFavorite } from '@/app/(site)/auth/actions';

export function FavoriteButton({
  animeId,
  favorited,
  returnTo,
}: {
  animeId: number;
  favorited: boolean;
  returnTo: string;
}) {
  return (
    <form action={actionToggleFavorite}>
      <input type="hidden" name="animeId" value={animeId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        aria-pressed={favorited}
        className={
          favorited
            ? 'inline-flex items-center gap-1.5 rounded-full bg-[#fce8e6] px-3 py-1.5 font-ui text-[12px] font-medium text-[#c5221f] transition active:scale-[0.98]'
            : 'inline-flex items-center gap-1.5 rounded-full border border-[#e8e4dc] bg-white px-3 py-1.5 font-ui text-[12px] font-medium text-[#444] transition hover:border-[#1a1917]/20 hover:bg-[#fbfaf7] active:scale-[0.98]'
        }
      >
        <span aria-hidden>{favorited ? '♥' : '♡'}</span>
        {favorited ? '已收藏' : '收藏'}
      </button>
    </form>
  );
}
