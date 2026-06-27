import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { useStore, selectGoals, selectSavedMeals } from "../../../store";
import { saveMealEntryOrQueue } from "../../../services/pendingSyncService";
import { FoodItem, MealEntry, MealPeriod, QuantityUnit, FoodNutrition } from "../../../types";
import { sumNutrition } from "../../../utils/nutrition";
import { isAiLimitError, showAiLimitAlert } from "../../../utils/aiErrors";
import { isFirebaseConfigured } from "../../../config";
import { FoodIcon } from "../../../components/FoodIcon";
import { ManualMealSelection, MEAL_PERIODS } from "../types";
import {
  searchFoods,
  findExactFood,
  findAnyFood,
  getWaterMl,
  parseQtyInput,
  parseOptionalQtyInput,
} from "../utils/foodSearch";
import {
  getPreferredFoodUnit,
  getFoodUnits,
  loadSpeechRecognitionModule,
  createLocalEntry,
  firebaseErrorMessage,
  createMealGroupId,
  buildMealPayload,
  getDefaultMealPeriod,
} from "../utils/mealUtils";
import { modal } from "../styles";

const NUTRITION_SUMMARY_ROWS: {
  key: keyof FoodNutrition;
  label: string;
  unit: string;
}[] = [
  { key: "sodium", label: "Sódio", unit: "mg" },
  { key: "calcium", label: "Ca", unit: "mg" },
  { key: "iron", label: "Fe", unit: "mg" },
  { key: "potassium", label: "K", unit: "mg" },
  { key: "magnesium", label: "Mg", unit: "mg" },
  { key: "zinc", label: "Zn", unit: "mg" },
  { key: "vitaminC", label: "Vit. C", unit: "mg" },
];

function NutritionSummary({ nutrition }: { nutrition: FoodNutrition }) {
  const macroText = [
    `${formatFactValue(nutrition.kcal)}kcal`,
    `P ${formatFactValue(nutrition.protein)}g`,
    `C ${formatFactValue(nutrition.carbs)}g`,
    `G ${formatFactValue(nutrition.fat)}g`,
    nutrition.fiber > 0 ? `Fib ${formatFactValue(nutrition.fiber)}g` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const microText = NUTRITION_SUMMARY_ROWS.map((row) => ({
    ...row,
    value: nutrition[row.key],
  }))
    .filter(
      (row): row is typeof row & { value: number } =>
        typeof row.value === "number" &&
        Number.isFinite(row.value) &&
        row.value > 0,
    )
    .slice(0, 3)
    .map((row) => `${row.label} ${formatFactValue(row.value)}${row.unit}`)
    .join(" · ");

  return (
    <>
      <Text style={modal.nutritionSummary} numberOfLines={1}>
        {macroText}
      </Text>
      {microText ? (
        <Text style={modal.nutritionMicroSummary} numberOfLines={1}>
          {microText}
        </Text>
      ) : null}
    </>
  );
}

function formatFactValue(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10).replace(".", ",");
  if (value >= 1) return String(Math.round(value * 10) / 10).replace(".", ",");
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

export function MealPeriodPicker({
  value,
  onChange,
}: {
  value: MealPeriod;
  onChange: (period: MealPeriod) => void;
}) {
  return (
    <View style={modal.periodBox}>
      <Text style={modal.label}>Refeição</Text>
      <View style={modal.periodRow}>
        {MEAL_PERIODS.map((period) => {
          const active = period.key === value;
          return (
            <TouchableOpacity
              key={period.key}
              style={[modal.periodChip, active && modal.periodChipActive]}
              onPress={() => onChange(period.key)}
            >
              <MaterialIcons
                name={period.icon as any}
                size={16}
                color={active ? Colors.white : Colors.gray600}
              />
              <Text
                style={[modal.periodText, active && modal.periodTextActive]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function AddMealModal({
  visible,
  onClose,
  onAdded,
  customFoods,
  onCreateFood,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (entry: MealEntry) => void;
  customFoods: FoodItem[];
  onCreateFood: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
}) {
  const goals = useStore(selectGoals);
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const addEntry = useStore((s) => s.addEntry);

  const [foodQuery, setFoodQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null);
  const [listeningSearch, setListeningSearch] = useState(false);
  const [foodItem, setFoodItem] = useState<FoodItem | null>(null);
  const [selectedFoods, setSelectedFoods] = useState<ManualMealSelection[]>([]);
  const selectedFoodsRef = React.useRef<ManualMealSelection[]>([]);
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );

  const suggestions = React.useMemo(
    () => searchFoods(foodQuery, customFoods),
    [customFoods, foodQuery],
  );
  const exactFoodMatch = React.useMemo(
    () => findExactFood(foodQuery, customFoods),
    [customFoods, foodQuery],
  );
  const frequentFoods = React.useMemo(() => {
    const counts = new Map<string, { food: FoodItem; count: number }>();
    const addFood = (foodName: string, amount = 1) => {
      const food = findAnyFood(foodName, customFoods);
      if (!food) return;
      const current = counts.get(food.id);
      counts.set(food.id, { food, count: (current?.count ?? 0) + amount });
    };

    todayLog?.entries.forEach((entry) => addFood(entry.foodName, 2));
    savedMeals.forEach((meal) => {
      meal.entries.forEach((entry) =>
        addFood(entry.foodName, Math.max(1, meal.usageCount + 1)),
      );
    });

    const ranked = Array.from(counts.values())
      .sort(
        (a, b) => b.count - a.count || a.food.name.localeCompare(b.food.name),
      )
      .map((item) => item.food);

    return ranked.length > 0 ? ranked.slice(0, 10) : customFoods.slice(0, 10);
  }, [customFoods, savedMeals, todayLog]);

  React.useEffect(() => {
    if (!visible) return;
    speechModule?.stop?.();
    setListeningSearch(false);
    setFoodQuery("");
    setFoodItem(null);
    updateSelectedFoods([]);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  React.useEffect(() => {
    if (!speechModule) return undefined;

    const startSub = speechModule.addListener("start", () =>
      setListeningSearch(true),
    );
    const endSub = speechModule.addListener("end", () =>
      setListeningSearch(false),
    );
    const resultSub = speechModule.addListener("result", (event) => {
      const transcript = event.results[0]?.transcript?.trim() ?? "";
      if (transcript) {
        setFoodQuery(transcript);
        setFoodItem(null);
      }
    });
    const errorSub = speechModule.addListener("error", (event) => {
      setListeningSearch(false);
      console.warn("Meal search voice error", event);
    });

    return () => {
      startSub.remove();
      endSub.remove();
      resultSub.remove();
      errorSub.remove();
    };
  }, [speechModule]);

  React.useEffect(() => {
    if (visible) return undefined;
    speechModule?.stop?.();
    setListeningSearch(false);
    return undefined;
  }, [speechModule, visible]);

  function updateSelectedFoods(
    next:
      | ManualMealSelection[]
      | ((items: ManualMealSelection[]) => ManualMealSelection[]),
  ) {
    const nextItems =
      typeof next === "function" ? next(selectedFoodsRef.current) : next;
    selectedFoodsRef.current = nextItems;
    setSelectedFoods(nextItems);
  }

  function handleSelectFood(food: FoodItem) {
    setFoodItem(food);
    setFoodQuery(food.name);
  }

  function handleFoodQuery(value: string) {
    setFoodQuery(value);
    if (foodItem && value !== foodItem.name) {
      setFoodItem(null);
    }
  }

  async function toggleSearchVoice() {
    if (!speechModule || !speechModule.isRecognitionAvailable()) {
      Alert.alert(
        "Microfone indisponível",
        "O reconhecimento de voz precisa de uma development build para funcionar.",
      );
      return;
    }

    if (listeningSearch) {
      speechModule.stop();
      setListeningSearch(false);
      return;
    }

    try {
      const permission = await speechModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permissão necessária",
          "Autorize o microfone para buscar alimentos por voz.",
        );
        return;
      }
      setFoodQuery("");
      setFoodItem(null);
      speechModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: false,
      });
    } catch (error) {
      setListeningSearch(false);
      console.warn("Meal search voice fallback", error);
      Alert.alert(
        "Não consegui ouvir agora",
        "Tente novamente ou digite o alimento no campo de busca.",
      );
    }
  }

  async function resolveCurrentFood({
    createWithAi = false,
  }: { createWithAi?: boolean } = {}): Promise<FoodItem> {
    let food = createWithAi
      ? findExactFood(foodQuery, customFoods)
      : foodItem ?? findAnyFood(foodQuery, customFoods);
    if (!food) {
      if (!createWithAi) {
        throw new Error("food_not_found");
      }
      food = await onCreateFood(foodQuery, "porcao");
      setFoodItem(food);
      setFoodQuery(food.name);
    }
    return food;
  }

  function selectionFromFood(
    food: FoodItem,
    options: { quantityText?: string; preferredUnit?: QuantityUnit } = {},
  ): ManualMealSelection {
    const requestedUnit = options.preferredUnit ?? getPreferredFoodUnit(food);
    const selectedUnit = food.nutritionPer[requestedUnit]
      ? requestedUnit
      : food.defaultUnit;
    const requestedQuantity = options.quantityText ?? "1";
    const typedQuantity = parseQtyInput(requestedQuantity);
    const parsedQuantity =
      food.defaultUnit === "mililitro" &&
      selectedUnit === "mililitro" &&
      !food.nutritionPer[requestedUnit] &&
      typedQuantity === 1
        ? 200
        : typedQuantity;

    return {
      key: `${food.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      food,
      quantityText: String(parsedQuantity).replace(".", ","),
      quantity: parsedQuantity,
      unit: selectedUnit,
      nutrition: calculateNutrition(food, parsedQuantity, selectedUnit),
    };
  }

  function updateSelectedFood(
    key: string,
    changes: { quantityText?: string; unit?: QuantityUnit },
  ) {
    updateSelectedFoods((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        const nextUnit = changes.unit ?? item.unit;
        const quantityText =
          changes.quantityText !== undefined
            ? changes.quantityText
            : item.quantityText;
        const quantity =
          changes.quantityText !== undefined
            ? parseOptionalQtyInput(changes.quantityText)
            : item.quantity;
        return {
          ...item,
          quantityText,
          quantity,
          unit: nextUnit,
          nutrition: calculateNutrition(item.food, quantity, nextUnit),
        };
      }),
    );
  }

  async function handleAddFoodOption(food: FoodItem) {
    if (selecting || saving || addingFoodId) return;
    setAddingFoodId(food.id);
    try {
      const preferredUnit = getPreferredFoodUnit(food);
      const selection = selectionFromFood(food, { preferredUnit });
      updateSelectedFoods((items) => [...items, selection]);
      if (foodItem?.id === food.id) {
        setFoodQuery("");
        setFoodItem(null);
      }
    } catch (error) {
      console.warn("Failed to add food option", error);
      if (isAiLimitError(error)) showAiLimitAlert();
      else
        Alert.alert("Erro", "Não foi possível adicionar este alimento agora.");
    } finally {
      setAddingFoodId(null);
    }
  }

  async function handleSelectCurrentFood() {
    if (isEmpty || selecting) return;
    setSelecting(true);
    try {
      const food = await resolveCurrentFood({ createWithAi: true });
      const selection = selectionFromFood(food);
      updateSelectedFoods((items) => [...items, selection]);
      setFoodQuery("");
      setFoodItem(null);
    } catch (error) {
      console.warn("AI food creation failed", error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
        return;
      }
      Alert.alert(
        "Alimento não encontrado",
        "Não consegui cadastrar este alimento automaticamente agora. Tente outro nome ou seja mais específico.",
      );
    } finally {
      setSelecting(false);
    }
  }

  async function handleAdd() {
    if (!user || !goals) return;
    let itemsToSave = selectedFoodsRef.current;
    if (itemsToSave.length === 0 && !isEmpty) {
      try {
        setSaving(true);
        const food = await resolveCurrentFood();
        itemsToSave = [selectionFromFood(food)];
      } catch (error) {
        if ((error as Error)?.message === "food_not_found") {
          Alert.alert(
            "Alimento não encontrado",
            "Selecione um alimento da lista ou use o botão Cadastrar com IA para criar um novo alimento.",
          );
        } else {
          console.warn("Failed to resolve current food", error);
          Alert.alert("Erro", "Não foi possível adicionar este alimento agora.");
        }
        setSaving(false);
        return;
      }
    }

    if (itemsToSave.length === 0) {
      Alert.alert(
        "Nenhum alimento selecionado",
        "Selecione um ou mais alimentos antes de adicionar a refeição.",
      );
      return;
    }
    if (
      itemsToSave.some(
        (item) => !item.quantityText.trim() || item.quantity <= 0,
      )
    ) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero para todos os alimentos.",
      );
      return;
    }

    setSaving(true);
    try {
      const mealGroupId = createMealGroupId("manual");
      let queuedError: unknown = null;
      let lastEntry: MealEntry | null = null;

      for (const item of itemsToSave) {
        const payload = buildMealPayload({
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          nutrition: item.nutrition,
          mealPeriod,
          source: "manual",
          mealGroupId,
        });

        let entry: MealEntry;
        try {
          const result =
            isFirebaseConfigured && user.id !== "dev_user"
              ? await saveMealEntryOrQueue({ userId: user.id, goals, payload })
              : {
                  entry: createLocalEntry(user.id, payload),
                  queued: false,
                  error: undefined,
                };
          entry = result.entry;
          queuedError ??= result.queued ? result.error : null;
        } catch (error) {
          console.warn("Manual meal save failed, using local entry", error);
          entry = createLocalEntry(user.id, payload);
          queuedError ??= error;
        }
        addEntry(entry);
        lastEntry = entry;
      }

      if (queuedError) {
        console.warn(
          "Manual meal queued for Firebase sync",
          firebaseErrorMessage(queuedError),
        );
      }
      setFoodQuery("");
      setFoodItem(null);
      updateSelectedFoods([]);
      if (lastEntry) {
        onClose();
        onAdded(lastEntry);
      }
    } catch (error) {
      console.warn("Manual meal save failed", error);
      Alert.alert("Erro", "Não foi possível adicionar esta refeição agora.");
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !foodQuery.trim();
  const canCreateWithAi =
    !isEmpty && !exactFoodMatch && suggestions.length === 0;
  const selectedTotal = React.useMemo(
    () =>
      sumNutrition(
        selectedFoods.map((item) => ({ nutrition: item.nutrition })),
      ),
    [selectedFoods],
  );
  const canSaveMeal =
    selectedFoods.length > 0 && !saving && !selecting && !addingFoodId;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Adicionar alimentos</Text>
              <Text style={modal.subtitle}>
                {selectedFoods.length > 0
                  ? `${selectedFoods.length} alimento(s) selecionado(s)`
                  : "Monte a refeição antes de salvar"}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modal.body}
            contentContainerStyle={modal.bodyContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={modal.searchPanel}>
              <Text style={modal.label}>Alimento</Text>
              <View
                style={[
                  modal.searchInputWrap,
                  listeningSearch && modal.searchInputWrapActive,
                ]}
              >
                <TextInput
                  style={modal.searchInput}
                  value={foodQuery}
                  onChangeText={handleFoodQuery}
                  placeholder={
                    listeningSearch
                      ? "Ouvindo..."
                      : "Busque: arroz, file frango, brocoli..."
                  }
                  placeholderTextColor={Colors.gray400}
                  autoFocus
                />
                <TouchableOpacity
                  style={[
                    modal.searchMicButton,
                    listeningSearch && modal.searchMicButtonActive,
                  ]}
                  onPress={toggleSearchVoice}
                  accessibilityRole="button"
                  accessibilityLabel={
                    listeningSearch
                      ? "Parar busca por voz"
                      : "Buscar alimento por voz"
                  }
                >
                  <MaterialIcons
                    name={listeningSearch ? "stop" : "mic"}
                    size={20}
                    color={listeningSearch ? Colors.white : Colors.green600}
                  />
                </TouchableOpacity>
              </View>
              <Text style={modal.subLabel}>
                {todayLog?.entries.length || savedMeals.length
                  ? "Mais usados por você"
                  : "Atalhos populares"}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={modal.chipsScroll}
              >
                <View style={modal.chips}>
                  {frequentFoods.map((food) => (
                    <TouchableOpacity
                      key={food.id}
                      style={modal.chip}
                      onPress={() => handleSelectFood(food)}
                    >
                      <View style={modal.chipContent}>
                        <FoodIcon
                          name={food.name}
                          emoji={food.emoji}
                          size={15}
                          variant="plain"
                        />
                        <Text style={modal.chipText}>
                          {food.name.replace(
                            / cozido\/mexido| cozido| grelhado/g,
                            "",
                          )}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={modal.suggestionBox}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {suggestions.map((food) => {
                  const selected = foodItem?.id === food.id;
                  const previewUnit = getPreferredFoodUnit(food);
                  const previewNutrition = calculateNutrition(
                    food,
                    1,
                    previewUnit,
                  );
                  return (
                    <TouchableOpacity
                      key={food.id}
                      style={[
                        modal.foodOption,
                        selected && modal.foodOptionActive,
                      ]}
                      onPress={() => handleSelectFood(food)}
                    >
                      <View style={modal.foodEmoji}>
                        <FoodIcon name={food.name} emoji={food.emoji} />
                      </View>
                      <View style={modal.foodInfo}>
                        <Text
                          style={[
                            modal.foodName,
                            selected && modal.foodNameActive,
                          ]}
                        >
                          {food.name}
                        </Text>
                        <Text style={modal.foodUnit}>
                          Padrão: {UNIT_LABELS[previewUnit]}
                        </Text>
                        <NutritionSummary nutrition={previewNutrition} />
                      </View>
                      <View style={modal.foodActions}>
                        {selected && (
                          <MaterialIcons
                            name="check-circle"
                            size={20}
                            color={Colors.green600}
                          />
                        )}
                        <TouchableOpacity
                          style={[
                            modal.foodAddButton,
                            (saving || selecting || !!addingFoodId) &&
                              modal.foodAddButtonDisabled,
                          ]}
                          onPress={() => handleAddFoodOption(food)}
                          disabled={saving || selecting || !!addingFoodId}
                          accessibilityLabel={`Adicionar ${food.name}`}
                        >
                          {addingFoodId === food.id ? (
                            <ActivityIndicator
                              size="small"
                              color={Colors.white}
                            />
                          ) : (
                            <MaterialIcons
                              name="add"
                              size={20}
                              color={Colors.white}
                            />
                          )}
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {canCreateWithAi && (
                  <TouchableOpacity
                    style={modal.aiCreateOption}
                    onPress={handleSelectCurrentFood}
                    disabled={selecting || saving}
                  >
                    <View style={modal.aiIcon}>
                      {selecting ? (
                        <ActivityIndicator color={Colors.green600} />
                      ) : (
                        <MaterialIcons
                          name="auto-awesome"
                          size={20}
                          color={Colors.green600}
                        />
                      )}
                    </View>
                    <View style={modal.foodInfo}>
                      <Text style={modal.aiCreateTitle}>
                        Adicionar "{foodQuery.trim()}" com IA
                      </Text>
                      <Text style={modal.aiCreateText}>
                        Vou estimar os nutrientes, salvar o alimento e incluir
                        na refeição.
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {suggestions.length === 0 && isEmpty && (
                  <View style={modal.noResults}>
                    <Text style={modal.noResultsText}>
                      Digite um alimento para buscar ou cadastrar com IA.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>

            <View style={modal.bottomPanel}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />

              {selectedFoods.length === 0 ? (
                <View style={modal.emptySelection}>
                  <MaterialIcons
                    name="add-circle-outline"
                    size={24}
                    color={Colors.green600}
                  />
                  <Text style={modal.emptySelectionText}>
                    Use o botão + nos alimentos acima para montar a refeição.
                  </Text>
                </View>
              ) : (
                <View style={modal.selectedBox}>
                  <View style={modal.selectedHeader}>
                    <Text style={modal.selectedTitle}>
                      Itens desta refeição
                    </Text>
                    <Text style={modal.selectedTotal}>
                      {Math.round(selectedTotal.kcal)} kcal
                    </Text>
                  </View>
                  {selectedFoods.map((item) => (
                    <View key={item.key} style={modal.selectedItem}>
                      <View style={modal.selectedTopRow}>
                        <View style={modal.selectedEmoji}>
                          <FoodIcon
                            name={item.food.name}
                            emoji={item.food.emoji}
                            size={18}
                          />
                        </View>
                        <View style={modal.selectedInfo}>
                          <Text style={modal.selectedName}>
                            {item.food.name}
                          </Text>
                          <Text style={modal.selectedMeta}>
                            {Math.round(item.nutrition.kcal)} kcal
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={modal.selectedRemove}
                          onPress={() =>
                            updateSelectedFoods((items) =>
                              items.filter(
                                (current) => current.key !== item.key,
                              ),
                            )
                          }
                        >
                          <MaterialIcons
                            name="close"
                            size={18}
                            color={Colors.gray400}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={modal.selectedControls}>
                        <View style={modal.selectedQtyField}>
                          <Text style={modal.inlineLabel}>Qtd.</Text>
                          <TextInput
                            style={modal.selectedQtyInput}
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
                        <View style={modal.selectedUnits}>
                          {getFoodUnits(item.food).map((unitOption) => (
                            <TouchableOpacity
                              key={unitOption}
                              style={[
                                modal.unitChip,
                                item.unit === unitOption &&
                                  modal.unitChipActive,
                              ]}
                              onPress={() =>
                                updateSelectedFood(item.key, {
                                  unit: unitOption,
                                })
                              }
                            >
                              <Text
                                style={[
                                  modal.unitChipText,
                                  item.unit === unitOption &&
                                    modal.unitChipTextActive,
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
                </View>
              )}
            </View>
          </ScrollView>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, !canSaveMeal && modal.btnDisabled]}
              onPress={handleAdd}
              disabled={!canSaveMeal}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>Adicionar refeição</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default AddMealModal;
