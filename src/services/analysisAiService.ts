import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { DailyLog, MacroGoals, UserProfile } from '../types';
import { formatNutritionDetails } from '../utils/nutrition';

export type NutritionInsight = {
  summary: string;
  tips: string[];
};

const insightSchema = Schema.object({
  properties: {
    summary: Schema.string({ description: 'Resumo curto em portugues do Brasil.' }),
    tips: Schema.array({
      items: Schema.string({ description: 'Dica prática, curta e segura.' }),
    }),
  },
});

function logLine(log: DailyLog): string {
  const nutrition = formatNutritionDetails(log.totalNutrition, { includeKcal: true }) || 'sem nutrientes relevantes';
  const foods = log.entries
    .slice(-8)
    .map((entry) => entry.foodName)
    .join(', ');
  const waterTimes = log.entries
    .filter((entry) => (entry.waterMl ?? 0) > 0)
    .map((entry) => `${entry.waterMl}ml às ${new Date(entry.addedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
    .join(', ');

  return `${log.date}: ${nutrition}. Alimentos: ${foods || 'sem alimentos'}. Agua total: ${log.waterMl ?? 0}ml. Horarios de agua: ${waterTimes || 'sem horarios registrados'}.`;
}

export async function generateNutritionInsights({
  logs,
  goals,
  profile,
}: {
  logs: DailyLog[];
  goals: MacroGoals;
  profile: UserProfile | null;
}): Promise<NutritionInsight> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: insightSchema,
    },
  });

  const today = logs[logs.length - 1];
  const recent = logs.slice(-7).map(logLine).join('\n');

  const result = await model.generateContent(`
Voce e um assistente nutricional de um app de acompanhamento alimentar.
Analise os registros recentes e gere dicas praticas, seguras e nao medicas.
Compare o dia atual com as metas e com dias anteriores quando existirem.
Use os horarios de agua para sugerir melhor distribuicao de hidratacao ao longo do dia quando fizer sentido.
Evite diagnosticos, prescricoes clinicas e alarmismo.

Perfil:
- Nome: ${profile?.name ?? 'usuario'}
- Idade: ${profile?.age ?? 'nao informado'}
- Objetivo: ${profile?.goal ?? 'nao informado'}
- Atividade: ${profile?.activityLevel ?? 'nao informado'}

Metas:
- kcal: ${goals.kcal}
- proteina: ${goals.protein}g
- carboidratos: ${goals.carbs}g
- gorduras: ${goals.fat}g
- fibras: ${goals.fiber}g
- agua: ${goals.water}ml
- acucar limite: ${goals.sugar}g
- sodio limite: ${goals.sodium}mg

Dia atual:
${today ? logLine(today) : 'sem registro'}

Historico recente:
${recent || 'sem historico'}

Responda apenas com JSON. Gere um summary e 3 tips curtas em portugues do Brasil.
`);

  const raw = JSON.parse(result.response.text());
  return {
    summary: String(raw.summary || 'Analise gerada com base nos seus registros recentes.'),
    tips: Array.isArray(raw.tips) ? raw.tips.slice(0, 3).map(String) : [],
  };
}
