import {
  FoodItem,
  FoodNutrition,
  FoodPlan,
  FoodPlanMealItem,
  QuantityUnit,
  ShoppingListItem,
} from "../../../types";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { EMPTY_TOTAL, PlanMealOptionDraft, PlanSelectedFood } from "../types";

export function normalizeFoodSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function searchPlanFoods(query: string, foods: FoodItem[]) {
  const normalized = normalizeFoodSearchText(query);
  if (!normalized) return foods.slice(0, 12);
  return foods
    .filter((food) => normalizeFoodSearchText(food.name).includes(normalized))
    .sort((a, b) => {
      const aName = normalizeFoodSearchText(a.name);
      const bName = normalizeFoodSearchText(b.name);
      const aExact = aName === normalized ? 0 : 1;
      const bExact = bName === normalized ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    })
    .slice(0, 30);
}

export function getFoodUnits(food: FoodItem): QuantityUnit[] {
  const units = Object.keys(food.nutritionPer) as QuantityUnit[];
  return Array.from(new Set([food.defaultUnit, ...units])).filter(
    (unit) => food.nutritionPer[unit],
  );
}

export function parseOptionalPlanQuantity(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function recalcPlanFood(
  item: PlanSelectedFood,
  changes: Partial<
    Pick<PlanSelectedFood, "quantityText" | "quantity" | "unit">
  >,
): PlanSelectedFood {
  const next = { ...item, ...changes };
  return {
    ...next,
    nutrition: calculateNutrition(next.food, next.quantity, next.unit),
  };
}

export function buildShoppingList(items: PlanSelectedFood[]): ShoppingListItem[] {
  return items.map((item) => ({
    name: item.food.name,
    quantity: item.quantityText,
    unit: UNIT_LABELS[item.unit],
  }));
}

export function buildShoppingListFromOptions(
  options: PlanMealOptionDraft[],
): ShoppingListItem[] {
  return options.flatMap((option) => buildShoppingList(option.selectedFoods));
}

export function planItemsFromSelectedFoods(
  items: PlanSelectedFood[],
): FoodPlanMealItem[] {
  return items.map((item) => ({
    foodId: item.food.id,
    name: item.food.name,
    emoji: item.food.emoji,
    quantity: `${item.quantityText} ${UNIT_LABELS[item.unit]}`,
    quantityValue: item.quantity,
    unit: item.unit,
    nutrition: item.nutrition,
  }));
}

export function selectedFoodsFromMealItems(
  items: FoodPlanMealItem[],
  foods: FoodItem[],
  keyPrefix: string,
): PlanSelectedFood[] {
  return items.map((item, index) => {
    const unit = item.unit ?? "porcao";
    const quantity =
      item.quantityValue ?? (parseOptionalPlanQuantity(item.quantity) || 1);
    const food =
      foods.find(
        (candidate) =>
          candidate.id === item.foodId ||
          normalizeFoodSearchText(candidate.name) ===
            normalizeFoodSearchText(item.name),
      ) ??
      ({
        id: item.foodId ?? `${keyPrefix}_${index}`,
        name: item.name,
        emoji: item.emoji ?? "🍽️",
        aliases: [item.name.toLowerCase()],
        defaultUnit: unit,
        nutritionPer: {
          [unit]: item.nutrition ?? EMPTY_TOTAL,
        },
        source: "plan",
      } satisfies FoodItem);

    const selectedUnit = food.nutritionPer[unit] ? unit : food.defaultUnit;
    return {
      key: `${food.id}_${keyPrefix}_${index}`,
      food,
      quantityText: item.quantityValue
        ? String(item.quantityValue).replace(".", ",")
        : item.quantity.split(" ")[0] || "1",
      quantity,
      unit: selectedUnit,
      nutrition:
        item.nutrition ?? calculateNutrition(food, quantity, selectedUnit),
    };
  });
}

export function selectedFoodsFromPlan(
  plan: FoodPlan,
  foods: FoodItem[],
): PlanSelectedFood[] {
  const meal = plan.meals[0];
  if (!meal) return [];
  return selectedFoodsFromMealItems(meal.items, foods, plan.id);
}

export function optionDraftsFromPlan(
  plan: FoodPlan | null | undefined,
  foods: FoodItem[],
): PlanMealOptionDraft[] {
  const meal = plan?.meals[0];
  if (!plan || !meal) return [];
  return (meal.substitutions ?? []).map((substitution, index) => ({
    id: substitution.id || `sub_${index + 1}`,
    title: substitution.title || `Substituição ${index + 1}`,
    selectedFoods: selectedFoodsFromMealItems(
      substitution.items,
      foods,
      `${plan.id}_${substitution.id || index}`,
    ),
  }));
}
