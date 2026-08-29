package de.ixacg.animestream.core.media

import de.ixacg.animestream.BuildConfig
import java.net.URI
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object MediaUrlNormalizer {
    const val DEFAULT_ORIGIN = "https://www.ixacg.de"

    private const val PROXIED_IMAGE_HOST = "image.ixacg.de"
    private const val IMAGE_ACCEPT = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"

    val origin: String = validatedOrigin(BuildConfig.API_BASE_URL)

    fun validatedOrigin(raw: String?): String =
        raw.orEmpty().trim().trimEnd('/').toHttpUrlOrNull()
            ?.newBuilder()
            ?.encodedPath("/")
            ?.query(null)
            ?.fragment(null)
            ?.build()
            ?.toString()
            ?.trimEnd('/')
            ?: DEFAULT_ORIGIN

    fun rewriteCdnUrl(
        raw: String,
        siteOrigin: String = origin,
    ): String {
        val parsed = raw.toHttpUrlOrNull() ?: return raw
        if (!parsed.host.equals(PROXIED_IMAGE_HOST, ignoreCase = true)) return parsed.toString()
        val safeOrigin = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return parsed.toString()
        return safeOrigin.newBuilder()
            .addPathSegment("cdn-img")
            .addEncodedPathSegments(parsed.encodedPath.trimStart('/'))
            .encodedQuery(parsed.encodedQuery)
            .build()
            .toString()
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
