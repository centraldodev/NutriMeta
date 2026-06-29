import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { ModalActionBar } from "../../../components/ModalActionBar";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { FoodItem, MealEntry, MealPeriod, QuantityUnit } from "../../../types";
import { formatBrasiliaTime, formatNutritionDetails } from "../../../utils/nutrition";
import { FoodIcon } from "../../../components/FoodIcon";
import { MEAL_PERIOD_LABELS } from "../types";
import {
  getFoodUnits,
  editableFoodFromEntry,
  getEntryMealPeriod,
  emptyNutrition,
} from "../utils/mealUtils";
import { getWaterMl, parseOptionalQtyInput } from "../utils/foodSearch";
import { logStyle } from "../styles";
import { modal } from "../modalStyles";
import { MealPeriodPicker } from "./MealPeriodPicker";

// ─── Today Log ────────────────────────────────────────────────────────────────

export function TodayEntry({
  entry,
  onDelete,
  onEdit,
}: {
  entry: MealEntry;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const time = formatBrasiliaTime(new Date(entry.addedAt));
  const mealPeriod = getEntryMealPeriod(entry);
  const nutritionDetails = formatNutritionDetails(entry.nutrition);

  return (
    <View style={logStyle.row}>
      <View style={logStyle.emoji}>
        <FoodIcon name={entry.foodName} emoji={entry.emoji} />
      </View>
      <View style={logStyle.info}>
        <View style={logStyle.infoTop}>
          <View style={logStyle.periodBadge}>
            <Text style={logStyle.periodTxt}>
              {MEAL_PERIOD_LABELS[mealPeriod]}
            </Text>
          </View>
          <View style={logStyle.timeBadge}>
            <Text style={logStyle.timeTxt}>{time}</Text>
          </View>
        </View>
        <Text style={logStyle.name}>{entry.foodName}</Text>
        {nutritionDetails ? (
          <Text style={logStyle.macros}>{nutritionDetails}</Text>
        ) : null}
      </View>
      <View style={logStyle.right}>
        <Text style={logStyle.kcal}>{Math.round(entry.nutrition.kcal)}</Text>
        <Text style={logStyle.kcalLabel}>kcal</Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} style={logStyle.editBtn}>
            <MaterialIcons name="edit" size={16} color={Colors.green600} />
          </TouchableOpacity>
        ) : null}
        {onDelete ? (
          <TouchableOpacity onPress={onDelete} style={logStyle.delBtn}>
            <Text style={logStyle.delTxt}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function EditMealEntryModal({
  visible,
  entry,
  customFoods,
  onClose,
  onSave,
}: {
  visible: boolean;
  entry: MealEntry | null;
  customFoods: FoodItem[];
  onClose: () => void;
  onSave: (entry: MealEntry) => Promise<void>;
}) {
  const [quantityText, setQuantityText] = React.useState("");
  const [unit, setUnit] = React.useState<QuantityUnit>("porcao");
  const [mealPeriod, setMealPeriod] = React.useState<MealPeriod>("snack");
  const [saving, setSaving] = React.useState(false);

  const food = React.useMemo(
    () => (entry ? editableFoodFromEntry(entry, customFoods) : null),
    [customFoods, entry],
  );
  const quantity = parseOptionalQtyInput(quantityText);
  const nutrition = food
    ? calculateNutrition(food, quantity, unit)
    : emptyNutrition();

  React.useEffect(() => {
    if (!visible || !entry) return;
    setQuantityText(String(entry.quantity).replace(".", ","));
    setUnit(entry.unit);
    setMealPeriod(getEntryMealPeriod(entry));
  }, [entry, visible]);

  async function handleSave() {
    if (!entry || !food) return;
    if (!quantityText.trim() || quantity <= 0) {
      Alert.alert(
        "Quantidade inválida",
        "Informe uma quantidade maior que zero.",
      );
      return;
    }
    setSaving(true);
    try {
      const waterMl = getWaterMl(food, quantity, unit);
      const finalPeriod = waterMl ? "hydration" : mealPeriod;
      await onSave({
        ...entry,
        foodName: `${food.name} (${quantityText} ${UNIT_LABELS[unit]})`,
        emoji: food.emoji,
        quantity,
        unit,
        nutrition,
        waterMl,
        mealPeriod: finalPeriod,
        mealGroupLabel: MEAL_PERIOD_LABELS[finalPeriod],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Editar refeição"
      subtitle={food ? `${food.emoji} ${food.name}` : undefined}
      closeType="pill"
      closeLabel="Fechar"
    >
      <View style={modal.bodyContent}>
        <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
        <View style={modal.selectedItem}>
          <Text style={modal.inlineLabel}>Quantidade</Text>
          <TextInput
            style={modal.selectedQtyInput}
            value={quantityText}
            onChangeText={setQuantityText}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={Colors.gray400}
          />
          <View style={modal.selectedUnits}>
            {getFoodUnits(food).map((unitOption) => (
              <TouchableOpacity
                key={unitOption}
                style={[
                  modal.unitChip,
                  unit === unitOption && modal.unitChipActive,
                ]}
                onPress={() => setUnit(unitOption)}
              >
                <Text
                  style={[
                    modal.unitChipText,
                    unit === unitOption && modal.unitChipTextActive,
                  ]}
                >
                  {UNIT_LABELS[unitOption]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={modal.selectedMeta}>
            {formatNutritionDetails(nutrition, { includeKcal: true })}
          </Text>
        </View>
      </View>
      <ModalActionBar
        onCancel={onClose}
        onConfirm={handleSave}
        cancelLabel="Cancelar"
        confirmLabel="Salvar alterações"
        loading={saving}
      />
    </BottomSheet>
  );
}
