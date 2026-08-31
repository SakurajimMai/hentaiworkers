package de.ixacg.animestream.data.repository

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.updateDataStore by preferencesDataStore(name = "animestream_update")

internal data class UpdateCheckSnapshot(
    val lastSuccessAt: Long = 0,
    val lastFailureAt: Long = 0,
    val snoozedVersionCode: Int = 0,
    val remindAfter: Long = 0,
)

class UpdateCheckStore(context: Context) {
    private val dataStore = context.updateDataStore

    internal suspend fun snapshot(): UpdateCheckSnapshot {
        val preferences = dataStore.data.first()
        return UpdateCheckSnapshot(
            lastSuccessAt = preferences[LAST_SUCCESS_AT] ?: 0,
            lastFailureAt = preferences[LAST_FAILURE_AT] ?: 0,
            snoozedVersionCode = preferences[SNOOZED_VERSION_CODE] ?: 0,
            remindAfter = preferences[REMIND_AFTER] ?: 0,
        )
    }

    internal suspend fun recordSuccess(now: Long) {
        dataStore.edit { preferences ->
            preferences[LAST_SUCCESS_AT] = now
            preferences.remove(LAST_FAILURE_AT)
        }
    }

    internal suspend fun recordFailure(now: Long) {
        dataStore.edit { preferences -> preferences[LAST_FAILURE_AT] = now }
    }

    suspend fun snooze(
        versionCode: Int,
        remindAfter: Long,
        checkedAt: Long,
    ) {
        dataStore.edit { preferences ->
            preferences[SNOOZED_VERSION_CODE] = versionCode
            preferences[REMIND_AFTER] = remindAfter
            preferences[LAST_SUCCESS_AT] = checkedAt
            preferences.remove(LAST_FAILURE_AT)
        }
    }

    private companion object {
        val LAST_SUCCESS_AT = longPreferencesKey("last_success_at")
        val LAST_FAILURE_AT = longPreferencesKey("last_failure_at")
        val SNOOZED_VERSION_CODE = intPreferencesKey("snoozed_version_code")
        val REMIND_AFTER = longPreferencesKey("remind_after")
    }
}
