package de.ixacg.animestream.core.network

import de.ixacg.animestream.BuildConfig
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.AnimeListResponse
import de.ixacg.animestream.core.model.AndroidUpdateManifest
import de.ixacg.animestream.core.model.FavoriteBody
import de.ixacg.animestream.core.model.FavoriteResult
import de.ixacg.animestream.core.model.FavoritesEnvelope
import de.ixacg.animestream.core.model.LoginBody
import de.ixacg.animestream.core.model.MangaChapterResponse
import de.ixacg.animestream.core.model.MangaDetail
import de.ixacg.animestream.core.model.MangaListResponse
import de.ixacg.animestream.core.model.MangaMergeBody
import de.ixacg.animestream.core.model.MangaProgressBody
import de.ixacg.animestream.core.model.MangaProgressEnvelope
import de.ixacg.animestream.core.model.PublicAdsConfig
import de.ixacg.animestream.core.model.Tag
import de.ixacg.animestream.core.model.UserEnvelope
import de.ixacg.animestream.core.model.WatchMergeBody
import de.ixacg.animestream.core.model.WatchProgressBody
import de.ixacg.animestream.core.model.WatchProgressEnvelope
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface AnimeStreamApi {
    @GET("api/android/update")
    suspend fun androidUpdate(): AndroidUpdateManifest

    @GET("api/animes")
    suspend fun animes(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("tag") tagId: Long? = null,
        @Query("search") search: String? = null,
        @Query("sort") sort: String? = null,
    ): AnimeListResponse

    @GET("api/animes/{id}")
    suspend fun anime(
        @Path("id") id: Long,
    ): Anime

    @GET("api/animes/{id}/similar")
    suspend fun similarAnimes(
        @Path("id") id: Long,
    ): List<Anime>

    @GET("api/tags")
    suspend fun tags(
        @Query("limit") limit: Int,
    ): List<Tag>

    @GET("api/mangas")
    suspend fun mangas(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("q") query: String? = null,
        @Query("tag") tag: String? = null,
        @Query("rank") rank: String? = null,
    ): MangaListResponse

    @GET("api/mangas/{id}")
    suspend fun manga(
        @Path("id") id: Long,
    ): MangaDetail

    @GET("api/mangas/{id}/chapters/{number}")
    suspend fun mangaChapter(
        @Path("id") id: Long,
        @Path("number") chapterNumber: Double,
    ): MangaChapterResponse

    @GET("api/ads")
    suspend fun ads(): PublicAdsConfig

    @POST("api/auth/login")
    suspend fun login(
        @Body body: LoginBody,
    ): UserEnvelope

    @POST("api/auth/logout")
    suspend fun logout(): Response<Unit>

    @GET("api/me")
    suspend fun me(): UserEnvelope

    @GET("api/me/favorites")
    suspend fun favorites(): FavoritesEnvelope

    @POST("api/me/favorites")
    suspend fun setFavorite(
        @Body body: FavoriteBody,
    ): FavoriteResult

    @GET("api/me/watch-progress")
    suspend fun watchProgress(
        @Query("limit") limit: Int = 50,
    ): WatchProgressEnvelope

    @PUT("api/me/watch-progress/{animeId}")
    suspend fun putWatchProgress(
        @Path("animeId") animeId: Long,
        @Body body: WatchProgressBody,
    ): Response<Unit>

    @POST("api/me/watch-progress")
    suspend fun mergeWatchProgress(
        @Body body: WatchMergeBody,
    ): Response<Unit>

    @DELETE("api/me/watch-progress/{animeId}")
    suspend fun deleteWatchProgress(
        @Path("animeId") animeId: Long,
    ): Response<Unit>

    @DELETE("api/me/watch-progress")
    suspend fun clearWatchProgress(): Response<Unit>

    @GET("api/me/manga-progress")
    suspend fun mangaProgress(
        @Query("limit") limit: Int = 50,
    ): MangaProgressEnvelope

    @PUT("api/me/manga-progress/{mangaId}")
    suspend fun putMangaProgress(
        @Path("mangaId") mangaId: Long,
        @Body body: MangaProgressBody,
    ): Response<Unit>

    @POST("api/me/manga-progress")
    suspend fun mergeMangaProgress(
        @Body body: MangaMergeBody,
    ): Response<Unit>

    @DELETE("api/me/manga-progress/{mangaId}")
    suspend fun deleteMangaProgress(
        @Path("mangaId") mangaId: Long,
    ): Response<Unit>

    @DELETE("api/me/manga-progress")
    suspend fun clearMangaProgress(): Response<Unit>
}

class ApiError(
    override val message: String,
    val status: Int,
) : IOException(message)

suspend fun <T> apiCall(request: suspend () -> T): T =
    try {
        request()
    } catch (error: HttpException) {
        if (error.code() in 500..599) {
            throw ApiError("服务器暂时不可用，请稍后重试", error.code())
        }
        throw ApiError(parseApiError(error), error.code())
    } catch (error: IOException) {
        if (error is ApiError) throw error
        val message =
            if (
                error is SocketTimeoutException ||
                (error is InterruptedIOException && error.message == "timeout")
            ) {
                "服务器响应超时，请检查网络后重试"
            } else {
                "网络连接失败，请检查网络后重试"
            }
        throw ApiError(message, 0)
    } catch (_: SerializationException) {
        throw ApiError("响应不是合法 JSON", 0)
    }

fun requireSuccessful(response: Response<Unit>) {
    if (!response.isSuccessful) {
        throw ApiError("请求失败：${response.code()}", response.code())
    }
}

internal fun parseApiError(error: HttpException): String {
    val fallback = "请求失败：${error.code()}"
    val raw = runCatching { error.response()?.errorBody()?.string() }.getOrNull().orEmpty()
    if (raw.isBlank()) return fallback
    return runCatching {
        val node = ApiClient.json.parseToJsonElement(raw)
        if (node is kotlinx.serialization.json.JsonPrimitive && node.isString) {
            node.content
        } else {
            val errorNode = node.jsonObject["error"]
            when {
                errorNode == null -> fallback
                errorNode is kotlinx.serialization.json.JsonPrimitive -> errorNode.contentOrNull ?: fallback
                else -> errorNode.jsonObject["message"]?.jsonPrimitive?.contentOrNull ?: fallback
            }
        }
    }.getOrDefault(fallback)
}

object ApiClient {
    private const val CONNECT_TIMEOUT_SECONDS = 8L
    private const val READ_TIMEOUT_SECONDS = 20L
    private const val WRITE_TIMEOUT_SECONDS = 20L
    private const val CALL_TIMEOUT_SECONDS = 25L

    val json =
        Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            explicitNulls = false
        }

    fun create(
        cookieStore: SessionCookieStore,
        baseUrl: String = MediaUrlNormalizer.origin,
    ): AnimeStreamApi {
        return Retrofit.Builder()
            .baseUrl("${MediaUrlNormalizer.validatedOrigin(baseUrl)}/")
            .client(createHttpClient(cookieStore))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AnimeStreamApi::class.java)
    }

    internal fun createHttpClient(cookieStore: SessionCookieStore): OkHttpClient =
        OkHttpClient.Builder()
            .cookieJar(cookieStore)
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor { chain ->
                val request =
                    chain.request().newBuilder()
                        .header("Accept", "application/json")
                        .header("User-Agent", "AnimeStream-Android/${BuildConfig.VERSION_NAME}")
                        .build()
                chain.proceed(request)
            }
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(
                        HttpLoggingInterceptor().apply {
                            level = HttpLoggingInterceptor.Level.BASIC
                        },
                    )
                }
            }
            .build()
}
