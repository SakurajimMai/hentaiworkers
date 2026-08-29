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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient

class AppContainer(context: Context) {
    private val applicationContext = context.applicationContext
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val apiOrigin = "${MediaUrlNormalizer.origin}/".toHttpUrl()

    val cookieStore = SessionCookieStore(applicationContext, apiOrigin, applicationScope)
    val api = ApiClient.create(cookieStore)
    val database = LibraryDatabase.create(applicationContext)
    val sessionRepository = SessionRepository(api, cookieStore)
    val catalogRepository = CatalogRepository(api)
    val adsRepository = AdsRepository(api)
    val libraryRepository = LibraryRepository(database, api, sessionRepository)
    val legacyStorageMigrator = LegacyStorageMigrator(applicationContext, database, cookieStore)

    val imageLoader: ImageLoader =
        ImageLoader.Builder(applicationContext)
            .okHttpClient {
                OkHttpClient.Builder()
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
