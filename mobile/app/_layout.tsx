import 'react-native-gesture-handler';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, screenFill } from '../constants/theme';
import { hydrateSession } from '../services/session';

function SessionBootstrap() {
  useEffect(() => {
    hydrateSession().catch(() => undefined);
  }, []);
  return null;
}

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

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AnimeStream root crash', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
            应用启动失败
          </Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
            {this.state.error.message || '未知错误'}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.white, fontWeight: '700' }}>重试</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={screenFill}>
    <SafeAreaProvider>
      <SessionBootstrap />
      <RootErrorBoundary>
        <ThemeProvider value={navTheme}>
          <View collapsable={false} style={screenFill}>
            <StatusBar style="light" backgroundColor={colors.background} />
            <Stack
              screenOptions={{
                animation: 'fade',
                animationDuration: 180,
                contentStyle: screenFill,
                freezeOnBlur: false,
                headerShown: false,
                navigationBarColor: colors.background,
                navigationBarTranslucent: false,
                statusBarBackgroundColor: colors.background,
                statusBarStyle: 'light',
                statusBarTranslucent: false,
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="detail/[id]" />
              <Stack.Screen name="player/[id]" options={{ animation: 'fade' }} />
              <Stack.Screen name="manga-detail/[id]" />
              <Stack.Screen name="manga-reader/[id]/[number]" options={{ animation: 'fade' }} />
              <Stack.Screen name="login" options={{ animation: 'fade', presentation: 'modal' }} />
            </Stack>
          </View>
        </ThemeProvider>
      </RootErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
