import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { NutritionistPatientLink, UserProfile } from "../../../types";
import { calcMacroGoals } from "../../../utils/nutrition";
import { formatBirthDateInput } from "../../../utils/profileValidation";
import { InfoCard, goalLabel } from "./ProgressRow";
import { styles } from "../styles";

type Props = {
  patient: UserProfile;
  link: NutritionistPatientLink | null;
  unreadChatCounts: Record<string, number>;
  onEdit: () => void;
  onChat: (link: NutritionistPatientLink) => void;
};

export function PatientSummaryTab({ patient, link, unreadChatCounts, onEdit, onChat }: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitleNoMargin}>Resumo do paciente</Text>
        <View style={styles.patientActionRow}>
          <TouchableOpacity style={styles.chatBtn} onPress={onEdit}>
            <MaterialIcons name="edit" size={17} color={Colors.green600} />
            <Text style={styles.chatBtnText}>Editar</Text>
          </TouchableOpacity>
          {link ? (
            <TouchableOpacity style={styles.chatBtn} onPress={() => onChat(link)}>
              <MaterialIcons name="chat" size={17} color={Colors.green600} />
              <Text style={styles.chatBtnText}>
                Chat
                {(unreadChatCounts[link.id] ?? 0) > 0
                  ? ` (${unreadChatCounts[link.id]})`
                  : ""}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={styles.summaryGrid}>
        <InfoCard
          label="Nascimento"
          value={formatBirthDateInput(patient.birthDate) || "Não definido"}
        />
        <InfoCard label="Idade" value={`${patient.age} anos`} />
        <InfoCard label="Objetivo" value={goalLabel(patient.goal)} />
        <InfoCard label="Altura" value={`${patient.height} cm`} />
        <InfoCard label="Peso" value={`${patient.weight} kg`} />
        <InfoCard label="Atividade" value={`${patient.activityLevel}x`} />
      </View>
      <View style={styles.summaryGrid}>
        <InfoCard
          label="Proteína"
          value={`${patient.macroGoals?.protein ?? calcMacroGoals(patient).protein} g`}
        />
        <InfoCard
          label="Carboidratos"
          value={`${patient.macroGoals?.carbs ?? calcMacroGoals(patient).carbs} g`}
        />
        <InfoCard
          label="Gorduras"
          value={`${patient.macroGoals?.fat ?? calcMacroGoals(patient).fat} g`}
        />
        <InfoCard
          label="Calorias"
          value={`${patient.macroGoals?.kcal ?? calcMacroGoals(patient).kcal} kcal`}
        />
      </View>
    </View>
  );
}
