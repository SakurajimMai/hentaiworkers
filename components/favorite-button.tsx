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
        className={
          favorited
            ? 'inline-flex items-center gap-1.5 rounded-full bg-[#FCE8E6] px-3 py-1.5 font-ui text-[12px] font-medium text-[#C5221F]'
            : 'inline-flex items-center gap-1.5 rounded-full border border-[#EAEAEA] bg-white px-3 py-1.5 font-ui text-[12px] font-medium text-[#444] hover:border-[#111]/20'
        }
      >
        <span aria-hidden>{favorited ? '♥' : '♡'}</span>
        {favorited ? '已收藏' : '收藏'}
      </button>
    </form>
  );
}
