package de.ixacg.animestream.data.repository

import de.ixacg.animestream.BuildConfig
import de.ixacg.animestream.core.model.AndroidUpdateApk
import de.ixacg.animestream.core.model.AndroidUpdateManifest
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.apiCall
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout

data class AvailableUpdate(
    val versionCode: Int,
    val releaseName: String,
    val releasePageUrl: String,
    val abi: String,
    val apk: AndroidUpdateApk,
)

sealed interface UpdateCheckResult {
    data object Skipped : UpdateCheckResult

    data object Current : UpdateCheckResult

    data class Available(val update: AvailableUpdate) : UpdateCheckResult

    data object Failed : UpdateCheckResult
}

class UpdateRepository(
    private val api: AnimeStreamApi,
    private val store: UpdateCheckStore,
    private val supportedAbis: List<String>,
    private val now: () -> Long = { System.currentTimeMillis() },
) {
    private val mutex = Mutex()

    suspend fun check(
        currentVersionCode: Int,
        force: Boolean = false,
    ): UpdateCheckResult =
        mutex.withLock {
            val checkedAt = now()
            // Builds without a configured release repository never contact the update endpoint.
            if (UpdatePolicy.releaseOrigin() == null) return@withLock UpdateCheckResult.Skipped
            val snapshot = readSnapshot() ?: return@withLock UpdateCheckResult.Failed
            if (!force && !UpdatePolicy.shouldAutomaticallyCheck(snapshot, checkedAt)) {
                return@withLock UpdateCheckResult.Skipped
            }

            val manifest =
                try {
                    withTimeout(UPDATE_TIMEOUT_MS) { apiCall { api.androidUpdate() } }
                } catch (error: TimeoutCancellationException) {
                    recordFailure(checkedAt)
                    return@withLock UpdateCheckResult.Failed
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Throwable) {
                    recordFailure(checkedAt)
                    return@withLock UpdateCheckResult.Failed
                }

            val update = UpdatePolicy.selectUpdate(manifest, supportedAbis)
            if (update == null) {
                recordFailure(checkedAt)
                return@withLock UpdateCheckResult.Failed
            }
            if (update.versionCode <= currentVersionCode) {
                recordSuccess(checkedAt)
                return@withLock UpdateCheckResult.Current
            }
            if (!force && UpdatePolicy.isSnoozed(snapshot, update.versionCode, checkedAt)) {
                recordSuccess(checkedAt)
                return@withLock UpdateCheckResult.Skipped
            }
            UpdateCheckResult.Available(update)
        }

    suspend fun snooze(versionCode: Int) {
        val currentTime = now()
        try {
            store.snooze(
                versionCode = versionCode,
                remindAfter = currentTime + UpdatePolicy.AUTO_SUCCESS_INTERVAL_MS,
                checkedAt = currentTime,
            )
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            // A reminder preference must never affect the rest of the app.
        }
    }

    private suspend fun readSnapshot(): UpdateCheckSnapshot? =
        try {
            store.snapshot()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            null
        }

    private suspend fun recordSuccess(checkedAt: Long) {
        try {
            store.recordSuccess(checkedAt)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            // A failed throttle write only causes a later re-check.
        }
    }

    private suspend fun recordFailure(checkedAt: Long) {
        try {
            store.recordFailure(checkedAt)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            // Network failure remains isolated even if its backoff cannot persist.
        }
    }

    private companion object {
        const val UPDATE_TIMEOUT_MS = 4_000L
    }
}

internal object UpdatePolicy {
    const val AUTO_SUCCESS_INTERVAL_MS = 24L * 60 * 60 * 1_000
    const val AUTO_FAILURE_INTERVAL_MS = 6L * 60 * 60 * 1_000
    private const val PACKAGE_NAME = "de.ixacg.animestream"
    private const val MAX_VERSION_CODE = 2_100_000_000
    private val REPOSITORY = Regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$")

    /** GitHub repository (`owner/name`) injected at build time; blank disables update checks. */
    val configuredRepository: String = BuildConfig.UPDATE_REPOSITORY.trim()

    /** Release origin for a repository, or null when none is configured or the value is malformed. */
    fun releaseOrigin(repository: String = configuredRepository): String? = repository.trim().takeIf { REPOSITORY.matches(it) }?.let { "https://github.com/$it" }

    private val SHA256 = Regex("^[0-9a-fA-F]{64}$")
    private val PUBLISHED_AT = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$")
    private val supportedApkAbis = setOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
    private val requiredApkAbis = supportedApkAbis + "universal"

    fun shouldAutomaticallyCheck(
        snapshot: UpdateCheckSnapshot,
        now: Long,
    ): Boolean =
        !withinWindow(snapshot.lastSuccessAt, now, AUTO_SUCCESS_INTERVAL_MS) &&
            !withinWindow(snapshot.lastFailureAt, now, AUTO_FAILURE_INTERVAL_MS)

    fun isSnoozed(
        snapshot: UpdateCheckSnapshot,
        versionCode: Int,
        now: Long,
    ): Boolean = snapshot.snoozedVersionCode == versionCode && now < snapshot.remindAfter

    fun selectUpdate(
        manifest: AndroidUpdateManifest,
        deviceAbis: List<String>,
        repository: String = configuredRepository,
    ): AvailableUpdate? {
        val releaseOrigin = releaseOrigin(repository) ?: return null
        if (
            manifest.schemaVersion != 1 ||
            manifest.packageName != PACKAGE_NAME ||
            manifest.versionCode !in 1..MAX_VERSION_CODE ||
            manifest.releaseName.isBlank() ||
            !isValidPublishedAt(manifest.publishedAt)
        ) {
            return null
        }
        val expectedTag = "build-${manifest.versionCode}"
        if (manifest.releaseTag != expectedTag) return null
        if (manifest.releasePageUrl != "$releaseOrigin/releases/tag/$expectedTag") return null
        if (manifest.apks.keys != requiredApkAbis) return null
        if (requiredApkAbis.any { abi -> !isValidApk(manifest, abi, expectedTag, releaseOrigin) }) return null
        if (!isValidChecksums(manifest.checksums, expectedTag, releaseOrigin)) return null

        val abi = deviceAbis.firstOrNull { it in supportedApkAbis && manifest.apks.containsKey(it) } ?: "universal"
        val apk = manifest.apks[abi] ?: return null

        return AvailableUpdate(
            versionCode = manifest.versionCode,
            releaseName = manifest.releaseName,
            releasePageUrl = manifest.releasePageUrl,
            abi = abi,
            apk = apk.copy(sha256 = apk.sha256.lowercase()),
        )
    }

    private fun isValidApk(
        manifest: AndroidUpdateManifest,
        abi: String,
        releaseTag: String,
        releaseOrigin: String,
    ): Boolean {
        val apk = manifest.apks[abi] ?: return false
        val expectedName = "AnimeStream-${manifest.versionCode}-$abi.apk"
        val expectedUrl = "$releaseOrigin/releases/download/$releaseTag/$expectedName"
        return apk.name == expectedName &&
            apk.url == expectedUrl &&
            apk.size > 0 &&
            SHA256.matches(apk.sha256)
    }

    private fun isValidChecksums(
        checksums: AndroidUpdateApk,
        releaseTag: String,
        releaseOrigin: String,
    ): Boolean {
        val expectedName = "SHA256SUMS"
        val expectedUrl = "$releaseOrigin/releases/download/$releaseTag/$expectedName"
        return checksums.name == expectedName &&
            checksums.url == expectedUrl &&
            checksums.size > 0 &&
            SHA256.matches(checksums.sha256)
    }

    private fun isValidPublishedAt(value: String): Boolean {
        return PUBLISHED_AT.matches(value) && runCatching { Instant.parse(value) }.isSuccess
    }

    private fun withinWindow(
        timestamp: Long,
        now: Long,
        interval: Long,
    ): Boolean = timestamp > 0 && now < timestamp + interval
}
