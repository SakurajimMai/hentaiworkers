package de.ixacg.animestream.core.media

import android.app.Application
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import androidx.test.core.app.ApplicationProvider
import coil.decode.DataSource
import coil.intercept.Interceptor
import coil.network.HttpException
import coil.request.ErrorResult
import coil.request.ImageRequest
import coil.request.ImageResult
import coil.request.SuccessResult
import coil.size.Size
import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class ProxiedImageFallbackTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val fallback =
        ProxiedImageFallback(
            directUrl = { MediaUrlNormalizer.directImageUrl(it, siteOrigin = SITE, proxiedHost = IMAGE_HOST) },
        )

    @Test
    fun `a 5xx from the proxy retries the direct host once and keeps the proxied disk key`() =
        runBlocking {
            val chain =
                FakeChain(request(PROXIED)) { request ->
                    if (request.data == PROXIED) httpError(request, 503) else success(request)
                }

            val result = fallback.intercept(chain)

            assertTrue(result is SuccessResult)
            assertEquals(listOf(PROXIED, DIRECT), chain.seen.map { it.data })
            assertEquals("later proxied requests must hit this disk entry", PROXIED, chain.seen.last().diskCacheKey)
        }

    @Test
    fun `an explicit disk cache key survives the retry`() =
        runBlocking {
            val chain =
                FakeChain(request(PROXIED, diskCacheKey = "page-key")) { request ->
                    if (request.data == PROXIED) httpError(request, 502) else success(request)
                }

            fallback.intercept(chain)

            assertEquals("page-key", chain.seen.last().diskCacheKey)
        }

    @Test
    fun `a failing retry reports the retry error without a third attempt`() =
        runBlocking {
            val chain = FakeChain(request(PROXIED)) { request -> httpError(request, 503) }

            val result = fallback.intercept(chain)

            assertTrue(result is ErrorResult)
            assertEquals(2, chain.seen.size)
            assertEquals(DIRECT, (result as ErrorResult).request.data)
        }

    @Test
    fun `a 4xx is the image's own status and is not retried`() = assertNotRetried(request(PROXIED)) { httpError(it, 404) }

    @Test
    fun `a transport failure is not retried`() = assertNotRetried(request(PROXIED)) { ErrorResult(null, it, IOException("reset")) }

    @Test
    fun `a direct address that fails is not retried`() = assertNotRetried(request(DIRECT)) { httpError(it, 503) }

    @Test
    fun `a site route that is not the proxy is not retried`() = assertNotRetried(request("$SITE/api/mangas/1/cover")) { httpError(it, 503) }

    private fun assertNotRetried(
        request: ImageRequest,
        respond: (ImageRequest) -> ImageResult,
    ) = runBlocking {
        val chain = FakeChain(request, respond = respond)

        val result = fallback.intercept(chain)

        assertEquals(1, chain.seen.size)
        assertSame(request, chain.seen.single())
        assertTrue(result is ErrorResult)
    }

    private fun request(
        url: String,
        diskCacheKey: String? = null,
    ): ImageRequest =
        ImageRequest.Builder(context)
            .data(url)
            .apply { if (diskCacheKey != null) diskCacheKey(diskCacheKey) }
            .build()

    private fun success(request: ImageRequest): ImageResult = SuccessResult(ColorDrawable(Color.BLACK), request, DataSource.NETWORK)

    private fun httpError(
        request: ImageRequest,
        code: Int,
    ): ImageResult {
        val response =
            Response.Builder()
                .request(Request.Builder().url(request.data.toString()).build())
                .protocol(Protocol.HTTP_1_1)
                .code(code)
                .message("status $code")
                .build()
        return ErrorResult(null, request, HttpException(response))
    }

    // `respond` stays last so call sites can pass it as a trailing lambda.
    private class FakeChain(
        override val request: ImageRequest,
        val seen: MutableList<ImageRequest> = mutableListOf(),
        private val respond: (ImageRequest) -> ImageResult,
    ) : Interceptor.Chain {
        override val size: Size = Size.ORIGINAL

        override fun withRequest(request: ImageRequest): Interceptor.Chain = FakeChain(request, seen, respond)

        override fun withSize(size: Size): Interceptor.Chain = this

        override suspend fun proceed(request: ImageRequest): ImageResult {
            seen += request
            return respond(request)
        }
    }

    private companion object {
        const val SITE = "https://site.example"
        const val IMAGE_HOST = "images.example"
        const val PROXIED = "$SITE/cdn-img/file/page-1.jpg"
        const val DIRECT = "https://$IMAGE_HOST/file/page-1.jpg"
    }
}
