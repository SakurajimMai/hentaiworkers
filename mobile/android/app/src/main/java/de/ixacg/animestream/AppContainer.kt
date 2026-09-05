package de.ixacg.animestream

import android.content.Context
import android.os.Build
import coil.ImageLoader
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import de.ixacg.animestream.core.database.LegacyStorageMigrator
import de.ixacg.animestream.core.database.LibraryDatabase
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.network.ApiClient
import de.ixacg.animestream.core.network.SessionCookieStore
import de.ixacg.animestream.data.repository.AdsRepository
import de.ixacg.animestream.data.repository.CatalogRepository
import de.ixacg.animestream.data.repository.LibraryRepository
import de.ixacg.animestream.data.repository.SessionRepository
import de.ixacg.animestream.data.repository.UpdateCheckStore
import de.ixacg.animestream.data.repository.UpdateRepository
import de.ixacg.animestream.reader.ReaderImageSingleFlight
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient

class AppContainer(context: Context) {
    internal val applicationContext = context.applicationContext
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val apiOrigin = "${MediaUrlNormalizer.origin}/".toHttpUrl()
    private val networkConnectionPool = ConnectionPool()
    private val networkDispatcher = Dispatcher()
    private val networkClient =
        OkHttpClient.Builder()
            .connectionPool(networkConnectionPool)
            .dispatcher(networkDispatcher)
            .build()

    val cookieStore = SessionCookieStore(applicationContext, apiOrigin, applicationScope)
    val api =
        ApiClient.create(
            cookieStore = cookieStore,
            connectionPool = networkConnectionPool,
            dispatcher = networkDispatcher,
            baseClient = networkClient,
        )
    val database = LibraryDatabase.create(applicationContext)
    val sessionRepository = SessionRepository(api, cookieStore)
    val catalogRepository = CatalogRepository(api)
    val adsRepository = AdsRepository(api)
    val updateCheckStore = UpdateCheckStore(applicationContext)
    val updateRepository = UpdateRepository(api, updateCheckStore, Build.SUPPORTED_ABIS.toList())
    val libraryRepository = LibraryRepository(database, api, sessionRepository)
    val legacyStorageMigrator = LegacyStorageMigrator(applicationContext, database, cookieStore)

    val imageLoader: ImageLoader =
        ImageLoader.Builder(applicationContext)
            .okHttpClient {
                networkClient.newBuilder()
                    .addInterceptor { chain ->
                        val builder = chain.request().newBuilder()
                        MediaUrlNormalizer.imageHeaders().forEach { (name, value) ->
                            builder.header(name, value)
                        }
                        chain.proceed(builder.build())
                    }
                    .build()
            }
            .components {
                add(ReaderImageSingleFlight.Factory())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    add(ImageDecoderDecoder.Factory())
                } else {
                    add(GifDecoder.Factory())
                }
            }
            .crossfade(true)
            .respectCacheHeaders(false)
            .build()
}
