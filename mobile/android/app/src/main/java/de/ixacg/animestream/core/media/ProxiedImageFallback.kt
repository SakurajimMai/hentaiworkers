package de.ixacg.animestream.core.media

import android.net.Uri
import coil.intercept.Interceptor
import coil.network.HttpException
import coil.request.ErrorResult
import coil.request.ImageResult
import java.net.URL
import okhttp3.HttpUrl

/**
 * `/cdn-img` exists because some networks cannot reach the image host directly, yet the proxy
 * itself can be unconfigured or down. When the site answers a proxied image with a 5xx, retry the
 * original host once so a broken proxy degrades to direct loading instead of blank pages. A 4xx is
 * the image's own status and is not retried. The retry keeps the proxied disk cache key, so later
 * requests for the same page are served from disk without repeating the failed round trip.
 */
internal class ProxiedImageFallback(
    private val directUrl: (String) -> String? = { MediaUrlNormalizer.directImageUrl(it) },
) : Interceptor {
    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val result = chain.proceed(chain.request)
        if (result !is ErrorResult || !isProxyFailure(result.throwable)) return result
        val proxied = requestUrl(chain.request.data) ?: return result
        val direct = directUrl(proxied) ?: return result
        val retry =
            chain.request.newBuilder()
                .data(direct)
                .diskCacheKey(chain.request.diskCacheKey ?: proxied)
                .build()
        return chain.proceed(retry)
    }

    companion object {
        fun isProxyFailure(throwable: Throwable): Boolean = throwable is HttpException && throwable.response.code in 500..599

        fun requestUrl(data: Any): String? =
            when (data) {
                is String -> data
                is Uri, is HttpUrl, is URL -> data.toString()
                else -> null
            }
    }
}
