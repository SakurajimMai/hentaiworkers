package de.ixacg.animestream.core.network

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import de.ixacg.animestream.data.repository.SessionRepository
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.CancellationException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
class ApiContractTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `catalog query preserves page filter search and sort`() =
        runTest {
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """{"data":[{"id":7,"title":"Example"}],"pagination":{"page":2,"limit":30,"total":1,"totalPages":2}}""",
                    ),
            )
            val api = createApi()
            val result = api.animes(page = 2, limit = 30, tagId = 9, search = "night", sort = "popular")
            val request = requireNotNull(server.takeRequest(2, TimeUnit.SECONDS))

            assertEquals(7L, result.data.single().id)
            assertEquals("/api/animes?page=2&limit=30&tag=9&search=night&sort=popular", request.path)
            assertEquals("application/json", request.getHeader("Accept"))
        }

    @Test
    fun `android update manifest uses the same origin contract`() =
        runTest {
            val versionCode = 67
            val releaseTag = "build-$versionCode"
            val releaseOrigin = "https://github.com/SakurajimMai/hentaiworkers/releases"
            val sha256 = "a".repeat(64)
            val apks =
                listOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86", "universal")
                    .joinToString(",") { abi ->
                        val name = "AnimeStream-$versionCode-$abi.apk"
                        """"$abi":{"name":"$name","url":"$releaseOrigin/download/$releaseTag/$name","size":16000000,"sha256":"$sha256"}"""
                    }
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "schemaVersion": 1,
                          "packageName": "de.ixacg.animestream",
                          "versionCode": $versionCode,
                          "releaseTag": "$releaseTag",
                          "releaseName": "AnimeStream Build $versionCode",
                          "publishedAt": "2026-08-31T00:00:00Z",
                          "releasePageUrl": "$releaseOrigin/tag/$releaseTag",
                          "apks": {$apks},
                          "checksums": {
                            "name": "SHA256SUMS",
                            "url": "$releaseOrigin/download/$releaseTag/SHA256SUMS",
                            "size": 500,
                            "sha256": "$sha256"
                          }
                        }
                        """.trimIndent(),
                    ),
            )

            val result = createApi().androidUpdate()
            val request = requireNotNull(server.takeRequest(2, TimeUnit.SECONDS))

            assertEquals("/api/android/update", request.path)
            assertEquals(versionCode, result.versionCode)
            assertEquals("AnimeStream-67-arm64-v8a.apk", result.apks["arm64-v8a"]?.name)
            assertEquals("SHA256SUMS", result.checksums.name)
        }

    @Test
    fun `session cookie persists from login and is sent to me`() =
        runTest {
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setHeader("Set-Cookie", "animestream_session=test-token; Path=/; HttpOnly")
                    .setBody("""{"user":{"id":1,"username":"mei","role":"user"}}"""),
            )
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"user":{"id":1,"username":"mei","role":"user"}}"""),
            )
            val context = ApplicationProvider.getApplicationContext<Context>()
            val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            cookies.clear()
            val api = ApiClient.create(cookies, server.url("/").toString())

            SessionRepository(api, cookies).login("mei", "password")
            val restoredCookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            restoredCookies.hydrate()
            ApiClient.create(restoredCookies, server.url("/").toString()).me()
            val loginRequest = requireNotNull(server.takeRequest(2, TimeUnit.SECONDS))
            val meRequest = requireNotNull(server.takeRequest(2, TimeUnit.SECONDS))

            assertEquals("/api/auth/login", loginRequest.path)
            assertTrue(loginRequest.body.readUtf8().contains("\"emailOrUsername\":\"mei\""))
            assertEquals("animestream_session=test-token", meRequest.getHeader("Cookie"))
        }

    @Test
    fun `api client uses resilient bounded timeouts`() =
        runTest {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            val client = ApiClient.createHttpClient(cookies)

            assertEquals(TimeUnit.SECONDS.toMillis(8), client.connectTimeoutMillis.toLong())
            assertEquals(TimeUnit.SECONDS.toMillis(20), client.readTimeoutMillis.toLong())
            assertEquals(TimeUnit.SECONDS.toMillis(20), client.writeTimeoutMillis.toLong())
            assertEquals(TimeUnit.SECONDS.toMillis(25), client.callTimeoutMillis.toLong())
            assertTrue(client.retryOnConnectionFailure)
        }

    @Test
    fun `api client reuses injected network resources without replacing its cookie store`() =
        runTest {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            val connectionPool = ConnectionPool()
            val dispatcher = Dispatcher()

            val client = ApiClient.createHttpClient(cookies, connectionPool, dispatcher)

            assertTrue(client.connectionPool === connectionPool)
            assertTrue(client.dispatcher === dispatcher)
            assertTrue(client.cookieJar === cookies)
        }

    @Test
    fun `api client derived from a base client can reuse its tls connections`() =
        runTest {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            val baseClient = OkHttpClient()

            val client = ApiClient.createHttpClient(cookies, baseClient = baseClient)

            assertTrue(client.connectionPool === baseClient.connectionPool)
            assertTrue(client.dispatcher === baseClient.dispatcher)
            assertTrue(client.sslSocketFactory === baseClient.sslSocketFactory)
            assertTrue(client.cookieJar === cookies)
        }

    @Test
    fun `session hydrate skips me request when cookie is empty`() =
        runTest {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
            cookies.clear()
            val repository = SessionRepository(ApiClient.create(cookies, server.url("/").toString()), cookies)

            repository.hydrate()

            assertTrue(repository.state.value.ready)
            assertNull(repository.state.value.user)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `socket timeout is mapped to actionable localized error`() =
        runTest {
            val error =
                runCatching {
                    apiCall<Unit> { throw SocketTimeoutException("Read timed out") }
                }.exceptionOrNull() as ApiError

            assertEquals(0, error.status)
            assertEquals("服务器响应超时，请检查网络后重试", error.message)
        }

    @Test
    fun `server errors hide internals while client errors preserve api message`() =
        runTest {
            val serverError =
                runCatching {
                    apiCall<Unit> {
                        throw HttpException(Response.error<Unit>(503, "Failed query: private detail".toResponseBody()))
                    }
                }.exceptionOrNull() as ApiError
            val clientError =
                runCatching {
                    apiCall<Unit> {
                        throw HttpException(
                            Response.error<Unit>(
                                400,
                                """{"error":{"message":"请求参数无效"}}""".toResponseBody(),
                            ),
                        )
                    }
                }.exceptionOrNull() as ApiError

            assertEquals(503, serverError.status)
            assertEquals("服务器暂时不可用，请稍后重试", serverError.message)
            assertEquals(400, clientError.status)
            assertEquals("请求参数无效", clientError.message)
        }

    @Test
    fun `network failures are localized without catching cancellation`() =
        runTest {
            val callTimeout =
                runCatching {
                    apiCall<Unit> { throw InterruptedIOException("timeout") }
                }.exceptionOrNull() as ApiError
            val interrupted =
                runCatching {
                    apiCall<Unit> { throw InterruptedIOException("interrupted") }
                }.exceptionOrNull() as ApiError
            val englishFailure =
                runCatching {
                    apiCall<Unit> { throw IOException("Failed to connect") }
                }.exceptionOrNull() as ApiError
            val cancellation = CancellationException("cancelled")
            val cancellationResult =
                runCatching {
                    apiCall<Unit> { throw cancellation }
                }.exceptionOrNull()

            assertEquals("服务器响应超时，请检查网络后重试", callTimeout.message)
            assertEquals("网络连接失败，请检查网络后重试", interrupted.message)
            assertEquals("网络连接失败，请检查网络后重试", englishFailure.message)
            assertTrue(cancellationResult === cancellation)
        }

    private fun kotlinx.coroutines.test.TestScope.createApi(): AnimeStreamApi {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
        return ApiClient.create(cookies, server.url("/").toString())
    }
}
