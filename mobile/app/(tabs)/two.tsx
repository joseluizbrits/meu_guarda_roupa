import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { useAuthStore } from '@/src/core/auth/authStore';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {user ? (
        <View style={styles.userInfo}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      ) : null}
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
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 24,
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
  logoutButton: {
    width: 160,
  },
});
