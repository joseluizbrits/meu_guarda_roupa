import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';

import Colors from '@/constants/Colors';
import { spacing, radius, shadow, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useAuthStore } from '@/src/core/auth/authStore';
import { useUpdateStore } from '@/src/core/updates/updateStore';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { status, latest, progress, error, check, download, install, reset } = useUpdateStore();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const statusLabels: Record<string, string> = {
    idle: 'Pronto',
    checking_apk: 'Verificando atualização nativa...',
    checking_ota: 'Verificando atualização OTA...',
    ota_available: 'Atualização OTA disponível — reinicie para aplicar',
    update_available: `Versão ${latest?.version} (${latest?.version_code}) disponível`,
    downloading: 'Baixando APK...',
    ready_to_install: 'APK baixado — pronto para instalar',
    installing: 'Instalando...',
    up_to_date: 'App atualizado',
    error: 'Erro ao verificar',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Profile header card */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface }, shadow.md]}>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
        {user ? (
          <View style={styles.userInfo}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {user.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={[styles.name, { color: colors.text }]}>{user.full_name}</Text>
            <Text style={[styles.email, { color: colors.textSecondary }]}>{user.email}</Text>
          </View>
        ) : null}
      </View>

      {/* Updates section card */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }, shadow.sm]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Atualizações</Text>
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          {statusLabels[status] || status}
        </Text>
        {error && <ErrorText style={styles.error}>{error}</ErrorText>}

        {status === 'downloading' && progress !== null && (
          <View style={[styles.progressContainer, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: colors.primary },
              ]}
            />
            <Text style={[styles.progressText, { color: colors.textMuted }]}>{progress}%</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          {status === 'idle' || status === 'up_to_date' || status === 'error' || status === 'ota_available' ? (
            <Button title="Verificar atualização" variant="secondary" onPress={() => { check(); reset(); }} />
          ) : null}
          {status === 'update_available' && <Button title="Baixar" onPress={download} />}
          {status === 'ready_to_install' && <Button title="Instalar agora" onPress={install} />}
          {status === 'ota_available' && (
            <Button title="Reiniciar para aplicar" onPress={() => Updates.reloadAsync()} />
          )}
        </View>
      </View>

      <View style={styles.logoutButton}>
        <Button title="Log out" variant="outline" onPress={handleLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.lg,
  },
  profileCard: {
    width: '100%',
    alignItems: 'center',
    padding: spacing['2xl'],
    borderRadius: radius.lg,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.lg,
  },
  userInfo: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    ...typography.h2,
    color: '#FFFFFF',
  },
  name: {
    ...typography.h3,
  },
  email: {
    ...typography.body,
  },
  sectionCard: {
    width: '100%',
    padding: spacing['2xl'],
    borderRadius: radius.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  status: {
    ...typography.body,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  error: {
    marginBottom: spacing.md,
    width: '100%',
  },
  progressContainer: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: radius.pill,
  },
  progressText: {
    ...typography.caption,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoutButton: {
    width: '100%',
    maxWidth: 300,
  },
});
