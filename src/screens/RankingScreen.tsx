import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, MacroColors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import {
  createGroup,
  getUserGroups,
  joinGroupByCode,
  subscribeGroupRanking,
  upsertMemberStats,
} from '../services/groupService';
import { useStore, selectGoals, selectMemberStats, selectTodayLog } from '../store';
import { calcGoalProgressPercent, formatDate, getCompletedGoals, getInitials, macroPercent } from '../utils/nutrition';
import { FoodNutrition, Group, GroupMemberStats, MacroGoals } from '../types';

const EMPTY_NUTRITION: FoodNutrition = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  sugar: 0,
};

const DEFAULT_GOALS: MacroGoals = {
  kcal: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 25,
  water: 2500,
  sugar: 50,
  sodium: 2300,
};

type RankingRow = GroupMemberStats & {
  progressPercent: number;
  isCurrentUser?: boolean;
};

function buildRankingRow(
  stat: GroupMemberStats,
  index: number,
  currentUserId?: string
): RankingRow {
  return {
    ...stat,
    rank: index + 1,
    progressPercent: calcGoalProgressPercent(stat.totalNutrition, stat.goals),
    isCurrentUser: stat.userId === currentUserId,
  };
}

function buildCurrentUserStat({
  userId,
  name,
  totalNutrition,
  goals,
}: {
  userId: string;
  name: string;
  totalNutrition: FoodNutrition;
  goals: MacroGoals;
}): GroupMemberStats {
  return {
    userId,
    name,
    avatarInitials: getInitials(name),
    avatarColor: Colors.green50,
    totalNutrition,
    goals,
    completedGoals: getCompletedGoals(totalNutrition, goals),
    points: calcGoalProgressPercent(totalNutrition, goals),
    rank: 1,
    date: formatDate(new Date()),
  };
}

function GoalProgressLine({
  label,
  current,
  goal,
  color,
  unit,
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
  unit: string;
}) {
  const pct = macroPercent(current, goal);
  return (
    <View style={styles.goalLine}>
      <View style={styles.goalLineTop}>
        <Text style={styles.goalLineLabel}>{label}</Text>
        <Text style={[styles.goalLinePct, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.goalLineBar}>
        <View style={[styles.goalLineFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.goalLineSub}>{Math.round(current)}{unit} de {Math.round(goal)}{unit}</Text>
    </View>
  );
}

function RankingCard({ row }: { row: RankingRow }) {
  const medal =
    row.rank === 1 ? '1º' :
    row.rank === 2 ? '2º' :
    row.rank === 3 ? '3º' :
    `${row.rank}º`;

  return (
    <View style={[styles.rankCard, row.isCurrentUser && styles.currentUserCard]}>
      <View style={styles.rankTop}>
        <View style={styles.rankLeft}>
          <View style={[styles.rankAvatar, { backgroundColor: row.avatarColor || Colors.green50 }]}>
            <Text style={styles.rankAvatarText}>{row.avatarInitials || getInitials(row.name)}</Text>
          </View>
          <View style={styles.rankNameWrap}>
            <Text style={styles.rankName}>{row.name}{row.isCurrentUser ? ' · você' : ''}</Text>
            <Text style={styles.rankSub}>{row.completedGoals.length} metas concluídas hoje</Text>
          </View>
        </View>
        <View style={styles.rankScore}>
          <Text style={styles.rankMedal}>{medal}</Text>
          <Text style={styles.rankPercent}>{row.progressPercent}%</Text>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <GoalProgressLine label="Calorias" current={row.totalNutrition.kcal} goal={row.goals.kcal} color={Colors.green400} unit=" kcal" />
        <GoalProgressLine label="Proteína" current={row.totalNutrition.protein} goal={row.goals.protein} color={MacroColors.protein.primary} unit="g" />
        <GoalProgressLine label="Carboidratos" current={row.totalNutrition.carbs} goal={row.goals.carbs} color={MacroColors.carbs.primary} unit="g" />
        <GoalProgressLine label="Gorduras" current={row.totalNutrition.fat} goal={row.goals.fat} color={MacroColors.fat.primary} unit="g" />
        <GoalProgressLine label="Fibras" current={row.totalNutrition.fiber} goal={row.goals.fiber} color={MacroColors.fiber.primary} unit="g" />
      </View>
    </View>
  );
}

export function RankingScreen() {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const todayLog = useStore(selectTodayLog);
  const goals = useStore(selectGoals);
  const groups = useStore((s) => s.groups);
  const memberStats = useStore(selectMemberStats);
  const setGroups = useStore((s) => s.setGroups);
  const setMemberStats = useStore((s) => s.setMemberStats);

  const [inviteCode, setInviteCode] = useState('');
  const [loadingGroup, setLoadingGroup] = useState(false);

  const activeGoals = useMemo(() => ({ ...DEFAULT_GOALS, ...(goals ?? {}) }), [goals]);
  const totalNutrition = todayLog?.totalNutrition ?? EMPTY_NUTRITION;
  const currentGroup = groups[0];
  const displayName = profile?.name ?? user?.name ?? 'Usuário';

  const currentUserStat = useMemo(
    () => user
      ? buildCurrentUserStat({
          userId: user.id,
          name: displayName,
          totalNutrition,
          goals: activeGoals,
        })
      : null,
    [activeGoals, displayName, totalNutrition, user]
  );

  const rankingRows = useMemo(() => {
    const rowsByUser = new Map<string, GroupMemberStats>();
    for (const stat of memberStats) rowsByUser.set(stat.userId, stat);
    if (currentUserStat) rowsByUser.set(currentUserStat.userId, currentUserStat);

    return Array.from(rowsByUser.values())
      .sort(
        (a, b) =>
          calcGoalProgressPercent(b.totalNutrition, b.goals) -
          calcGoalProgressPercent(a.totalNutrition, a.goals)
      )
      .map((stat, index) => buildRankingRow(stat, index, user?.id));
  }, [currentUserStat, memberStats, user?.id]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) return;

    let cancelled = false;
    getUserGroups(user.id)
      .then((loadedGroups) => {
        if (!cancelled) setGroups(loadedGroups);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });

    return () => {
      cancelled = true;
    };
  }, [setGroups, user]);

  useEffect(() => {
    if (!currentGroup) return undefined;
    if (!isFirebaseConfigured || user?.id === 'dev_user') return undefined;

    return subscribeGroupRanking(currentGroup.id, setMemberStats);
  }, [currentGroup, setMemberStats, user?.id]);

  useEffect(() => {
    if (!user || !currentGroup || user.id === 'dev_user' || !isFirebaseConfigured) return;

    upsertMemberStats(user.id, displayName, currentGroup.id, totalNutrition, activeGoals)
      .catch(() => undefined);
  }, [activeGoals, currentGroup, displayName, totalNutrition, user]);

  async function handleCreateGroup() {
    if (!user) return;
    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      const localGroup: Group = {
        id: 'local_group',
        name: 'Família NutriMeta',
        emoji: '🏆',
        ownerId: user.id,
        memberIds: [user.id],
        inviteCode: 'LOCAL',
        createdAt: new Date(),
      };
      setGroups([localGroup]);
      return;
    }

    setLoadingGroup(true);
    try {
      const group = await createGroup(user.id, 'Família NutriMeta', '🏆');
      setGroups([group, ...groups]);
      Alert.alert('Grupo criado', `Código de convite: ${group.inviteCode}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível criar o grupo agora.');
    } finally {
      setLoadingGroup(false);
    }
  }

  async function handleJoinGroup() {
    if (!user || !inviteCode.trim()) return;
    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      Alert.alert('Modo local', 'Entrar por código precisa do Firebase ativo e login real.');
      return;
    }

    setLoadingGroup(true);
    try {
      const group = await joinGroupByCode(user.id, inviteCode.trim());
      setGroups([group, ...groups.filter((item) => item.id !== group.id)]);
      setInviteCode('');
    } catch (err: any) {
      Alert.alert('Código inválido', err?.message ?? 'Não encontramos esse grupo.');
    } finally {
      setLoadingGroup(false);
    }
  }

  async function handleShareInvite() {
    if (!currentGroup) return;
    await Share.share({
      message: `Entre no meu ranking do NutriMeta com o código: ${currentGroup.inviteCode}`,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Ranking</Text>
          <Text style={styles.title}>Família e amigos</Text>
          <Text style={styles.subtitle}>Primeiro lugar é quem está mais perto de bater as metas.</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.groupPanel}>
          {currentGroup ? (
            <>
              <View style={styles.groupTop}>
                <View>
                  <Text style={styles.groupName}>{currentGroup.emoji} {currentGroup.name}</Text>
                  <Text style={styles.groupHint}>Código: {currentGroup.inviteCode}</Text>
                </View>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
                  <Text style={styles.shareText}>Compartilhar</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.groupName}>Crie um grupo para competir</Text>
              <Text style={styles.groupHint}>Parentes e amigos entram com um código e acompanham a evolução diária das metas.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateGroup} disabled={loadingGroup}>
                <Text style={styles.primaryText}>{loadingGroup ? 'Criando...' : 'Criar grupo'}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.joinRow}>
            <TextInput
              style={styles.joinInput}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Código do grupo"
              placeholderTextColor={Colors.gray400}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.joinBtn} onPress={handleJoinGroup} disabled={loadingGroup}>
              <Text style={styles.joinText}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryPanel}>
          <Text style={styles.summaryLabel}>Sua evolução média</Text>
          <Text style={styles.summaryPercent}>{currentUserStat ? calcGoalProgressPercent(currentUserStat.totalNutrition, currentUserStat.goals) : 0}%</Text>
          <Text style={styles.summaryHint}>Média de calorias, proteína, carboidratos, gorduras e fibras.</Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Ranking de hoje</Text>
          <Text style={styles.sectionHint}>Ordenado por quem está mais perto da meta</Text>
        </View>

        {rankingRows.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="leaderboard" size={42} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Sem dados ainda</Text>
            <Text style={styles.emptyText}>Registre uma refeição para aparecer no ranking.</Text>
          </View>
        ) : (
          rankingRows.map((row) => <RankingCard key={row.userId} row={row} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  eyebrow: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gray800 },
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400 },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 760 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: 110 },
  groupPanel: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  groupTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  groupName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  groupHint: { marginTop: 3, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  primaryBtn: { marginTop: Spacing.md, backgroundColor: Colors.green400, borderRadius: Radius.md, alignItems: 'center', paddingVertical: Spacing.md },
  primaryText: { color: Colors.white, fontWeight: Typography.bold },
  shareBtn: { backgroundColor: Colors.green50, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.green400 },
  shareText: { color: Colors.green600, fontWeight: Typography.bold, fontSize: Typography.sm },
  joinRow: { marginTop: Spacing.md, flexDirection: 'row', gap: Spacing.sm },
  joinInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: Typography.base, color: Colors.gray800 },
  joinBtn: { backgroundColor: Colors.gray800, borderRadius: Radius.md, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  joinText: { color: Colors.white, fontWeight: Typography.bold },
  summaryPanel: {
    backgroundColor: Colors.green600,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  summaryLabel: { color: Colors.green50, fontSize: Typography.sm, fontWeight: Typography.semibold },
  summaryPercent: { color: Colors.white, fontSize: 40, fontWeight: Typography.bold, marginTop: 2 },
  summaryHint: { color: Colors.green100, fontSize: Typography.sm },
  listHeader: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  sectionHint: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400 },
  rankCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  currentUserCard: { borderColor: Colors.green400 },
  rankTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  rankLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  rankAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rankAvatarText: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold },
  rankNameWrap: { flex: 1 },
  rankName: { fontSize: Typography.md, color: Colors.gray800, fontWeight: Typography.bold },
  rankSub: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400 },
  rankScore: { alignItems: 'flex-end' },
  rankMedal: { fontSize: Typography.sm, color: Colors.gray400, fontWeight: Typography.bold },
  rankPercent: { fontSize: Typography.xl, color: Colors.green600, fontWeight: Typography.bold },
  progressBlock: { marginTop: Spacing.md, gap: Spacing.sm },
  goalLine: { gap: 4 },
  goalLineTop: { flexDirection: 'row', justifyContent: 'space-between' },
  goalLineLabel: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.semibold },
  goalLinePct: { fontSize: Typography.xs, fontWeight: Typography.bold },
  goalLineBar: { height: 5, borderRadius: 3, backgroundColor: Colors.gray50, overflow: 'hidden' },
  goalLineFill: { height: 5, borderRadius: 3 },
  goalLineSub: { fontSize: Typography.xs, color: Colors.gray400 },
  emptyState: { alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  emptyText: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
});
