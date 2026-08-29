package de.ixacg.animestream.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Tag(
    val id: Long,
    val name: String,
    val description: String? = null,
    val count: Int? = null,
)

@Serializable
data class Anime(
    val id: Long,
    val title: String,
    val titleEnglish: String? = null,
    val titleJapanese: String? = null,
    val description: String? = null,
    val cover: String? = null,
    val fanart: String? = null,
    val videoUrl: String? = null,
    val releaseYear: Int? = null,
    val releaseDate: String? = null,
    val viewCount: Long? = null,
    val favoriteCount: Long? = null,
    val isActive: Int? = null,
    val categoryId: Long? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val tags: List<Tag> = emptyList(),
)

@Serializable
data class Pagination(
    val page: Int = 1,
    val limit: Int = 24,
    val total: Int = 0,
    val totalPages: Int = 1,
)

@Serializable
data class AnimeListResponse(
    val data: List<Anime> = emptyList(),
    val pagination: Pagination = Pagination(),
)

@Serializable
data class AuthUser(
    val id: Long,
    val username: String,
    val displayName: String? = null,
    val role: String = "user",
)

enum class MangaRank(val wireValue: String, val label: String) {
    Latest("", "最近更新"),
    Day("day", "日榜"),
    Week("week", "周榜"),
    Month("month", "月榜"),
    All("all", "总榜"),
}

@Serializable
data class MangaSummary(
    val id: Long,
    val slug: String = "",
    val title: String,
    val author: String? = null,
    val tags: List<String> = emptyList(),
    val description: String? = null,
    val coverUrl: String? = null,
    val chapterCount: Int = 0,
    val pageCount: Int = 0,
    val updatedAt: String? = null,
)

@Serializable
data class MangaChapterSummary(
    val id: Long,
    val number: Double,
    val title: String? = null,
    val pageCount: Int = 0,
)

@Serializable
data class MangaDetail(
    val id: Long,
    val slug: String = "",
    val title: String,
    val author: String? = null,
    val tags: List<String> = emptyList(),
    val description: String? = null,
    val coverUrl: String? = null,
    val chapterCount: Int = 0,
    val pageCount: Int = 0,
    val updatedAt: String? = null,
    val chapters: List<MangaChapterSummary> = emptyList(),
) {
    fun asSummary() =
        MangaSummary(
            id = id,
            slug = slug,
            title = title,
            author = author,
            tags = tags,
            description = description,
            coverUrl = coverUrl,
            chapterCount = chapterCount,
            pageCount = pageCount,
            updatedAt = updatedAt,
        )
}

@Serializable
data class MangaPage(
    val index: Int,
    val imageUrl: String,
)

@Serializable
data class MangaChapterDetail(
    val id: Long,
    val number: Double,
    val title: String? = null,
    val pageCount: Int = 0,
    val pages: List<MangaPage> = emptyList(),
)

@Serializable
data class MangaListResponse(
    val data: List<MangaSummary> = emptyList(),
    val pagination: Pagination = Pagination(),
)

@Serializable
data class MangaChapterResponse(
    val manga: MangaChapterManga,
    val chapter: MangaChapterDetail,
)

@Serializable
data class MangaChapterManga(
    val id: Long,
    val title: String,
    val coverUrl: String? = null,
)

@Serializable
data class FeedAdSlot(
    val enabled: Boolean = false,
    val name: String = "",
    val interval: Int = 5,
    val href: String = "",
    val html: String = "",
)

@Serializable
data class ReaderAdSlot(
    val enabled: Boolean = false,
    val html: String = "",
    val interval: Int = 5,
)

@Serializable
data class PlayerPreRollAd(
    val enabled: Boolean = false,
    val videoUrl: String = "",
    val imageUrl: String = "",
    val html: String = "",
    val clickUrl: String = "",
    val playDuration: Int = 5,
    val totalDuration: Int = 10,
    val muted: Boolean = true,
)

@Serializable
data class PlayerPauseAd(
    val enabled: Boolean = false,
    val videoUrl: String = "",
    val imageUrl: String = "",
    val html: String = "",
    val clickUrl: String = "",
    val muted: Boolean = true,
)

@Serializable
data class ReaderAds(
    val top: ReaderAdSlot = ReaderAdSlot(),
    val middle: ReaderAdSlot = ReaderAdSlot(),
    val bottom: ReaderAdSlot = ReaderAdSlot(),
)

@Serializable
data class PlayerAds(
    val preRollAd: PlayerPreRollAd = PlayerPreRollAd(),
    val pauseAd: PlayerPauseAd = PlayerPauseAd(),
)

@Serializable
data class PublicAdsConfig(
    val feedSlots: List<FeedAdSlot> = emptyList(),
    val reader: ReaderAds = ReaderAds(),
    val player: PlayerAds = PlayerAds(),
) {
    companion object {
        val Empty = PublicAdsConfig()
    }
}

@Serializable
data class UserEnvelope(
    val user: AuthUser? = null,
    val error: String? = null,
)

@Serializable
data class CloudFavoriteAnime(
    val id: Long,
    val title: String,
    val cover: String? = null,
    val favoritedAt: String? = null,
)

@Serializable
data class CloudFavoriteManga(
    val id: Long,
    val title: String,
    val coverUrl: String? = null,
    val favoritedAt: String? = null,
)

@Serializable
data class FavoritesEnvelope(
    val animes: List<CloudFavoriteAnime> = emptyList(),
    val mangas: List<CloudFavoriteManga> = emptyList(),
)

@Serializable
data class FavoriteResult(val favorited: Boolean)

@Serializable
data class CloudWatchItem(
    val animeId: Long,
    val title: String,
    val cover: String? = null,
    val lastWatchedAt: String,
    val positionSeconds: Long = 0,
    val durationSeconds: Long = 0,
    val completed: Boolean = false,
)

@Serializable
data class WatchProgressEnvelope(val data: List<CloudWatchItem> = emptyList())

@Serializable
data class CloudMangaProgressItem(
    val mangaId: Long,
    val title: String,
    val coverUrl: String? = null,
    val chapterNumber: Double,
    val pageIndex: Int = 0,
    val lastReadAt: String,
)

@Serializable
data class MangaProgressEnvelope(val data: List<CloudMangaProgressItem> = emptyList())

@Serializable
data class LoginBody(val emailOrUsername: String, val password: String)

@Serializable
data class FavoriteBody(
    val kind: String,
    val id: Long,
    val favorited: Boolean? = null,
)

@Serializable
data class WatchProgressBody(
    val positionSeconds: Long,
    val durationSeconds: Long = 0,
    val completed: Boolean = false,
)

@Serializable
data class WatchMergeRow(
    val animeId: Long,
    val positionSeconds: Long,
    val durationSeconds: Long,
    val lastWatchedAt: String? = null,
)

@Serializable
data class WatchMergeBody(val rows: List<WatchMergeRow>)

@Serializable
data class MangaProgressBody(
    val chapterNumber: Double,
    val pageIndex: Int = 0,
)

@Serializable
data class MangaMergeRow(
    val mangaId: Long,
    val chapterNumber: Double,
    val pageIndex: Int = 0,
    val lastReadAt: String? = null,
)

@Serializable
data class MangaMergeBody(val rows: List<MangaMergeRow>)

data class AnimeFavorite(
    val id: Long,
    val title: String,
    val cover: String?,
    val titleJapanese: String? = null,
    val releaseYear: Int? = null,
    val favoritedAt: Long,
)

data class MangaFavorite(
    val id: Long,
    val title: String,
    val coverUrl: String?,
    val author: String? = null,
    val favoritedAt: Long,
)

data class AnimeHistory(
    val id: Long,
    val title: String,
    val cover: String?,
    val titleJapanese: String? = null,
    val watchedAt: Long,
)

data class MangaHistory(
    val id: Long,
    val title: String,
    val coverUrl: String?,
    val chapterNumber: Double,
    val pageIndex: Int = 0,
    val readAt: Long,
)

data class LibrarySnapshot(
    val animeFavorites: List<AnimeFavorite> = emptyList(),
    val mangaFavorites: List<MangaFavorite> = emptyList(),
    val animeHistory: List<AnimeHistory> = emptyList(),
    val mangaHistory: List<MangaHistory> = emptyList(),
)
