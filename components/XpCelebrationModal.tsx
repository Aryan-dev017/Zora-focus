import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

type XpCelebrationModalProps = {
  visible: boolean;
  xpEarned: number;
  totalXp: number;
  onDone: () => void;
};

export const XpCelebrationModal = ({
  visible,
  xpEarned,
  totalXp,
  onDone,
}: XpCelebrationModalProps) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.container}>
        <Pressable style={styles.scrim} onPress={onDone} />

        <View style={styles.cardWrap}>
          <LinearGradient
            colors={['rgba(123,110,246,0.24)', 'rgba(17,17,34,0.98)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.sparkleBadge}>
              <Feather name="zap" size={18} color="#0A0818" />
            </View>

            <Text style={styles.kicker}>Session Complete</Text>
            <Text style={styles.title}>XP gained</Text>
            <Text style={styles.xp}>+{xpEarned}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Feather name="trending-up" size={15} color="#F5C842" />
                <Text style={styles.statLabel}>Session gain</Text>
                <Text style={styles.statValue}>+{xpEarned} XP</Text>
              </View>

              <View style={styles.statCard}>
                <Feather name="award" size={15} color="#A99FF8" />
                <Text style={styles.statLabel}>Total XP</Text>
                <Text style={styles.statValue}>{totalXp.toLocaleString()}</Text>
              </View>
            </View>

            <Pressable onPress={onDone} style={styles.btn}>
              <LinearGradient
                colors={['#9B8EF8', '#5C4FD4']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.btnInner}
              >
                <Text style={styles.btnText}>Keep going</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,2,7,0.78)',
  },
  cardWrap: {
    width: '100%',
    maxWidth: 360,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(169,159,248,0.24)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  sparkleBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5C842',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  kicker: {
    color: '#A99FF8',
    fontFamily: 'DM_Sans_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: '#EEEDF8',
    fontFamily: 'Fraunces_900Black',
    fontSize: 28,
    letterSpacing: -0.6,
  },
  xp: {
    color: '#F5C842',
    fontFamily: 'Fraunces_900Black',
    fontSize: 44,
    letterSpacing: -1.5,
    marginTop: 10,
    marginBottom: 18,
  },
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 8,
  },
  statLabel: {
    color: '#7E7E9A',
    fontFamily: 'DM_Sans_500Medium',
    fontSize: 11,
  },
  statValue: {
    color: '#EEEDF8',
    fontFamily: 'DM_Sans_700Bold',
    fontSize: 15,
  },
  btn: {
    width: '100%',
    marginTop: 18,
  },
  btnInner: {
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontFamily: 'DM_Sans_700Bold',
    fontSize: 15,
  },
});
