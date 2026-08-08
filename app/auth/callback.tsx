import { View, ActivityIndicator } from 'react-native';

export default function AuthCallback() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#07070F',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator size="small" color="#A99FF8" />
    </View>
  );
}