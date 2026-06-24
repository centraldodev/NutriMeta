import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Animated, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../constants/theme';
import { UserProfile, BiologicalSex, GoalType, ActivityLevel, MacroGoals } from '../types';
import { useStore } from '../store';
import { calcMacroGoals, formatGrams } from '../utils/nutrition';
import {
  buildValidatedProfileValues,
  maskAgeInput,
  maskHeightInput,
  maskNameInput,
  maskWeightInput,
  parseAge,
  parseHeightCm,
  parseWeightKg,
  validateProfileBasics,
} from '../utils/profileValidation';
import { saveUserProfile } from '../services/authService';
import { refineDietGoals } from '../services/goalAiService';
import { isFirebaseConfigured } from '../config';
import { isAiLimitError, showAiLimitAlert } from '../utils/aiErrors';

interface Props {
  onComplete: () => void;
}

type Step = 'basics' | 'sex' | 'goal' | 'activity' | 'result';
const STEPS: Step[] = ['basics', 'sex', 'goal', 'activity', 'result'];

const GOAL_OPTIONS: { val: GoalType; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; sub: string }[] = [
  { val: 'deficit',  icon: 'local-fire-department', label: 'Emagrecer',     sub: 'Déficit calórico controlado' },
  { val: 'maintain', icon: 'balance',               label: 'Manter peso',   sub: 'Manutenção do peso atual' },
  { val: 'muscle',   icon: 'fitness-center',        label: 'Ganhar massa',  sub: 'Superávit + proteína alta' },
  { val: 'bulk',     icon: 'trending-up',           label: 'Ganho de peso', sub: 'Superávit calórico maior' },
];

const ACTIVITY_OPTIONS: { val: ActivityLevel; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; sub: string }[] = [
  { val: 1.2,   icon: 'weekend',          label: 'Sedentário',  sub: 'Pouca ou nenhuma atividade' },
  { val: 1.375, icon: 'directions-walk',  label: 'Leve',        sub: '1-3 treinos por semana' },
  { val: 1.55,  icon: 'directions-run',   label: 'Moderado',    sub: '3-5 treinos por semana' },
  { val: 1.725, icon: 'fitness-center',   label: 'Intenso',     sub: '6-7 treinos por semana' },
];

export function OnboardingScreen({ onComplete }: Props) {
  const user       = useStore((s) => s.user);
  const setProfile = useStore((s) => s.setProfile);
  const setGoals   = useStore((s) => s.setGoals);

  const [stepIdx, setStepIdx]     = useState(0);
  const [name,    setName]        = useState(user?.name ?? '');
  const [age,     setAge]         = useState('');
  const [weight,  setWeight]      = useState('');
  const [height,  setHeight]      = useState('');
  const [sex,     setSex]         = useState<BiologicalSex>('M');
  const [goal,    setGoal]        = useState<GoalType>('maintain');
  const [activity,setActivity]    = useState<ActivityLevel>(1.55);
  const [saving,  setSaving]      = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGoals, setAiGoals] = useState<MacroGoals | null>(null);
  const [aiReason, setAiReason] = useState('');

  useEffect(() => {
    if (!name.trim() && user?.name) {
      setName(user.name);
    }
  }, [name, user?.name]);

  const progress = (stepIdx + 1) / STEPS.length;
  const step     = STEPS[stepIdx];

  function goNext() {
    if (step === 'basics') {
      const error = validateProfileBasics({ name, age, weight, height });
      if (error) {
        Alert.alert('Confira seus dados', error);
        return;
      }
    }
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      handleFinish();
    }
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
    const profileValues = buildValidatedProfileValues({ age, weight, height });

    const profile: UserProfile = {
      userId:           user.id,
      name:             name.trim(),
      age:              profileValues.age,
      weight:           profileValues.weight,
      height:           profileValues.height,
      sex,
      goal,
      activityLevel:    activity,
      onboardingComplete: true,
      groupIds:         [],
      communityPrivacy: {
        showProtein: true,
        showFiber: true,
        showCalories: true,
        showStreak: true,
        showLimits: true,
      },
      createdAt:        new Date(),
      updatedAt:        new Date(),
    };

    const goals = aiGoals ?? calcMacroGoals(profile);

    try {
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        await saveUserProfile(profile);
      }
      setProfile(profile);
      setGoals(goals);
      onComplete();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  // computed preview goals (for result step)
  const previewProfile: UserProfile = {
    userId: '', name, age: parseAge(age), weight: parseWeightKg(weight),
    height: parseHeightCm(height), sex, goal, activityLevel: activity,
    onboardingComplete: false, groupIds: [], communityPrivacy: {
      showProtein: true,
      showFiber: true,
      showCalories: true,
      showStreak: true,
      showLimits: true,
    }, createdAt: new Date(), updatedAt: new Date(),
  };
  const basePreviewGoals = calcMacroGoals(previewProfile);
  const previewGoals = aiGoals ?? basePreviewGoals;

  useEffect(() => {
    setAiGoals(null);
    setAiReason('');
  }, [age, weight, height, sex, goal, activity]);

  async function handleRefineGoalsWithAi() {
    setAiLoading(true);
    try {
      const recommendation = await refineDietGoals(previewProfile, basePreviewGoals);
      setAiGoals(recommendation.goals);
      setAiReason(recommendation.rationale);
    } catch (e) {
      console.warn('AI onboarding goal refinement failed', e);
      if (isAiLimitError(e)) {
        showAiLimitAlert();
        return;
      }
      Alert.alert('IA indisponível', 'Não consegui refinar suas metas agora. Você pode continuar com a meta calculada.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.stepLabel}>Passo {stepIdx + 1} de {STEPS.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Basics */}
        {step === 'basics' && (
          <>
            <Text style={styles.title}>Vamos te conhecer 👋</Text>
            <Text style={styles.sub}>Para calcular suas metas de macronutrientes personalizadas</Text>
            <Field label="Seu nome" value={name} onChangeText={(v) => setName(maskNameInput(v))} placeholder="Ex: João Silva" autoCapitalize="words" />
            <Field label="Idade" value={age} onChangeText={(v) => setAge(maskAgeInput(v))} placeholder="Ex: 28" keyboardType="numeric" maxLength={3} />
            <Field label="Peso atual (kg)" value={weight} onChangeText={(v) => setWeight(maskWeightInput(v))} placeholder="Ex: 85,5" keyboardType="decimal-pad" />
            <Field label="Altura (m)" value={height} onChangeText={(v) => setHeight(maskHeightInput(v))} placeholder="Ex: 1,85" keyboardType="numeric" maxLength={4} />
          </>
        )}

        {/* Sex */}
        {step === 'sex' && (
          <>
            <Text style={styles.title}>Sexo biológico ⚧</Text>
            <Text style={styles.sub}>Influencia no cálculo do metabolismo basal</Text>
            <OptionGrid
              options={[
                { val: 'M', icon: 'male', label: 'Masculino', sub: 'TMB masculino' },
                { val: 'F', icon: 'female', label: 'Feminino',  sub: 'TMB feminino' },
              ]}
              selected={sex}
              onSelect={(v) => setSex(v as BiologicalSex)}
            />
          </>
        )}

        {/* Goal */}
        {step === 'goal' && (
          <>
            <Text style={styles.title}>Qual é seu objetivo? 🎯</Text>
            <Text style={styles.sub}>Isso define a distribuição dos seus macronutrientes</Text>
            <OptionGrid options={GOAL_OPTIONS} selected={goal} onSelect={(v) => setGoal(v as GoalType)} />
          </>
        )}

        {/* Activity */}
        {step === 'activity' && (
          <>
            <Text style={styles.title}>Nível de atividade 🏃</Text>
            <Text style={styles.sub}>Com que frequência você se exercita?</Text>
            <OptionGrid options={ACTIVITY_OPTIONS} selected={activity} onSelect={(v) => setActivity(parseFloat(v) as ActivityLevel)} />
          </>
        )}

        {/* Result */}
        {step === 'result' && (
          <>
            <Text style={styles.title}>Suas metas calculadas! 🎉</Text>
            <Text style={styles.sub}>Baseado nos seus dados e objetivo</Text>
            <View style={styles.resultCard}>
              <GoalRow emoji="⚡" label="Calorias"     value={`${previewGoals.kcal} kcal`} />
              <GoalRow emoji="🥩" label="Proteína"     value={formatGrams(previewGoals.protein)} color={Colors.protein} />
              <GoalRow emoji="🌾" label="Carboidratos" value={formatGrams(previewGoals.carbs)}   color={Colors.carbs}   />
              <GoalRow emoji="🫒" label="Gorduras"     value={formatGrams(previewGoals.fat)}     color={Colors.fat}     />
              <GoalRow emoji="🥦" label="Fibras"       value={formatGrams(previewGoals.fiber)}   color={Colors.fiber}   />
              <GoalRow emoji="💧" label="Água"         value={`${previewGoals.water} ml`}        color={Colors.carbs}   />
              <GoalRow emoji="🍬" label="Açúcar máx."  value={formatGrams(previewGoals.sugar)}   color={Colors.purple}  />
              <GoalRow emoji="🧂" label="Sódio máx."   value={`${previewGoals.sodium} mg`}       color={Colors.warning} />
            </View>
            <TouchableOpacity style={[styles.aiBtn, aiLoading && styles.btnDisabled]} onPress={handleRefineGoalsWithAi} disabled={aiLoading}>
              {aiLoading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.aiBtnText}>{aiGoals ? 'Refinar novamente com IA' : 'Refinar com IA'}</Text>}
            </TouchableOpacity>
            {aiReason ? (
              <View style={styles.aiReasonBox}>
                <Text style={styles.aiReasonTitle}>Sugestão da IA</Text>
                <Text style={styles.aiReasonText}>{aiReason}</Text>
              </View>
            ) : null}
            <Text style={styles.hint}>Você pode ajustar essas metas em Configurações a qualquer momento.</Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {stepIdx > 0 && (
          <TouchableOpacity style={styles.btnBack} onPress={() => setStepIdx((i) => i - 1)}>
            <Text style={styles.btnBackText}>← Voltar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.btnNext, (saving || aiLoading) && styles.btnDisabled]}
          onPress={goNext}
          disabled={saving || aiLoading}
        >
          <Text style={styles.btnNextText}>
            {step === 'result' ? (saving ? 'Salvando...' : 'Começar! 🚀') : 'Continuar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={Colors.gray400} {...props} />
    </>
  );
}

function OptionGrid<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: { val: T; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; sub: string }[];
  selected: T;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={styles.optGrid}>
      {options.map((o) => (
        <TouchableOpacity
          key={String(o.val)}
          style={[styles.optCard, selected == o.val && styles.optCardSelected]}
          onPress={() => onSelect(String(o.val))}
        >
          <MaterialIcons
            name={o.icon}
            size={30}
            color={selected == o.val ? Colors.green600 : Colors.gray400}
            style={styles.optIcon}
          />
          <Text style={[styles.optLabel, selected == o.val && styles.optLabelSelected]}>{o.label}</Text>
          <Text style={[styles.optSub,   selected == o.val && styles.optSubSelected]}>{o.sub}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function GoalRow({ emoji, label, value, color }: { emoji: string; label: string; value: string; color?: string }) {
  return (
    <View style={styles.goalRow}>
      <View style={styles.goalRowLeft}>
        <Text style={styles.goalEmoji}>{emoji}</Text>
        <Text style={styles.goalLabel}>{label}</Text>
      </View>
      <Text style={[styles.goalValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 620 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: Spacing.xxxl },

  progressWrap: { width: '100%', maxWidth: Platform.OS === 'web' ? 620 : undefined, alignSelf: 'center', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
  progressBg:   { height: 4, backgroundColor: Colors.gray50, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.green400, borderRadius: 2 },
  stepLabel:    { fontSize: Typography.xs, color: Colors.green400, fontWeight: Typography.semibold, marginTop: 6 },

  title: { fontSize: Typography.xxl, fontWeight: Typography.bold, marginBottom: Spacing.sm },
  sub:   { fontSize: Typography.md,  color: Colors.gray600, marginBottom: Spacing.lg },

  fieldLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.base, color: Colors.gray800, marginBottom: Spacing.md,
    backgroundColor: Colors.white,
  },

  optGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optCard:         { width: '47%', backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', ...Shadows.sm },
  optCardSelected: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  optIcon:         { fontSize: 28, marginBottom: Spacing.sm },
  optLabel:        { fontSize: Typography.md, fontWeight: Typography.bold, textAlign: 'center' },
  optLabelSelected:{ color: Colors.green600 },
  optSub:          { fontSize: Typography.xs, color: Colors.gray400, textAlign: 'center', marginTop: 3 },
  optSubSelected:  { color: Colors.green400 },

  resultCard: { backgroundColor: Colors.green50, borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing.md },
  goalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  goalRowLeft:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goalEmoji:  { fontSize: 18 },
  goalLabel:  { fontSize: Typography.md, color: Colors.gray800 },
  goalValue:  { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.green600 },
  hint:       { fontSize: Typography.xs, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
  aiBtn: {
    backgroundColor: Colors.green600,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  aiBtnText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
  aiReasonBox: {
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green100,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  aiReasonTitle: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  aiReasonText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 19 },

  footer:   { width: '100%', maxWidth: Platform.OS === 'web' ? 620 : undefined, alignSelf: 'center', flexDirection: 'row', padding: Spacing.base, gap: Spacing.sm, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  btnBack:  { paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  btnBackText: { fontSize: Typography.base, color: Colors.gray600 },
  btnNext:  { flex: 1, backgroundColor: Colors.green400, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnNextText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
});
