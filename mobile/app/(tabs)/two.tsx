import { StyleSheet, View, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';

import { Text } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useAuthStore } from '@/src/core/auth/authStore';
import { useUpdateStore } from '@/src/core/updates/updateStore';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { status, latest, progress, error, check, download, install, reset } = useUpdateStore();

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
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.separator} />
      {user ? (
        <View style={styles.userInfo}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Atualizações</Text>
        <Text style={styles.status}>{statusLabels[status] || status}</Text>
        {error && <ErrorText style={styles.error}>{error}</ErrorText>}

        {status === 'downloading' && progress !== null && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.min(Math.max(progress, 0), 100)}%` },
              ]}
            />
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          {status === 'idle' || status === 'up_to_date' || status === 'error' || status === 'ota_available' ? (
            <Button title="Verificar atualização" onPress={() => { check(); reset(); }} />
          ) : null}

          {status === 'update_available' && <Button title="Baixar" onPress={download} />}

          {status === 'ready_to_install' && <Button title="Instalar agora" onPress={install} />}

          {status === 'ota_available' && (
            <Button title="Reiniciar para aplicar" onPress={() => Updates.reloadAsync()} />
          )}
        </View>
      </View>

      <View style={styles.logoutButton}>
        <Button title="Log out" onPress={handleLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '100%',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    opacity: 0.7,
  },
  section: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  status: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
    textAlign: 'center',
  },
  error: {
    marginBottom: 12,
    width: '100%',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#007AFF',
  },
  progressText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    textAlign: 'right',
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  logoutButton: {
    width: '100%',
    maxWidth: 300,
  },
});
