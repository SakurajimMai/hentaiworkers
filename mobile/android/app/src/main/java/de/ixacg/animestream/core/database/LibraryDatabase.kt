package de.ixacg.animestream.core.database

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import de.ixacg.animestream.core.model.AnimeFavorite
import de.ixacg.animestream.core.model.AnimeHistory
import de.ixacg.animestream.core.model.MangaFavorite
import de.ixacg.animestream.core.model.MangaHistory

@Entity(tableName = "anime_favorites", indices = [Index(value = ["favoritedAt"])])
data class AnimeFavoriteEntity(
    @PrimaryKey val id: Long,
    val title: String,
    val cover: String?,
    val titleJapanese: String?,
    val releaseYear: Int?,
    val favoritedAt: Long,
)

@Entity(tableName = "manga_favorites", indices = [Index(value = ["favoritedAt"])])
data class MangaFavoriteEntity(
    @PrimaryKey val id: Long,
    val title: String,
    val coverUrl: String?,
    val author: String?,
    val favoritedAt: Long,
)

@Entity(tableName = "anime_history", indices = [Index(value = ["watchedAt"])])
data class AnimeHistoryEntity(
    @PrimaryKey val id: Long,
    val title: String,
    val cover: String?,
    val titleJapanese: String?,
    val watchedAt: Long,
)

@Entity(tableName = "manga_history", indices = [Index(value = ["readAt"])])
data class MangaHistoryEntity(
    @PrimaryKey val id: Long,
    val title: String,
    val coverUrl: String?,
    val chapterNumber: Double,
    val pageIndex: Int,
    val readAt: Long,
)

@Dao
interface LibraryDao {
    @Query("SELECT * FROM anime_favorites ORDER BY favoritedAt DESC")
    suspend fun animeFavorites(): List<AnimeFavoriteEntity>

    @Query("SELECT * FROM manga_favorites ORDER BY favoritedAt DESC")
    suspend fun mangaFavorites(): List<MangaFavoriteEntity>

    @Query("SELECT * FROM anime_history ORDER BY watchedAt DESC LIMIT 50")
    suspend fun animeHistory(): List<AnimeHistoryEntity>

    @Query("SELECT * FROM manga_history ORDER BY readAt DESC LIMIT 50")
    suspend fun mangaHistory(): List<MangaHistoryEntity>

    @Query("SELECT * FROM anime_favorites WHERE id = :id")
    suspend fun animeFavorite(id: Long): AnimeFavoriteEntity?

    @Query("SELECT * FROM manga_favorites WHERE id = :id")
    suspend fun mangaFavorite(id: Long): MangaFavoriteEntity?

    @Query("SELECT * FROM anime_history WHERE id = :id")
    suspend fun animeHistory(id: Long): AnimeHistoryEntity?

    @Query("SELECT * FROM manga_history WHERE id = :id")
    suspend fun mangaHistory(id: Long): MangaHistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putAnimeFavorite(value: AnimeFavoriteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMangaFavorite(value: MangaFavoriteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putAnimeHistory(value: AnimeHistoryEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMangaHistory(value: MangaHistoryEntity)

    @Query("DELETE FROM anime_favorites WHERE id = :id")
    suspend fun deleteAnimeFavorite(id: Long)

    @Query("DELETE FROM manga_favorites WHERE id = :id")
    suspend fun deleteMangaFavorite(id: Long)

    @Query("DELETE FROM anime_history WHERE id = :id")
    suspend fun deleteAnimeHistory(id: Long)

    @Query("DELETE FROM manga_history WHERE id = :id")
    suspend fun deleteMangaHistory(id: Long)

    @Query("DELETE FROM anime_history")
    suspend fun clearAnimeHistory()

    @Query("DELETE FROM manga_history")
    suspend fun clearMangaHistory()

    @Query(
        "DELETE FROM anime_history WHERE id NOT IN " +
            "(SELECT id FROM anime_history ORDER BY watchedAt DESC LIMIT 50)",
    )
    suspend fun trimAnimeHistory()

    @Query(
        "DELETE FROM manga_history WHERE id NOT IN " +
            "(SELECT id FROM manga_history ORDER BY readAt DESC LIMIT 50)",
    )
    suspend fun trimMangaHistory()
}

@Database(
    entities = [
        AnimeFavoriteEntity::class,
        MangaFavoriteEntity::class,
        AnimeHistoryEntity::class,
        MangaHistoryEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class LibraryDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao

    companion object {
        fun create(context: Context): LibraryDatabase =
            Room.databaseBuilder(
                context.applicationContext,
                LibraryDatabase::class.java,
                "animestream-native.db",
            ).build()
    }
}

fun AnimeFavoriteEntity.asModel() = AnimeFavorite(id, title, cover, titleJapanese, releaseYear, favoritedAt)

fun MangaFavoriteEntity.asModel() = MangaFavorite(id, title, coverUrl, author, favoritedAt)

fun AnimeHistoryEntity.asModel() = AnimeHistory(id, title, cover, titleJapanese, watchedAt)

fun MangaHistoryEntity.asModel() = MangaHistory(id, title, coverUrl, chapterNumber, pageIndex, readAt)
