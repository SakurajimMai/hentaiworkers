package de.ixacg.animestream.core.database

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

data class LegacyPayload(
    val cookie: String? = null,
    val animeHistory: List<AnimeHistoryEntity> = emptyList(),
    val animeFavorites: List<AnimeFavoriteEntity> = emptyList(),
    val mangaHistory: List<MangaHistoryEntity> = emptyList(),
    val mangaFavorites: List<MangaFavoriteEntity> = emptyList(),
)

object LegacyPayloadParser {
    const val AUTH_COOKIE = "@auth/cookie"
    const val ANIME_HISTORY = "@anime/history"
    const val ANIME_FAVORITES = "@anime/favorites"
    const val MANGA_HISTORY = "@manga/history"
    const val MANGA_FAVORITES = "@manga/favorites"
    val knownKeys = listOf(AUTH_COOKIE, ANIME_HISTORY, ANIME_FAVORITES, MANGA_HISTORY, MANGA_FAVORITES)

    private val json = Json { ignoreUnknownKeys = true }

    fun parse(
        values: Map<String, String>,
        now: () -> Long = System::currentTimeMillis,
    ): LegacyPayload =
        LegacyPayload(
            cookie = values[AUTH_COOKIE],
            animeHistory = parseArray(values[ANIME_HISTORY]) { animeHistory(it, now()) },
            animeFavorites = parseArray(values[ANIME_FAVORITES]) { animeFavorite(it, now()) },
            mangaHistory = parseArray(values[MANGA_HISTORY]) { mangaHistory(it, now()) },
            mangaFavorites = parseArray(values[MANGA_FAVORITES]) { mangaFavorite(it, now()) },
        )

    private fun <T> parseArray(
        raw: String?,
        transform: (JsonObject) -> T?,
    ): List<T> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            json.parseToJsonElement(raw).jsonArray.mapNotNull { element ->
                runCatching { transform(element.jsonObject) }.getOrNull()
            }
        }.getOrDefault(emptyList())
    }

    private fun animeHistory(
        item: JsonObject,
        now: Long,
    ): AnimeHistoryEntity? {
        val id = item.long("id") ?: return null
        val title = item.string("title")?.takeIf(String::isNotBlank) ?: return null
        return AnimeHistoryEntity(
            id = id,
            title = title,
            cover = item.string("cover"),
            titleJapanese = item.string("titleJapanese"),
            watchedAt = item.long("watchedAt")?.takeIf { it > 0 } ?: now,
        )
    }

    private fun animeFavorite(
        item: JsonObject,
        now: Long,
    ): AnimeFavoriteEntity? {
        val id = item.long("id") ?: return null
        val title = item.string("title")?.takeIf(String::isNotBlank) ?: return null
        return AnimeFavoriteEntity(
            id = id,
            title = title,
            cover = item.string("cover"),
            titleJapanese = item.string("titleJapanese"),
            releaseYear = item.int("releaseYear"),
            favoritedAt = item.long("favoritedAt")?.takeIf { it > 0 } ?: now,
        )
    }

    private fun mangaHistory(
        item: JsonObject,
        now: Long,
    ): MangaHistoryEntity? {
        val id = item.long("id") ?: return null
        val title = item.string("title")?.takeIf(String::isNotBlank) ?: return null
        val chapter = item.double("chapterNumber") ?: return null
        return MangaHistoryEntity(
            id = id,
            title = title,
            coverUrl = item.string("coverUrl"),
            chapterNumber = chapter,
            pageIndex = item.int("pageIndex")?.coerceAtLeast(0) ?: 0,
            readAt = item.long("readAt")?.takeIf { it > 0 } ?: now,
        )
    }

    private fun mangaFavorite(
        item: JsonObject,
        now: Long,
    ): MangaFavoriteEntity? {
        val id = item.long("id") ?: return null
        val title = item.string("title")?.takeIf(String::isNotBlank) ?: return null
        return MangaFavoriteEntity(
            id = id,
            title = title,
            coverUrl = item.string("coverUrl"),
            author = item.string("author"),
            favoritedAt = item.long("favoritedAt")?.takeIf { it > 0 } ?: now,
        )
    }

    private fun JsonObject.string(name: String): String? =
        get(name)?.nullablePrimitive()?.contentOrNull

    private fun JsonObject.long(name: String): Long? =
        get(name)?.nullablePrimitive()?.let { it.longOrNull ?: it.contentOrNull?.toLongOrNull() }

    private fun JsonObject.int(name: String): Int? =
        get(name)?.nullablePrimitive()?.let { it.intOrNull ?: it.contentOrNull?.toIntOrNull() }

    private fun JsonObject.double(name: String): Double? =
        get(name)?.nullablePrimitive()?.contentOrNull?.toDoubleOrNull()

    private fun JsonElement.nullablePrimitive() =
        runCatching { jsonPrimitive }.getOrNull()?.takeUnless { it.contentOrNull == null }
}
