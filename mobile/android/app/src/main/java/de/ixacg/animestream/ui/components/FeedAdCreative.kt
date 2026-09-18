package de.ixacg.animestream.ui.components

/**
 * Tells a plain image creative apart from one that needs a browser.
 *
 * An `<img>` pasted into the admin feed slot carries no script, no frame and no size, so putting
 * it in a WebView buys nothing and costs the app its own image pipeline: cache, redirects, the
 * `/cdn-img` rewrite and the headers every poster already loads with. Creatives that do run code
 * (alliance snippets, iframes, `document.write`) stay on [HtmlAd].
 */
object FeedAdCreative {
    private val EXECUTABLE = Regex("""<\s*(script|iframe|ins|video|audio|embed|object|svg)\b""", RegexOption.IGNORE_CASE)
    private val IMAGE_TAG = Regex("""<\s*img\b[^>]*>""", RegexOption.IGNORE_CASE)
    private val WRAPPER_TAG = Regex("""</?\s*(a|p|div|span|center|figure)\b[^>]*>""", RegexOption.IGNORE_CASE)
    private val SOURCE = Regex("""\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))""", RegexOption.IGNORE_CASE)

    /**
     * The address of a creative that is a single image, optionally inside a link or block wrapper,
     * or null when the creative carries anything else and belongs in a WebView.
     */
    fun imageUrl(html: String): String? {
        val creative = html.trim()
        if (creative.isEmpty() || EXECUTABLE.containsMatchIn(creative)) return null
        val images = IMAGE_TAG.findAll(creative).toList()
        if (images.size != 1) return null
        // Text or extra markup around the image means the creative is a layout, not just a picture.
        val remainder = creative.replace(IMAGE_TAG, "").replace(WRAPPER_TAG, "").trim()
        if (remainder.isNotEmpty()) return null
        val source = SOURCE.find(images.first().value) ?: return null
        val quoted = source.groupValues.drop(1).firstOrNull(String::isNotEmpty).orEmpty().trim()
        val url = quoted.replace("&amp;", "&")
        return url.takeIf { it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true) }
    }
}
