import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { saveUserProfile, signOut } from '../services/authService';
import { refineDietGoals } from '../services/goalAiService';
import { respondNutritionistInvite, subscribePatientAcceptedNutritionistLinks, subscribePatientNutritionistInvites } from '../services/nutritionistLinkService';
import { subscribeUnreadChatCountByLink } from '../services/nutritionistChatService';
import { NutritionistChatModal } from '../components/NutritionistChatModal';
import { useStore, selectGoals, selectNotifications, selectTodayLog, selectUnreadCount } from '../store';
import { calcMacroGoals, formatBrasiliaDate, formatKcal, formatGrams, getBrasiliaHour, macroPercent } from '../utils/nutrition';
import { AI_LIMIT_MESSAGE, AI_LIMIT_TITLE, isAiLimitError } from '../utils/aiErrors';
import {
  buildValidatedProfileValues,
  formatHeightInput,
  formatWeightInput,
  maskAgeInput,
  maskHeightInput,
  maskNameInput,
  maskWeightInput,
  parseProfileNumber,
  validateProfileBasics,
} from '../utils/profileValidation';
import { ActivityLevel, BiologicalSex, FoodNutrition, GoalType, MacroGoals, NutritionistPatientLink, UserProfile } from '../types';

const RING_SIZE = 160;
const RING_STROKE = 14;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

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

type NutritionGoalMode = 'target' | 'limit';

type NutritionGoalRow = {
  key: keyof FoodNutrition | 'waterMl';
  label: string;
  unit: string;
  goal: number;
  mode: NutritionGoalMode;
  section: 'Energia e macros' | 'Limites' | 'Vitaminas e minerais';
  overPct?: number;
};

function formatNutritionValue(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${unit}`;
}

function getNutritionGoalStatus(current: number, goal: number, mode: NutritionGoalMode, overPct = 110) {
  const pct = goal > 0 ? Math.round((current / goal) * 100) : 0;

  if (mode === 'limit') {
    if (current > goal) return { pct, label: 'Passou', color: Colors.danger, bg: Colors.proteinL };
    if (current > 0) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
    return { pct, label: 'Sem consumo', color: Colors.gray400, bg: Colors.gray50 };
  }

  if (pct > overPct) return { pct, label: 'Passou', color: Colors.warning, bg: Colors.fatL };
  if (pct >= 90) return { pct, label: 'Bom', color: Colors.green600, bg: Colors.green50 };
  return { pct, label: 'Em progresso', color: Colors.info, bg: Colors.carbsL };
}

function RingChart({ pct, color }: { pct: number; color: string }) {
  const dash = (pct / 100) * CIRCUMFERENCE;
  const centerPoint = RING_SIZE / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={Colors.gray50}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={centerPoint}
        cy={centerPoint}
        r={RING_R}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${centerPoint} ${centerPoint})`}
      />
    </Svg>
  );
}

function NutritionGoalTable({
  rows,
  totals,
  waterMl,
}: {
  rows: NutritionGoalRow[];
  totals: FoodNutrition;
  waterMl: number;
}) {
  const sections = ['Energia e macros', 'Limites', 'Vitaminas e minerais'] as const;

  return (
    <View style={styles.nutritionPanel}>
      <View style={styles.nutritionHeader}>
        <View>
          <Text style={styles.nutritionTitle}>Metas e nutrientes</Text>
          <Text style={styles.nutritionSubtitle}>Resumo diário no estilo rótulo nutricional</Text>
        </View>
      </View>

      {sections.map((section) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <View key={section} style={styles.nutritionSection}>
            <Text style={styles.nutritionSectionTitle}>{section}</Text>
            {sectionRows.map((row) => {
              const current = row.key === 'waterMl' ? waterMl : ((totals[row.key] as number | undefined) ?? 0);
              const status = getNutritionGoalStatus(current, row.goal, row.mode, row.overPct);
              const barPct = Math.min(status.pct, 100);

              return (
                <View key={row.key} style={styles.nutritionRow}>
                  <View style={styles.nutritionRowTop}>
                    <Text style={styles.nutritionName}>{row.label}</Text>
                    <Text style={styles.nutritionValues}>
                      {formatNutritionValue(current, row.unit)}
                      <Text style={styles.nutritionGoalText}> / {formatNutritionValue(row.goal, row.unit)}</Text>
                    </Text>
                  </View>
                  <View style={styles.nutritionMetaRow}>
                    <View style={styles.nutritionBarBg}>
                      <View style={[styles.nutritionBarFill, { width: `${barPct}%`, backgroundColor: status.color }]} />
                    </View>
                    <Text style={[styles.nutritionStatus, { color: status.color, backgroundColor: status.bg }]}>{status.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function parseNumber(value: string, fallback: number) {
  return parseProfileNumber(value, fallback);
}

function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const goals = useStore(selectGoals);
  const setUser = useStore((s) => s.setUser);
  const setProfile = useStore((s) => s.setProfile);
  const setGoals = useStore((s) => s.setGoals);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<BiologicalSex>('M');
  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [goalInputs, setGoalInputs] = useState<Record<keyof MacroGoals, string>>({
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
    water: '',
    sugar: '',
    sodium: '',
  });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReason, setAiReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    const activeGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };
    setName(profile?.name ?? user?.name ?? '');
    setAge(String(profile?.age ?? ''));
    setWeight(formatWeightInput(profile?.weight));
    setHeight(formatHeightInput(profile?.height));
    setSex(profile?.sex ?? 'M');
    setGoalType(profile?.goal ?? 'maintain');
    setActivity(profile?.activityLevel ?? 1.55);
    setAvatarUrl(user?.avatarUrl);
    setGoalInputs({
      kcal: String(activeGoals.kcal),
      protein: String(activeGoals.protein),
      carbs: String(activeGoals.carbs),
      fat: String(activeGoals.fat),
      fiber: String(activeGoals.fiber),
      water: String(activeGoals.water),
      sugar: String(activeGoals.sugar),
      sodium: String(activeGoals.sodium),
    });
    setAiReason('');
    setAiLoading(false);
  }, [visible, goals, profile, user]);

  function updateGoalInput(key: keyof MacroGoals, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function buildProfile(): UserProfile | null {
    if (!user) return null;
    const error = validateProfileBasics({ name, age, weight, height });
    if (error) {
      Alert.alert('Confira seus dados', error);
      return null;
    }
    const profileValues = buildValidatedProfileValues({ age, weight, height, fallback: profile ?? undefined });
    const nextProfile: UserProfile = {
      userId: user.id,
      name: name.trim() || user.name,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      onboardingComplete: true,
      groupIds: profile?.groupIds ?? [],
      communityPrivacy: profile?.communityPrivacy ?? {
        showProtein: true,
        showFiber: true,
        showCalories: true,
        showStreak: true,
        showLimits: true,
      },
      createdAt: profile?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return nextProfile;
  }

  function handleRecalculateGoals() {
    const nextProfile = buildProfile();
    if (!nextProfile) return;
    const calculated = calcMacroGoals(nextProfile);
    setGoalInputs({
      kcal: String(calculated.kcal),
      protein: String(calculated.protein),
      carbs: String(calculated.carbs),
      fat: String(calculated.fat),
      fiber: String(calculated.fiber),
      water: String(calculated.water),
      sugar: String(calculated.sugar),
      sodium: String(calculated.sodium),
    });
    setAiReason('');
  }

  async function handleRefineGoalsWithAi() {
    const nextProfile = buildProfile();
    if (!nextProfile) return;

    const baseGoals: MacroGoals = {
      kcal: Math.round(parseNumber(goalInputs.kcal, DEFAULT_GOALS.kcal)),
      protein: Math.round(parseNumber(goalInputs.protein, DEFAULT_GOALS.protein)),
      carbs: Math.round(parseNumber(goalInputs.carbs, DEFAULT_GOALS.carbs)),
      fat: Math.round(parseNumber(goalInputs.fat, DEFAULT_GOALS.fat)),
      fiber: Math.round(parseNumber(goalInputs.fiber, DEFAULT_GOALS.fiber)),
      water: Math.round(parseNumber(goalInputs.water, DEFAULT_GOALS.water)),
      sugar: Math.round(parseNumber(goalInputs.sugar, DEFAULT_GOALS.sugar)),
      sodium: Math.round(parseNumber(goalInputs.sodium, DEFAULT_GOALS.sodium)),
    };

    setAiLoading(true);
    try {
      const recommendation = await refineDietGoals(nextProfile, baseGoals);
      setGoalInputs({
        kcal: String(recommendation.goals.kcal),
        protein: String(recommendation.goals.protein),
        carbs: String(recommendation.goals.carbs),
        fat: String(recommendation.goals.fat),
        fiber: String(recommendation.goals.fiber),
        water: String(recommendation.goals.water),
        sugar: String(recommendation.goals.sugar),
        sodium: String(recommendation.goals.sodium),
      });
      setAiReason(recommendation.rationale);
    } catch (e) {
      console.warn('AI goal refinement failed', e);
      if (isAiLimitError(e)) {
        Alert.alert(AI_LIMIT_TITLE, AI_LIMIT_MESSAGE);
        return;
      }
      Alert.alert('IA indisponível', 'Não consegui refinar suas metas agora. As metas calculadas continuam disponíveis.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para escolher uma imagem de perfil.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (!result.canceled) {
      setAvatarUrl(result.assets[0]?.uri);
    }
  }

  async function handleSave() {
    if (!user) return;
    const nextProfile = buildProfile();
    if (!nextProfile) return;

    const nextGoals: MacroGoals = {
      kcal: Math.round(parseNumber(goalInputs.kcal, DEFAULT_GOALS.kcal)),
      protein: Math.round(parseNumber(goalInputs.protein, DEFAULT_GOALS.protein)),
      carbs: Math.round(parseNumber(goalInputs.carbs, DEFAULT_GOALS.carbs)),
      fat: Math.round(parseNumber(goalInputs.fat, DEFAULT_GOALS.fat)),
      fiber: Math.round(parseNumber(goalInputs.fiber, DEFAULT_GOALS.fiber)),
      water: Math.round(parseNumber(goalInputs.water, DEFAULT_GOALS.water)),
      sugar: Math.round(parseNumber(goalInputs.sugar, DEFAULT_GOALS.sugar)),
      sodium: Math.round(parseNumber(goalInputs.sodium, DEFAULT_GOALS.sodium)),
    };

    setSaving(true);
    try {
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        await saveUserProfile(nextProfile);
      }
      setProfile(nextProfile);
      setGoals(nextGoals);
      setUser({ ...user, name: nextProfile.name, avatarUrl });
      onClose();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Configurações</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={modalStyles.scroll}>
            <View style={modalStyles.photoRow}>
              <TouchableOpacity style={modalStyles.photoButton} onPress={handlePickPhoto}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={modalStyles.photo} />
                ) : (
                  <Text style={modalStyles.photoInitials}>
                    {(name || user?.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={modalStyles.photoInfo}>
                <Text style={modalStyles.sectionTitle}>Foto de perfil</Text>
                <Text style={modalStyles.sectionHint}>Toque no círculo para escolher uma imagem.</Text>
              </View>
            </View>

            <Text style={modalStyles.sectionTitle}>Dados do corpo</Text>
            <View style={modalStyles.fieldGrid}>
              <Field label="Nome" value={name} onChangeText={(v) => setName(maskNameInput(v))} />
              <Field label="Idade" value={age} onChangeText={(v) => setAge(maskAgeInput(v))} keyboardType="numeric" maxLength={3} placeholder="28" />
              <Field label="Peso (kg)" value={weight} onChangeText={(v) => setWeight(maskWeightInput(v))} keyboardType="decimal-pad" placeholder="85,5" />
              <Field label="Altura (m)" value={height} onChangeText={(v) => setHeight(maskHeightInput(v))} keyboardType="numeric" maxLength={4} placeholder="1,85" />
            </View>

            <Text style={modalStyles.label}>Sexo biológico</Text>
            <View style={modalStyles.segmentRow}>
              {(['M', 'F'] as BiologicalSex[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[modalStyles.segment, sex === item && modalStyles.segmentActive]}
                  onPress={() => setSex(item)}
                >
                  <Text style={[modalStyles.segmentText, sex === item && modalStyles.segmentTextActive]}>
                    {item === 'M' ? 'Masculino' : 'Feminino'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Objetivo</Text>
            <View style={modalStyles.segmentWrap}>
              {[
                ['deficit', 'Emagrecer'],
                ['maintain', 'Manter'],
                ['muscle', 'Massa'],
                ['bulk', 'Volume'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[modalStyles.pill, goalType === value && modalStyles.pillActive]}
                  onPress={() => setGoalType(value as GoalType)}
                >
                  <Text style={[modalStyles.pillText, goalType === value && modalStyles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Atividade</Text>
            <View style={modalStyles.segmentWrap}>
              {[
                [1.2, 'Sedentário'],
                [1.375, 'Leve'],
                [1.55, 'Moderado'],
                [1.725, 'Intenso'],
                [1.9, 'Atleta'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={String(value)}
                  style={[modalStyles.pill, activity === value && modalStyles.pillActive]}
                  onPress={() => setActivity(value as ActivityLevel)}
                >
                  <Text style={[modalStyles.pillText, activity === value && modalStyles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={modalStyles.sectionHeaderRow}>
              <View>
                <Text style={modalStyles.sectionTitle}>Metas nutricionais</Text>
                <Text style={modalStyles.sectionHint}>Edite manualmente ou recalcule pelos dados acima.</Text>
              </View>
              <View style={modalStyles.goalActionRow}>
                <TouchableOpacity style={modalStyles.recalcBtn} onPress={handleRecalculateGoals} disabled={aiLoading}>
                  <Text style={modalStyles.recalcText}>Recalcular</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[modalStyles.aiBtn, aiLoading && modalStyles.btnDisabled]} onPress={handleRefineGoalsWithAi} disabled={aiLoading}>
                  {aiLoading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={modalStyles.aiText}>Refinar com IA</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {aiReason ? (
              <View style={modalStyles.aiReasonBox}>
                <Text style={modalStyles.aiReasonTitle}>Sugestão da IA</Text>
                <Text style={modalStyles.aiReasonText}>{aiReason}</Text>
              </View>
            ) : null}

            <View style={modalStyles.fieldGrid}>
              <Field label="Calorias" value={goalInputs.kcal} onChangeText={(v) => updateGoalInput('kcal', v)} keyboardType="numeric" suffix="kcal" />
              <Field label="Proteína" value={goalInputs.protein} onChangeText={(v) => updateGoalInput('protein', v)} keyboardType="numeric" suffix="g" />
              <Field label="Carboidratos" value={goalInputs.carbs} onChangeText={(v) => updateGoalInput('carbs', v)} keyboardType="numeric" suffix="g" />
              <Field label="Gorduras" value={goalInputs.fat} onChangeText={(v) => updateGoalInput('fat', v)} keyboardType="numeric" suffix="g" />
              <Field label="Fibras" value={goalInputs.fiber} onChangeText={(v) => updateGoalInput('fiber', v)} keyboardType="numeric" suffix="g" />
              <Field label="Água" value={goalInputs.water} onChangeText={(v) => updateGoalInput('water', v)} keyboardType="numeric" suffix="ml" />
              <Field label="Açúcar máx." value={goalInputs.sugar} onChangeText={(v) => updateGoalInput('sugar', v)} keyboardType="numeric" suffix="g" />
              <Field label="Sódio máx." value={goalInputs.sodium} onChangeText={(v) => updateGoalInput('sodium', v)} keyboardType="numeric" suffix="mg" />
            </View>
          </ScrollView>

          <View style={modalStyles.actions}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={modalStyles.saveText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  suffix,
  ...props
}: {
  label: string;
  suffix?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={modalStyles.fieldWrap}>
      <Text style={modalStyles.label}>{label}</Text>
      <View style={modalStyles.inputRow}>
        <TextInput
          {...props}
          style={modalStyles.input}
          placeholderTextColor={Colors.gray400}
        />
        {suffix && <Text style={modalStyles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function HelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  function openSource(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Não foi possível abrir o link', 'Tente novamente em alguns instantes.');
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.helpCard}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Como calculamos suas metas</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={modalStyles.helpScroll}>
            <Text style={modalStyles.helpIntro}>
              As metas são uma estimativa inicial baseada nos seus dados de perfil. Elas servem como guia prático e podem ser ajustadas manualmente nas configurações.
            </Text>

            <View style={modalStyles.helpBlock}>
              <Text style={modalStyles.helpBlockTitle}>Energia diária</Text>
              <Text style={modalStyles.helpText}>
                Usamos a fórmula Mifflin-St Jeor para estimar metabolismo basal e multiplicamos pelo nível de atividade. Para emagrecer, aplicamos um déficit moderado; para ganhar massa, um superávit controlado.
              </Text>
            </View>

            <View style={modalStyles.helpBlock}>
              <Text style={modalStyles.helpBlockTitle}>Macros e limites</Text>
              <Text style={modalStyles.helpText}>
                Proteína varia por peso, objetivo e atividade. Carboidratos, gorduras e fibras seguem faixas usadas em referências de ingestão diária. Açúcar e sódio aparecem como limites máximos.
              </Text>
            </View>

            <View style={modalStyles.helpBlock}>
              <Text style={modalStyles.helpBlockTitle}>Fontes usadas</Text>
              <TouchableOpacity onPress={() => openSource('https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html')}>
                <Text style={modalStyles.sourceLink}>CDC - perda de peso gradual e sustentável</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openSource('https://www.dietaryguidelines.gov/')}>
                <Text style={modalStyles.sourceLink}>Dietary Guidelines for Americans - açúcar, sódio e padrão alimentar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openSource('https://www.nationalacademies.org/cdn/materials/9fb9fae1-63a0-4048-88ad-3f972639149a')}>
                <Text style={modalStyles.sourceLink}>National Academies/DRI - referência de macros, fibras e água</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openSource('https://pubmed.ncbi.nlm.nih.gov/28642676/')}>
                <Text style={modalStyles.sourceLink}>ISSN - proteína para pessoas fisicamente ativas</Text>
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.helpFootnote}>
              Observação: se você tem condição médica, usa medicação, está grávida ou segue dieta terapêutica, confirme as metas com um profissional de saúde.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NotificationsModal({
  visible,
  onClose,
  nutritionistInvites,
  onRespondInvite,
  chatLinks,
  unreadChatCounts,
  onOpenChat,
}: {
  visible: boolean;
  onClose: () => void;
  nutritionistInvites: NutritionistPatientLink[];
  onRespondInvite: (linkId: string, status: 'accepted' | 'rejected') => void;
  chatLinks: NutritionistPatientLink[];
  unreadChatCounts: Record<string, number>;
  onOpenChat: (link: NutritionistPatientLink) => void;
}) {
  const notifications = useStore(selectNotifications);
  const hasItems = notifications.length > 0 || nutritionistInvites.length > 0 || chatLinks.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Notificações</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.scroll}>
            {!hasItems ? (
              <View style={modalStyles.emptyNotice}>
                <MaterialIcons name="notifications-none" size={34} color={Colors.gray400} />
                <Text style={modalStyles.emptyNoticeText}>Feedbacks e dicas aparecerão aqui.</Text>
              </View>
            ) : (
              <>
                {nutritionistInvites.map((invite) => (
                  <View key={invite.id} style={modalStyles.noticeCard}>
                    <Text style={modalStyles.noticeTitle}>Solicitação de nutricionista</Text>
                    <Text style={modalStyles.noticeText}>
                      {invite.nutritionistName} quer acessar seus registros nutricionais para acompanhamento.
                    </Text>
                    <Text style={modalStyles.noticeMeta}>{invite.nutritionistEmail}</Text>
                    <View style={modalStyles.noticeActions}>
                      <TouchableOpacity style={modalStyles.noticeRejectBtn} onPress={() => onRespondInvite(invite.id, 'rejected')}>
                        <Text style={modalStyles.noticeRejectText}>Recusar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={modalStyles.noticeAcceptBtn} onPress={() => onRespondInvite(invite.id, 'accepted')}>
                        <Text style={modalStyles.noticeAcceptText}>Aceitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {chatLinks.map((link) => {
                  const unread = unreadChatCounts[link.id] ?? 0;
                  return (
                    <TouchableOpacity key={link.id} style={modalStyles.noticeCard} onPress={() => onOpenChat(link)}>
                      <Text style={modalStyles.noticeTitle}>Chat com nutricionista</Text>
                      <Text style={modalStyles.noticeText}>{link.nutritionistName}</Text>
                      <Text style={modalStyles.noticeMeta}>
                        {unread > 0 ? `${unread} mensagem(ns) nova(s)` : 'Toque para abrir a conversa'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {notifications.map((item) => (
                  <View key={item.id} style={modalStyles.noticeCard}>
                    <Text style={modalStyles.noticeTitle}>{item.userName || 'NutriMeta'}</Text>
                    <Text style={modalStyles.noticeText}>{item.message}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WaterModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amountMl: number) => void;
}) {
  const options = [
    { label: '100 ml', sub: 'alguns goles', amount: 100 },
    { label: '250 ml', sub: '1 copo', amount: 250 },
    { label: '500 ml', sub: 'garrafa pequena', amount: 500 },
    { label: '1 litro', sub: 'garrafa grande', amount: 1000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={waterStyles.bg}>
        <TouchableOpacity style={waterStyles.backdrop} onPress={onClose} />
        <View style={waterStyles.card}>
          <Text style={waterStyles.title}>Quanto de água você bebeu?</Text>
          <View style={waterStyles.grid}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.amount}
                style={waterStyles.option}
                onPress={() => {
                  onAdd(option.amount);
                  onClose();
                }}
              >
                <Text style={waterStyles.optionTitle}>{option.label}</Text>
                <Text style={waterStyles.optionSub}>{option.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function HomeScreen({
  waterOpen,
  onWaterClose,
  onAddWater,
}: {
  waterOpen: boolean;
  onWaterClose: () => void;
  onAddWater: (amountMl: number) => void;
}) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const clearAuth = useStore((s) => s.clearAuth);
  const addWater = useStore((s) => s.addWater);
  const todayLog = useStore(selectTodayLog);
  const goals = useStore(selectGoals);
  const unreadCount = useStore(selectUnreadCount);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [nutritionistInvites, setNutritionistInvites] = useState<NutritionistPatientLink[]>([]);
  const [chatLinks, setChatLinks] = useState<NutritionistPatientLink[]>([]);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(null);

  const totals: FoodNutrition = useMemo(
    () => todayLog?.totalNutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
    [todayLog]
  );

  const safeGoals: MacroGoals = { ...DEFAULT_GOALS, ...(goals ?? {}) };
  const nutritionGoalRows = useMemo<NutritionGoalRow[]>(() => [
    { key: 'kcal', label: 'Calorias', unit: ' kcal', goal: safeGoals.kcal, mode: 'target', section: 'Energia e macros' },
    { key: 'protein', label: 'Proteína', unit: 'g', goal: safeGoals.protein, mode: 'target', section: 'Energia e macros', overPct: 130 },
    { key: 'carbs', label: 'Carboidratos', unit: 'g', goal: safeGoals.carbs, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fat', label: 'Gorduras', unit: 'g', goal: safeGoals.fat, mode: 'target', section: 'Energia e macros', overPct: 120 },
    { key: 'fiber', label: 'Fibras', unit: 'g', goal: safeGoals.fiber, mode: 'target', section: 'Energia e macros', overPct: 160 },
    { key: 'waterMl', label: 'Água', unit: 'ml', goal: safeGoals.water, mode: 'target', section: 'Energia e macros', overPct: 140 },
    { key: 'sugar', label: 'Açúcar', unit: 'g', goal: safeGoals.sugar, mode: 'limit', section: 'Limites' },
    { key: 'sodium', label: 'Sódio', unit: 'mg', goal: safeGoals.sodium, mode: 'limit', section: 'Limites' },
    { key: 'calcium', label: 'Cálcio', unit: 'mg', goal: 1300, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'iron', label: 'Ferro', unit: 'mg', goal: 18, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'potassium', label: 'Potássio', unit: 'mg', goal: 4700, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'magnesium', label: 'Magnésio', unit: 'mg', goal: 420, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'zinc', label: 'Zinco', unit: 'mg', goal: 11, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminA', label: 'Vitamina A', unit: 'mcg', goal: 900, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminC', label: 'Vitamina C', unit: 'mg', goal: 90, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminD', label: 'Vitamina D', unit: 'mcg', goal: 20, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminE', label: 'Vitamina E', unit: 'mg', goal: 15, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'vitaminB12', label: 'Vitamina B12', unit: 'mcg', goal: 2.4, mode: 'target', section: 'Vitaminas e minerais' },
    { key: 'folate', label: 'Folato', unit: 'mcg', goal: 400, mode: 'target', section: 'Vitaminas e minerais' },
  ], [safeGoals]);
  const waterMl = todayLog?.waterMl ?? 0;

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setNutritionistInvites([]);
      return undefined;
    }
    return subscribePatientNutritionistInvites(user.id, setNutritionistInvites);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setChatLinks([]);
      return undefined;
    }
    return subscribePatientAcceptedNutritionistLinks(user.id, setChatLinks);
  }, [user]);

  useEffect(() => {
    if (!user || user.id === 'dev_user' || !isFirebaseConfigured) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [user]);

  async function handleRespondNutritionistInvite(linkId: string, status: 'accepted' | 'rejected') {
    try {
      await respondNutritionistInvite(linkId, status);
      setNutritionistInvites((items) => items.filter((item) => item.id !== linkId));
      Alert.alert(status === 'accepted' ? 'Acesso aceito' : 'Solicitação recusada',
        status === 'accepted'
          ? 'Seu nutricionista agora pode acompanhar seus registros.'
          : 'O nutricionista não terá acesso aos seus registros.');
    } catch (error) {
      console.warn('Failed to respond nutritionist invite', error);
      Alert.alert('Erro', 'Não foi possível responder essa solicitação agora.');
    }
  }
  const kcalPct = macroPercent(totals.kcal, safeGoals.kcal);
  const hour = getBrasiliaHour();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (profile?.name ?? user?.name ?? 'Usuário').split(' ')[0];
  const initials = (profile?.name ?? user?.name ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const today = formatBrasiliaDate(new Date(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  async function handleLogout() {
    Alert.alert('Sair da conta', 'Você quer sair do NutriMeta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            // Even if Firebase is offline, clear the in-memory app state.
          } finally {
            clearAuth();
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <View style={styles.nameRow}>
            <Text style={styles.userName}>{firstName}</Text>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Sair</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dateLabel}>{today}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.helpButton} onPress={() => setNotificationsOpen(true)}>
            <MaterialIcons name="notifications-none" size={21} color={Colors.green600} />
            {unreadCount + nutritionistInvites.length + Object.values(unreadChatCounts).reduce((sum, count) => sum + count, 0) > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.helpButton} onPress={() => setHelpOpen(true)}>
            <MaterialIcons name="help-outline" size={21} color={Colors.green600} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setSettingsOpen(true)}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          <View style={styles.gearBadge}>
            <MaterialIcons name="settings" size={12} color={Colors.white} />
          </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.ringSection}>
          <View style={styles.ringWrap}>
            <RingChart pct={kcalPct} color={Colors.green400} />
            <View style={styles.ringCenter}>
              <Text style={styles.ringKcal}>{formatKcal(totals.kcal)}</Text>
              <Text style={styles.ringKcalSub}>kcal hoje</Text>
              <Text style={styles.ringGoal}>de {safeGoals.kcal}</Text>
            </View>
          </View>

          <View style={styles.remainRow}>
            <View style={styles.remainItem}>
              <Text style={styles.remainVal}>{Math.max(0, safeGoals.kcal - Math.round(totals.kcal))}</Text>
              <Text style={styles.remainLabel}>kcal restantes</Text>
            </View>
            <View style={[styles.remainItem, styles.remainCenter]}>
              <Text style={styles.remainVal}>{Math.round(totals.kcal)}</Text>
              <Text style={styles.remainLabel}>consumidas</Text>
            </View>
            <View style={styles.remainItem}>
              <Text style={styles.remainVal}>{waterMl}/{safeGoals.water}</Text>
              <Text style={styles.remainLabel}>ml de água</Text>
            </View>
          </View>
        </View>

        <NutritionGoalTable rows={nutritionGoalRows} totals={totals} waterMl={waterMl} />
      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        nutritionistInvites={nutritionistInvites}
        onRespondInvite={handleRespondNutritionistInvite}
        chatLinks={chatLinks}
        unreadChatCounts={unreadChatCounts}
        onOpenChat={(link) => {
          setChatLink(link);
          setNotificationsOpen(false);
        }}
      />
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={profile?.name ?? user?.name ?? 'Paciente'}
        onClose={() => setChatLink(null)}
      />
      <WaterModal visible={waterOpen} onClose={onWaterClose} onAdd={onAddWater} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: { fontSize: Typography.sm, color: Colors.gray400 },
  userName: { fontSize: Typography.xl, fontWeight: Typography.bold },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoutBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.bold },
  dateLabel: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  helpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.green600 },
  gearBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.green600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },

  scroll: { paddingBottom: 100 },
  ringSection: { backgroundColor: Colors.white, padding: Spacing.base, marginBottom: Spacing.sm },
  ringWrap: { alignItems: 'center', marginBottom: Spacing.md, position: 'relative' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringKcal: { fontSize: Typography.xxl, fontWeight: Typography.bold },
  ringKcalSub: { fontSize: Typography.xs, color: Colors.gray400 },
  ringGoal: { fontSize: Typography.sm, color: Colors.gray400 },
  remainRow: { flexDirection: 'row', justifyContent: 'space-around' },
  remainItem: { alignItems: 'center', flex: 1 },
  remainCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm },
  remainVal: { fontSize: Typography.lg, fontWeight: Typography.bold },
  remainLabel: { fontSize: Typography.xs, color: Colors.gray400 },

  nutritionPanel: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  nutritionHeader: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionSubtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  nutritionSection: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  nutritionSectionTitle: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 6,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.green600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: Colors.green50,
  },
  nutritionRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  nutritionRowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nutritionName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gray800 },
  nutritionValues: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800 },
  nutritionGoalText: { fontSize: Typography.xs, fontWeight: Typography.regular, color: Colors.gray400 },
  nutritionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6 },
  nutritionBarBg: { flex: 1, height: 6, backgroundColor: Colors.gray50, borderRadius: Radius.full, overflow: 'hidden' },
  nutritionBarFill: { height: 6, borderRadius: Radius.full },
  nutritionStatus: {
    minWidth: 78,
    overflow: 'hidden',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textAlign: 'center',
  },

});

const modalStyles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 720 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  closeText: { fontSize: Typography.xl, color: Colors.gray600, lineHeight: 24 },
  scroll: { paddingBottom: Spacing.base },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  photoButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.green50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.green100 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoInitials: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.green600 },
  photoInfo: { flex: 1 },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, marginBottom: 3 },
  sectionHint: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  fieldWrap: { width: '48%' },
  label: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, backgroundColor: Colors.white },
  input: { flex: 1, paddingVertical: Spacing.sm, fontSize: Typography.base, color: Colors.gray800 },
  suffix: { fontSize: Typography.xs, color: Colors.gray400, marginLeft: 4 },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  segment: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  segmentActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  segmentText: { color: Colors.gray600, fontWeight: Typography.semibold },
  segmentTextActive: { color: Colors.green600 },
  segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.green50, borderColor: Colors.green400 },
  pillText: { color: Colors.gray600, fontWeight: Typography.semibold, fontSize: Typography.sm },
  pillTextActive: { color: Colors.green600 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  goalActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.xs, flex: 1 },
  recalcBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green400 },
  recalcText: { color: Colors.green600, fontWeight: Typography.bold, fontSize: Typography.sm },
  aiBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.green600, minWidth: 112, alignItems: 'center' },
  aiText: { color: Colors.white, fontWeight: Typography.bold, fontSize: Typography.sm },
  btnDisabled: { opacity: 0.6 },
  aiReasonBox: { backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  aiReasonTitle: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  aiReasonText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.gray600, fontWeight: Typography.semibold },
  saveBtn: { flex: 1.4, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.green400 },
  saveText: { color: Colors.white, fontWeight: Typography.bold },
  helpCard: {
    maxHeight: '82%',
    maxWidth: Platform.OS === 'web' ? 620 : undefined,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    alignSelf: 'stretch',
  },
  helpScroll: { paddingBottom: Spacing.sm },
  helpIntro: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20, marginBottom: Spacing.md },
  helpBlock: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  helpBlockTitle: { fontSize: Typography.base, fontWeight: Typography.bold, marginBottom: 6 },
  helpText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  sourceLink: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.semibold,
    lineHeight: 22,
    marginBottom: 8,
  },
  helpFootnote: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 18,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  emptyNotice: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyNoticeText: { marginTop: Spacing.sm, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  noticeCard: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  noticeTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: 4 },
  noticeText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19 },
  noticeMeta: { marginTop: 4, fontSize: Typography.xs, color: Colors.gray400 },
  noticeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.md },
  noticeRejectBtn: { borderWidth: 1, borderColor: Colors.borderMd, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  noticeRejectText: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.bold },
  noticeAcceptBtn: { backgroundColor: Colors.green400, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  noticeAcceptText: { fontSize: Typography.sm, color: Colors.white, fontWeight: Typography.bold },
});

const waterStyles = StyleSheet.create({
  bg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.base },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  card: { width: '100%', maxWidth: 380, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.base, ...Shadows.lg },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: Spacing.md, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: '48%', backgroundColor: Colors.carbsL, borderWidth: 1, borderColor: '#B9D8F4', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  optionTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.info },
  optionSub: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray600 },
});
