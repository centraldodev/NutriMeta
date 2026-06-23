#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const args = parseArgs(process.argv.slice(2));
const dryRun = !args.yes;
const rootDir = path.resolve(__dirname, '..');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const db = initializeFirestore();
  const foods = await loadGlobalFoods(db);
  const foodIndex = buildFoodIndex(foods);

  const dailyResult = await standardizeDailyLogs(db, foodIndex);
  const savedResult = await standardizeSavedMeals(db, foodIndex);

  printResult('dailyLogs', dailyResult);
  printResult('savedMeals', savedResult);

  if (dryRun) {
    console.log('\nDry-run apenas. Rode com --yes para gravar as alteracoes.');
  }
}

async function standardizeDailyLogs(db, foodIndex) {
  const snapshot = await db.collection('dailyLogs').get();
  const result = createResult();
  let batch = db.batch();
  let pendingWrites = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const nextEntries = entries.map((entry) => standardizeEntry(entry, foodIndex, result));
    const changed = nextEntries.some((entry, index) => entry !== entries[index]);

    if (!changed) continue;

    const totalNutrition = sumNutrition(nextEntries);
    const completedGoals = data.goals ? getCompletedGoals(totalNutrition, data.goals) : data.completedGoals ?? [];
    result.docsChanged += 1;

    if (!dryRun) {
      batch.update(docSnap.ref, {
        entries: nextEntries,
        totalNutrition,
        completedGoals,
        updatedAt: FieldValue.serverTimestamp(),
        standardizedWithGlobalFoodsAt: FieldValue.serverTimestamp(),
      });
      pendingWrites += 1;
      if (pendingWrites >= 450) {
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }
  }

  if (!dryRun && pendingWrites > 0) await batch.commit();
  return result;
}

async function standardizeSavedMeals(db, foodIndex) {
  const snapshot = await db.collection('savedMeals').get();
  const result = createResult();
  let batch = db.batch();
  let pendingWrites = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const nextEntries = entries.map((entry) => standardizeEntry(entry, foodIndex, result));
    const changed = nextEntries.some((entry, index) => entry !== entries[index]);

    if (!changed) continue;

    result.docsChanged += 1;

    if (!dryRun) {
      batch.update(docSnap.ref, {
        entries: nextEntries,
        totalNutrition: sumNutrition(nextEntries),
        updatedAt: FieldValue.serverTimestamp(),
        standardizedWithGlobalFoodsAt: FieldValue.serverTimestamp(),
      });
      pendingWrites += 1;
      if (pendingWrites >= 450) {
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }
  }

  if (!dryRun && pendingWrites > 0) await batch.commit();
  return result;
}

function standardizeEntry(entry, foodIndex, result) {
  result.entriesSeen += 1;

  if (entry.standardizedFoodId && entry.standardizedSource === 'globalFoods') {
    result.entriesAlreadyStandardized += 1;
    return entry;
  }

  const match = findFoodMatch(entry, foodIndex);
  if (!match) {
    result.entriesSkipped += 1;
    addExample(result.skippedExamples, entry.foodName);
    return entry;
  }

  const standardized = makeStandardizedEntry(entry, match.food);
  if (!standardized) {
    result.entriesSkipped += 1;
    addExample(result.skippedExamples, entry.foodName);
    return entry;
  }

  result.entriesChanged += 1;
  addExample(result.changedExamples, `${entry.foodName} -> ${standardized.foodName}`);
  return standardized;
}

function makeStandardizedEntry(entry, food) {
  const base = food.nutritionPer?.porcao;
  if (!base) return null;

  const grams = estimateGrams(entry, base);
  if (!grams || grams <= 0) return null;

  const nutrition = multiplyNutrition(base, grams / 100);
  const roundedGrams = round(grams, grams >= 100 ? 0 : 1);

  return {
    ...entry,
    foodName: `${food.name} (${formatNumber(roundedGrams)} g)`,
    emoji: food.emoji || entry.emoji,
    quantity: roundedGrams,
    unit: 'grama',
    nutrition,
    standardizedFoodId: food.id,
    standardizedSource: 'globalFoods',
    standardizedAt: new Date(),
    originalFoodName: entry.originalFoodName ?? entry.foodName,
    originalQuantity: entry.originalQuantity ?? entry.quantity,
    originalUnit: entry.originalUnit ?? entry.unit,
    originalNutrition: entry.originalNutrition ?? entry.nutrition,
  };
}

function estimateGrams(entry, base) {
  const oldKcal = number(entry.nutrition?.kcal);
  const baseKcal = number(base.kcal);

  if (oldKcal > 0 && baseKcal > 0) {
    return clamp((oldKcal / baseKcal) * 100, 1, 2000);
  }
  if (oldKcal > 0 && baseKcal <= 0) return null;

  if (entry.unit === 'grama') return number(entry.quantity);
  if (entry.unit === 'mililitro') return number(entry.quantity);
  if (entry.unit === 'porcao' && number(entry.quantity) > 0) return number(entry.quantity) * 100;
  return null;
}

function findFoodMatch(entry, foodIndex) {
  const query = cleanFoodName(entry.foodName);
  if (!query || isHydrationOnly(entry)) return null;

  const manual = manualMatchId(query);
  if (manual && foodIndex.byId.has(manual)) {
    return { food: foodIndex.byId.get(manual), score: 1 };
  }

  const queryTokens = tokens(query);
  const candidates = foodIndex.foods
    .map((food) => ({ food, score: lexicalScore(queryTokens, food.searchTokens) }))
    .filter((candidate) => candidate.score >= 0.5 && candidate.food.nutritionPer?.porcao?.kcal > 0)
    .map((candidate) => ({
      ...candidate,
      macroPenalty: macroPenalty(entry.nutrition, candidate.food.nutritionPer.porcao),
    }))
    .sort((a, b) => {
      const aTotal = a.score * 10 - a.macroPenalty;
      const bTotal = b.score * 10 - b.macroPenalty;
      return bTotal - aTotal || a.food.name.localeCompare(b.food.name);
    });

  const best = candidates[0];
  if (!best || best.score < 0.5 || best.macroPenalty > 8) return null;
  return best;
}

function manualMatchId(query) {
  if (/arroz branco cozido/.test(query)) return 'global_arroz_tipo_1_cozido';
  if (/feijao carioca cozido/.test(query)) return 'global_feijao_carioca_cozido';
  if (/pao frances/.test(query)) return 'global_pao_trigo_frances';
  if (/coxa.*frango.*assad/.test(query)) return 'global_frango_coxa_com_pele_assada';
  if (/refrigerante/.test(query)) return 'global_refrigerante_tipo_cola';
  if (/cafe preto/.test(query)) return 'global_cafe_infusao';
  if (/carne bovina grelhada/.test(query)) return 'global_carne_bovina_capa_de_contra_file_sem_gordura_grelhada';
  if (/leite integral/.test(query)) return 'global_leite_de_vaca_integral';
  return null;
}

function macroPenalty(oldNutrition = {}, base) {
  const oldKcal = number(oldNutrition.kcal);
  const baseKcal = number(base.kcal);
  if (oldKcal <= 0 || baseKcal <= 0) return 0;

  const factor = oldKcal / baseKcal;
  const keys = ['protein', 'carbs', 'fat', 'fiber'];

  return keys.reduce((sum, key) => {
    const oldValue = number(oldNutrition[key]);
    const nextValue = number(base[key]) * factor;
    if (oldValue === 0 && nextValue === 0) return sum;
    const scale = Math.max(1, oldValue);
    return sum + Math.min(4, Math.abs(nextValue - oldValue) / scale);
  }, 0);
}

async function loadGlobalFoods(db) {
  const snapshot = await db.collection('globalFoods').get();
  return snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
}

function buildFoodIndex(foods) {
  const byId = new Map(foods.map((food) => [food.id, food]));
  const indexedFoods = foods.map((food) => ({
    ...food,
    searchTokens: tokens([food.name, ...(food.aliases ?? [])].join(' ')),
  }));

  return { foods: indexedFoods, byId };
}

function cleanFoodName(name = '') {
  return normalize(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:[,.]\d+)?\b/g, ' ')
    .replace(/\b(?:g|ml|kcal|unidade|unidades|colher|colheres|sopa|concha|bife|medio|media|xicara|porcao)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  const stopWords = new Set(['com', 'sem', 'dos', 'das', 'para', 'tipo', 'base', 'de', 'da', 'do', 'ao']);
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

function lexicalScore(queryTokens, foodTokens) {
  if (queryTokens.size === 0) return 0;
  let matches = 0;
  queryTokens.forEach((token) => {
    if (foodTokens.has(token)) matches += 1;
  });
  return matches / queryTokens.size;
}

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sumNutrition(entries) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 };
  entries.forEach((entry) => {
    Object.entries(entry.nutrition ?? {}).forEach(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      total[key] = round((total[key] ?? 0) + value, key === 'kcal' || key === 'sodium' ? 0 : 1);
    });
  });
  return total;
}

function getCompletedGoals(total, goals) {
  const completed = [];
  if (total.kcal >= goals.kcal * 0.95) completed.push('kcal');
  if (total.protein >= goals.protein * 0.95) completed.push('protein');
  if (total.carbs >= goals.carbs * 0.95) completed.push('carbs');
  if (total.fat >= goals.fat * 0.9) completed.push('fat');
  if (total.fiber >= goals.fiber * 0.95) completed.push('fiber');
  return completed;
}

function multiplyNutrition(nutrition, factor) {
  const result = {};
  Object.entries(nutrition).forEach(([key, value]) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    result[key] = round(value * factor, key === 'kcal' || key === 'sodium' ? 0 : 1);
  });
  return {
    kcal: result.kcal ?? 0,
    protein: result.protein ?? 0,
    carbs: result.carbs ?? 0,
    fat: result.fat ?? 0,
    fiber: result.fiber ?? 0,
    ...result,
  };
}

function isHydrationOnly(entry) {
  return entry.waterMl > 0 && number(entry.nutrition?.kcal) === 0;
}

function initializeFirestore() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = args['project-id'] || readFirebaseProjectId();

    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId });
    } else {
      if (credentialsPath && !fs.existsSync(credentialsPath)) {
        throw new Error(`Arquivo de credenciais nao encontrado em GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath}`);
      }
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore();
}

function readFirebaseProjectId() {
  const appJsonPath = path.resolve(rootDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  return appJson.expo?.extra?.firebaseProjectId;
}

function createResult() {
  return {
    entriesSeen: 0,
    entriesChanged: 0,
    entriesSkipped: 0,
    entriesAlreadyStandardized: 0,
    docsChanged: 0,
    changedExamples: [],
    skippedExamples: [],
  };
}

function printResult(name, result) {
  console.log(`\n${name}`);
  console.log(`- documentos alterados: ${result.docsChanged}`);
  console.log(`- entradas lidas: ${result.entriesSeen}`);
  console.log(`- entradas padronizadas: ${result.entriesChanged}`);
  console.log(`- entradas ja padronizadas: ${result.entriesAlreadyStandardized}`);
  console.log(`- entradas puladas: ${result.entriesSkipped}`);
  if (result.changedExamples.length) {
    console.log('- exemplos alterados:');
    result.changedExamples.forEach((item) => console.log(`  • ${item}`));
  }
  if (result.skippedExamples.length) {
    console.log('- exemplos pulados:');
    result.skippedExamples.forEach((item) => console.log(`  • ${item}`));
  }
}

function addExample(examples, value) {
  if (!value || examples.includes(value) || examples.length >= 12) return;
  examples.push(value);
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value) {
  return String(value).replace('.', ',');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      parsed[key] = argv[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}
