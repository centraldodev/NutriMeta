import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { useStore, selectGoals, selectSavedMeals } from "../../../store";
import { saveMealEntryOrQueue } from "../../../services/pendingSyncService";
import { FoodItem, MealEntry, MealPeriod, QuantityUnit } from "../../../types";
import { sumNutrition } from "../../../utils/nutrition";
import { isAiLimitError, showAiLimitAlert } from "../../../utils/aiErrors";
import { isFirebaseConfigured } from "../../../config";
import { FoodIcon } from "../../../components/FoodIcon";
import { ManualMealSelection } from "../types";
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
import { modal } from "../modalStyles";
import { NutritionSummary } from "./NutritionSummary";
import { MealPeriodPicker } from "./MealPeriodPicker";
import { BottomSheet } from "../../../components/BottomSheet";
import { ModalActionBar } from "../../../components/ModalActionBar";

function QuantityPicker({
  food,
  qtyText,
  qtyUnit,
  onChangeQty,
  onChangeUnit,
  onAddToList,
  onFinish,
  onCancel,
  saving,
}: {
  food: FoodItem;
  qtyText: string;
  qtyUnit: QuantityUnit;
  onChangeQty: (v: string) => void;
  onChangeUnit: (u: QuantityUnit) => void;
  onAddToList: () => void;
  onFinish: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const units = getFoodUnits(food);
  const qty = parseOptionalQtyInput(qtyText);
  const nutrition = calculateNutrition(food, qty || 1, qtyUnit);

  return (
    <View style={modal.qtyPickerPanel}>
      <View style={modal.qtyPickerHeader}>
        <FoodIcon name={food.name} emoji={food.emoji} size={18} variant="plain" />
        <Text style={modal.qtyPickerName} numberOfLines={1}>{food.name}</Text>
        <TouchableOpacity onPress={onCancel}>
          <MaterialIcons name="close" size={18} color={Colors.gray400} />
        </TouchableOpacity>
      </View>
      <Text style={modal.qtyPickerNutritionText}>
        {Math.round(nutrition.kcal)} kcal · {Math.round(nutrition.protein)}g proteína
      </Text>
      <View style={modal.qtyPickerRow}>
        <View style={modal.qtyPickerInputWrap}>
          <TextInput
            style={modal.qtyPickerInput}
            value={qtyText}
            onChangeText={onChangeQty}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={Colors.gray400}
            selectTextOnFocus
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={modal.qtyPickerUnitsScroll}
        >
          <View style={modal.qtyPickerUnits}>
            {units.map((unit) => (
              <TouchableOpacity
                key={unit}
                style={[modal.unitChip, qtyUnit === unit && modal.unitChipActive]}
                onPress={() => onChangeUnit(unit)}
              >
                <Text style={[modal.unitChipText, qtyUnit === unit && modal.unitChipTextActive]}>
                  {UNIT_LABELS[unit]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={modal.qtyPickerActions}>
        <TouchableOpacity
          style={modal.qtyPickerAddBtn}
          onPress={onAddToList}
          disabled={saving}
        >
          <MaterialIcons name="add" size={15} color={Colors.green600} />
          <Text style={modal.qtyPickerAddBtnText}>Adicionar à lista</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[modal.qtyPickerFinishBtn, saving && modal.qtyPickerFinishBtnDisabled]}
          onPress={onFinish}
          disabled={saving}
        >
          <Text style={modal.qtyPickerFinishBtnText}>
            {saving ? 'Salvando...' : 'Concluir'}
          </Text>
        </TouchableOpacity>
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
  initialFoods,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (entry: MealEntry) => void;
  customFoods: FoodItem[];
  onCreateFood: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
  initialFoods?: ManualMealSelection[];
}) {
  const goals = useStore(selectGoals);
  const user = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const addEntry = useStore((s) => s.addEntry);

  const [foodQuery, setFoodQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [listeningSearch, setListeningSearch] = useState(false);
  const [foodItem, setFoodItem] = useState<FoodItem | null>(null);
  const [selectedFoods, setSelectedFoods] = useState<ManualMealSelection[]>([]);
  const selectedFoodsRef = React.useRef<ManualMealSelection[]>([]);
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );
  const [quantityFood, setQuantityFood] = useState<FoodItem | null>(null);
  const [quantityQtyText, setQuantityQtyText] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>("porcao");

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
    setQuantityFood(null);
    setQuantityQtyText("1");
    // initialFoods intentionally not in deps — read at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    updateSelectedFoods(initialFoods ?? []);
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

  function handleAddFoodOption(food: FoodItem) {
    if (selecting || saving) return;

    // Expand prepared dishes (pratos feitos) into their individual ingredients
    if (food.ingredients && food.ingredients.length > 0) {
      const baseFoods = customFoods.filter(
        (f) => f.source !== 'json:pratos_feitos_brasileiros',
      );
      const expanded: ManualMealSelection[] = [];
      for (const ingredient of food.ingredients) {
        const qty = ingredient.quantidade_g ?? 0;
        if (qty < 5) continue;
        const found = findAnyFood(ingredient.nome, baseFoods);
        if (!found) continue;
        expanded.push(
          selectionFromFood(found, {
            quantityText: String(qty).replace('.', ','),
            preferredUnit: 'grama',
          }),
        );
      }
      if (expanded.length > 0) {
        updateSelectedFoods((items) => [...items, ...expanded]);
        setFoodQuery('');
        setFoodItem(null);
        return;
      }
    }

    const preferredUnit = getPreferredFoodUnit(food);
    const selectedUnit = food.nutritionPer[preferredUnit] ? preferredUnit : food.defaultUnit;
    const defaultQty =
      food.defaultUnit === "mililitro" && selectedUnit === "mililitro" ? 200 : 1;
    setQuantityFood(food);
    setQuantityQtyText(String(defaultQty));
    setQuantityUnit(selectedUnit);
  }

  function handleAddToList() {
    if (!quantityFood) return;
    const selection = selectionFromFood(quantityFood, {
      quantityText: quantityQtyText,
      preferredUnit: quantityUnit,
    });
    updateSelectedFoods((items) => [...items, selection]);
    setQuantityFood(null);
    setQuantityQtyText("1");
  }

  async function handleFinishWithQuantity() {
    if (!quantityFood) return;
    const selection = selectionFromFood(quantityFood, {
      quantityText: quantityQtyText,
      preferredUnit: quantityUnit,
    });
    updateSelectedFoods((items) => [...items, selection]);
    setQuantityFood(null);
    setQuantityQtyText("1");
    await handleAdd();
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
    selectedFoods.length > 0 && !saving && !selecting && !quantityFood;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Adicionar alimentos"
      subtitle={
        selectedFoods.length > 0
          ? `${selectedFoods.length} alimento(s) selecionado(s)`
          : "Monte a refeição antes de salvar"
      }
      closeType="pill"
      closeLabel="Concluir"
      fillHeight>

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
                            (saving || selecting) && modal.foodAddButtonDisabled,
                          ]}
                          onPress={() => handleAddFoodOption(food)}
                          disabled={saving || selecting}
                          accessibilityLabel={`Selecionar ${food.name}`}
                        >
                          <MaterialIcons
                            name="add"
                            size={20}
                            color={Colors.white}
                          />
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
                    Toque em + nos alimentos acima para selecionar e ajustar a quantidade.
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

          {quantityFood ? (
            <QuantityPicker
              food={quantityFood}
              qtyText={quantityQtyText}
              qtyUnit={quantityUnit}
              onChangeQty={setQuantityQtyText}
              onChangeUnit={setQuantityUnit}
              onAddToList={handleAddToList}
              onFinish={handleFinishWithQuantity}
              onCancel={() => setQuantityFood(null)}
              saving={saving}
            />
          ) : null}

      <ModalActionBar
        onCancel={onClose}
        onConfirm={handleAdd}
        cancelLabel="Fechar"
        confirmLabel="Adicionar refeição"
        loading={saving}
        disabled={!canSaveMeal}
      />
    </BottomSheet>
  );
}

export default AddMealModal;
