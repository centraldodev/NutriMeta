import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
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
import { signOut } from '../services/authService';
import { getPatientRecentLogs } from '../services/nutritionistService';
import { getLinkedPatientProfiles, sendNutritionistInvite, subscribeLinkedPatientProfiles, subscribeNutritionistAcceptedLinks } from '../services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from '../services/nutritionistChatService';
import { NutritionistChatModal } from '../components/NutritionistChatModal';
import { useStore } from '../store';
import { DailyLog, MealEntry, NutritionistPatientLink, UserProfile } from '../types';
import { formatBrasiliaTime, formatNutritionDetails } from '../utils/nutrition';

const PERIOD_LABELS: Record<MealEntry['mealPeriod'], string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

function pct(value: number, goal?: number) {
  if (!goal || goal <= 0) return 0;
  return Math.round((value / goal) * 100);
}

export function NutritionistScreen() {
  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [acceptedLinks, setAcceptedLinks] = useState<NutritionistPatientLink[]>([]);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);

  const selectedPatient = patients.find((patient) => patient.userId === selectedPatientId) ?? null;
  const selectedLog = logs.find((log) => log.date === selectedDate) ?? logs[0] ?? null;
  const selectedPatientLink = acceptedLinks.find((link) => link.patientId === selectedPatientId) ?? null;

  async function loadPatients() {
    if (!isFirebaseConfigured || !user) return;
    setLoadingPatients(true);
    try {
      const loaded = await getLinkedPatientProfiles(user.id);
      setPatients(loaded);
      setSelectedPatientId((current) => {
        if (current && loaded.some((patient) => patient.userId === current)) return current;
        return loaded[0]?.userId ?? null;
      });
    } catch (error) {
      console.warn('Failed to load nutritionist patients', error);
      Alert.alert('Erro', 'Não foi possível carregar os pacientes agora.');
    } finally {
      setLoadingPatients(false);
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return undefined;
    setLoadingPatients(true);
    const unsubscribe = subscribeLinkedPatientProfiles(
      user.id,
      (loaded) => {
        setPatients(loaded);
        setSelectedPatientId((current) => {
          if (current && loaded.some((patient) => patient.userId === current)) return current;
          return loaded[0]?.userId ?? null;
        });
        setLoadingPatients(false);
      },
      (error) => {
        console.warn('Failed to load nutritionist patients', error);
        Alert.alert('Erro', 'Não foi possível carregar os pacientes agora.');
        setLoadingPatients(false);
      }
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setAcceptedLinks([]);
      return undefined;
    }
    return subscribeNutritionistAcceptedLinks(user.id, setAcceptedLinks);
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [user]);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      if (!selectedPatientId || !isFirebaseConfigured) {
        setLogs([]);
        return;
      }
      setLoadingLogs(true);
      try {
        const loaded = await getPatientRecentLogs(selectedPatientId, 21);
        if (!active) return;
        setLogs(loaded);
        setSelectedDate(loaded[0]?.date ?? null);
      } catch (error) {
        console.warn('Failed to load patient logs', error);
        Alert.alert('Erro', 'Não foi possível carregar os registros deste paciente.');
      } finally {
        if (active) setLoadingLogs(false);
      }
    }
    loadLogs();
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) => patient.name.toLowerCase().includes(normalized));
  }, [patients, search]);

  const entriesByPeriod = useMemo(() => {
    const groups = new Map<MealEntry['mealPeriod'], MealEntry[]>();
    selectedLog?.entries.forEach((entry) => {
      groups.set(entry.mealPeriod, [...(groups.get(entry.mealPeriod) ?? []), entry]);
    });
    return Array.from(groups.entries());
  }, [selectedLog]);

  async function handleSignOut() {
    await signOut();
    clearAuth();
  }

  async function handleSendInvite() {
    if (!user || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      await sendNutritionistInvite({
        nutritionistId: user.id,
        nutritionistName: user.name,
        nutritionistEmail: user.email,
        patientEmail: inviteEmail,
      });
      setInviteEmail('');
      Alert.alert('Solicitação enviada', 'O paciente receberá o convite nas notificações da página inicial.');
      await loadPatients();
    } catch (error: any) {
      const message = error?.message === 'patient_not_found'
        ? 'Não encontramos um paciente cadastrado com esse e-mail.'
        : error?.message === 'patient_is_nutritionist'
          ? 'Esse e-mail pertence a uma conta de nutricionista.'
          : error?.message === 'self_invite'
            ? 'Você não pode enviar convite para sua própria conta.'
            : error?.message === 'already_accepted'
              ? 'Esse paciente já aceitou seu acesso.'
              : 'Não foi possível enviar a solicitação agora.';
      Alert.alert('Convite não enviado', message);
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Nutricionista</Text>
          <Text style={styles.title}>Acesso completo</Text>
          <Text style={styles.subtitle}>Acompanhe pacientes, refeições, água, metas e nutrientes dos últimos dias.</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
          <MaterialIcons name="logout" size={18} color={Colors.green600} />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isFirebaseConfigured ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-off" size={38} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Firebase necessário</Text>
            <Text style={styles.emptyText}>O acesso do nutricionista usa dados sincronizados dos pacientes.</Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Enviar solicitação</Text>
              <Text style={styles.mutedText}>Informe o e-mail do paciente. Ele precisa aceitar o acesso nas notificações da página inicial.</Text>
              <View style={styles.inviteRow}>
                <TextInput
                  style={styles.inviteInput}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="email@paciente.com"
                  placeholderTextColor={Colors.gray400}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.inviteBtn, (!inviteEmail.trim() || inviteLoading) && styles.btnDisabled]}
                  onPress={handleSendInvite}
                  disabled={!inviteEmail.trim() || inviteLoading}
                >
                  {inviteLoading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.inviteBtnText}>Enviar</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Pacientes</Text>
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.gray400} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar paciente"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              {loadingPatients ? (
                <ActivityIndicator color={Colors.green400} />
              ) : filteredPatients.length === 0 ? (
                <Text style={styles.mutedText}>Nenhum paciente vinculado ainda. Envie uma solicitação e aguarde o aceite.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientRow}>
                  {filteredPatients.map((patient) => {
                    const active = patient.userId === selectedPatientId;
                    const patientLink = acceptedLinks.find((link) => link.patientId === patient.userId);
                    const unread = patientLink ? unreadChatCounts[patientLink.id] ?? 0 : 0;
                    return (
                      <TouchableOpacity
                        key={patient.userId}
                        style={[styles.patientCard, active && styles.patientCardActive]}
                        onPress={() => setSelectedPatientId(patient.userId)}
                      >
                        <View style={styles.patientNameRow}>
                          <Text style={[styles.patientName, active && styles.patientNameActive]}>{patient.name}</Text>
                          {unread > 0 ? (
                            <View style={styles.patientUnreadBadge}>
                              <Text style={styles.patientUnreadText}>{unread}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.patientMeta}>{patient.age} anos · {patient.weight}kg</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedPatient ? (
              <View style={styles.panel}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleNoMargin}>Resumo do paciente</Text>
                  {selectedPatientLink ? (
                    <TouchableOpacity style={styles.chatBtn} onPress={() => setChatLink(selectedPatientLink)}>
                      <MaterialIcons name="chat" size={17} color={Colors.green600} />
                      <Text style={styles.chatBtnText}>
                        Chat{(unreadChatCounts[selectedPatientLink.id] ?? 0) > 0 ? ` (${unreadChatCounts[selectedPatientLink.id]})` : ''}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.summaryGrid}>
                  <InfoCard label="Objetivo" value={goalLabel(selectedPatient.goal)} />
                  <InfoCard label="Altura" value={`${selectedPatient.height} cm`} />
                  <InfoCard label="Peso" value={`${selectedPatient.weight} kg`} />
                  <InfoCard label="Atividade" value={`${selectedPatient.activityLevel}x`} />
                </View>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Registros recentes</Text>
              {loadingLogs ? (
                <ActivityIndicator color={Colors.green400} />
              ) : logs.length === 0 ? (
                <Text style={styles.mutedText}>Este paciente ainda não possui registros.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                  {logs.map((log) => {
                    const active = log.date === selectedLog?.date;
                    return (
                      <TouchableOpacity
                        key={log.id}
                        style={[styles.dateChip, active && styles.dateChipActive]}
                        onPress={() => setSelectedDate(log.date)}
                      >
                        <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{formatDateLabel(log.date)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedLog ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Metas do dia</Text>
                  <ProgressRow label="Calorias" value={Math.round(selectedLog.totalNutrition.kcal)} goal={selectedLog.goals.kcal} unit="kcal" />
                  <ProgressRow label="Proteína" value={Math.round(selectedLog.totalNutrition.protein)} goal={selectedLog.goals.protein} unit="g" />
                  <ProgressRow label="Carboidratos" value={Math.round(selectedLog.totalNutrition.carbs)} goal={selectedLog.goals.carbs} unit="g" />
                  <ProgressRow label="Gorduras" value={Math.round(selectedLog.totalNutrition.fat)} goal={selectedLog.goals.fat} unit="g" />
                  <ProgressRow label="Fibras" value={Math.round(selectedLog.totalNutrition.fiber)} goal={selectedLog.goals.fiber} unit="g" />
                  <ProgressRow label="Água" value={selectedLog.waterMl ?? 0} goal={selectedLog.goals.water} unit="ml" />
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Nutrientes completos</Text>
                  <Text style={styles.nutritionText}>{formatNutritionDetails(selectedLog.totalNutrition, { includeKcal: true }) || 'Sem nutrientes registrados.'}</Text>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Refeições e horários</Text>
                  {entriesByPeriod.length === 0 ? (
                    <Text style={styles.mutedText}>Nenhuma refeição registrada neste dia.</Text>
                  ) : (
                    entriesByPeriod.map(([period, entries]) => (
                      <View key={period} style={styles.periodBlock}>
                        <Text style={styles.periodTitle}>{PERIOD_LABELS[period] ?? period}</Text>
                        {entries.map((entry) => (
                          <View key={entry.id} style={styles.entryRow}>
                            <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                            <View style={styles.entryBody}>
                              <Text style={styles.entryName}>{entry.foodName}</Text>
                              <Text style={styles.entryMeta}>
                                {formatBrasiliaTime(new Date(entry.addedAt))}
                                {' · '}
                                {formatNutritionDetails(entry.nutrition, { includeKcal: true })}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={user?.name ?? 'Nutricionista'}
        onClose={() => setChatLink(null)}
      />
    </SafeAreaView>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ProgressRow({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const progress = Math.min(100, pct(value, goal));
  const over = goal > 0 && value > goal * 1.1;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, over && styles.progressOver]}>{value}{unit} / {goal}{unit}</Text>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: over ? Colors.danger : Colors.green400 }]} />
      </View>
    </View>
  );
}

function goalLabel(goal: UserProfile['goal']) {
  return goal === 'deficit' ? 'Emagrecer' :
    goal === 'muscle' ? 'Ganhar massa' :
    goal === 'bulk' ? 'Ganho de peso' :
    'Manter peso';
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 900 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerText: { flex: 1 },
  eyebrow: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gray800 },
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green50, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  logoutText: { color: Colors.green600, fontWeight: Typography.bold, fontSize: Typography.xs },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 900 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: Spacing.xxl },
  panel: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadows.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: Spacing.sm },
  sectionTitleNoMargin: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green50, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 7 },
  chatBtnText: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  inviteRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  inviteInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 44, fontSize: Typography.sm, color: Colors.gray800 },
  inviteBtn: { minWidth: 92, minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  inviteBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  btnDisabled: { opacity: 0.6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm },
  searchInput: { flex: 1, minHeight: 40, fontSize: Typography.sm, color: Colors.gray800 },
  patientRow: { gap: Spacing.sm },
  patientCard: { width: 180, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, backgroundColor: Colors.gray50 },
  patientCardActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  patientNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  patientName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  patientNameActive: { color: Colors.green600 },
  patientUnreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  patientUnreadText: { fontSize: Typography.xs, color: Colors.white, fontWeight: Typography.bold },
  patientMeta: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray400 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  infoCard: { flex: 1, minWidth: 130, backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.sm },
  infoLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold, textTransform: 'uppercase' },
  infoValue: { marginTop: 4, fontSize: Typography.md, color: Colors.gray800, fontWeight: Typography.bold },
  dateRow: { gap: Spacing.xs },
  dateChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.white },
  dateChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  dateChipText: { fontSize: Typography.sm, color: Colors.gray400, fontWeight: Typography.bold },
  dateChipTextActive: { color: Colors.green600 },
  progressRow: { marginBottom: Spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 5 },
  progressLabel: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.semibold },
  progressValue: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.bold },
  progressOver: { color: Colors.danger },
  progressBg: { height: 7, borderRadius: Radius.full, backgroundColor: Colors.gray50, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: Radius.full },
  nutritionText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  periodBlock: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm, marginTop: Spacing.sm },
  periodTitle: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold, marginBottom: Spacing.xs },
  entryRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  entryEmoji: { width: 30, fontSize: 22, textAlign: 'center' },
  entryBody: { flex: 1 },
  entryName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  entryMeta: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16 },
  mutedText: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  emptyState: { alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.xl },
  emptyTitle: { marginTop: Spacing.sm, fontSize: Typography.base, color: Colors.gray800, fontWeight: Typography.bold },
  emptyText: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
});
