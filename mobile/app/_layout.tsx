import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { View } from 'react-native';
import { colors } from '../constants/theme';

const navTheme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
    notification: colors.danger,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" backgroundColor={colors.background} />
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
            headerShown: false,
            navigationBarColor: colors.background,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="detail/[id]" />
          <Stack.Screen name="player/[id]" options={{ animation: 'fade' }} />
        </Stack>
      </View>
    </ThemeProvider>
  );
}
