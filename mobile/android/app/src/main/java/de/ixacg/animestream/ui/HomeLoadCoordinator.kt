package de.ixacg.animestream.ui

import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.MangaSummary

internal data class HomeLoadUpdate(
    val state: Loadable<HomeContent>,
    val shouldLoadAds: Boolean,
)

internal fun shouldStartHomeLoad(
    hasContent: Boolean,
    loading: Boolean,
    active: Boolean,
): Boolean = !hasContent && !loading && !active

internal class HomeLoadCoordinator(private val previous: HomeContent?) {
    private var animeResult: Result<List<Anime>>? = null
    private var mangaResult: Result<List<MangaSummary>>? = null
    private var adsRequested = false

    fun animeCompleted(result: Result<List<Anime>>): HomeLoadUpdate {
        check(animeResult == null) { "Anime home request already completed" }
        animeResult = result
        return resolve(completedWithUsefulContent = result.getOrNull()?.isNotEmpty() == true)
    }

    fun mangaCompleted(result: Result<List<MangaSummary>>): HomeLoadUpdate {
        check(mangaResult == null) { "Manga home request already completed" }
        mangaResult = result
        return resolve(completedWithUsefulContent = result.getOrNull()?.isNotEmpty() == true)
    }

    private fun resolve(completedWithUsefulContent: Boolean): HomeLoadUpdate {
        val completed = animeResult != null && mangaResult != null
        val allRequestsSuccessful = animeResult?.isSuccess == true && mangaResult?.isSuccess == true
        val merged =
            HomeContent(
                animes = animeResult?.getOrNull() ?: previous?.animes.orEmpty(),
                mangas = mangaResult?.getOrNull() ?: previous?.mangas.orEmpty(),
            )
        val visibleContent = merged.takeIf(HomeContent::hasUsefulContent)
        val value =
            when {
                visibleContent != null -> merged
                !completed -> previous?.takeIf(HomeContent::hasUsefulContent)
                allRequestsSuccessful -> merged
                else -> null
            }
        val error =
            when {
                !completed -> null
                animeResult?.isFailure == true && mangaResult?.isFailure == true ->
                    animeResult?.exceptionOrNull()?.userMessage()
                        ?: mangaResult?.exceptionOrNull()?.userMessage()
                value?.hasUsefulContent() == true &&
                    (animeResult?.isFailure == true || mangaResult?.isFailure == true) ->
                    "部分内容暂时不可用，请重试"
                value?.hasUsefulContent() != true ->
                    animeResult?.exceptionOrNull()?.userMessage()
                        ?: mangaResult?.exceptionOrNull()?.userMessage()
                else -> null
            }
        val shouldLoadAds =
            !adsRequested &&
                (completedWithUsefulContent || (completed && allRequestsSuccessful))
        if (shouldLoadAds) adsRequested = true

        return HomeLoadUpdate(
            state = Loadable(value = value, loading = !completed, error = error),
            shouldLoadAds = shouldLoadAds,
        )
    }
}

private fun HomeContent.hasUsefulContent(): Boolean = animes.isNotEmpty() || mangas.isNotEmpty()
