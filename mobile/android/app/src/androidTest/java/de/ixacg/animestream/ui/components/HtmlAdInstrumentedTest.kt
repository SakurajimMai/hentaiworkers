package de.ixacg.animestream.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.math.abs
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HtmlAdInstrumentedTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun replacingHtmlUpdatesTheRetainedWebViewHeightAndCanShrink() {
        var html by mutableStateOf("""<div style="height:180px">First creative</div>""")
        compose.setContent {
            Column {
                HtmlAd(html, modifier = Modifier.testTag("ad"))
            }
        }
        waitForHeight(180f)
        compose.runOnIdle {
            html = """<div id="creative" style="height:240px">Second creative</div>"""
        }
        waitForHeight(240f)
        compose.runOnIdle {
            html = """<div style="height:50px">Third creative</div>"""
        }
        waitForHeight(50f)
    }

    @Test
    fun configuredLeaderboardKeepsItsRatioOnDevice() {
        compose.setContent {
            Column {
                HtmlAd(
                    html = """<div style="width:728px;height:90px;background:#147d72">Leaderboard</div>""",
                    width = 728,
                    height = 90,
                    modifier = Modifier.testTag("ad"),
                )
            }
        }
        compose.waitUntil(10_000) {
            val bounds = compose.onNodeWithTag("ad").fetchSemanticsNode().boundsInRoot
            bounds.width > 0 && abs(bounds.height - bounds.width * 90f / 728f) < 2f
        }
    }

    private fun waitForHeight(expected: Float) {
        compose.waitUntil(10_000) {
            val bounds = compose.onNodeWithTag("ad").fetchSemanticsNode().boundsInRoot
            abs(bounds.height / compose.density.density - expected) < 2f
        }
    }
}
