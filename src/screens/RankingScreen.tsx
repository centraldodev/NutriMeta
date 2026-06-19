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

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import {
  addCommunityComment,
  createGroup,
  getUserGroups,
  joinGroupByCode,
  subscribeCommunityComments,
  subscribeGroupRanking,
  upsertMemberStats,
} from '../services/groupService';
import { saveUserProfile } from '../services/authService';
import { useStore, selectGoals, selectMemberStats, selectTodayLog } from '../store';
import { calcGoalProgressPercent, formatDate, getCompletedGoals, getInitials } from '../utils/nutrition';
import { CommunityComment, CommunityPrivacy, FoodNutrition, Group, GroupMemberStats, MacroGoals } from '../types';

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

type CommunityRow = GroupMemberStats & {
  isCurrentUser?: boolean;
  progressPercent: number;
};

type CommunitySignal = {
  key: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  tone: 'green' | 'blue' | 'orange' | 'purple' | 'gray';
};

const SIGNAL_COLORS: Record<CommunitySignal['tone'], { bg: string; text: string; border: string }> = {
  green: { bg: Colors.green50, text: Colors.green600, border: Colors.green100 },
  blue: { bg: Colors.carbsL, text: Colors.info, border: '#B9D8F4' },
  orange: { bg: Colors.fatL, text: Colors.warning, border: '#E9C58E' },
  purple: { bg: Colors.purpleL, text: Colors.purpleD, border: Colors.purple },
  gray: { bg: Colors.gray50, text: Colors.gray600, border: Colors.borderMd },
};

const DEFAULT_PRIVACY: CommunityPrivacy = {
  showProtein: true,
  showFiber: true,
  showCalories: true,
  showStreak: true,
  showLimits: true,
};

function ratio(current: number | undefined, goal: number): number {
  if (!goal) return 0;
  return (current ?? 0) / goal;
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
  const completedGoals = getCompletedGoals(totalNutrition, goals);
  return {
    userId,
    name,
    avatarInitials: getInitials(name),
    avatarColor: Colors.green50,
    totalNutrition,
    goals,
    completedGoals,
    streakDays: 0,
    points: calcGoalProgressPercent(totalNutrition, goals),
    rank: 1,
    date: formatDate(new Date()),
  };
}

function buildSignals(row: CommunityRow): CommunitySignal[] {
  const signals: CommunitySignal[] = [];
  const completed = new Set(row.completedGoals);
  const privacy = { ...DEFAULT_PRIVACY, ...(row.privacy ?? {}) };
  const kcalRatio = ratio(row.totalNutrition.kcal, row.goals.kcal);
  const sodiumRatio = ratio(row.totalNutrition.sodium, row.goals.sodium);
  const sugarRatio = ratio(row.totalNutrition.sugar, row.goals.sugar);

  if (privacy.showProtein && completed.has('protein')) {
    signals.push({ key: 'protein', icon: 'fitness-center', label: 'bateu proteína', tone: 'orange' });
  }
  if (privacy.showFiber && completed.has('fiber')) {
    signals.push({ key: 'fiber', icon: 'eco', label: 'boa fibra', tone: 'green' });
  }
  if (privacy.showCalories && kcalRatio >= 0.85 && kcalRatio <= 1.1) {
    signals.push({ key: 'kcal', icon: 'track-changes', label: 'calorias na faixa', tone: 'blue' });
  }
  if (privacy.showStreak && (row.streakDays ?? 0) >= 2) {
    signals.push({ key: 'streak', icon: 'local-fire-department', label: `${row.streakDays} dias consistentes`, tone: 'purple' });
  }
  if (privacy.showLimits && sodiumRatio > 0 && sodiumRatio <= 1 && sugarRatio > 0 && sugarRatio <= 1) {
    signals.push({ key: 'limits', icon: 'verified', label: 'limites controlados', tone: 'green' });
  }

  return signals.slice(0, 4);
}

function buildCommunityMessage(row: CommunityRow): string {
  const signals = buildSignals(row);
  if (signals.some((signal) => signal.key === 'streak')) {
    return `${row.name} vem mantendo uma rotina consistente nos últimos dias.`;
  }
  if (signals.some((signal) => signal.key === 'protein') && signals.some((signal) => signal.key === 'kcal')) {
    return `${row.name} alinhou proteína e calorias hoje, um bom sinal de aderência.`;
  }
  if (signals.some((signal) => signal.key === 'fiber')) {
    return `${row.name} deu atenção à qualidade da alimentação hoje.`;
  }
  if (row.completedGoals.length > 0) {
    return `${row.name} já concluiu algumas metas do dia.`;
  }
  if (row.totalNutrition.kcal > 0) {
    return `${row.name} registrou progresso hoje e ainda tem espaço para evoluir.`;
  }
  return `${row.name} ainda não compartilhou progresso agregado hoje.`;
}

function CommunityCard({
  row,
  comments,
  commentValue,
  onCommentChange,
  onSendComment,
}: {
  row: CommunityRow;
  comments: CommunityComment[];
  commentValue: string;
  onCommentChange: (value: string) => void;
  onSendComment: () => void;
}) {
  const signals = buildSignals(row);
  const message = buildCommunityMessage(row);
  const hasActivity = row.totalNutrition.kcal > 0 || row.completedGoals.length > 0;

  return (
    <View style={[styles.memberCard, row.isCurrentUser && styles.currentUserCard]}>
      <View style={styles.memberTop}>
        <View style={styles.memberLeft}>
          <View style={[styles.avatar, { backgroundColor: row.avatarColor || Colors.green50 }]}>
            <Text style={styles.avatarText}>{row.avatarInitials || getInitials(row.name)}</Text>
          </View>
          <View style={styles.memberNameWrap}>
            <Text style={styles.memberName}>{row.name}{row.isCurrentUser ? ' · você' : ''}</Text>
            <Text style={styles.memberSub}>{hasActivity ? 'Progresso agregado de hoje' : 'Aguardando registros de hoje'}</Text>
          </View>
        </View>
        <View style={[styles.statusDot, hasActivity && styles.statusDotActive]} />
      </View>

      <Text style={styles.memberMessage}>{message}</Text>

      <View style={styles.signalWrap}>
        {signals.length > 0 ? (
          signals.map((signal) => {
            const colors = SIGNAL_COLORS[signal.tone];
            return (
              <View key={signal.key} style={[styles.signalChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <MaterialIcons name={signal.icon} size={15} color={colors.text} />
                <Text style={[styles.signalText, { color: colors.text }]}>{signal.label}</Text>
              </View>
            );
          })
        ) : (
          <View style={styles.signalChip}>
            <MaterialIcons name="lock-outline" size={15} color={Colors.gray600} />
            <Text style={styles.signalText}>sem detalhes privados</Text>
          </View>
        )}
      </View>

      <Text style={styles.privacyNote}>Sem alimentos, porções ou quantidades individuais.</Text>

      <View style={styles.commentBlock}>
        <Text style={styles.commentTitle}>Comentários públicos</Text>
        {comments.slice(0, 2).map((comment) => (
          <View key={comment.id} style={styles.commentItem}>
            <Text style={styles.commentAuthor}>{comment.authorName}</Text>
            <Text style={styles.commentMessage}>{comment.message}</Text>
          </View>
        ))}
        {comments.length === 0 && <Text style={styles.noComments}>Seja a primeira pessoa a incentivar.</Text>}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={commentValue}
            onChangeText={onCommentChange}
            placeholder="Escreva um apoio..."
            placeholderTextColor={Colors.gray400}
            maxLength={240}
          />
          <TouchableOpacity style={styles.commentSend} onPress={onSendComment}>
            <MaterialIcons name="send" size={17} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PrivacyToggle({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.privacyToggle, value && styles.privacyToggleActive]} onPress={onPress}>
      <MaterialIcons name={value ? 'visibility' : 'visibility-off'} size={15} color={value ? Colors.green600 : Colors.gray600} />
      <Text style={[styles.privacyToggleText, value && styles.privacyToggleTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  const setProfile = useStore((s) => s.setProfile);

  const [inviteCode, setInviteCode] = useState('');
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const activeGoals = useMemo(() => ({ ...DEFAULT_GOALS, ...(goals ?? {}) }), [goals]);
  const totalNutrition = todayLog?.totalNutrition ?? EMPTY_NUTRITION;
  const currentGroup = groups[0];
  const displayName = profile?.name ?? user?.name ?? 'Usuário';

  const currentUserStat = useMemo(
    () => user
      ? {
          ...buildCurrentUserStat({
            userId: user.id,
            name: displayName,
            totalNutrition,
            goals: activeGoals,
          }),
          privacy: profile?.communityPrivacy ?? DEFAULT_PRIVACY,
        }
      : null,
    [activeGoals, displayName, profile?.communityPrivacy, totalNutrition, user]
  );

  const communityRows = useMemo(() => {
    const rowsByUser = new Map<string, GroupMemberStats>();
    for (const stat of memberStats) rowsByUser.set(stat.userId, stat);
    if (currentUserStat) rowsByUser.set(currentUserStat.userId, {
      ...rowsByUser.get(currentUserStat.userId),
      ...currentUserStat,
      streakDays: rowsByUser.get(currentUserStat.userId)?.streakDays ?? currentUserStat.streakDays,
    });

    return Array.from(rowsByUser.values())
      .map((stat) => ({
        ...stat,
        isCurrentUser: stat.userId === user?.id,
        progressPercent: calcGoalProgressPercent(stat.totalNutrition, stat.goals),
      }))
      .sort((a, b) => {
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;
        return b.progressPercent - a.progressPercent;
      });
  }, [currentUserStat, memberStats, user?.id]);

  const activeMembers = communityRows.filter((row) => row.totalNutrition.kcal > 0).length;
  const groupHighlights = communityRows.reduce(
    (acc, row) => {
      const signals = buildSignals(row);
      return {
        protein: acc.protein + (signals.some((signal) => signal.key === 'protein') ? 1 : 0),
        kcal: acc.kcal + (signals.some((signal) => signal.key === 'kcal') ? 1 : 0),
        streak: acc.streak + (signals.some((signal) => signal.key === 'streak') ? 1 : 0),
      };
    },
    { protein: 0, kcal: 0, streak: 0 }
  );

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

    upsertMemberStats(user.id, displayName, currentGroup.id, totalNutrition, activeGoals, profile?.communityPrivacy ?? DEFAULT_PRIVACY)
      .catch(() => undefined);
  }, [activeGoals, currentGroup, displayName, profile?.communityPrivacy, totalNutrition, user]);

  useEffect(() => {
    if (!currentGroup) return undefined;
    if (!isFirebaseConfigured || user?.id === 'dev_user') return undefined;

    return subscribeCommunityComments(currentGroup.id, setComments);
  }, [currentGroup, user?.id]);

  async function handleTogglePrivacy(key: keyof CommunityPrivacy) {
    if (!profile) return;
    const currentPrivacy = { ...DEFAULT_PRIVACY, ...(profile.communityPrivacy ?? {}) };
    const nextProfile = {
      ...profile,
      communityPrivacy: { ...currentPrivacy, [key]: !currentPrivacy[key] },
      updatedAt: new Date(),
    };
    setProfile(nextProfile);
    if (isFirebaseConfigured && user?.id !== 'dev_user') {
      try {
        await saveUserProfile(nextProfile);
      } catch {
        Alert.alert('Erro', 'Não foi possível salvar sua privacidade agora.');
      }
    }
  }

  async function handleSendComment(targetUserId: string) {
    if (!user || !currentGroup) return;
    const message = (commentInputs[targetUserId] ?? '').trim();
    if (!message) return;

    if (!isFirebaseConfigured || user.id === 'dev_user') {
      const localComment: CommunityComment = {
        id: `${targetUserId}_${Date.now()}`,
        groupId: currentGroup.id,
        targetUserId,
        authorId: user.id,
        authorName: displayName,
        message,
        createdAt: new Date(),
      };
      setComments((items) => [localComment, ...items]);
      setCommentInputs((items) => ({ ...items, [targetUserId]: '' }));
      return;
    }

    try {
      await addCommunityComment(currentGroup.id, targetUserId, user.id, displayName, message);
      setCommentInputs((items) => ({ ...items, [targetUserId]: '' }));
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o comentário agora.');
    }
  }

  async function handleCreateGroup() {
    if (!user) return;
    if (user.id === 'dev_user' || !isFirebaseConfigured) {
      const localGroup: Group = {
        id: 'local_group',
        name: 'Comunidade NutriMeta',
        emoji: '🌱',
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
      const group = await createGroup(user.id, 'Comunidade NutriMeta', '🌱');
      setGroups([group, ...groups]);
      Alert.alert('Comunidade criada', `Código de convite: ${group.inviteCode}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a comunidade agora.');
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
      Alert.alert('Código inválido', err?.message ?? 'Não encontramos essa comunidade.');
    } finally {
      setLoadingGroup(false);
    }
  }

  async function handleShareInvite() {
    if (!currentGroup) return;
    await Share.share({
      message: `Entre na minha comunidade do NutriMeta com o código: ${currentGroup.inviteCode}`,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Comunidade</Text>
          <Text style={styles.title}>Progresso do grupo</Text>
          <Text style={styles.subtitle}>Acompanhe sinais de consistência sem expor refeições ou quantidades.</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.groupPanel}>
          {currentGroup ? (
            <View style={styles.groupTop}>
              <View style={styles.groupTitleWrap}>
                <Text style={styles.groupName}>{currentGroup.emoji} {currentGroup.name}</Text>
                <Text style={styles.groupHint}>Código: {currentGroup.inviteCode}</Text>
              </View>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
                <Text style={styles.shareText}>Compartilhar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.groupName}>Crie uma comunidade privada</Text>
              <Text style={styles.groupHint}>Pessoas próximas acompanham sinais agregados de progresso, sem ver o que cada um comeu.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateGroup} disabled={loadingGroup}>
                <Text style={styles.primaryText}>{loadingGroup ? 'Criando...' : 'Criar comunidade'}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.joinRow}>
            <TextInput
              style={styles.joinInput}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Código da comunidade"
              placeholderTextColor={Colors.gray400}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.joinBtn} onPress={handleJoinGroup} disabled={loadingGroup}>
              <Text style={styles.joinText}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryPanel}>
          <Text style={styles.summaryLabel}>Hoje na comunidade</Text>
          <Text style={styles.summaryTitle}>{activeMembers} pessoa(s) com registros</Text>
          <View style={styles.summaryChips}>
            <Text style={styles.summaryChip}>{groupHighlights.protein} bateram proteína</Text>
            <Text style={styles.summaryChip}>{groupHighlights.kcal} ficaram nas calorias</Text>
            <Text style={styles.summaryChip}>{groupHighlights.streak} em sequência</Text>
          </View>
        </View>

        <View style={styles.privacyPanel}>
          <MaterialIcons name="privacy-tip" size={20} color={Colors.green600} />
          <View style={styles.privacyPanelContent}>
            <Text style={styles.privacyPanelText}>
              Escolha quais conquistas agregadas podem aparecer. Alimentos, porções e calorias exatas ficam privados.
            </Text>
            <View style={styles.privacyToggleWrap}>
              {profile && ([
                ['showProtein', 'Proteína'],
                ['showFiber', 'Fibras'],
                ['showCalories', 'Calorias'],
                ['showStreak', 'Sequência'],
                ['showLimits', 'Limites'],
              ] as [keyof CommunityPrivacy, string][]).map(([key, label]) => {
                const privacy = { ...DEFAULT_PRIVACY, ...(profile.communityPrivacy ?? {}) };
                return (
                  <PrivacyToggle
                    key={key}
                    label={label}
                    value={privacy[key]}
                    onPress={() => handleTogglePrivacy(key)}
                  />
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Atualizações do grupo</Text>
          <Text style={styles.sectionHint}>Mensagens geradas a partir das metas, sem ranking público.</Text>
        </View>

        {communityRows.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="groups" size={42} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Sem atualizações ainda</Text>
            <Text style={styles.emptyText}>Registre uma refeição para compartilhar progresso agregado com sua comunidade.</Text>
          </View>
        ) : (
          communityRows.map((row) => (
            <CommunityCard
              key={row.userId}
              row={row}
              comments={comments.filter((comment) => comment.targetUserId === row.userId)}
              commentValue={commentInputs[row.userId] ?? ''}
              onCommentChange={(value) => setCommentInputs((items) => ({ ...items, [row.userId]: value }))}
              onSendComment={() => handleSendComment(row.userId)}
            />
          ))
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
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
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
  groupTitleWrap: { flex: 1 },
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
    marginBottom: Spacing.sm,
  },
  summaryLabel: { color: Colors.green50, fontSize: Typography.sm, fontWeight: Typography.semibold },
  summaryTitle: { color: Colors.white, fontSize: Typography.xxl, fontWeight: Typography.bold, marginTop: 2 },
  summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
  summaryChip: { color: Colors.green800, backgroundColor: Colors.green50, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 5, fontSize: Typography.xs, fontWeight: Typography.bold },
  privacyPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.green50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green100,
    padding: Spacing.sm,
    marginBottom: Spacing.base,
  },
  privacyPanelText: { flex: 1, fontSize: Typography.sm, color: Colors.green800, lineHeight: 18 },
  privacyPanelContent: { flex: 1 },
  privacyToggleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  privacyToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.borderMd, backgroundColor: Colors.white, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  privacyToggleActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  privacyToggleText: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold },
  privacyToggleTextActive: { color: Colors.green600 },
  listHeader: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  sectionHint: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400 },
  memberCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  currentUserCard: { borderColor: Colors.green400 },
  memberTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold },
  memberNameWrap: { flex: 1 },
  memberName: { fontSize: Typography.md, color: Colors.gray800, fontWeight: Typography.bold },
  memberSub: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gray200 },
  statusDotActive: { backgroundColor: Colors.green400 },
  memberMessage: { marginTop: Spacing.md, fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19 },
  signalWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
  signalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.borderMd,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  signalText: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold },
  privacyNote: { marginTop: Spacing.sm, fontSize: Typography.xs, color: Colors.gray400 },
  commentBlock: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  commentTitle: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.xs },
  commentItem: { backgroundColor: Colors.gray50, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.xs },
  commentAuthor: { fontSize: Typography.xs, color: Colors.gray800, fontWeight: Typography.bold },
  commentMessage: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray600, lineHeight: 18 },
  noComments: { fontSize: Typography.sm, color: Colors.gray400, marginBottom: Spacing.xs },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  commentInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, fontSize: Typography.sm, color: Colors.gray800, backgroundColor: Colors.white },
  commentSend: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.green600, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  emptyText: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
});
