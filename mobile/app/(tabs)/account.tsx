import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '../../constants/theme';
import { useSession } from '../../services/session';

export default function AccountScreen() {
  const router = useRouter();
  const { user, ready, logout } = useSession();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>我的</Text>
        {!ready ? (
          <Text style={styles.muted}>正在读取登录状态…</Text>
        ) : user ? (
          <>
            <Text style={styles.name}>{user.displayName || user.username}</Text>
            <Text style={styles.muted}>{user.username}</Text>
            <Pressable
              onPress={async () => {
                await logout();
              }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>退出登录</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.muted}>登录后收藏和观看/阅读历史会与网页同步。</Text>
            <Pressable onPress={() => router.push('/login')} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>登录</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  body: { gap: spacing.md, padding: spacing.xl },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  btn: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingVertical: 12,
  },
  btnText: { color: colors.text, fontWeight: '700' },
  btnPrimary: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingVertical: 12,
  },
  btnPrimaryText: { color: colors.white, fontWeight: '800' },
});
