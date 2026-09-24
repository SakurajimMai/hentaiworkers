package de.ixacg.animestream.core.media

import de.ixacg.animestream.BuildConfig
import java.net.URI
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object MediaUrlNormalizer {
    private const val IMAGE_ACCEPT = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    private const val PROXY_SEGMENT = "cdn-img"

    /**
     * Registrable domains that sit two labels below the TLD. A site directly under one of these
     * (`example.co.uk`) keeps its own host as the proxy scope instead of widening it to `*.co.uk`.
     * Kept identical to lib/server/image-proxy.ts on the server.
     */
    private val TWO_LABEL_PUBLIC_SUFFIXES: Set<String> =
        """
        co.uk org.uk ac.uk gov.uk me.uk net.uk ltd.uk plc.uk sch.uk
        com.au net.au org.au edu.au gov.au id.au
        co.nz net.nz org.nz govt.nz ac.nz
        co.jp ne.jp or.jp ac.jp go.jp gr.jp
        com.cn net.cn org.cn gov.cn edu.cn ac.cn
        com.hk net.hk org.hk edu.hk gov.hk
        com.tw net.tw org.tw edu.tw gov.tw
        com.sg net.sg org.sg edu.sg gov.sg
        com.my net.my org.my
        co.kr ne.kr or.kr re.kr go.kr
        co.in net.in org.in firm.in gen.in ind.in
        com.br net.br org.br
        com.mx org.mx gob.mx
        com.ar net.ar org.ar
        co.za net.za org.za web.za
        com.tr net.tr org.tr
        com.ua net.ua org.ua
        co.il org.il net.il ac.il
        com.vn net.vn org.vn
        com.ph net.ph org.ph
        co.th in.th or.th ac.th go.th
        com.pk net.pk org.pk
        com.eg com.sa com.ng com.pe com.co com.ec com.ve com.uy com.py com.bo com.do com.gt com.pa com.sv com.ni com.hn com.cr
        """.trimIndent().split(Regex("\\s+")).filterNot(String::isEmpty).toSet()

    /**
     * Site origin injected at build time (`ANIMESTREAM_API_BASE_URL`). Gradle validates the value;
     * re-validating here keeps a broken injection from silently pointing the app anywhere else.
     */
    val origin: String =
        requireNotNull(validatedOrigin(BuildConfig.API_BASE_URL)) {
            "API_BASE_URL must be an absolute HTTP(S) origin"
        }

    /**
     * Domain whose hosts the site proxies through `/cdn-img/<host>/...`: `image1.example.com`,
     * `image2.example.com`, ... for a site at `www.example.com`. Derived from the origin, never
     * configured, so new image hosts need no app or server change.
     */
    val proxiedImageDomain: String = imageProxyDomain(origin)

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

    /** The site host minus its first label when it has one to spare: `www.example.com` -> `example.com`. */
    fun imageProxyDomain(siteOrigin: String): String {
        val host = siteOrigin.trimEnd('/').toHttpUrlOrNull()?.host?.lowercase() ?: return ""
        val labels = host.split('.')
        if (labels.size < 3) return host
        val parent = labels.drop(1).joinToString(".")
        return if (parent in TWO_LABEL_PUBLIC_SUFFIXES) host else parent
    }

    /** True when [host] (no port) is the proxied domain or below it, and is not the site itself. */
    fun isProxiedImageHost(
        host: String,
        siteOrigin: String = origin,
    ): Boolean {
        val site = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return false
        val candidate = host.trim().lowercase()
        if (candidate.isEmpty() || candidate == site.host.lowercase()) return false
        val domain = imageProxyDomain(siteOrigin)
        return domain.isNotEmpty() && (candidate == domain || candidate.endsWith(".$domain"))
    }

    fun rewriteCdnUrl(
        raw: String,
        siteOrigin: String = origin,
    ): String {
        val parsed = raw.toHttpUrlOrNull() ?: return raw
        val site = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return parsed.toString()
        if (!isProxiedImageHost(parsed.host, siteOrigin)) return parsed.toString()
        val hostSegment = if (parsed.port == HttpUrl.defaultPort(parsed.scheme)) parsed.host else "${parsed.host}:${parsed.port}"
        return site.newBuilder()
            .addPathSegment(PROXY_SEGMENT)
            .addPathSegment(hostSegment)
            .addEncodedPathSegments(parsed.encodedPath.trimStart('/'))
            .encodedQuery(parsed.encodedQuery)
            .build()
            .toString()
    }

    /**
     * Inverse of [rewriteCdnUrl]: the address on the image host behind a `/cdn-img/<host>/...` URL
     * of the site origin, or null when [proxied] is not one. Used to retry directly when the proxy fails.
     */
    fun directImageUrl(
        proxied: String,
        siteOrigin: String = origin,
    ): String? {
        val parsed = proxied.toHttpUrlOrNull() ?: return null
        val site = siteOrigin.trimEnd('/').toHttpUrlOrNull() ?: return null
        if (parsed.scheme != site.scheme || !parsed.host.equals(site.host, ignoreCase = true) || parsed.port != site.port) return null
        val segments = parsed.encodedPathSegments
        if (segments.size < 3 || segments[0] != PROXY_SEGMENT) return null
        val hostSegment = segments[1]
        if (!isProxiedImageHost(hostSegment.substringBefore(':'), siteOrigin)) return null
        return "https://$hostSegment/".toHttpUrlOrNull()
            ?.newBuilder()
            ?.addEncodedPathSegments(segments.drop(2).joinToString("/"))
            ?.encodedQuery(parsed.encodedQuery)
            ?.build()
            ?.toString()
    }

    /**
     * A usable absolute http(s) address for [raw], left on the host it names. The reader uses this
     * when the site turns on 阅读页直连图床, so pages skip `/cdn-img` entirely.
     */
    fun normalizeDirect(raw: String?): String? {
        val value = raw?.trim().orEmpty()
        if (value.isBlank()) return null
        return value.toHttpUrlOrNull()?.toString()
            ?: runCatching { URI(value).toASCIIString().toHttpUrlOrNull()?.toString() }.getOrNull()
    }

    fun normalize(raw: String?): String? = normalizeDirect(raw)?.let { rewriteCdnUrl(it) }

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
