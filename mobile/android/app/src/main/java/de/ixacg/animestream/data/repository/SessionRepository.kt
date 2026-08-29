package de.ixacg.animestream.data.repository

import de.ixacg.animestream.core.model.AuthUser
import de.ixacg.animestream.core.model.LoginBody
import de.ixacg.animestream.core.network.AnimeStreamApi
import de.ixacg.animestream.core.network.ApiError
import de.ixacg.animestream.core.network.SessionCookieStore
import de.ixacg.animestream.core.network.apiCall
import de.ixacg.animestream.core.network.requireSuccessful
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class SessionState(
    val ready: Boolean = false,
    val busy: Boolean = false,
    val user: AuthUser? = null,
    val error: String? = null,
)

class SessionRepository(
    private val api: AnimeStreamApi,
    private val cookieStore: SessionCookieStore,
) {
    private val mutableState = MutableStateFlow(SessionState())
    val state: StateFlow<SessionState> = mutableState.asStateFlow()

    suspend fun hydrate() {
        cookieStore.hydrate()
        val user = runCatching { apiCall { api.me().user } }.getOrNull()
        mutableState.value = SessionState(ready = true, user = user)
    }

    suspend fun login(
        identity: String,
        password: String,
    ): AuthUser {
        mutableState.value = mutableState.value.copy(busy = true, error = null)
        return try {
            val payload = apiCall { api.login(LoginBody(identity.trim(), password)) }
            val user = payload.user ?: throw ApiError(payload.error ?: "登录失败", 401)
            mutableState.value = SessionState(ready = true, user = user)
            user
        } catch (error: Throwable) {
            mutableState.value = mutableState.value.copy(busy = false, error = error.message ?: "登录失败")
            throw error
        }
    }

    suspend fun logout() {
        mutableState.value = mutableState.value.copy(busy = true, error = null)
        try {
            apiCall { api.logout() }.also(::requireSuccessful)
        } finally {
            cookieStore.clear()
            mutableState.value = SessionState(ready = true)
        }
    }
}
