package de.ixacg.animestream.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp

val Ink = Color(0xFF0B0D10)
val InkRaised = Color(0xFF14181D)
val InkSoft = Color(0xFF20262C)
val Paper = Color(0xFFF1ECE3)
val PaperMuted = Color(0xFFAAA69F)
val Ember = Color(0xFFC8664B)
val EmberSoft = Color(0xFFFFB59F)
val Jade = Color(0xFF65AFA2)
val ErrorRed = Color(0xFFFFB4AB)

private val DarkColors =
    darkColorScheme(
        primary = EmberSoft,
        onPrimary = Color(0xFF551707),
        primaryContainer = Color(0xFF7A2E1B),
        onPrimaryContainer = Color(0xFFFFDBD0),
        secondary = Jade,
        onSecondary = Color(0xFF003731),
        background = Ink,
        onBackground = Paper,
        surface = Ink,
        onSurface = Paper,
        surfaceVariant = InkRaised,
        onSurfaceVariant = PaperMuted,
        outline = Color(0xFF454B50),
        error = ErrorRed,
    )

private val LightColors =
    lightColorScheme(
        primary = Color(0xFF98462F),
        secondary = Color(0xFF2E6B62),
        background = Color(0xFFFBF8F3),
        surface = Color(0xFFFBF8F3),
        onBackground = Color(0xFF1B1B1A),
        onSurface = Color(0xFF1B1B1A),
    )

private val AppTypography =
    androidx.compose.material3.Typography(
        displaySmall = TextStyle(fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.SemiBold),
        headlineLarge = TextStyle(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold),
        headlineMedium = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold),
        titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 25.sp, fontFamily = FontFamily.SansSerif),
        bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp, fontFamily = FontFamily.SansSerif),
        labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
        labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.Medium),
    )

@Composable
fun AnimeStreamTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        shapes =
            MaterialTheme.shapes.copy(
                extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
                small = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
                medium = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                large = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
            ),
        content = content,
    )
}
