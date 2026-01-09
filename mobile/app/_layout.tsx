import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: '动漫列表',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="detail/[id]"
        options={{
          title: '动漫详情',
          headerShown: true,
        }}
      />
    </Stack>
  );
}
