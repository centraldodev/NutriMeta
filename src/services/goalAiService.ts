import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { ActivityLevel, BiologicalSex, GoalType, MacroGoals, UserProfile } from '../types';

export type GoalAiRecommendation = {
  goals: MacroGoals;
  rationale: string;
};

const goalSchema = Schema.object({
  properties: {
    kcal: Schema.number({ description: 'Calorias diarias recomendadas.' }),
    protein: Schema.number({ description: 'Proteina diaria em gramas.' }),
    carbs: Schema.number({ description: 'Carboidratos diarios em gramas.' }),
    fat: Schema.number({ description: 'Gorduras diarias em gramas.' }),
    fiber: Schema.number({ description: 'Fibras diarias em gramas.' }),
    water: Schema.number({ description: 'Agua diaria em ml.' }),
    sugar: Schema.number({ description: 'Limite maximo diario de acucar em gramas.' }),
    sodium: Schema.number({ description: 'Limite maximo diario de sodio em mg.' }),
    rationale: Schema.string({ description: 'Explicacao curta em portugues do Brasil.' }),
  },
});

const GOAL_LABELS: Record<GoalType, string> = {
  deficit: 'emagrecer com deficit moderado',
  maintain: 'manter o peso',
  muscle: 'ganhar massa muscular',
  bulk: 'ganhar peso/volume',
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  1.2: 'sedentario',
  1.375: 'atividade leve',
  1.55: 'atividade moderada',
  1.725: 'atividade intensa',
  1.9: 'atividade muito intensa/atleta',
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function calorieBounds(profile: UserProfile, base: MacroGoals): { min: number; max: number } {
  const floor = profile.sex === 'M' ? 1500 : 1200;
  const relativeMin = profile.goal === 'deficit' ? base.kcal * 0.85 : base.kcal * 0.9;
  const relativeMax = profile.goal === 'deficit' ? base.kcal * 1.05 : base.kcal * 1.15;
  return {
    min: Math.round(Math.max(floor, relativeMin)),
    max: Math.round(Math.max(floor + 100, relativeMax)),
  };
}

function sanitizeGoals(raw: any, profile: UserProfile, base: MacroGoals): MacroGoals {
  const kcalBounds = calorieBounds(profile, base);
  const kcal = roundTo(clamp(safeNumber(raw.kcal, base.kcal), kcalBounds.min, kcalBounds.max), 10);

  const minProtein = Math.max(50, profile.weight * 0.8);
  const maxProtein = profile.weight * 2.4;
  const protein = roundTo(clamp(safeNumber(raw.protein, base.protein), minProtein, maxProtein), 1);

  const minFat = Math.max(25, (kcal * 0.18) / 9);
  const maxFat = (kcal * 0.4) / 9;
  const fat = roundTo(clamp(safeNumber(raw.fat, base.fat), minFat, maxFat), 1);

  const minCarbs = 100;
  const maxCarbs = Math.max(minCarbs, (kcal - protein * 4 - fat * 9) / 4 + 60);
  const carbs = roundTo(clamp(safeNumber(raw.carbs, base.carbs), minCarbs, maxCarbs), 1);

  return {
    kcal,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: Math.round(clamp(safeNumber(raw.fiber, base.fiber), 20, 55)),
    water: roundTo(clamp(safeNumber(raw.water, base.water), profile.sex === 'M' ? 2200 : 1800, profile.sex === 'M' ? 4500 : 3800), 50),
    sugar: Math.round(clamp(safeNumber(raw.sugar, base.sugar), 20, Math.max(25, (kcal * 0.1) / 4))),
    sodium: Math.round(clamp(safeNumber(raw.sodium, base.sodium), 1500, 2300)),
  };
}

export async function refineDietGoals(
  profile: UserProfile,
  baseGoals: MacroGoals
): Promise<GoalAiRecommendation> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: goalSchema,
    },
  });

  const prompt = `
Voce e um assistente de nutricao para um app de acompanhamento alimentar.
Refine metas diarias usando a meta calculada como base, sem fazer prescricao medica.
Mantenha recomendacoes moderadas, sustentaveis e seguras.
Nao recomende deficit extremo, calorias abaixo do minimo seguro, proteina excessiva ou gordura muito baixa.

Perfil:
- Sexo biologico: ${profile.sex === 'M' ? 'masculino' : 'feminino'}
- Idade: ${profile.age}
- Peso: ${profile.weight} kg
- Altura: ${profile.height} cm
- Objetivo: ${GOAL_LABELS[profile.goal]}
- Atividade: ${ACTIVITY_LABELS[profile.activityLevel]}

Meta base calculada:
- kcal: ${baseGoals.kcal}
- proteina: ${baseGoals.protein} g
- carboidratos: ${baseGoals.carbs} g
- gorduras: ${baseGoals.fat} g
- fibras: ${baseGoals.fiber} g
- agua: ${baseGoals.water} ml
- acucar maximo: ${baseGoals.sugar} g
- sodio maximo: ${baseGoals.sodium} mg

Responda apenas com JSON seguindo o schema.
`;

  const result = await model.generateContent(prompt);
  const raw = JSON.parse(result.response.text());

  return {
    goals: sanitizeGoals(raw, profile, baseGoals),
    rationale: String(raw.rationale || 'Metas refinadas com base no seu perfil e objetivo.'),
  };
}
