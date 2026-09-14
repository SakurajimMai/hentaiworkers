package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.AndroidUpdateApk
import de.ixacg.animestream.core.model.AndroidUpdateManifest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    private companion object {
        const val REPOSITORY = "example-owner/example-app"
    }

    @Test
    fun `automatic checks honor success and failure windows`() {
        val now = 100_000_000L

        assertFalse(
            UpdatePolicy.shouldAutomaticallyCheck(
                UpdateCheckSnapshot(lastSuccessAt = now - UpdatePolicy.AUTO_SUCCESS_INTERVAL_MS + 1),
                now,
            ),
        )
        assertFalse(
            UpdatePolicy.shouldAutomaticallyCheck(
                UpdateCheckSnapshot(lastFailureAt = now - UpdatePolicy.AUTO_FAILURE_INTERVAL_MS + 1),
                now,
            ),
        )
        assertTrue(
            UpdatePolicy.shouldAutomaticallyCheck(
                UpdateCheckSnapshot(lastSuccessAt = now - UpdatePolicy.AUTO_SUCCESS_INTERVAL_MS),
                now,
            ),
        )
    }

    @Test
    fun `selects first supported device ABI and falls back to universal`() {
        val manifest = manifest()

        assertEquals("arm64-v8a", select(manifest, listOf("arm64-v8a", "armeabi-v7a"))?.abi)
        assertEquals("x86", select(manifest, listOf("x86"))?.abi)
        assertEquals("universal", select(manifest, listOf("riscv64"))?.abi)
    }

    @Test
    fun `rejects mismatched package tag url filename and digest`() {
        val valid = manifest()
        val arm = requireNotNull(valid.apks["arm64-v8a"])

        assertNull(select(valid.copy(packageName = "invalid"), listOf("arm64-v8a")))
        assertNull(select(valid.copy(releaseTag = "build-99"), listOf("arm64-v8a")))
        assertNull(select(valid.copy(apks = valid.apks - "x86"), listOf("arm64-v8a")))
        assertNull(
            select(
                valid.copy(apks = valid.apks + ("riscv64" to arm)),
                listOf("arm64-v8a"),
            ),
        )
        assertNull(select(valid.copy(publishedAt = "not-a-date"), listOf("arm64-v8a")))
        assertNull(select(valid.copy(versionCode = Int.MAX_VALUE), listOf("arm64-v8a")))
        assertNull(
            select(
                valid.copy(checksums = valid.checksums.copy(sha256 = "bad")),
                listOf("arm64-v8a"),
            ),
        )
        assertNull(
            select(
                valid.copy(apks = valid.apks + ("arm64-v8a" to arm.copy(url = "https://example.com/app.apk"))),
                listOf("arm64-v8a"),
            ),
        )
        assertNull(
            select(
                valid.copy(apks = valid.apks + ("arm64-v8a" to arm.copy(name = "wrong.apk"))),
                listOf("arm64-v8a"),
            ),
        )
        assertNull(
            select(
                valid.copy(apks = valid.apks + ("arm64-v8a" to arm.copy(sha256 = "bad"))),
                listOf("arm64-v8a"),
            ),
        )
    }

    @Test
    fun `snooze applies only to the same version before remind time`() {
        val snapshot = UpdateCheckSnapshot(snoozedVersionCode = 67, remindAfter = 2_000)

        assertTrue(UpdatePolicy.isSnoozed(snapshot, versionCode = 67, now = 1_999))
        assertFalse(UpdatePolicy.isSnoozed(snapshot, versionCode = 68, now = 1_999))
        assertFalse(UpdatePolicy.isSnoozed(snapshot, versionCode = 67, now = 2_000))
    }

    @Test
    fun `update checks require a configured owner slash repository`() {
        assertNull(UpdatePolicy.releaseOrigin(""))
        assertNull(UpdatePolicy.releaseOrigin("not a repository"))
        assertNull(UpdatePolicy.releaseOrigin("owner/"))
        assertEquals("https://github.com/$REPOSITORY", UpdatePolicy.releaseOrigin(REPOSITORY))
        assertNull(UpdatePolicy.selectUpdate(manifest(), listOf("arm64-v8a"), repository = ""))
        assertNull(UpdatePolicy.selectUpdate(manifest(), listOf("arm64-v8a"), repository = "other-owner/other-app"))
    }

    private fun select(
        manifest: AndroidUpdateManifest,
        deviceAbis: List<String>,
    ) = UpdatePolicy.selectUpdate(manifest, deviceAbis, repository = REPOSITORY)

    private fun manifest(versionCode: Int = 67): AndroidUpdateManifest {
        val tag = "build-$versionCode"
        val origin = "https://github.com/$REPOSITORY"
        val abis = listOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86", "universal")
        return AndroidUpdateManifest(
            schemaVersion = 1,
            packageName = "de.ixacg.animestream",
            versionCode = versionCode,
            releaseTag = tag,
            releaseName = "AnimeStream Build $versionCode",
            publishedAt = "2026-08-31T00:00:00Z",
            releasePageUrl = "$origin/releases/tag/$tag",
            apks =
                abis.associateWith { abi ->
                    val name = "AnimeStream-$versionCode-$abi.apk"
                    AndroidUpdateApk(
                        name = name,
                        url = "$origin/releases/download/$tag/$name",
                        size = 16_000_000,
                        sha256 = "a".repeat(64),
                    )
                },
            checksums =
                AndroidUpdateApk(
                    name = "SHA256SUMS",
                    url = "$origin/releases/download/$tag/SHA256SUMS",
                    size = 500,
                    sha256 = "b".repeat(64),
                ),
        )
    }
}
