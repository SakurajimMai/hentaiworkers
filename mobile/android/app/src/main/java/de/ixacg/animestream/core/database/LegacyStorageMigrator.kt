package de.ixacg.animestream.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.withTransaction
import de.ixacg.animestream.core.network.SessionCookieStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LegacyStorageMigrator(
    private val context: Context,
    private val database: LibraryDatabase,
    private val cookieStore: SessionCookieStore,
) {
    suspend fun migrateIfNeeded() =
        withContext(Dispatchers.IO) {
            if (cookieStore.migrationVersion() >= CURRENT_VERSION) return@withContext
            val legacyFile = context.getDatabasePath(LEGACY_DATABASE)
            if (!legacyFile.exists()) {
                cookieStore.markMigrationComplete(CURRENT_VERSION)
                return@withContext
            }

            val values = readLegacyValues(legacyFile.absolutePath) ?: return@withContext
            val payload = LegacyPayloadParser.parse(values)
            database.withTransaction { importPayload(payload) }
            cookieStore.hydrate()
            if (cookieStore.currentHeader().isBlank()) {
                payload.cookie?.let { cookieStore.importLegacyCookie(it) }
            }
            cookieStore.markMigrationComplete(CURRENT_VERSION)
        }

    private fun readLegacyValues(path: String): Map<String, String>? =
        runCatching {
            SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY).use { source ->
                val hasTable =
                    source.rawQuery(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                        arrayOf(LEGACY_TABLE),
                    ).use { it.moveToFirst() }
                if (!hasTable) return@use emptyMap()
                val placeholders = LegacyPayloadParser.knownKeys.joinToString(",") { "?" }
                source.rawQuery(
                    "SELECT key, value FROM $LEGACY_TABLE WHERE key IN ($placeholders)",
                    LegacyPayloadParser.knownKeys.toTypedArray(),
                ).use { cursor ->
                    buildMap {
                        while (cursor.moveToNext()) put(cursor.getString(0), cursor.getString(1))
                    }
                }
            }
        }.getOrNull()

    private suspend fun importPayload(payload: LegacyPayload) {
        val dao = database.libraryDao()
        payload.animeFavorites.forEach { value ->
            if ((dao.animeFavorite(value.id)?.favoritedAt ?: Long.MIN_VALUE) <= value.favoritedAt) {
                dao.putAnimeFavorite(value)
            }
        }
        payload.mangaFavorites.forEach { value ->
            if ((dao.mangaFavorite(value.id)?.favoritedAt ?: Long.MIN_VALUE) <= value.favoritedAt) {
                dao.putMangaFavorite(value)
            }
        }
        payload.animeHistory.forEach { value ->
            if ((dao.animeHistory(value.id)?.watchedAt ?: Long.MIN_VALUE) <= value.watchedAt) {
                dao.putAnimeHistory(value)
            }
        }
        payload.mangaHistory.forEach { value ->
            if ((dao.mangaHistory(value.id)?.readAt ?: Long.MIN_VALUE) <= value.readAt) {
                dao.putMangaHistory(value)
            }
        }
        dao.trimAnimeHistory()
        dao.trimMangaHistory()
    }

    private companion object {
        const val LEGACY_DATABASE = "RKStorage"
        const val LEGACY_TABLE = "catalystLocalStorage"
        const val CURRENT_VERSION = 1
    }
}
