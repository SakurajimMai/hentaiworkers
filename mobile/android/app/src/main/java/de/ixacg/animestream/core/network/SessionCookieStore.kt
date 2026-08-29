package de.ixacg.animestream.core.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

private val Context.sessionDataStore by preferencesDataStore(name = "animestream_session")

class SessionCookieStore(
    context: Context,
    apiOrigin: HttpUrl,
    private val applicationScope: CoroutineScope,
) : CookieJar {
    private val dataStore = context.sessionDataStore
    private val apiHost = apiOrigin.host
    private val apiIsHttps = apiOrigin.isHttps
    private val cachedHeader = AtomicReference("")

    suspend fun hydrate() {
        cachedHeader.set(dataStore.data.first()[SESSION_COOKIE].orEmpty())
    }

    override fun saveFromResponse(
        url: HttpUrl,
        cookies: List<Cookie>,
    ) {
        if (url.host != apiHost) return
        val cookie = cookies.lastOrNull { it.name.equals(SESSION_NAME, ignoreCase = true) } ?: return
        val header = if (cookie.maxAgeSeconds == 0L) "" else "${cookie.name}=${cookie.value}"
        cachedHeader.set(header)
        applicationScope.launch {
            dataStore.edit { preferences ->
                if (header.isBlank()) preferences.remove(SESSION_COOKIE) else preferences[SESSION_COOKIE] = header
            }
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        if (url.host != apiHost) return emptyList()
        val header = cachedHeader.get()
        val separator = header.indexOf('=')
        if (separator <= 0 || separator == header.lastIndex) return emptyList()
        return listOf(
            Cookie.Builder()
                .name(header.substring(0, separator))
                .value(header.substring(separator + 1))
                .domain(apiHost)
                .path("/")
                .httpOnly()
                .apply { if (apiIsHttps) secure() }
                .build(),
        )
    }

    suspend fun clear() {
        cachedHeader.set("")
        dataStore.edit { it.remove(SESSION_COOKIE) }
    }

    suspend fun importLegacyCookie(raw: String): Boolean {
        val match = SESSION_PATTERN.find(raw.trim()) ?: return false
        val header = match.value
        cachedHeader.set(header)
        dataStore.edit { it[SESSION_COOKIE] = header }
        return true
    }

    suspend fun migrationVersion(): Int = dataStore.data.first()[MIGRATION_VERSION] ?: 0

    suspend fun markMigrationComplete(version: Int) {
        dataStore.edit { it[MIGRATION_VERSION] = version }
    }

    internal suspend fun setMigrationVersionForTest(version: Int) {
        dataStore.edit { it[MIGRATION_VERSION] = version }
    }

    internal fun currentHeader(): String = cachedHeader.get()

    private companion object {
        const val SESSION_NAME = "animestream_session"
        val SESSION_PATTERN = Regex("animestream_session=[^;\\s]+", RegexOption.IGNORE_CASE)
        val SESSION_COOKIE = stringPreferencesKey("session_cookie")
        val MIGRATION_VERSION = intPreferencesKey("legacy_storage_migration_version")
    }
}

private val Cookie.maxAgeSeconds: Long
    get() = if (expiresAt <= System.currentTimeMillis()) 0 else (expiresAt - System.currentTimeMillis()) / 1_000
