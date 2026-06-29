import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import {
  ActivityLevel,
  BiologicalSex,
  GoalType,
  MacroGoals,
  UserProfile,
} from "../../../types";
import { calcMacroGoals } from "../../../utils/nutrition";
import {
  birthDateFromAge,
  buildValidatedProfileValues,
  formatBirthDateInput,
  formatHeightInput,
  formatWeightInput,
  maskHeightInput,
  maskWeightInput,
  validateProfileBasics,
} from "../../../utils/profileValidation";
import {
  DEFAULT_GOALS,
  EDITABLE_GOAL_ROWS,
  EditableGoalKey,
} from "../types";
import {
  buildGoalsFromInputs,
  formatGoalInputs,
} from "../utils/goalUtils";
import { styles } from "../styles";
import { BottomSheet } from "../../../components/BottomSheet";
import { ModalActionBar } from "../../../components/ModalActionBar";

export function NutritionistField({
  label,
  suffix,
  wide,
  ...props
}: {
  label: string;
  suffix?: string;
  wide?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.fieldWrap, wide && styles.fieldWrapWide]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <TextInput
          {...props}
          style={[styles.fieldInput, props.style]}
          placeholderTextColor={Colors.gray400}
        />
        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function PatientEditModal({
  visible,
  patient,
  onClose,
  onSave,
}: {
  visible: boolean;
  patient: UserProfile | null;
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
}) {
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<BiologicalSex>("M");
  const [goalType, setGoalType] = useState<GoalType>("maintain");
  const [activity, setActivity] = useState<ActivityLevel>(1.55);
  const [goalInputs, setGoalInputs] = useState<
    Record<EditableGoalKey, string>
  >(formatGoalInputs(DEFAULT_GOALS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !patient) return;
    const activeGoals = patient.macroGoals ?? calcMacroGoals(patient);
    setWeight(formatWeightInput(patient.weight));
    setHeight(formatHeightInput(patient.height));
    setSex(patient.sex);
    setGoalType(patient.goal);
    setActivity(patient.activityLevel);
    setGoalInputs(formatGoalInputs(activeGoals));
  }, [patient, visible]);

  function updateGoalInput(key: EditableGoalKey, value: string) {
    setGoalInputs((current) => ({ ...current, [key]: value }));
  }

  function handleRecalculateGoals() {
    if (!patient) return;
    const patientBirthDate = patient.birthDate ?? birthDateFromAge(patient.age);
    const error = validateProfileBasics({ name: patient.name, birthDate: patientBirthDate, weight, height });
    if (error) {
      Alert.alert("Confira os dados", error);
      return;
    }
    const profileValues = buildValidatedProfileValues({
      birthDate: patientBirthDate,
      age: String(patient.age),
      weight,
      height,
      fallback: patient,
    });
    const preview: UserProfile = {
      ...patient,
      birthDate: profileValues.birthDate,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
    };
    setGoalInputs(formatGoalInputs(calcMacroGoals(preview)));
  }

  async function handleSave() {
    if (!patient) return;
    const patientBirthDate = patient.birthDate ?? birthDateFromAge(patient.age);
    const error = validateProfileBasics({ name: patient.name, birthDate: patientBirthDate, weight, height });
    if (error) {
      Alert.alert("Confira os dados", error);
      return;
    }
    const profileValues = buildValidatedProfileValues({
      birthDate: patientBirthDate,
      age: String(patient.age),
      weight,
      height,
      fallback: patient,
    });
    const profileBase: UserProfile = {
      ...patient,
      birthDate: profileValues.birthDate,
      age: profileValues.age,
      weight: profileValues.weight,
      height: profileValues.height,
      sex,
      goal: goalType,
      activityLevel: activity,
      updatedAt: new Date(),
    };
    const fallbackGoals = {
      ...calcMacroGoals(profileBase),
      ...(patient.macroGoals ?? {}),
    };
    const nextProfile: UserProfile = {
      ...profileBase,
      macroGoals: buildGoalsFromInputs(goalInputs, fallbackGoals),
    };

    setSaving(true);
    try {
      await onSave(nextProfile);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Editar paciente">
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            <View style={styles.fieldGrid}>
              <View style={styles.lockedPatientField}>
                <View style={styles.lockedPatientFieldHeader}>
                  <Text style={styles.fieldLabel}>Nome</Text>
                  <MaterialIcons name="lock-outline" size={15} color={Colors.gray400} />
                </View>
                <Text style={styles.lockedPatientValue}>{patient?.name ?? "-"}</Text>
              </View>
              <View style={styles.lockedPatientField}>
                <View style={styles.lockedPatientFieldHeader}>
                  <Text style={styles.fieldLabel}>Nickname</Text>
                  <MaterialIcons name="lock-outline" size={15} color={Colors.gray400} />
                </View>
                <Text style={styles.lockedPatientValue}>
                  {patient?.nickname ? `@${patient.nickname}` : "Não definido"}
                </Text>
              </View>
              <View style={styles.lockedPatientField}>
                <View style={styles.lockedPatientFieldHeader}>
                  <Text style={styles.fieldLabel}>Nascimento</Text>
                  <MaterialIcons name="lock-outline" size={15} color={Colors.gray400} />
                </View>
                <Text style={styles.lockedPatientValue}>
                  {formatBirthDateInput(patient?.birthDate) || "Não definido"}
                </Text>
              </View>
              <View style={styles.lockedPatientField}>
                <View style={styles.lockedPatientFieldHeader}>
                  <Text style={styles.fieldLabel}>Idade</Text>
                  <MaterialIcons name="lock-outline" size={15} color={Colors.gray400} />
                </View>
                <Text style={styles.lockedPatientValue}>
                  {patient ? `${patient.age} anos` : "-"}
                </Text>
              </View>
              <NutritionistField
                label="Peso"
                value={weight}
                onChangeText={(v) => setWeight(maskWeightInput(v))}
                keyboardType="decimal-pad"
                suffix="kg"
              />
              <NutritionistField
                label="Altura"
                value={height}
                onChangeText={(v) => setHeight(maskHeightInput(v))}
                keyboardType="numeric"
                maxLength={4}
                suffix="m"
              />
            </View>

            <Text style={styles.fieldLabel}>Sexo biológico</Text>
            <View style={styles.segmentRow}>
              {(["M", "F"] as BiologicalSex[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.segment, sex === item && styles.segmentActive]}
                  onPress={() => setSex(item)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      sex === item && styles.segmentTextActive,
                    ]}
                  >
                    {item === "M" ? "Masculino" : "Feminino"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Objetivo</Text>
            <View style={styles.segmentWrap}>
              {(
                [
                  ["deficit", "Emagrecer"],
                  ["maintain", "Manter"],
                  ["muscle", "Massa"],
                  ["bulk", "Volume"],
                ] as [GoalType, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.pill, goalType === value && styles.pillActive]}
                  onPress={() => setGoalType(value)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      goalType === value && styles.pillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Atividade</Text>
            <View style={styles.segmentWrap}>
              {(
                [
                  [1.2, "Sedentário"],
                  [1.375, "Leve"],
                  [1.55, "Moderado"],
                  [1.725, "Intenso"],
                  [1.9, "Atleta"],
                ] as [ActivityLevel, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={String(value)}
                  style={[styles.pill, activity === value && styles.pillActive]}
                  onPress={() => setActivity(value)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      activity === value && styles.pillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalSectionHeader}>
              <Text style={styles.sectionTitleNoMargin}>
                Metas nutricionais
              </Text>
              <TouchableOpacity
                style={styles.recalcBtn}
                onPress={handleRecalculateGoals}
                accessibilityRole="button"
                accessibilityLabel="Recalcular metas nutricionais"
              >
                <MaterialIcons name="refresh" size={20} color={Colors.green600} />
              </TouchableOpacity>
            </View>
            <View style={styles.fieldGrid}>
              {EDITABLE_GOAL_ROWS.map((item) => (
                <NutritionistField
                  key={item.key}
                  label={item.label}
                  value={goalInputs[item.key]}
                  onChangeText={(v) => updateGoalInput(item.key, v)}
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
