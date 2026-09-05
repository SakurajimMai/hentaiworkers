package de.ixacg.animestream.reader

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.decode.DecodeResult
import coil.decode.Decoder
import coil.fetch.Fetcher
import coil.fetch.SourceResult
import coil.request.ImageRequest
import coil.request.Options
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val READER_IMAGE_REQUEST = "reader-image-request"

internal fun ImageRequest.Builder.readerImageRequest(): ImageRequest.Builder = setParameter(READER_IMAGE_REQUEST, true, memoryCacheKey = null)

internal class ReaderImageSingleFlight {
    class Factory : Fetcher.Factory<Uri> {
        private class TransferLock {
            val mutex = Mutex()
            var users = 0
        }

        private val transfers = mutableMapOf<String, TransferLock>()

        override fun create(
            data: Uri,
            options: Options,
            imageLoader: ImageLoader,
        ): Fetcher? {
            if (data.scheme != "http" && data.scheme != "https") return null
            if (options.parameters.value<Boolean>(READER_IMAGE_REQUEST) != true) return null
            val factoryIndex = imageLoader.components.fetcherFactories.indexOfFirst { it.first === this }
            if (factoryIndex < 0) return null
            return Fetcher {
                val key = options.diskCacheKey ?: data.toString()
                val transfer =
                    synchronized(transfers) {
                        transfers.getOrPut(key) { TransferLock() }.also { it.users++ }
                    }
                try {
                    transfer.mutex.withLock {
                        // Coil commits the HTTP body to disk before returning. Release the lock
                        // here so visible images can read that file without waiting for preview decode.
                        imageLoader.components.newFetcher(data, options, imageLoader, factoryIndex + 1)
                            ?.first?.fetch()
                    }
                } finally {
                    synchronized(transfers) {
                        transfer.users--
                        if (transfer.users == 0) transfers.remove(key)
                    }
                }
            }
        }
    }
}

internal class ReaderDiskOnlyDecoder {
    @OptIn(ExperimentalCoilApi::class)
    class Factory : Decoder.Factory {
        override fun create(
            result: SourceResult,
            options: Options,
            imageLoader: ImageLoader,
        ): Decoder =
            Decoder {
                // Coil 2.7 has no BlackholeDecoder. Its HTTP fetcher already writes the file;
                // return a non-bitmap result and let Coil close the source without decoding it.
                val diskKey = checkNotNull(options.diskCacheKey)
                check(imageLoader.diskCache?.openSnapshot(diskKey)?.use { true } == true) {
                    "Reader prefetch did not commit a disk file"
                }
                DecodeResult(ColorDrawable(Color.TRANSPARENT), isSampled = true)
            }
    }
}
