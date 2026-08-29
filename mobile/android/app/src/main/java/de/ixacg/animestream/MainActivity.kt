package de.ixacg.animestream

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
import de.ixacg.animestream.ui.theme.AnimeStreamTheme

class MainActivity : ComponentActivity() {
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
                    AnimeStreamApp(viewModel)
                }
            }
        }
    }
}
