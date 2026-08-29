package de.ixacg.animestream.core.network

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import de.ixacg.animestream.data.repository.SessionRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

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

    private fun kotlinx.coroutines.test.TestScope.createApi(): AnimeStreamApi {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val cookies = SessionCookieStore(context, server.url("/"), backgroundScope)
        return ApiClient.create(cookies, server.url("/").toString())
    }
}
