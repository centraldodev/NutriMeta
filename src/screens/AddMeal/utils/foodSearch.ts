import { FoodItem, QuantityUnit } from "../../../types";

export const FOOD_MATCH_STOP_WORDS = new Set([
  "com",
  "sem",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "tipo",
  "var",
  "mais",
  "tambem",
  "também",
  "um",
  "uma",
  "dois",
  "duas",
  "tres",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "colher",
  "colheres",
  "sopa",
  "cha",
  "chá",
  "xicara",
  "xícara",
  "copo",
  "garrafa",
  "lata",
  "concha",
  "fatia",
  "file",
  "filé",
  "bife",
  "medio",
  "médio",
  "unidade",
  "unidades",
  "porcao",
  "porção",
  "grama",
  "gramas",
  "quilo",
  "kg",
  "ml",
  "litro",
  "litros",
]);

export const FOOD_SYNONYMS: Record<string, string[]> = {
  cafe: ["cafe", "café", "infusao", "infusão"],
  frances: ["frances", "francês", "trigo"],
  branco: ["tipo", "1", "branco"],
  refri: ["refrigerante", "cola", "guarana", "guaraná"],
  coca: ["refrigerante", "cola"],
  frango: ["frango", "galinha"],
  carne: ["carne", "bovina"],
  leite: ["leite", "vaca", "integral"],
  catupiry: ["requeijao", "cremoso"],
};

export const FOOD_COMPONENT_ALIASES: Record<string, string[]> = {
  catupiry: ["requeijao cremoso"],
};

export function normalizeFoodText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmussarela\b/g, "mucarela")
    .replace(/\bmozarela\b/g, "mucarela")
    .replace(/\bcatupiri\b/g, "catupiry")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodTokens(value: string): string[] {
  return normalizeFoodText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !FOOD_MATCH_STOP_WORDS.has(token));
}

export function expandFoodTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    FOOD_SYNONYMS[token]?.forEach((synonym) =>
      expanded.add(normalizeFoodText(synonym)),
    );
  });
  return expanded;
}

export function foodSearchText(food: FoodItem) {
  return [food.name, ...(food.aliases ?? [])].join(" ");
}

export function foodMatchScore(query: string, food: FoodItem): number {
  const queryTokens = expandFoodTokens(foodTokens(query));
  if (queryTokens.size === 0) return 0;

  const foodText = normalizeFoodText(foodSearchText(food));
  const targetTokens = expandFoodTokens(foodTokens(foodText));
  const exactText = normalizeFoodText(query);

  if (
    foodText === exactText ||
    food.aliases.some((alias) => normalizeFoodText(alias) === exactText)
  ) {
    return 100;
  }
  if (foodText.includes(exactText) && exactText.length >= 4) {
    return 80 + Math.min(10, exactText.length / 4);
  }

  let matches = 0;
  queryTokens.forEach((token) => {
    if (targetTokens.has(token)) matches += 1;
  });

  const coverage = matches / queryTokens.size;
  const extraPenalty = Math.max(0, targetTokens.size - matches) * 0.35;
  const preferredBonus =
    (queryTokens.has("cozido") && targetTokens.has("cozido") ? 4 : 0) +
    (queryTokens.has("cru") && targetTokens.has("cru") ? 4 : 0) +
    (queryTokens.has("assado") && targetTokens.has("assado") ? 4 : 0) +
    (queryTokens.has("grelhado") && targetTokens.has("grelhado") ? 4 : 0);

  return coverage * 70 + matches * 5 + preferredBonus - extraPenalty;
}

export function findBestFood(
  query: string,
  customFoods: FoodItem[] = [],
  minScore = 30,
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;

  const ranked = customFoods
    .map((food) => ({ food, score: foodMatchScore(query, food) }))
    .filter((item) => item.score >= minScore)
    .sort(
      (a, b) => b.score - a.score || a.food.name.length - b.food.name.length,
    );

  return ranked[0]?.food;
}

export function findAnyFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return (
    customFoods.find(
      (food) =>
        normalizeFoodText(food.name) === normalized ||
        food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
    ) ?? findBestFood(query, customFoods)
  );
}

export function findExactFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) =>
      normalizeFoodText(food.name) === normalized ||
      food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
  );
}

export function findLiteralFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) => normalizeFoodText(food.name) === normalized,
  );
}

export function findContainedFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  const tokenCount = foodTokens(normalized).length;
  const matches = customFoods
    .filter((food) => {
      const foodName = normalizeFoodText(food.name);
      if (foodName === normalized) return true;
      if (tokenCount < 2) return false;
      return foodName.includes(normalized);
    })
    .sort((a, b) => a.name.length - b.name.length);
  return matches[0];
}

export function findCompositePartFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  const candidates = [
    normalized,
    ...(FOOD_COMPONENT_ALIASES[normalized] ?? []),
  ];
  for (const candidate of candidates) {
    const food =
      findLiteralFood(candidate, customFoods) ??
      findContainedFood(candidate, customFoods);
    if (food) return food;
  }
  return undefined;
}

export function splitCompositeFoodQuery(query: string): string[] {
  return normalizeFoodText(query)
    .split(
      /\b(?:acompanhado de|acompanhada de|acompanhado|acompanhada|com|e|mais|junto)\b|[,;+&/]/g,
    )
    .map((part) => part.trim())
    .filter((part) => foodTokens(part).length > 0);
}

export function findCompositeFoods(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem[] {
  const parts = splitCompositeFoodQuery(query);
  if (parts.length < 2) return [];

  const matches: FoodItem[] = [];
  const seen = new Set<string>();

  parts.forEach((part) => {
    const food = findCompositePartFood(part, customFoods);
    if (!food || seen.has(food.id)) return;
    seen.add(food.id);
    matches.push(food);
  });

  return matches.length >= 2 ? matches : [];
}

export function isCompositeFoodQuery(query: string): boolean {
  return splitCompositeFoodQuery(query).length >= 2;
}

export function searchFoods(query: string, customFoods: FoodItem[] = []): FoodItem[] {
  const q = query.trim();
  if (!q) return customFoods;
  const normalized = normalizeFoodText(q);

  const directMatches = customFoods
    .filter((food) => normalizeFoodText(food.name).includes(normalized))
    .sort((a, b) => {
      const aName = normalizeFoodText(a.name);
      const bName = normalizeFoodText(b.name);
      const aExact = aName === normalized ? 0 : 1;
      const bExact = bName === normalized ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    });

  if (directMatches.length > 0) return directMatches;

  const aliasMatches = (FOOD_COMPONENT_ALIASES[normalized] ?? [])
    .map((alias) => findCompositePartFood(alias, customFoods))
    .filter((food): food is FoodItem => Boolean(food));
  if (aliasMatches.length > 0) return aliasMatches;

  return findCompositeFoods(q, customFoods);
}

export function isWaterFood(food: Pick<FoodItem, "name" | "aliases"> | null): boolean {
  if (!food) return false;
  const terms = [food.name, ...food.aliases].map((term) =>
    term
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  );
  return terms.some((term) => /\bagua\b|\bwater\b/.test(term));
}

export function getWaterMl(
  food: FoodItem | null,
  quantity: number,
  unit: QuantityUnit,
): number | undefined {
  if (!isWaterFood(food)) return undefined;
  if (unit === "litro") return Math.round(quantity * 1000);
  if (unit === "mililitro") return Math.round(quantity);
  if (unit === "xicara") return Math.round(quantity * 200);
  if (unit === "porcao") return Math.round(quantity * 200);
  if (unit === "unidade") return Math.round(quantity * 200);
  return undefined;
}

export function parseQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseOptionalQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
