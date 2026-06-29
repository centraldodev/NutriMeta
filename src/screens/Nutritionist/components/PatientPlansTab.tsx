import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { FoodPlan } from "../../../types";
import { formatNutritionDetails } from "../../../utils/nutrition";
import { styles } from "../styles";

type Props = {
  foodPlans: FoodPlan[];
  onShowPdf: () => void;
  onNewPlan: () => void;
  onEditPlan: (plan: FoodPlan) => void;
};

export function PatientPlansTab({ foodPlans, onShowPdf, onNewPlan, onEditPlan }: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitleNoMargin}>Planos alimentares</Text>
        <View style={styles.patientActionRow}>
          {foodPlans[0] ? (
            <TouchableOpacity style={styles.chatBtn} onPress={onShowPdf}>
              <MaterialIcons name="picture-as-pdf" size={17} color={Colors.green600} />
              <Text style={styles.chatBtnText}>Lista PDF</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.chatBtn} onPress={onNewPlan}>
            <MaterialIcons name="add" size={18} color={Colors.green600} />
            <Text style={styles.chatBtnText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
      </View>
      {foodPlans.length === 0 ? (
        <Text style={styles.mutedText}>
          Nenhum plano alimentar criado para este paciente.
        </Text>
      ) : (
        foodPlans.slice(0, 3).map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <View style={styles.planCardHeader}>
              <Text style={styles.planTitle}>{plan.title}</Text>
              <TouchableOpacity style={styles.planEditBtn} onPress={() => onEditPlan(plan)}>
                <MaterialIcons name="edit" size={16} color={Colors.green600} />
                <Text style={styles.planEditText}>Editar</Text>
              </TouchableOpacity>
            </View>
            {plan.notes ? (
              <Text style={styles.planNotes}>{plan.notes}</Text>
            ) : null}
            {plan.meals[0] ? (
              <Text style={styles.planNotes}>
                {plan.meals[0].time ? `${plan.meals[0].time} · ` : ""}
                {plan.meals[0].title}
              </Text>
            ) : null}
            {plan.totalNutrition ? (
              <Text style={styles.planNutrition}>
                {formatNutritionDetails(plan.totalNutrition, { includeKcal: true })}
              </Text>
            ) : null}
            <Text style={styles.planMeta}>
              {plan.meals.length} refeição(ões) ·{" "}
              {plan.shoppingList.length} item(ns) na lista de compras
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
