package de.ixacg.animestream.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import de.ixacg.animestream.core.network.SessionCookieStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LegacyStorageMigratorTest {
    private lateinit var context: Context
    private lateinit var database: LibraryDatabase

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.deleteDatabase("RKStorage")
        database = Room.inMemoryDatabaseBuilder(context, LibraryDatabase::class.java).build()
    }

    @After
    fun tearDown() {
        database.close()
        context.deleteDatabase("RKStorage")
    }

    @Test
    fun `migration is idempotent preserves newer native rows and keeps old database`() =
        runTest {
            val source = context.openOrCreateDatabase("RKStorage", Context.MODE_PRIVATE, null)
            source.execSQL("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            source.execSQL(
                "INSERT INTO catalystLocalStorage(key,value) VALUES (?,?)",
                arrayOf(
                    LegacyPayloadParser.AUTH_COOKIE,
                    "animestream_session=legacy-token",
                ),
            )
            source.execSQL(
                "INSERT INTO catalystLocalStorage(key,value) VALUES (?,?)",
                arrayOf(
                    LegacyPayloadParser.ANIME_FAVORITES,
                    """[{"id":4,"title":"Legacy","favoritedAt":1000}]""",
                ),
            )
            source.execSQL(
                "INSERT INTO catalystLocalStorage(key,value) VALUES (?,?)",
                arrayOf(
                    LegacyPayloadParser.MANGA_HISTORY,
                    """[{"id":8,"title":"Manga","chapterNumber":3,"pageIndex":6,"readAt":2000},{"id":"bad"}]""",
                ),
            )
            source.close()

            withContext(Dispatchers.IO) {
                database.libraryDao().putAnimeFavorite(
                    AnimeFavoriteEntity(
                        id = 4,
                        title = "Native newer",
                        cover = null,
                        titleJapanese = null,
                        releaseYear = null,
                        favoritedAt = 5_000,
                    ),
                )
            }
            val cookieStore =
                SessionCookieStore(
                    context,
                    "https://www.ixacg.de/".toHttpUrl(),
                    backgroundScope,
                )
            cookieStore.clear()
            cookieStore.setMigrationVersionForTest(0)
            val migrator = LegacyStorageMigrator(context, database, cookieStore)

            migrator.migrateIfNeeded()
            migrator.migrateIfNeeded()

            val favorite = withContext(Dispatchers.IO) { database.libraryDao().animeFavorite(4) }
            val history = withContext(Dispatchers.IO) { database.libraryDao().mangaHistory() }
            assertEquals("Native newer", favorite?.title)
            assertEquals(1, history.size)
            assertEquals(6, history.single().pageIndex)
            assertEquals("animestream_session=legacy-token", cookieStore.currentHeader())
            assertEquals(1, cookieStore.migrationVersion())
            assertTrue(context.getDatabasePath("RKStorage").exists())
        }

    @Test
    fun `migration does not overwrite a persisted native cookie after restart`() =
        runTest {
            val source = context.openOrCreateDatabase("RKStorage", Context.MODE_PRIVATE, null)
            source.execSQL("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            source.execSQL(
                "INSERT INTO catalystLocalStorage(key,value) VALUES (?,?)",
                arrayOf(
                    LegacyPayloadParser.AUTH_COOKIE,
                    "animestream_session=legacy-token",
                ),
            )
            source.close()

            val origin = "https://www.ixacg.de/".toHttpUrl()
            val initialCookieStore = SessionCookieStore(context, origin, backgroundScope)
            initialCookieStore.clear()
            initialCookieStore.importLegacyCookie("animestream_session=native-token")
            initialCookieStore.setMigrationVersionForTest(0)

            val restartedCookieStore = SessionCookieStore(context, origin, backgroundScope)
            LegacyStorageMigrator(context, database, restartedCookieStore).migrateIfNeeded()

            assertEquals("animestream_session=native-token", restartedCookieStore.currentHeader())
            assertEquals(1, restartedCookieStore.migrationVersion())
        }
}
