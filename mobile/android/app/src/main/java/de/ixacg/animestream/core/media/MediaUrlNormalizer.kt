package de.ixacg.animestream.core.media

import de.ixacg.animestream.BuildConfig
import java.net.URI
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

    /** A usable absolute http(s) address for [raw], left on the host it names. */
    fun normalize(raw: String?): String? {
        val value = raw?.trim().orEmpty()
        if (value.isBlank()) return null
        return value.toHttpUrlOrNull()?.toString()
            ?: runCatching { URI(value).toASCIIString().toHttpUrlOrNull()?.toString() }.getOrNull()
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
