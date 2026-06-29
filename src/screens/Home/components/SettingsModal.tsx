import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { isFirebaseConfigured } from '../../../config';
import { normalizeNickname, saveUserProfile, validateNickname } from '../../../services/authService';
import { NativeDatePicker } from '../../../components/NativeDatePicker';
import { useStore } from '../../../store';
import { selectGoals } from '../../../store';
import { ActivityLevel, BiologicalSex, GoalType, MacroGoals, UserProfile } from '../../../types';
import { calcMacroGoals } from '../../../utils/nutrition';
import {
  birthDateFromAge,
  birthDateToDate,
  buildValidatedProfileValues,
  calculateAgeFromBirthDate,
  dateToBirthDateString,
  formatBirthDateInput,
  formatHeightInput,
  formatWeightInput,
  maskBirthDateInput,
  maskHeightInput,
  maskNameInput,
  maskWeightInput,
  normalizeBirthDateInput,
  validateProfileBasics,
} from '../../../utils/profileValidation';
import { DEFAULT_GOALS, EDITABLE_GOAL_ROWS, EditableGoalKey } from '../types';
import { buildGoalsFromInputs, formatGoalInputs } from '../utils/goalUtils';
import { modalStyles } from '../styles';
import { BottomSheet } from '../../../components/BottomSheet';
import { ModalActionBar } from '../../../components/ModalActionBar';

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

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const goals = useStore(selectGoals);
  const setUser = useStore((s) => s.setUser);
  const setProfile = useStore((s) => s.setProfile);
  const setGoals = useStore((s) => s.setGoals);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<BiologicalSex>('M');
  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [goalInputs, setGoalInputs] = useState<Record<EditableGoalKey, string>>(
    formatGoalInputs(DEFAULT_GOALS),
  );
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [birthDateEditing, setBirthDateEditing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const activeGoals = { ...DEFAULT_GOALS, ...(profile?.macroGoals ?? goals ?? {}) };
    setName(profile?.name ?? user?.name ?? '');
    setNickname(profile?.nickname ?? user?.nickname ?? '');
    setBirthDate(profile?.birthDate ?? (profile?.age ? birthDateFromAge(profile.age) : ''));
    setBirthDateEditing(false);
    setWeight(formatWeightInput(profile?.weight));
    setHeight(formatHeightInput(profile?.height));
    setSex(profile?.sex ?? 'M');
    setGoalType(profile?.goal ?? 'maintain');
    setActivity(profile?.activityLevel ?? 1.55);
    setAvatarUrl(user?.avatarUrl);
    setGoalInputs(formatGoalInputs(activeGoals));
  }, [visible, goals, profile, user]);

  function updateGoalInput(key: EditableGoalKey, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function buildProfile(): UserProfile | null {
    if (!user) return null;
    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    const error = validateProfileBasics({ name, birthDate: normalizedBirthDate, weight, height });
    if (error) {
      Alert.alert('Confira seus dados', error);
      return null;
    }
    const nicknameValue = nickname.trim();
    const nicknameError = nicknameValue ? validateNickname(nicknameValue) : null;
    if (nicknameError) {
      Alert.alert('Confira seu nickname', nicknameError);
      return null;
    }
    const profileValues = buildValidatedProfileValues({ birthDate: normalizedBirthDate, weight, height, fallback: profile ?? undefined });
    const nextProfile: UserProfile = {
      userId: user.id,
      name: name.trim() || user.name,
      nickname: nicknameValue ? normalizeNickname(nicknameValue) : undefined,
      birthDate: profileValues.birthDate,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      onboardingComplete: true,
      groupIds: profile?.groupIds ?? [],
      macroGoals: profile?.macroGoals,
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
    setGoalInputs(formatGoalInputs(calculated));
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

    const nextGoals = buildGoalsFromInputs(goalInputs, {
      ...DEFAULT_GOALS,
      ...(profile?.macroGoals ?? goals ?? {}),
    });
    const profileToSave: UserProfile = { ...nextProfile, macroGoals: nextGoals };

    setSaving(true);
    try {
      if (isFirebaseConfigured && user.id !== 'dev_user') {
        const savedNickname = await saveUserProfile(profileToSave);
        profileToSave.nickname = savedNickname;
      }
      setProfile(profileToSave);
      setGoals(nextGoals);
      setUser({ ...user, name: profileToSave.name, nickname: profileToSave.nickname, avatarUrl });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message === 'nickname_taken') {
        Alert.alert('Nickname indisponível', 'Esse nickname já está em uso. Escolha outro.');
      } else {
        Alert.alert('Erro', 'Não foi possível salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Configurações">

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
              <View style={modalStyles.profileInfo}>
                <TextInput
                  style={modalStyles.profileNameInput}
                  value={name}
                  onChangeText={(v) => setName(maskNameInput(v))}
                  placeholder="Seu nome"
                  placeholderTextColor={Colors.gray400}
                  autoCapitalize="words"
                />
                <View style={modalStyles.nicknameRow}>
                  <Text style={modalStyles.nicknamePrefix}>@</Text>
                  <TextInput
                    style={modalStyles.nicknameInput}
                    value={nickname}
                    onChangeText={(v) => setNickname(normalizeNickname(v))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="nickname"
                    placeholderTextColor={Colors.gray400}
                    maxLength={20}
                  />
                </View>
                {birthDateEditing || !birthDate ? (
                  <View style={modalStyles.birthDateRow}>
                    <TextInput
                      style={modalStyles.birthDateInput}
                      value={birthDate.includes('-') ? formatBirthDateInput(birthDate) : birthDate}
                      onChangeText={(value) => setBirthDate(maskBirthDateInput(value))}
                      placeholder="Data de nascimento"
                      placeholderTextColor={Colors.gray400}
                      keyboardType="numeric"
                      maxLength={10}
                      onBlur={() => {
                        if (birthDate) setBirthDateEditing(false);
                      }}
                    />
                    {Platform.OS !== 'web' ? (
                      <TouchableOpacity style={modalStyles.datePickerBtn} onPress={() => setDatePickerOpen(true)}>
                        <MaterialIcons name="calendar-today" size={18} color={Colors.green600} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={modalStyles.birthDateDisplay}
                    onPress={() => {
                      setBirthDateEditing(true);
                      if (Platform.OS !== 'web') setDatePickerOpen(true);
                    }}
                  >
                    <MaterialIcons name="cake" size={16} color={Colors.gray400} />
                    <Text style={modalStyles.birthDateText}>{formatBirthDateInput(birthDate)}</Text>
                    <MaterialIcons name="edit" size={15} color={Colors.green600} />
                  </TouchableOpacity>
                )}
                {datePickerOpen && Platform.OS !== 'web' ? (
                  <NativeDatePicker
                    value={birthDateToDate(birthDate)}
                    maximumDate={new Date()}
                    onChange={(date, dismissed) => {
                      setDatePickerOpen(false);
                      setBirthDateEditing(false);
                      if (!dismissed && date) setBirthDate(dateToBirthDateString(date));
                    }}
                  />
                ) : null}
              </View>
              <View style={modalStyles.ageCard}>
                <Text style={modalStyles.ageValue}>
                  {calculateAgeFromBirthDate(birthDate) || '--'}
                </Text>
                <Text style={modalStyles.ageLabel}>anos</Text>
              </View>
            </View>

            <Text style={modalStyles.sectionTitle}>Dados do corpo</Text>
            <View style={modalStyles.fieldGrid}>
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
                <TouchableOpacity
                  style={modalStyles.recalcBtn}
                  onPress={handleRecalculateGoals}
                  accessibilityRole="button"
                  accessibilityLabel="Recalcular metas nutricionais"
                >
                  <MaterialIcons name="refresh" size={20} color={Colors.green600} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={modalStyles.fieldGrid}>
              {EDITABLE_GOAL_ROWS.map((item) => (
                <Field
                  key={item.key}
                  label={item.label}
                  value={goalInputs[item.key]}
                  onChangeText={(value) => updateGoalInput(item.key, value)}
                  keyboardType="numeric"
                  suffix={item.unit}
                />
              ))}
            </View>
          </ScrollView>

      <ModalActionBar
        onCancel={onClose}
        onConfirm={handleSave}
        confirmLabel="Salvar"
        loading={saving}
      />
    </BottomSheet>
  );
}
