package de.ixacg.animestream.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import de.ixacg.animestream.AppContainer
import de.ixacg.animestream.BuildConfig
import de.ixacg.animestream.core.media.MediaUrlNormalizer
import de.ixacg.animestream.core.model.Anime
import de.ixacg.animestream.core.model.LibrarySnapshot
import de.ixacg.animestream.core.model.MangaChapterDetail
import de.ixacg.animestream.core.model.MangaChapterResponse
import de.ixacg.animestream.core.model.MangaChapterSummary
import de.ixacg.animestream.core.model.MangaDetail
import de.ixacg.animestream.core.model.MangaPage
import de.ixacg.animestream.core.model.MangaRank
import de.ixacg.animestream.core.model.MangaSummary
import de.ixacg.animestream.core.model.PublicAdsConfig
import de.ixacg.animestream.core.model.Tag
import de.ixacg.animestream.data.repository.AvailableUpdate
import de.ixacg.animestream.data.repository.SessionState
import de.ixacg.animestream.data.repository.UpdateCheckResult
import de.ixacg.animestream.reader.ReaderLogic
import de.ixacg.animestream.reader.ReaderPreparationKey
import de.ixacg.animestream.reader.ReaderPreparationStore
import de.ixacg.animestream.reader.ReaderPreviewPreloader
import de.ixacg.animestream.reader.ReaderPreviewState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

data class Loadable<T>(
    val value: T? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

data class HomeContent(
    val animes: List<Anime> = emptyList(),
    val mangas: List<MangaSummary> = emptyList(),
)

private suspend fun <T> captureResult(request: suspend () -> T): Result<T> =
    try {
        Result.success(request())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }

internal fun Throwable.userMessage(): String = message?.takeIf(String::isNotBlank) ?: "请求失败，请重试"

data class AdsState(
    val config: PublicAdsConfig = PublicAdsConfig.Empty,
    val ready: Boolean = false,
)

data class AppUpdateState(
    val checking: Boolean = false,
    val available: AvailableUpdate? = null,
    val message: String? = null,
)

internal fun shouldStartAdsLoad(
    ready: Boolean,
    active: Boolean,
    force: Boolean,
): Boolean = !active && (force || !ready)

data class AnimeCatalogState(
    val items: List<Anime> = emptyList(),
    val query: String = "",
    val selectedTag: Tag? = null,
    val sort: String = "latest",
    val page: Int = 0,
    val totalPages: Int = 1,
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
)

data class MangaCatalogState(
    val items: List<MangaSummary> = emptyList(),
    val query: String = "",
    val selectedTag: String? = null,
    val rank: MangaRank = MangaRank.Latest,
    val page: Int = 0,
    val totalPages: Int = 1,
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
)

data class AnimeDetailContent(
    val anime: Anime,
    val similar: List<Anime> = emptyList(),
    val favorite: Boolean = false,
)

data class MangaDetailContent(
    val manga: MangaDetail,
    val recommendations: List<MangaSummary> = emptyList(),
    val favorite: Boolean = false,
)

data class ReaderContent(
    val manga: MangaDetail,
    val chapter: MangaChapterDetail,
    val favorite: Boolean,
    val currentPage: Int = 0,
    val mangaLoaded: Boolean = true,
    val favoriteLoaded: Boolean = true,
) {
    val chapterIndex: Int = manga.chapters.indexOfFirst { it.number == chapter.number }
    val previousChapter = manga.chapters.getOrNull(chapterIndex - 1)
    val nextChapter = manga.chapters.getOrNull(chapterIndex + 1)
}

private fun MangaDetail.withReaderChapter(chapter: MangaChapterDetail): MangaDetail {
    if (chapters.any { it.id == chapter.id || it.number == chapter.number }) return this
    val updatedChapters =
        (
            chapters +
                MangaChapterSummary(
                    id = chapter.id,
                    number = chapter.number,
                    title = chapter.title,
                    pageCount = maxOf(chapter.pageCount, chapter.pages.size),
                )
        ).sortedBy(MangaChapterSummary::number)
    return copy(
        chapters = updatedChapters,
        chapterCount = maxOf(chapterCount, updatedChapters.size),
    )
}

private fun MangaChapterResponse.readerManga(chapter: MangaChapterDetail): MangaDetail =
    MangaDetail(
        id = manga.id,
        title = manga.title,
        coverUrl = manga.coverUrl,
        chapterCount = 1,
        pageCount = maxOf(chapter.pageCount, chapter.pages.size),
        chapters =
            listOf(
                MangaChapterSummary(
                    id = chapter.id,
                    number = chapter.number,
                    title = chapter.title,
                    pageCount = maxOf(chapter.pageCount, chapter.pages.size),
                ),
            ),
    )

private fun MangaChapterResponse.normalizedForReader(): MangaChapterResponse {
    val normalizedPages =
        chapter.pages.mapNotNull { page ->
            MediaUrlNormalizer.normalize(page.imageUrl)?.let { page.copy(imageUrl = it) }
        }.distinctBy { it.index }
    return copy(chapter = chapter.copy(pages = normalizedPages))
}

class AnimeStreamViewModel(private val container: AppContainer) : ViewModel() {
    private val catalog = container.catalogRepository
    private val library = container.libraryRepository
    private val adsRepository = container.adsRepository
    private val updateRepository = container.updateRepository
    private val readerPreparations = ReaderPreparationStore<MangaChapterResponse>(scope = viewModelScope)
    private val readerPreviewPreloader =
        ReaderPreviewPreloader(
            context = container.applicationContext,
            imageLoader = container.imageLoader,
            scope = viewModelScope,
        )

    val sessionState: StateFlow<SessionState> = container.sessionRepository.state

    private val mutableAdsState = MutableStateFlow(AdsState())
    val adsState: StateFlow<AdsState> = mutableAdsState.asStateFlow()

    private val mutableUpdateState = MutableStateFlow(AppUpdateState())
    val updateState: StateFlow<AppUpdateState> = mutableUpdateState.asStateFlow()

    private val mutableHome = MutableStateFlow(Loadable<HomeContent>())
    val home: StateFlow<Loadable<HomeContent>> = mutableHome.asStateFlow()

    private val mutableTags = MutableStateFlow(Loadable<List<Tag>>())
    val tags: StateFlow<Loadable<List<Tag>>> = mutableTags.asStateFlow()

    private val mutableDiscover = MutableStateFlow(AnimeCatalogState())
    val discover: StateFlow<AnimeCatalogState> = mutableDiscover.asStateFlow()

    private val mutableMangaCatalog = MutableStateFlow(MangaCatalogState())
    val mangaCatalog: StateFlow<MangaCatalogState> = mutableMangaCatalog.asStateFlow()

    private val mutableLibrary = MutableStateFlow(Loadable<LibrarySnapshot>())
    val libraryState: StateFlow<Loadable<LibrarySnapshot>> = mutableLibrary.asStateFlow()

    private val mutableAnimeDetail = MutableStateFlow(Loadable<AnimeDetailContent>())
    val animeDetail: StateFlow<Loadable<AnimeDetailContent>> = mutableAnimeDetail.asStateFlow()

    private val mutableMangaDetail = MutableStateFlow(Loadable<MangaDetailContent>())
    val mangaDetail: StateFlow<Loadable<MangaDetailContent>> = mutableMangaDetail.asStateFlow()

    private val mutablePlayerAnime = MutableStateFlow(Loadable<Anime>())
    val playerAnime: StateFlow<Loadable<Anime>> = mutablePlayerAnime.asStateFlow()

    private val mutableReader = MutableStateFlow(Loadable<ReaderContent>())
    val reader: StateFlow<Loadable<ReaderContent>> = mutableReader.asStateFlow()

    private var discoverJob: Job? = null
    private var discoverLoadMoreJob: Job? = null
    private var mangaJob: Job? = null
    private var mangaLoadMoreJob: Job? = null
    private var homeJob: Job? = null
    private var adsJob: Job? = null
    private var detailJob: Job? = null
    private var mangaDetailJob: Job? = null
    private var playerJob: Job? = null
    private var readerJob: Job? = null
    private var readerPreparationJob: Job? = null
    private var readerPreparationKey: ReaderPreparationKey? = null
    private var readerPreparationPage: Int? = null
    private var progressJob: Job? = null
    private var updateJob: Job? = null
    private var discoverRequestGeneration = 0L
    private var mangaRequestGeneration = 0L
    private var readerRequestGeneration = 0L
    private var activeReaderRequestId: String? = null

    init {
        viewModelScope.launch {
            runCatching { container.legacyStorageMigrator.migrateIfNeeded() }
            container.sessionRepository.hydrate()
        }
    }

    fun ensureHomeLoaded() {
        if (
            !shouldStartHomeLoad(
                hasContent = mutableHome.value.value != null,
                loading = mutableHome.value.loading,
                active = homeJob?.isActive == true,
            )
        ) {
            return
        }
        refreshHome()
    }

    fun refreshHome(forceAds: Boolean = false) {
        homeJob?.cancel()
        homeJob =
            viewModelScope.launch {
                val previous = mutableHome.value.value
                mutableHome.update { it.copy(loading = true, error = null) }
                val coordinator = HomeLoadCoordinator(previous)
                supervisorScope {
                    launch {
                        publishHomeUpdate(
                            coordinator.animeCompleted(
                                captureResult {
                                    catalog.animes(page = 1, limit = HOME_ANIME_LIMIT, sort = "popular").data
                                },
                            ),
                            forceAds,
                        )
                    }
                    launch {
                        publishHomeUpdate(
                            coordinator.mangaCompleted(
                                captureResult {
                                    catalog.mangas(page = 1, limit = HOME_MANGA_LIMIT).data
                                },
                            ),
                            forceAds,
                        )
                    }
                }
            }
    }

    fun ensureAdsLoaded() {
        refreshAds()
    }

    private fun refreshAds(force: Boolean = false) {
        if (
            !shouldStartAdsLoad(
                ready = mutableAdsState.value.ready,
                active = adsJob?.isActive == true,
                force = force,
            )
        ) {
            return
        }
        adsJob =
            viewModelScope.launch {
                mutableAdsState.value = AdsState(config = adsRepository.load(force), ready = true)
            }
    }

    fun loadTags(force: Boolean = false) {
        if (!force && (mutableTags.value.loading || mutableTags.value.value != null)) return
        viewModelScope.launch {
            mutableTags.value = mutableTags.value.copy(loading = true, error = null)
            runCatching { catalog.popularTags(40) }
                .onSuccess { mutableTags.value = Loadable(value = it) }
                .onFailure { mutableTags.value = Loadable(error = it.userMessage()) }
        }
    }

    fun ensureDiscoverLoaded() {
        loadTags()
        if (mutableDiscover.value.page == 0 && !mutableDiscover.value.loading) refreshDiscover()
    }

    private fun publishHomeUpdate(
        update: HomeLoadUpdate,
        forceAds: Boolean,
    ) {
        mutableHome.value = update.state
        if (update.shouldLoadAds) refreshAds(force = forceAds)
        if (!update.state.loading) checkForUpdate()
    }

    fun checkForUpdate(force: Boolean = false) {
        if (updateJob?.isActive == true) return
        if (!force && mutableUpdateState.value.available != null) return
        mutableUpdateState.update { it.copy(checking = true, message = if (force) null else it.message) }
        updateJob =
            viewModelScope.launch {
                val result =
                    captureResult { updateRepository.check(BuildConfig.VERSION_CODE, force) }
                        .getOrDefault(UpdateCheckResult.Failed)
                when (result) {
                    UpdateCheckResult.Skipped -> mutableUpdateState.update { it.copy(checking = false) }
                    UpdateCheckResult.Current ->
                        mutableUpdateState.update {
                            it.copy(
                                checking = false,
                                message = if (force) "已是最新版本（Build ${BuildConfig.VERSION_CODE}）" else null,
                            )
                        }
                    is UpdateCheckResult.Available ->
                        mutableUpdateState.value = AppUpdateState(available = result.update)
                    UpdateCheckResult.Failed ->
                        mutableUpdateState.update {
                            it.copy(
                                checking = false,
                                message = if (force) "检查更新失败，请稍后重试" else null,
                            )
                        }
                }
            }
    }

    fun snoozeUpdate() {
        val update = mutableUpdateState.value.available ?: return
        mutableUpdateState.update { it.copy(available = null) }
        viewModelScope.launch { captureResult { updateRepository.snooze(update.versionCode) } }
    }

    fun searchAnimes(query: String) {
        mutableDiscover.update {
            it.copy(
                items = emptyList(),
                query = query,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshDiscover()
    }

    fun setAnimeSort(sort: String) {
        if (mutableDiscover.value.sort == sort) return
        mutableDiscover.update {
            it.copy(
                items = emptyList(),
                sort = sort,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshDiscover()
    }

    fun setAnimeTag(tag: Tag?) {
        if (mutableDiscover.value.selectedTag?.id == tag?.id) return
        mutableDiscover.update {
            it.copy(
                items = emptyList(),
                selectedTag = tag,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshDiscover()
    }

    fun clearAnimeFilters() {
        mutableDiscover.update {
            it.copy(
                items = emptyList(),
                query = "",
                selectedTag = null,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshDiscover()
    }

    fun refreshDiscover(forceAds: Boolean = false) {
        if (forceAds) refreshAds(force = true)
        discoverJob?.cancel()
        discoverLoadMoreJob?.cancel()
        discoverRequestGeneration += 1
        val requestGeneration = discoverRequestGeneration
        discoverJob =
            viewModelScope.launch {
                val request = mutableDiscover.value
                mutableDiscover.update { it.copy(loading = true, loadingMore = false, error = null) }
                val result =
                    captureResult {
                        catalog.animes(
                            page = 1,
                            limit = ANIME_PAGE_SIZE,
                            tagId = request.selectedTag?.id,
                            search = request.query,
                            sort = request.sort,
                        )
                    }
                if (!isCurrentCatalogRequest(requestGeneration, discoverRequestGeneration)) {
                    return@launch
                }
                result.onSuccess { response ->
                    mutableDiscover.update {
                        it.copy(
                            items = response.data.distinctBy(Anime::id),
                            page = response.pagination.page,
                            totalPages = response.pagination.totalPages,
                            hasLoaded = true,
                            loading = false,
                            error = null,
                        )
                    }
                }.onFailure { error ->
                    mutableDiscover.update { it.copy(loading = false, error = error.userMessage()) }
                }
            }
    }

    fun loadMoreAnimes() {
        val state = mutableDiscover.value
        if (
            state.loading ||
            state.loadingMore ||
            discoverLoadMoreJob?.isActive == true ||
            state.page >= state.totalPages
        ) {
            return
        }
        val requestGeneration = discoverRequestGeneration
        discoverLoadMoreJob =
            viewModelScope.launch {
                mutableDiscover.update { it.copy(loadingMore = true) }
                val result =
                    captureResult {
                        catalog.animes(
                            page = state.page + 1,
                            limit = ANIME_PAGE_SIZE,
                            tagId = state.selectedTag?.id,
                            search = state.query,
                            sort = state.sort,
                        )
                    }
                if (!isCurrentCatalogRequest(requestGeneration, discoverRequestGeneration)) {
                    return@launch
                }
                result.onSuccess { response ->
                    mutableDiscover.update { current ->
                        if (
                            shouldAppendCatalogPage(
                                requestGeneration = requestGeneration,
                                currentGeneration = discoverRequestGeneration,
                                currentPage = current.page,
                                responsePage = response.pagination.page,
                            )
                        ) {
                            current.copy(
                                items = (current.items + response.data).distinctBy(Anime::id),
                                page = response.pagination.page,
                                totalPages = response.pagination.totalPages,
                                loadingMore = false,
                            )
                        } else {
                            current.copy(loadingMore = false)
                        }
                    }
                }.onFailure { error ->
                    mutableDiscover.update { it.copy(loadingMore = false, error = error.userMessage()) }
                }
            }
    }

    fun ensureMangasLoaded() {
        if (mutableMangaCatalog.value.page == 0 && !mutableMangaCatalog.value.loading) refreshMangas()
    }

    fun searchMangas(query: String) {
        mutableMangaCatalog.update {
            it.copy(
                items = emptyList(),
                query = query,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshMangas()
    }

    fun setMangaTag(tag: String?) {
        if (mutableMangaCatalog.value.selectedTag == tag) return
        mutableMangaCatalog.update {
            it.copy(
                items = emptyList(),
                selectedTag = tag,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshMangas()
    }

    fun clearMangaFilters() {
        mutableMangaCatalog.update {
            it.copy(
                items = emptyList(),
                query = "",
                selectedTag = null,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshMangas()
    }

    fun setMangaRank(rank: MangaRank) {
        if (mutableMangaCatalog.value.rank == rank) return
        mutableMangaCatalog.update {
            it.copy(
                items = emptyList(),
                rank = rank,
                page = 0,
                totalPages = 1,
                hasLoaded = false,
                error = null,
            )
        }
        refreshMangas()
    }

    fun refreshMangas(forceAds: Boolean = false) {
        if (forceAds) refreshAds(force = true)
        mangaJob?.cancel()
        mangaLoadMoreJob?.cancel()
        mangaRequestGeneration += 1
        val requestGeneration = mangaRequestGeneration
        mangaJob =
            viewModelScope.launch {
                val request = mutableMangaCatalog.value
                mutableMangaCatalog.update { it.copy(loading = true, loadingMore = false, error = null) }
                val result =
                    captureResult {
                        catalog.mangas(
                            page = 1,
                            limit = MANGA_PAGE_SIZE,
                            query = request.query,
                            tag = request.selectedTag,
                            rank = request.rank,
                        )
                    }
                if (!isCurrentCatalogRequest(requestGeneration, mangaRequestGeneration)) {
                    return@launch
                }
                result.onSuccess { response ->
                    mutableMangaCatalog.update {
                        it.copy(
                            items = response.data.distinctBy(MangaSummary::id),
                            page = response.pagination.page,
                            totalPages = response.pagination.totalPages,
                            hasLoaded = true,
                            loading = false,
                            error = null,
                        )
                    }
                }.onFailure { error ->
                    mutableMangaCatalog.update { it.copy(loading = false, error = error.userMessage()) }
                }
            }
    }

    fun loadMoreMangas() {
        val state = mutableMangaCatalog.value
        if (
            state.loading ||
            state.loadingMore ||
            mangaLoadMoreJob?.isActive == true ||
            state.page >= state.totalPages
        ) {
            return
        }
        val requestGeneration = mangaRequestGeneration
        mangaLoadMoreJob =
            viewModelScope.launch {
                mutableMangaCatalog.update { it.copy(loadingMore = true) }
                val result =
                    captureResult {
                        catalog.mangas(
                            page = state.page + 1,
                            limit = MANGA_PAGE_SIZE,
                            query = state.query,
                            tag = state.selectedTag,
                            rank = state.rank,
                        )
                    }
                if (!isCurrentCatalogRequest(requestGeneration, mangaRequestGeneration)) {
                    return@launch
                }
                result.onSuccess { response ->
                    mutableMangaCatalog.update { current ->
                        if (
                            shouldAppendCatalogPage(
                                requestGeneration = requestGeneration,
                                currentGeneration = mangaRequestGeneration,
                                currentPage = current.page,
                                responsePage = response.pagination.page,
                            )
                        ) {
                            current.copy(
                                items = (current.items + response.data).distinctBy(MangaSummary::id),
                                page = response.pagination.page,
                                totalPages = response.pagination.totalPages,
                                loadingMore = false,
                            )
                        } else {
                            current.copy(loadingMore = false)
                        }
                    }
                }.onFailure { error ->
                    mutableMangaCatalog.update { it.copy(loadingMore = false, error = error.userMessage()) }
                }
            }
    }

    fun loadAnimeDetail(id: Long) {
        if (mutableAnimeDetail.value.value?.anime?.id == id && mutableAnimeDetail.value.error == null) return
        detailJob?.cancel()
        detailJob =
            viewModelScope.launch {
                mutableAnimeDetail.value = Loadable(loading = true)
                runCatching {
                    coroutineScope {
                        val anime = async { catalog.anime(id) }
                        val similar = async { runCatching { catalog.similarAnimes(id) }.getOrDefault(emptyList()) }
                        val favorite = async { library.isAnimeFavorite(id) }
                        AnimeDetailContent(anime.await(), similar.await(), favorite.await())
                    }
                }.onSuccess { mutableAnimeDetail.value = Loadable(value = it) }
                    .onFailure { mutableAnimeDetail.value = Loadable(error = it.userMessage()) }
            }
    }

    fun toggleAnimeFavorite() {
        val detail = mutableAnimeDetail.value.value ?: return
        viewModelScope.launch {
            runCatching { library.toggleAnimeFavorite(detail.anime) }
                .onSuccess { next ->
                    mutableAnimeDetail.update { it.copy(value = detail.copy(favorite = next), error = null) }
                }.onFailure { error ->
                    mutableAnimeDetail.update { it.copy(error = error.userMessage()) }
                }
        }
    }

    fun loadMangaDetail(id: Long) {
        if (mutableMangaDetail.value.value?.manga?.id == id && mutableMangaDetail.value.error == null) return
        mangaDetailJob?.cancel()
        mangaDetailJob =
            viewModelScope.launch {
                mutableMangaDetail.value = Loadable(loading = true)
                runCatching {
                    val manga = catalog.manga(id)
                    coroutineScope {
                        val recommendations = async { runCatching { catalog.mangaRecommendations(manga) }.getOrDefault(emptyList()) }
                        val favorite = async { library.isMangaFavorite(id) }
                        MangaDetailContent(manga, recommendations.await(), favorite.await())
                    }
                }.onSuccess { mutableMangaDetail.value = Loadable(value = it) }
                    .onFailure { mutableMangaDetail.value = Loadable(error = it.userMessage()) }
            }
    }

    fun toggleMangaFavorite() {
        val detail = mutableMangaDetail.value.value ?: return
        viewModelScope.launch {
            runCatching { library.toggleMangaFavorite(detail.manga.asSummary()) }
                .onSuccess { next ->
                    mutableMangaDetail.update { it.copy(value = detail.copy(favorite = next), error = null) }
                    mutableReader.update { reader ->
                        val current = reader.value
                        if (current?.manga?.id == detail.manga.id) {
                            reader.copy(value = current.copy(favorite = next, favoriteLoaded = true))
                        } else {
                            reader
                        }
                    }
                }.onFailure { error ->
                    mutableMangaDetail.update { it.copy(error = error.userMessage()) }
                }
        }
    }

    fun refreshLibrary() {
        viewModelScope.launch {
            mutableLibrary.update { it.copy(loading = true, error = null) }
            runCatching { library.snapshot() }
                .onSuccess { mutableLibrary.value = Loadable(value = it) }
                .onFailure { mutableLibrary.value = Loadable(error = it.userMessage()) }
        }
    }

    fun removeFavorite(
        kind: String,
        id: Long,
    ) {
        viewModelScope.launch {
            runCatching { library.removeFavorite(kind, id) }
                .onSuccess { refreshLibrary() }
                .onFailure { error -> mutableLibrary.update { it.copy(error = error.userMessage()) } }
        }
    }

    fun removeHistory(
        kind: String,
        id: Long,
    ) {
        viewModelScope.launch {
            library.removeHistory(kind, id)
            refreshLibrary()
        }
    }

    fun clearHistory() {
        viewModelScope.launch {
            library.clearHistory()
            refreshLibrary()
        }
    }

    fun login(
        identity: String,
        password: String,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            runCatching { container.sessionRepository.login(identity, password) }
                .onSuccess {
                    runCatching { library.syncAfterLogin() }
                    refreshLibrary()
                    onSuccess()
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { container.sessionRepository.logout() }
            refreshLibrary()
        }
    }

    fun loadPlayer(id: Long) {
        playerJob?.cancel()
        playerJob =
            viewModelScope.launch {
                mutablePlayerAnime.value = Loadable(loading = true)
                runCatching { catalog.anime(id) }
                    .onSuccess { anime ->
                        mutablePlayerAnime.value = Loadable(value = anime)
                        if (MediaUrlNormalizer.normalize(anime.videoUrl) != null) {
                            library.recordAnimeHistory(anime)
                        }
                    }.onFailure { mutablePlayerAnime.value = Loadable(error = it.userMessage()) }
            }
    }

    fun prepareReader(
        mangaId: Long,
        chapterNumber: Double,
        initialPage: Int = 0,
    ) {
        if (!chapterNumber.isFinite()) return
        val key = ReaderPreparationKey.of(mangaId, chapterNumber)
        val targetPage = initialPage.coerceAtLeast(0)
        if (
            readerPreparationKey == key &&
            readerPreparationPage == targetPage &&
            readerPreparationJob?.isActive == true
        ) {
            return
        }
        readerPreparationJob?.cancel()
        readerPreparationKey = key
        readerPreparationPage = targetPage
        readerPreparationJob =
            viewModelScope.launch {
                captureResult { preparedReaderChapter(key, mangaId, chapterNumber) }
                    .onSuccess { response ->
                        warmReaderTarget(response, mangaId, chapterNumber, targetPage)
                    }
            }
    }

    fun loadReader(
        mangaId: Long,
        chapterNumber: Double,
        initialPage: Int = 0,
        requestId: String? = null,
    ) {
        if (!chapterNumber.isFinite()) {
            mutableReader.value = Loadable(error = "章节编号无效")
            return
        }
        if (
            requestId != null &&
            requestId == activeReaderRequestId &&
            mutableReader.value.loading &&
            readerJob?.isActive == true
        ) {
            return
        }
        val isNewReaderRequest = shouldApplyReaderRestore(activeReaderRequestId, requestId)
        val previous = mutableReader.value.value?.takeIf { it.manga.id == mangaId }
        if (
            previous?.chapter?.number == chapterNumber &&
            previous.chapter.pages.isNotEmpty()
        ) {
            val restoredPage = initialPage.coerceIn(0, previous.chapter.pages.lastIndex)
            val shouldRecordRestore = isNewReaderRequest && restoredPage != previous.currentPage
            mutableReader.update { state ->
                val current = state.value
                if (current?.manga?.id == mangaId && current.chapter.number == chapterNumber) {
                    state.copy(
                        value =
                            current.copy(
                                currentPage = if (isNewReaderRequest) restoredPage else current.currentPage,
                            ),
                        loading = false,
                        error = null,
                    )
                } else {
                    state
                }
            }
            if (shouldRecordRestore) {
                progressJob?.cancel()
                progressJob =
                    viewModelScope.launch {
                        captureResult {
                            library.recordMangaHistory(
                                previous.manga.asSummary(),
                                previous.chapter.number,
                                restoredPage,
                            )
                        }
                    }
            }
            warmReaderTarget(previous.chapter.pages, mangaId, chapterNumber, restoredPage)
            activeReaderRequestId = requestId
            return
        }
        val detail = mutableMangaDetail.value.value?.takeIf { it.manga.id == mangaId }
        val cachedManga = detail?.manga ?: previous?.manga
        val cachedMangaLoaded = detail != null || previous?.mangaLoaded == true
        val cachedFavorite = detail?.favorite ?: previous?.favorite ?: false
        val cachedFavoriteLoaded = detail != null || previous?.favoriteLoaded == true

        readerJob?.cancel()
        progressJob?.cancel()
        activeReaderRequestId = requestId
        val identity = ReaderLoadIdentity(++readerRequestGeneration, mangaId, chapterNumber)
        readerJob =
            viewModelScope.launch {
                mutableReader.value = Loadable(loading = true)
                captureResult {
                    coroutineScope {
                        val preparationKey = ReaderPreparationKey.of(mangaId, chapterNumber)
                        val response = preparedReaderChapter(preparationKey, mangaId, chapterNumber)
                        val chapterValue = response.chapter
                        val pages = chapterValue.pages
                        val normalizedChapter = chapterValue
                        warmReaderTarget(response, mangaId, chapterNumber, initialPage)
                        val content =
                            ReaderContent(
                                manga =
                                    (cachedManga ?: response.readerManga(normalizedChapter))
                                        .withReaderChapter(normalizedChapter),
                                chapter = normalizedChapter,
                                favorite = cachedFavorite,
                                currentPage = initialPage.coerceIn(0, (pages.size - 1).coerceAtLeast(0)),
                                mangaLoaded = cachedMangaLoaded,
                                favoriteLoaded = cachedFavoriteLoaded,
                            )
                        if (identity.generation != readerRequestGeneration) return@coroutineScope

                        mutableReader.value = Loadable(value = content)
                        progressJob?.cancel()
                        progressJob =
                            launch {
                                captureResult {
                                    library.recordMangaHistory(
                                        content.manga.asSummary(),
                                        content.chapter.number,
                                        content.currentPage,
                                    )
                                }
                            }
                        if (!cachedMangaLoaded) {
                            launch {
                                captureResult { catalog.manga(mangaId) }.onSuccess { manga ->
                                    if (manga.id == mangaId) {
                                        updateReader(identity) { current ->
                                            if (current.mangaLoaded) {
                                                current
                                            } else {
                                                current.copy(
                                                    manga = manga.withReaderChapter(current.chapter),
                                                    mangaLoaded = true,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (!cachedFavoriteLoaded) {
                            launch {
                                captureResult { library.isMangaFavorite(mangaId) }.onSuccess { favorite ->
                                    updateReader(identity) { current ->
                                        if (current.favoriteLoaded) {
                                            current
                                        } else {
                                            current.copy(favorite = favorite, favoriteLoaded = true)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }.onFailure { error ->
                    if (identity.generation == readerRequestGeneration) {
                        mutableReader.value = Loadable(error = error.userMessage())
                    }
                }
            }
    }

    private suspend fun preparedReaderChapter(
        key: ReaderPreparationKey,
        mangaId: Long,
        chapterNumber: Double,
    ): MangaChapterResponse =
        readerPreparations.getOrLoad(key) {
            catalog.chapter(mangaId, chapterNumber).normalizedForReader()
        }

    private fun warmReaderTarget(
        response: MangaChapterResponse,
        mangaId: Long,
        chapterNumber: Double,
        requestedPage: Int,
    ) = warmReaderTarget(response.chapter.pages, mangaId, chapterNumber, requestedPage)

    private fun warmReaderTarget(
        pages: List<MangaPage>,
        mangaId: Long,
        chapterNumber: Double,
        requestedPage: Int,
    ) {
        val target = ReaderLogic.targetPage(pages, requestedPage) ?: return
        readerPreviewPreloader.warm(
            imageUrl = target.imageUrl,
            memoryCacheKey = ReaderLogic.previewMemoryCacheKey(mangaId, chapterNumber, target),
        )
    }

    internal fun readerPreviewState(memoryCacheKey: String): Flow<ReaderPreviewState> = readerPreviewPreloader.state(memoryCacheKey)

    internal fun currentReaderPreviewState(memoryCacheKey: String): ReaderPreviewState = readerPreviewPreloader.currentState(memoryCacheKey)

    private fun updateReader(
        identity: ReaderLoadIdentity,
        transform: (ReaderContent) -> ReaderContent,
    ) {
        mutableReader.update { state ->
            val content = state.value
            if (
                content == null ||
                !identity.matches(
                    activeGeneration = readerRequestGeneration,
                    activeMangaId = content.manga.id,
                    activeChapterNumber = content.chapter.number,
                )
            ) {
                state
            } else {
                state.copy(value = transform(content), loading = false, error = null)
            }
        }
    }

    fun setReaderPage(index: Int) {
        val content = mutableReader.value.value ?: return
        val safeIndex = index.coerceIn(0, (content.chapter.pages.size - 1).coerceAtLeast(0))
        if (content.currentPage == safeIndex) return
        mutableReader.update { state ->
            state.copy(value = state.value?.copy(currentPage = safeIndex))
        }
        progressJob?.cancel()
        progressJob =
            viewModelScope.launch {
                delay(READER_PROGRESS_DEBOUNCE_MS)
                mutableReader.value.value?.let { latest ->
                    library.recordMangaHistory(
                        latest.manga.asSummary(),
                        latest.chapter.number,
                        latest.currentPage,
                    )
                }
            }
    }

    fun toggleReaderFavorite() {
        val content = mutableReader.value.value ?: return
        val mangaId = content.manga.id
        viewModelScope.launch {
            runCatching { library.toggleMangaFavorite(content.manga.asSummary()) }
                .onSuccess { next ->
                    mutableReader.update { state ->
                        val current = state.value
                        if (current?.manga?.id == mangaId) {
                            state.copy(
                                value = current.copy(favorite = next, favoriteLoaded = true),
                                error = null,
                            )
                        } else {
                            state
                        }
                    }
                    mutableMangaDetail.update { state ->
                        val current = state.value
                        if (current?.manga?.id == mangaId) {
                            state.copy(value = current.copy(favorite = next), error = null)
                        } else {
                            state
                        }
                    }
                }.onFailure { error ->
                    mutableReader.update { state ->
                        if (state.value?.manga?.id == mangaId) state.copy(error = error.userMessage()) else state
                    }
                }
        }
    }

    companion object {
        private const val HOME_ANIME_LIMIT = 30
        private const val HOME_MANGA_LIMIT = 10
        private const val ANIME_PAGE_SIZE = 30
        private const val MANGA_PAGE_SIZE = 24
        private const val READER_PROGRESS_DEBOUNCE_MS = 800L

        fun factory(container: AppContainer): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T = AnimeStreamViewModel(container) as T
            }
    }
}
