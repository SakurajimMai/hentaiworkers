package de.ixacg.animestream

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import de.ixacg.animestream.ui.AnimeStreamViewModel
import de.ixacg.animestream.ui.navigation.AnimeStreamApp
import de.ixacg.animestream.ui.navigation.shouldForwardAppDeepLink
import de.ixacg.animestream.ui.theme.AnimeStreamTheme
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

class MainActivity : ComponentActivity() {
    private val incomingDeepLinks = Channel<Intent>(Channel.BUFFERED)
    private val incomingDeepLinkFlow = incomingDeepLinks.receiveAsFlow()
    private val viewModel: AnimeStreamViewModel by viewModels {
        AnimeStreamViewModel.factory((application as AnimeStreamApplication).container)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AnimeStreamTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AnimeStreamApp(viewModel, incomingDeepLinkFlow)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (shouldForwardAppDeepLink(intent.action, intent.dataString)) {
            incomingDeepLinks.trySend(intent)
        }
    }
}
