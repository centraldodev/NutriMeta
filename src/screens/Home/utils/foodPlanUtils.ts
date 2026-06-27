import { FoodPlan, FoodPlanMeal } from '../../../types';

export function makeFoodPlanMealKey(planId: string, meal: FoodPlanMeal, mealIndex: number) {
  return `${planId}_${mealIndex}_${meal.period}_${meal.title}`;
}

export function makeLegacyFoodPlanMealKey(planId: string, meal: FoodPlanMeal) {
  return `${planId}_${meal.period}_${meal.title}`;
}
