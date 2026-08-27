import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../constants/theme';
import { signIn } from '../services/session';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await signIn(email.trim(), password);
      if (router.canGoBack()) router.back();
      else router.replace('/account');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <Text style={styles.title}>登录 AnimeStream</Text>
        <Text style={styles.hint}>使用网站账号登录后，收藏和历史会与网页同步。</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="邮箱或用户名"
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPassword}
          onSubmitEditing={submit}
          placeholder="密码"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={busy} onPress={submit} style={[styles.btn, busy && styles.btnDisabled]}>
          <Text style={styles.btnText}>{busy ? '登录中…' : '登录'}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  body: { flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  error: { color: colors.danger, fontSize: 13 },
  btn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontWeight: '800' },
  cancel: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
