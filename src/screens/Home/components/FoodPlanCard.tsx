import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { FoodNutrition, FoodPlan, FoodPlanMeal, FoodPlanMealSubstitution } from '../../../types';
import { formatNutritionDetails } from '../../../utils/nutrition';
import { styles } from '../styles';

function makeFoodPlanMealKey(planId: string, meal: FoodPlanMeal, mealIndex: number) {
  return `${planId}_${mealIndex}_${meal.period}_${meal.title}`;
}

function makeLegacyFoodPlanMealKey(planId: string, meal: FoodPlanMeal) {
  return `${planId}_${meal.period}_${meal.title}`;
}

export { makeFoodPlanMealKey, makeLegacyFoodPlanMealKey };

export function FoodPlanCard({
  plan,
  completingMealKey,
  onCompleteMeal,
  onOpenShoppingPdf,
  selectedOptions,
  openOptionKey,
  skippedMealKeys,
  completedMealKeys,
  onSelectOption,
  onToggleOptions,
  onSkipMeal,
}: {
  plan: FoodPlan;
  completingMealKey?: string | null;
  onCompleteMeal: (plan: FoodPlan, meal: FoodPlanMeal, mealIndex: number) => void;
  onOpenShoppingPdf: () => void;
  selectedOptions: Record<string, string>;
  openOptionKey: string | null;
  skippedMealKeys: Record<string, boolean>;
  completedMealKeys: Record<string, boolean>;
  onSelectOption: (mealKey: string, optionId: string) => void;
  onToggleOptions: (mealKey: string) => void;
  onSkipMeal: (mealKey: string) => void;
}) {
  const plannedMeals = plan.meals.map((meal, index) => ({
    meal,
    index,
    key: makeFoodPlanMealKey(plan.id, meal, index),
    legacyKey: makeLegacyFoodPlanMealKey(plan.id, meal),
  }));
  const legacyKeyCounts = plannedMeals.reduce<Record<string, number>>((counts, item) => {
    counts[item.legacyKey] = (counts[item.legacyKey] ?? 0) + 1;
    return counts;
  }, {});
  const isMealCompleted = (item: { key: string; legacyKey: string }) =>
    completedMealKeys[item.key] || (legacyKeyCounts[item.legacyKey] === 1 && completedMealKeys[item.legacyKey]);
  const mealOptions = (meal: FoodPlanMeal) => [
    {
      id: 'main',
      title: 'Opção principal',
      items: meal.items,
      totalNutrition: meal.totalNutrition,
      instructions: meal.instructions,
    },
    ...(meal.substitutions ?? []),
  ];
  const selectedMealFromOption = (
    meal: FoodPlanMeal,
    option: FoodPlanMealSubstitution | {
      id: string;
      title: string;
      items: FoodPlanMeal['items'];
      totalNutrition?: FoodNutrition;
      instructions?: string;
    },
  ): FoodPlanMeal => ({
    ...meal,
    instructions: option.instructions ?? meal.instructions,
    items: option.items,
    totalNutrition: option.totalNutrition,
  });
  const visibleMeals = plannedMeals
    .filter((item) => !isMealCompleted(item))
    .slice(0, 2);

  return (
    <View style={styles.foodPlanPanel}>
      <View style={styles.foodPlanHeader}>
        <View>
          <Text style={styles.foodPlanEyebrow}>Plano alimentar</Text>
          <Text style={styles.foodPlanTitle}>{plan.title}</Text>
        </View>
        <Text style={styles.foodPlanAuthor}>{plan.nutritionistName}</Text>
      </View>
      {plan.notes ? <Text style={styles.foodPlanNotes}>{plan.notes}</Text> : null}
      {visibleMeals.length === 0 ? (
        <View style={styles.foodPlanCompleteBox}>
          <MaterialIcons name="task-alt" size={22} color={Colors.green600} />
          <Text style={styles.foodPlanCompleteText}>
            Todas as refeições do plano foram marcadas hoje.
          </Text>
        </View>
      ) : null}
      {visibleMeals.map(({ meal, index, key, legacyKey }) => {
        const options = mealOptions(meal);
        const selectedOptionId = selectedOptions[key] ?? 'main';
        const selectedOption =
          options.find((option) => option.id === selectedOptionId) ?? options[0];
        const selectedMeal = selectedMealFromOption(meal, selectedOption);
        const isSkipped = skippedMealKeys[key];
        const isCompleted = isMealCompleted({ key, legacyKey });
        const isCompleting = completingMealKey === key;

        return (
          <View key={key} style={[styles.foodPlanMeal, isSkipped && styles.foodPlanMealSkipped]}>
            <View style={styles.foodPlanMealHeader}>
              <View style={styles.foodPlanMealHeaderText}>
                <Text style={styles.foodPlanMealTitle}>{meal.time ? `${meal.time} · ${meal.title}` : meal.title}</Text>
                <Text style={styles.foodPlanOptionLabel}>{selectedOption.title}</Text>
              </View>
            <View style={styles.foodPlanMealHeaderActions}>
              <TouchableOpacity
                style={styles.foodPlanShoppingIconBtn}
                onPress={onOpenShoppingPdf}
                accessibilityRole="button"
                accessibilityLabel="Abrir lista de compras em PDF"
              >
                <MaterialIcons name="picture-as-pdf" size={19} color={Colors.green600} />
              </TouchableOpacity>
              {options.length > 1 ? (
              <TouchableOpacity
                style={styles.foodPlanDropdownBtn}
                onPress={() => onToggleOptions(key)}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar opção da refeição"
                >
                  <MaterialIcons
                    name={openOptionKey === key ? 'expand-less' : 'expand-more'}
                    size={20}
                  color={Colors.green600}
                />
              </TouchableOpacity>
              ) : null}
            </View>
          </View>
            {openOptionKey === key ? (
              <View style={styles.foodPlanDropdown}>
                {options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.foodPlanDropdownItem,
                      selectedOption.id === option.id && styles.foodPlanDropdownItemActive,
                    ]}
                    onPress={() => onSelectOption(key, option.id)}
                  >
                    <Text
                      style={[
                        styles.foodPlanDropdownText,
                        selectedOption.id === option.id && styles.foodPlanDropdownTextActive,
                      ]}
                    >
                      {option.title}
                    </Text>
                    {selectedOption.id === option.id ? (
                      <MaterialIcons name="check" size={18} color={Colors.green600} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <Text style={styles.foodPlanMealItems}>
              {selectedMeal.items.map((item) => `${item.quantity} ${item.name}`.trim()).join(', ')}
            </Text>
            {selectedMeal.totalNutrition ? (
              <Text style={styles.foodPlanMealNutrition}>{formatNutritionDetails(selectedMeal.totalNutrition, { includeKcal: true })}</Text>
            ) : null}
            <View style={styles.foodPlanMealActions}>
              <TouchableOpacity
                style={[styles.foodPlanSkipBtn, isSkipped && styles.foodPlanSkipBtnActive]}
                onPress={() => onSkipMeal(key)}
              >
                <MaterialIcons name="skip-next" size={18} color={isSkipped ? Colors.white : Colors.gray600} />
                <Text style={[styles.foodPlanSkipText, isSkipped && styles.foodPlanSkipTextActive]}>
                  {isSkipped ? 'Pulada' : 'Pular'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.foodPlanDoneBtn,
                  isCompleted && styles.foodPlanDoneBtnCompleted,
                  (isCompleting || isSkipped || isCompleted) && styles.foodPlanDoneBtnDisabled,
                ]}
                onPress={() => onCompleteMeal(plan, selectedMeal, index)}
                disabled={isCompleting || isSkipped || isCompleted}
              >
                <MaterialIcons name={isCompleted ? 'task-alt' : 'check-circle'} size={18} color={Colors.white} />
                <Text style={styles.foodPlanDoneText}>
                  {isCompleted ? 'Refeição marcada' : isCompleting ? 'Registrando...' : 'Fiz esta refeição'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}
