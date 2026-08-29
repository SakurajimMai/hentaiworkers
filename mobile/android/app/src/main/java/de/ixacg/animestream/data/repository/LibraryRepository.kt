package de.ixacg.animestream.data.repository

import androidx.room.withTransaction
import de.ixacg.animestream.core.database.AnimeFavoriteEntity
import de.ixacg.animestream.core.database.AnimeHistoryEntity
import de.ixacg.animestream.core.database.LibraryDatabase
import de.ixacg.animestream.core.database.MangaFavoriteEntity
import de.ixacg.animestream.core.database.MangaHistoryEntity
import de.ixacg.animestream.core.database.asModel
import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.AnimeFavorite
import de.ixacg.animestream.core.model.AnimeHistory
import de.ixacg.animestream.core.model.FavoriteBody
import de.ixacg.animestream.core.model.LibrarySnapshot
import de.ixacg.animestream.core.model.MangaFavorite
import de.ixacg.animestream.core.model.MangaHistory
import de.ixacg.animestream.core.model.MangaMergeBody
import de.ixacg.animestream.core.model.MangaMergeRow
import de.ixacg.animestream.core.model.MangaProgressBody
import de.ixacg.animestream.core.model.MangaSummary
import de.ixacg.animestream.core.model.WatchMergeBody
import de.ixacg.animestream.core.model.WatchMergeRow
import de.ixacg.animestream.core.model.WatchProgressBody
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.ApiError
import de.ixacg.animestream.core.network.apiCall
import de.ixacg.animestream.core.network.requireSuccessful
import java.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

class LibraryRepository(
    private val database: LibraryDatabase,
    private val api: AnimeStreamApi,
    private val session: SessionRepository,
) {
    private val dao = database.libraryDao()

    suspend fun snapshot(): LibrarySnapshot {
        val local = localSnapshot()
        if (!isLoggedIn()) return local
        return try {
            coroutineScope {
                val favorites = async { apiCall { api.favorites() } }
                val watch = async { apiCall { api.watchProgress() } }
                val manga = async { apiCall { api.mangaProgress() } }
                val remoteFavorites = favorites.await()
                LibrarySnapshot(
                    animeFavorites =
                        remoteFavorites.animes.map {
                            AnimeFavorite(it.id, it.title, it.cover, favoritedAt = cloudTime(it.favoritedAt))
                        },
                    mangaFavorites =
                        remoteFavorites.mangas.map {
                            MangaFavorite(it.id, it.title, it.coverUrl, favoritedAt = cloudTime(it.favoritedAt))
                        },
                    animeHistory =
                        watch.await().data.map {
                            AnimeHistory(it.animeId, it.title, it.cover, watchedAt = cloudTime(it.lastWatchedAt))
                        },
                    mangaHistory =
                        manga.await().data.map {
                            MangaHistory(
                                id = it.mangaId,
                                title = it.title,
                                coverUrl = it.coverUrl,
                                chapterNumber = it.chapterNumber,
                                pageIndex = it.pageIndex,
                                readAt = cloudTime(it.lastReadAt),
                            )
                        },
                )
            }
        } catch (_: Throwable) {
            local
        }
    }

    suspend fun isAnimeFavorite(id: Long): Boolean =
        if (isLoggedIn()) {
            runCatching { apiCall { api.favorites() }.animes.any { it.id == id } }
                .getOrElse { dao.animeFavorite(id) != null }
        } else {
            dao.animeFavorite(id) != null
        }

    suspend fun isMangaFavorite(id: Long): Boolean =
        if (isLoggedIn()) {
            runCatching { apiCall { api.favorites() }.mangas.any { it.id == id } }
                .getOrElse { dao.mangaFavorite(id) != null }
        } else {
            dao.mangaFavorite(id) != null
        }

    suspend fun toggleAnimeFavorite(anime: Anime): Boolean {
        if (isLoggedIn()) {
            try {
                val favorited = apiCall { api.setFavorite(FavoriteBody("anime", anime.id)) }.favorited
                setLocalAnimeFavorite(anime, favorited)
                return favorited
            } catch (error: ApiError) {
                if (error.status !in listOf(401, 403)) throw error
            }
        }
        val favorited = dao.animeFavorite(anime.id) == null
        setLocalAnimeFavorite(anime, favorited)
        return favorited
    }

    suspend fun toggleMangaFavorite(manga: MangaSummary): Boolean {
        if (isLoggedIn()) {
            try {
                val favorited = apiCall { api.setFavorite(FavoriteBody("manga", manga.id)) }.favorited
                setLocalMangaFavorite(manga, favorited)
                return favorited
            } catch (error: ApiError) {
                if (error.status !in listOf(401, 403)) throw error
            }
        }
        val favorited = dao.mangaFavorite(manga.id) == null
        setLocalMangaFavorite(manga, favorited)
        return favorited
    }

    suspend fun removeFavorite(
        kind: String,
        id: Long,
    ) {
        if (isLoggedIn()) {
            try {
                apiCall { api.setFavorite(FavoriteBody(kind, id, false)) }
            } catch (error: ApiError) {
                if (error.status !in listOf(401, 403)) throw error
            }
        }
        if (kind == "anime") dao.deleteAnimeFavorite(id) else dao.deleteMangaFavorite(id)
    }

    suspend fun recordAnimeHistory(anime: Anime) {
        database.withTransaction {
            dao.putAnimeHistory(
                AnimeHistoryEntity(
                    id = anime.id,
                    title = anime.title,
                    cover = anime.cover,
                    titleJapanese = anime.titleJapanese,
                    watchedAt = System.currentTimeMillis(),
                ),
            )
            dao.trimAnimeHistory()
        }
        if (isLoggedIn()) {
            runCatching {
                apiCall { api.putWatchProgress(anime.id, WatchProgressBody(positionSeconds = 1)) }
                    .also(::requireSuccessful)
            }
        }
    }

    suspend fun recordMangaHistory(
        manga: MangaSummary,
        chapterNumber: Double,
        pageIndex: Int,
    ) {
        database.withTransaction {
            dao.putMangaHistory(
                MangaHistoryEntity(
                    id = manga.id,
                    title = manga.title,
                    coverUrl = manga.coverUrl,
                    chapterNumber = chapterNumber,
                    pageIndex = pageIndex.coerceAtLeast(0),
                    readAt = System.currentTimeMillis(),
                ),
            )
            dao.trimMangaHistory()
        }
        if (isLoggedIn()) {
            runCatching {
                apiCall {
                    api.putMangaProgress(
                        manga.id,
                        MangaProgressBody(chapterNumber, pageIndex.coerceAtLeast(0)),
                    )
                }.also(::requireSuccessful)
            }
        }
    }

    suspend fun removeHistory(
        kind: String,
        id: Long,
    ) {
        if (kind == "anime") {
            dao.deleteAnimeHistory(id)
            if (isLoggedIn()) {
                runCatching { apiCall { api.deleteWatchProgress(id) }.also(::requireSuccessful) }
            }
        } else {
            dao.deleteMangaHistory(id)
            if (isLoggedIn()) {
                runCatching { apiCall { api.deleteMangaProgress(id) }.also(::requireSuccessful) }
            }
        }
    }

    suspend fun clearHistory() {
        database.withTransaction {
            dao.clearAnimeHistory()
            dao.clearMangaHistory()
        }
        if (isLoggedIn()) {
            coroutineScope {
                listOf(
                    async { runCatching { apiCall { api.clearWatchProgress() }.also(::requireSuccessful) } },
                    async { runCatching { apiCall { api.clearMangaProgress() }.also(::requireSuccessful) } },
                ).awaitAll()
            }
        }
    }

    suspend fun syncAfterLogin() {
        val local = localSnapshot()
        coroutineScope {
            val jobs =
                local.animeFavorites.map { favorite ->
                    async { runCatching { apiCall { api.setFavorite(FavoriteBody("anime", favorite.id, true)) } } }
                } +
                    local.mangaFavorites.map { favorite ->
                        async { runCatching { apiCall { api.setFavorite(FavoriteBody("manga", favorite.id, true)) } } }
                    }
            jobs.awaitAll()
        }
        if (local.animeHistory.isNotEmpty()) {
            runCatching {
                val rows =
                    local.animeHistory.map {
                        WatchMergeRow(
                            animeId = it.id,
                            positionSeconds = 1,
                            durationSeconds = 0,
                            lastWatchedAt = Instant.ofEpochMilli(it.watchedAt).toString(),
                        )
                    }
                apiCall { api.mergeWatchProgress(WatchMergeBody(rows)) }.also(::requireSuccessful)
            }
        }
        if (local.mangaHistory.isNotEmpty()) {
            runCatching {
                val rows =
                    local.mangaHistory.map {
                        MangaMergeRow(
                            mangaId = it.id,
                            chapterNumber = it.chapterNumber,
                            pageIndex = it.pageIndex,
                            lastReadAt = Instant.ofEpochMilli(it.readAt).toString(),
                        )
                    }
                apiCall { api.mergeMangaProgress(MangaMergeBody(rows)) }.also(::requireSuccessful)
            }
        }
    }

    private suspend fun localSnapshot() =
        LibrarySnapshot(
            animeFavorites = dao.animeFavorites().map { it.asModel() },
            mangaFavorites = dao.mangaFavorites().map { it.asModel() },
            animeHistory = dao.animeHistory().map { it.asModel() },
            mangaHistory = dao.mangaHistory().map { it.asModel() },
        )

    private suspend fun setLocalAnimeFavorite(
        anime: Anime,
        favorited: Boolean,
    ) {
        if (!favorited) {
            dao.deleteAnimeFavorite(anime.id)
            return
        }
        dao.putAnimeFavorite(
            AnimeFavoriteEntity(
                id = anime.id,
                title = anime.title,
                cover = anime.cover,
                titleJapanese = anime.titleJapanese,
                releaseYear = anime.releaseYear,
                favoritedAt = System.currentTimeMillis(),
            ),
        )
    }

    private suspend fun setLocalMangaFavorite(
        manga: MangaSummary,
        favorited: Boolean,
    ) {
        if (!favorited) {
            dao.deleteMangaFavorite(manga.id)
            return
        }
        dao.putMangaFavorite(
            MangaFavoriteEntity(
                id = manga.id,
                title = manga.title,
                coverUrl = manga.coverUrl,
                author = manga.author,
                favoritedAt = System.currentTimeMillis(),
            ),
        )
    }

    private fun isLoggedIn() = session.state.value.user != null

    private fun cloudTime(value: String?): Long = runCatching { value?.let(Instant::parse)?.toEpochMilli() }.getOrNull() ?: System.currentTimeMillis()
}
