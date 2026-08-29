package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.AnimeListResponse
import de.ixacg.animestream.core.model.MangaChapterResponse
import de.ixacg.animestream.core.model.MangaDetail
import de.ixacg.animestream.core.model.MangaListResponse
import de.ixacg.animestream.core.model.MangaRank
import de.ixacg.animestream.core.model.Tag
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.ApiError
import de.ixacg.animestream.core.network.apiCall
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

class CatalogRepository(private val api: AnimeStreamApi) {
    suspend fun animes(
        page: Int = 1,
        limit: Int = 24,
        tagId: Long? = null,
        search: String? = null,
        sort: String? = null,
    ): AnimeListResponse =
        apiCall {
            api.animes(
                page = page,
                limit = limit,
                tagId = tagId,
                search = search?.trim()?.takeIf(String::isNotEmpty),
                sort = sort,
            )
        }

    suspend fun anime(id: Long): Anime = apiCall { api.anime(id) }

    suspend fun similarAnimes(id: Long): List<Anime> = apiCall { api.similarAnimes(id) }

    suspend fun popularTags(limit: Int = 20): List<Tag> =
        try {
            apiCall { api.tags(limit) }
        } catch (error: ApiError) {
            if (error.status != 404) throw error
            aggregateTags(limit)
        }

    suspend fun mangas(
        page: Int = 1,
        limit: Int = 24,
        query: String? = null,
        tag: String? = null,
        rank: MangaRank = MangaRank.Latest,
    ): MangaListResponse =
        apiCall {
            api.mangas(
                page = page,
                limit = limit,
                query = query?.trim()?.takeIf(String::isNotEmpty),
                tag = tag?.trim()?.takeIf(String::isNotEmpty),
                rank = rank.wireValue.takeIf(String::isNotEmpty),
            )
        }

    suspend fun manga(id: Long): MangaDetail = apiCall { api.manga(id) }

    suspend fun chapter(
        id: Long,
        number: Double,
    ): MangaChapterResponse = apiCall { api.mangaChapter(id, number) }

    suspend fun mangaRecommendations(manga: MangaDetail): List<de.ixacg.animestream.core.model.MangaSummary> {
        val tag = manga.tags.firstOrNull()
        val ranked = mangas(page = 1, limit = 8, tag = tag).data.filterNot { it.id == manga.id }.take(6)
        if (ranked.size >= 6) return ranked
        val seen = ranked.mapTo(mutableSetOf()) { it.id }
        return (ranked + mangas(page = 1, limit = 8).data.filter { it.id != manga.id && seen.add(it.id) }).take(6)
    }

    private suspend fun aggregateTags(limit: Int): List<Tag> =
        coroutineScope {
            animes(page = 1, limit = 60).data.take(24)
                .map { anime -> async { runCatching { anime(anime.id) }.getOrNull() } }
                .awaitAll()
                .filterNotNull()
                .flatMap(Anime::tags)
                .groupBy(Tag::id)
                .map { (_, values) -> values.first().copy(count = values.size) }
                .sortedByDescending { it.count }
                .take(limit)
        }
}
