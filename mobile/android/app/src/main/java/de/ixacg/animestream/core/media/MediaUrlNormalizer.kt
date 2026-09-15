package de.ixacg.animestream.core.media

import de.ixacg.animestream.BuildConfig
import java.net.URI
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object MediaUrlNormalizer {
    private const val IMAGE_ACCEPT = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"

    /**
     * Site origin injected at build time (`ANIMESTREAM_API_BASE_URL`). Gradle validates the value;
     * re-validating here keeps a broken injection from silently pointing the app anywhere else.
     */
    val origin: String =
        requireNotNull(validatedOrigin(BuildConfig.API_BASE_URL)) {
            "API_BASE_URL must be an absolute HTTP(S) origin"
        }

    /** Host whose images the site proxies through `/cdn-img`; blank disables the rewrite. */
    val proxiedImageHost: String = BuildConfig.IMAGE_PROXY_HOST.trim().lowercase()

    /** Canonical `scheme://host[:port]` for a configured origin, or null when it is not an HTTP(S) origin. */
    fun validatedOrigin(raw: String?): String? =
        raw.orEmpty().trim().trimEnd('/').toHttpUrlOrNull()
            ?.newBuilder()
            ?.encodedPath("/")
            ?.query(null)
            ?.fragment(null)
            ?.build()
            ?.toString()
            ?.trimEnd('/')

    fun rewriteCdnUrl(
        raw: String,
        siteOrigin: String = origin,
        proxiedHost: String = proxiedImageHost,
    ): String {
        val parsed = raw.toHttpUrlOrNull() ?: return raw
        if (proxiedHost.isBlank() || !parsed.host.equals(proxiedHost, ignoreCase = true)) return parsed.toString()
        val safeOrigin = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return parsed.toString()
        return safeOrigin.newBuilder()
            .addPathSegment("cdn-img")
            .addEncodedPathSegments(parsed.encodedPath.trimStart('/'))
            .encodedQuery(parsed.encodedQuery)
            .build()
            .toString()
    }

    /**
     * Inverse of [rewriteCdnUrl]: the address on the proxied image host behind a `/cdn-img` URL of
     * the site origin, or null when [proxied] is not one. Used to retry directly when the proxy fails.
     */
    fun directImageUrl(
        proxied: String,
        siteOrigin: String = origin,
        proxiedHost: String = proxiedImageHost,
    ): String? {
        if (proxiedHost.isBlank()) return null
        val parsed = proxied.toHttpUrlOrNull() ?: return null
        val site = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return null
        if (parsed.scheme != site.scheme || !parsed.host.equals(site.host, ignoreCase = true) || parsed.port != site.port) return null
        val segments = parsed.encodedPathSegments
        if (segments.size < 2 || segments.first() != "cdn-img") return null
        return runCatching {
            HttpUrl.Builder()
                .scheme("https")
                .host(proxiedHost)
                .addEncodedPathSegments(segments.drop(1).joinToString("/"))
                .encodedQuery(parsed.encodedQuery)
                .build()
                .toString()
        }.getOrNull()
    }

    fun normalize(raw: String?): String? {
        val value = raw?.trim().orEmpty()
        if (value.isBlank()) return null
        val absolute =
            value.toHttpUrlOrNull()?.toString()
                ?: runCatching { URI(value).toASCIIString().toHttpUrlOrNull()?.toString() }.getOrNull()
                ?: return null
        return rewriteCdnUrl(absolute)
    }

    fun split(raw: String?): List<String> = raw.orEmpty().split(',').mapNotNull(::normalize).distinct()

    fun imageHeaders(): Map<String, String> =
        mapOf(
            "Accept" to IMAGE_ACCEPT,
            "Referer" to "$origin/",
        )

    fun mediaHeaders(): Map<String, String> =
        mapOf(
            "Accept" to "*/*",
            "Referer" to "$origin/",
            "User-Agent" to "AnimeStream-Android",
        )
}
