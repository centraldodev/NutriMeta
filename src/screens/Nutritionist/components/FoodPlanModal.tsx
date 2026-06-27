import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import {
  FoodItem,
  FoodNutrition,
  FoodPlan,
  FoodPlanMeal,
  MealEntry,
  QuantityUnit,
  UserProfile,
} from "../../../types";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import {
  formatBrasiliaTime,
  sumNutrition,
} from "../../../utils/nutrition";
import { getCustomFoods } from "../../../services/customFoodService";
import { FoodIcon } from "../../../components/FoodIcon";
import { NativeTimePicker } from "../../../components/NativeTimePicker";
import {
  MEAL_PERIOD_OPTIONS,
  PERIOD_LABELS,
  PLAN_NUTRITION_ROWS,
  PlanMealOptionDraft,
  PlanSelectedFood,
} from "../types";
import {
  buildShoppingListFromOptions,
  getFoodUnits,
  normalizeFoodSearchText,
  optionDraftsFromPlan,
  parseOptionalPlanQuantity,
  planItemsFromSelectedFoods,
  recalcPlanFood,
  searchPlanFoods,
  selectedFoodsFromPlan,
} from "../utils/foodPlan";
import {
  formatPlanNutritionValue,
  isValidMealTime,
  maskTimeInput,
} from "../utils/goalUtils";
import { styles } from "../styles";
import { NutritionistField } from "./PatientEditModal";

function PlanNutritionChips({ nutrition }: { nutrition: FoodNutrition }) {
  const rows = PLAN_NUTRITION_ROWS.map((item) => ({
    ...item,
    value: nutrition[item.key],
  })).filter(
    (
      item,
    ): item is {
      key: keyof FoodNutrition;
      label: string;
      unit: string;
      value: number;
    } => typeof item.value === "number" && item.value > 0,
  );

  if (rows.length === 0)
    return <Text style={styles.planFoodMeta}>Sem nutrientes cadastrados.</Text>;

  return (
    <View style={styles.planNutritionChips}>
      {rows.map((item) => (
        <Text key={item.key} style={styles.planNutritionChip}>
          {item.label}: {formatPlanNutritionValue(item.value)}
          {item.unit}
        </Text>
      ))}
    </View>
  );
}

export function FoodPlanModal({
  visible,
  patient,
  nutritionist,
  initialPlan,
  onClose,
  onSave,
}: {
  visible: boolean;
  patient: UserProfile | null;
  nutritionist: { id: string; name: string } | null;
  initialPlan?: FoodPlan | null;
  onClose: () => void;
  onSave: (
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt"> | FoodPlan,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [mealPeriod, setMealPeriod] =
    useState<MealEntry["mealPeriod"]>("breakfast");
  const [mealTime, setMealTime] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(false);
  const [activeOptionId, setActiveOptionId] = useState("main");
  const [selectedFoods, setSelectedFoods] = useState<PlanSelectedFood[]>([]);
  const [substitutions, setSubstitutions] = useState<PlanMealOptionDraft[]>([]);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const meal = initialPlan?.meals[0];
    setTitle(initialPlan?.title ?? "");
    setNotes(initialPlan?.notes ?? "");
    setMealPeriod(meal?.period ?? "breakfast");
    setMealTime(meal?.time ?? "");
    setFoodQuery("");
    setActiveOptionId("main");
    setSelectedFoods(
      initialPlan ? selectedFoodsFromPlan(initialPlan, foods) : [],
    );
    setSubstitutions(optionDraftsFromPlan(initialPlan, foods));
    setTimePickerOpen(false);
  }, [foods, initialPlan, visible]);

  useEffect(() => {
    let active = true;
    async function loadFoods() {
      if (!visible || !nutritionist) return;
      setLoadingFoods(true);
      try {
        const loaded = await getCustomFoods(nutritionist.id);
        if (active) setFoods(loaded);
      } catch (error) {
        console.warn("Failed to load plan foods", error);
        if (active) setFoods([]);
      } finally {
        if (active) setLoadingFoods(false);
      }
    }
    loadFoods();
    return () => {
      active = false;
    };
  }, [nutritionist, visible]);

  const suggestions = useMemo(
    () => searchPlanFoods(foodQuery, foods),
    [foodQuery, foods],
  );
  const planTotal = useMemo(
    () =>
      sumNutrition(
        selectedFoods.map((item) => ({ nutrition: item.nutrition })),
      ),
    [selectedFoods],
  );
  const activeSubstitution = substitutions.find(
    (option) => option.id === activeOptionId,
  );
  const activeSelectedFoods =
    activeOptionId === "main"
      ? selectedFoods
      : activeSubstitution?.selectedFoods ?? [];
  const activePlanTotal = useMemo(
    () =>
      sumNutrition(
        activeSelectedFoods.map((item) => ({ nutrition: item.nutrition })),
      ),
    [activeSelectedFoods],
  );

  function updateActiveSelectedFoods(
    updater: (items: PlanSelectedFood[]) => PlanSelectedFood[],
  ) {
    if (activeOptionId === "main") {
      setSelectedFoods(updater);
      return;
    }
    setSubstitutions((options) =>
      options.map((option) =>
        option.id === activeOptionId
          ? { ...option, selectedFoods: updater(option.selectedFoods) }
          : option,
      ),
    );
  }

  function addSubstitutionOption() {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nextOption: PlanMealOptionDraft = {
      id,
      title: `Substituição ${substitutions.length + 1}`,
      selectedFoods: [],
    };
    setSubstitutions((options) => [...options, nextOption]);
    setActiveOptionId(id);
  }

  function removeSubstitutionOption(id: string) {
    setSubstitutions((options) => options.filter((option) => option.id !== id));
    if (activeOptionId === id) setActiveOptionId("main");
  }

  function renameSubstitutionOption(id: string, title: string) {
    setSubstitutions((options) =>
      options.map((option) =>
        option.id === id ? { ...option, title } : option,
      ),
    );
  }

  function addFoodToPlan(food: FoodItem) {
    const unit = food.defaultUnit;
    updateActiveSelectedFoods((items) => [
      ...items,
      {
        key: `${food.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        food,
        quantityText: "1",
        quantity: 1,
        unit,
        nutrition: calculateNutrition(food, 1, unit),
      },
    ]);
  }

  function updateSelectedFood(
    key: string,
    changes: { quantityText?: string; unit?: QuantityUnit },
  ) {
    updateActiveSelectedFoods((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        if (changes.unit) return recalcPlanFood(item, { unit: changes.unit });
        if (changes.quantityText !== undefined) {
          return recalcPlanFood(item, {
            quantityText: changes.quantityText,
            quantity: parseOptionalPlanQuantity(changes.quantityText),
          });
        }
        return item;
      }),
    );
  }

  function selectedTimeDate() {
    const [hour = 7, minute = 0] = mealTime.split(":").map(Number);
    const date = new Date();
    date.setHours(
      Number.isFinite(hour) ? hour : 7,
      Number.isFinite(minute) ? minute : 0,
      0,
      0,
    );
    return date;
  }

  function handleTimeChange(date: Date | null, dismissed: boolean) {
    if (Platform.OS === "android") setTimePickerOpen(false);
    if (dismissed || !date) return;
    setMealTime(formatBrasiliaTime(date));
  }

  function buildMealsForPlan(): FoodPlanMeal[] | null {
    if (!patient) return null;
    if (!title.trim() || selectedFoods.length === 0) {
      Alert.alert(
        "Plano incompleto",
        "Informe o título do plano e adicione ao menos um alimento.",
      );
      return null;
    }
    if (
      [selectedFoods, ...substitutions.map((option) => option.selectedFoods)]
        .flat()
        .some(
        (item) => !item.quantityText.trim() || item.quantity <= 0,
      )
    ) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero para todos os alimentos.",
      );
      return null;
    }
    if (!isValidMealTime(mealTime)) {
      Alert.alert(
        "Horário inválido",
        "Informe o horário no formato HH:mm, por exemplo 07:30.",
      );
      return null;
    }
    const validSubstitutions = substitutions.filter(
      (option) => option.selectedFoods.length > 0,
    );
    const items = planItemsFromSelectedFoods(selectedFoods);
    return [
      {
        period: mealPeriod,
        title: PERIOD_LABELS[mealPeriod] ?? title.trim(),
        time: mealTime.trim() || undefined,
        instructions: notes.trim() || undefined,
        items,
        totalNutrition: planTotal,
        substitutions: validSubstitutions.map((option, index) => ({
          id: option.id,
          title: option.title.trim() || `Substituição ${index + 1}`,
          items: planItemsFromSelectedFoods(option.selectedFoods),
          totalNutrition: sumNutrition(
            option.selectedFoods.map((item) => ({ nutrition: item.nutrition })),
          ),
        })),
      },
    ];
  }

  async function handleCreate() {
    if (!patient || !nutritionist) return;
    const meals = buildMealsForPlan();
    if (!meals) return;

    setSaving(true);
    try {
      const payload = {
        patientId: patient.userId,
        nutritionistId: nutritionist.id,
        nutritionistName: nutritionist.name,
        title: title.trim(),
        notes: notes.trim() || undefined,
        meals,
        shoppingList: buildShoppingListFromOptions([
          { id: "main", title: "Opção principal", selectedFoods },
          ...substitutions.filter((option) => option.selectedFoods.length > 0),
        ]),
        totalNutrition: planTotal,
      };
      await onSave(
        initialPlan
          ? { ...initialPlan, ...payload, updatedAt: new Date() }
          : payload,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {initialPlan ? "Editar plano alimentar" : "Novo plano alimentar"}
            </Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalBodyScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            <NutritionistField
              label="Título do plano"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Jantar low carb"
              wide
            />
            <NutritionistField
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: beber água entre as refeições"
              multiline
              wide
            />

            <Text style={styles.fieldLabel}>Refeição</Text>
            <View style={styles.segmentWrap}>
              {MEAL_PERIOD_OPTIONS.map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.pill,
                    mealPeriod === period.key && styles.pillActive,
                  ]}
                  onPress={() => setMealPeriod(period.key)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      mealPeriod === period.key && styles.pillTextActive,
                    ]}
                  >
                    {period.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Horário</Text>
            {Platform.OS === "web" ? (
              <View style={[styles.fieldBox, styles.timeInputBox]}>
                <TextInput
                  style={styles.fieldInput}
                  value={mealTime}
                  onChangeText={(value) => setMealTime(maskTimeInput(value))}
                  placeholder="07:30"
                  placeholderTextColor={Colors.gray400}
                  maxLength={5}
                  {...({ type: "time" } as any)}
                />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => setTimePickerOpen(true)}
                >
                  <MaterialIcons
                    name="schedule"
                    size={18}
                    color={Colors.green600}
                  />
                  <Text
                    style={[
                      styles.timePickerText,
                      !mealTime && styles.timePickerPlaceholder,
                    ]}
                  >
                    {mealTime || "Selecionar horário"}
                  </Text>
                </TouchableOpacity>
                {timePickerOpen ? (
                  <NativeTimePicker
                    value={selectedTimeDate()}
                    onChange={handleTimeChange}
                  />
                ) : null}
              </>
            )}

            <View style={styles.planOptionPanel}>
              <View style={styles.planOptionHeader}>
                <Text style={styles.fieldLabel}>Opções desta refeição</Text>
                <TouchableOpacity
                  style={styles.planOptionAddBtn}
                  onPress={addSubstitutionOption}
                >
                  <MaterialIcons
                    name="playlist-add"
                    size={18}
                    color={Colors.green600}
                  />
                  <Text style={styles.planOptionAddText}>Substituição</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.planOptionTabs}>
                  <TouchableOpacity
                    style={[
                      styles.planOptionTab,
                      activeOptionId === "main" && styles.planOptionTabActive,
                    ]}
                    onPress={() => setActiveOptionId("main")}
                  >
                    <Text
                      style={[
                        styles.planOptionTabText,
                        activeOptionId === "main" &&
                          styles.planOptionTabTextActive,
                      ]}
                    >
                      Principal
                    </Text>
                  </TouchableOpacity>
                  {substitutions.map((option, index) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.planOptionTab,
                        activeOptionId === option.id &&
                          styles.planOptionTabActive,
                      ]}
                      onPress={() => setActiveOptionId(option.id)}
                    >
                      <Text
                        style={[
                          styles.planOptionTabText,
                          activeOptionId === option.id &&
                            styles.planOptionTabTextActive,
                        ]}
                      >
                        {option.title.trim() || `Substituição ${index + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {activeSubstitution ? (
                <View style={styles.planSubstitutionNameRow}>
                  <TextInput
                    style={styles.planSubstitutionNameInput}
                    value={activeSubstitution.title}
                    onChangeText={(value) =>
                      renameSubstitutionOption(activeSubstitution.id, value)
                    }
                    placeholder="Nome da substituição"
                    placeholderTextColor={Colors.gray400}
                  />
                  <TouchableOpacity
                    style={styles.planSubstitutionRemoveBtn}
                    onPress={() =>
                      removeSubstitutionOption(activeSubstitution.id)
                    }
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={20}
                      color={Colors.danger}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.planFoodSearchPanel}>
              <Text style={styles.fieldLabel}>Adicionar alimento</Text>
              <View style={styles.searchRow}>
                <MaterialIcons name="search" size={18} color={Colors.gray400} />
                <TextInput
                  style={styles.searchInput}
                  value={foodQuery}
                  onChangeText={setFoodQuery}
                  placeholder="Buscar alimento da base"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              {loadingFoods ? (
                <ActivityIndicator color={Colors.green400} />
              ) : suggestions.length === 0 ? (
                <Text style={styles.mutedText}>
                  Nenhum alimento encontrado na base.
                </Text>
              ) : (
                <View style={styles.planFoodResults}>
                  {suggestions.map((food) => {
                    const unit = food.defaultUnit;
                    const previewNutrition = calculateNutrition(food, 1, unit);
                    return (
                      <View key={food.id} style={styles.planFoodOption}>
                        <View style={styles.planFoodEmoji}>
                          <FoodIcon name={food.name} emoji={food.emoji} />
                        </View>
                        <View style={styles.planFoodInfo}>
                          <Text style={styles.planFoodName}>{food.name}</Text>
                          <Text style={styles.planFoodMeta}>
                            1 {UNIT_LABELS[unit]}
                          </Text>
                          <PlanNutritionChips nutrition={previewNutrition} />
                        </View>
                        <TouchableOpacity
                          style={styles.planFoodAddBtn}
                          onPress={() => addFoodToPlan(food)}
                        >
                          <MaterialIcons
                            name="add"
                            size={20}
                            color={Colors.white}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
          <View style={styles.planSelectedBox}>
            <View style={styles.planSelectedHeader}>
              <Text style={styles.sectionTitleNoMargin}>
                {activeOptionId === "main"
                  ? "Alimentos da opção principal"
                  : "Alimentos da substituição"}
              </Text>
              <Text style={styles.planSelectedTotal}>
                {Math.round(activePlanTotal.kcal)} kcal
              </Text>
            </View>
            {activeSelectedFoods.length === 0 ? (
              <Text style={styles.mutedText}>
                Use o botão + para montar esta opção da refeição.
              </Text>
            ) : (
              <ScrollView
                style={styles.planSelectedScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {activeSelectedFoods.map((item) => (
                  <View key={item.key} style={styles.planSelectedItem}>
                    <View style={styles.planSelectedTop}>
                      <View style={styles.planFoodEmoji}>
                        <FoodIcon
                          name={item.food.name}
                          emoji={item.food.emoji}
                        />
                      </View>
                      <View style={styles.planFoodInfo}>
                        <View style={styles.planSelectedNameRow}>
                          <Text style={styles.planFoodName}>
                            {item.food.name}
                          </Text>
                          <Text style={styles.planSelectedQtyBadge}>
                            {item.quantityText || "0"} {UNIT_LABELS[item.unit]}
                          </Text>
                        </View>
                        <PlanNutritionChips nutrition={item.nutrition} />
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          updateActiveSelectedFoods((items) =>
                            items.filter((current) => current.key !== item.key),
                          )
                        }
                      >
                        <MaterialIcons
                          name="close"
                          size={20}
                          color={Colors.gray400}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.planSelectedControls}>
                      <View style={styles.planQtyBox}>
                        <TextInput
                          style={styles.planQtyInput}
                          value={item.quantityText}
                          onChangeText={(value) =>
                            updateSelectedFood(item.key, {
                              quantityText: value,
                            })
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={styles.planUnitWrap}>
                        {getFoodUnits(item.food).map((unitOption) => (
                          <TouchableOpacity
                            key={unitOption}
                            style={[
                              styles.planUnitChip,
                              item.unit === unitOption &&
                                styles.planUnitChipActive,
                            ]}
                            onPress={() =>
                              updateSelectedFood(item.key, { unit: unitOption })
                            }
                          >
                            <Text
                              style={[
                                styles.planUnitChipText,
                                item.unit === unitOption &&
                                  styles.planUnitChipTextActive,
                              ]}
                            >
                              {UNIT_LABELS[unitOption]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreate}
              disabled={saving}
            >
              <Text style={styles.saveText}>
                {saving
                  ? "Salvando..."
                  : initialPlan
                    ? "Salvar alterações"
                    : "Criar plano"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
