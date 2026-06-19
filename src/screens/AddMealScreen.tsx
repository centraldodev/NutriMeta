import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  TextInput, Modal, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../constants/theme';
import { useStore, selectGoals, selectSavedMeals } from '../store';
import { addMealEntry, incrementMealUsage, removeMealEntry } from '../services/nutritionService';
import { analyzeMealPhoto } from '../services/photoMealAiService';
import {
  findFood,
  searchFoodDatabase,
  parseQuantityFromText,
  calculateNutrition,
  UNIT_LABELS,
  FOOD_DB,
} from '../constants/foodDatabase';
import { FoodItem, MealEntry, QuantityUnit } from '../types';
import { generateId, formatDate } from '../utils/nutrition';
import { isFirebaseConfigured } from '../config';

declare const require: (name: string) => any;

type SpeechRecognitionModule = {
  addListener: (eventName: string, listener: (event: any) => void) => { remove: () => void };
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: { lang: string; interimResults: boolean; continuous: boolean }) => void;
  stop: () => void;
};

function loadSpeechRecognitionModule(): SpeechRecognitionModule | null {
  try {
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

function getFoodUnits(food: FoodItem | null): QuantityUnit[] {
  if (!food) return ['porcao', 'colher_sopa', 'xicara', 'grama'];
  return Object.keys(food.nutritionPer) as QuantityUnit[];
}

function searchFoods(query: string): FoodItem[] {
  return searchFoodDatabase(query);
}

function parseQtyInput(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

type MealDraft = {
  key: string;
  food: FoodItem | null;
  foodText: string;
  foodFound: boolean;
  quantity: number;
  unit: QuantityUnit;
  nutrition: ReturnType<typeof calculateNutrition>;
  sourceNote?: string;
};

const QUANTITY_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

function hasExplicitUnit(text: string): boolean {
  return /colher|colheres|xicara|xícara|copo|concha|fatia|fil[eé]|bife|ovo|ovos|unidade|por[cç][aã]o|grama|gramas|\d+\s*g\b|kg|ml|litro/.test(text.toLowerCase());
}

function extractSpokenNumber(text: string): number | null {
  const digit = text.match(/\d+(?:[,.]\d+)?/);
  if (digit) return Number(digit[0].replace(',', '.'));
  const normalized = text.toLowerCase();
  for (const [word, value] of Object.entries(QUANTITY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return value;
  }
  return null;
}

function cleanVoiceSegment(text: string): string {
  return text
    .replace(/\b(eu|comi|comer|almocei|jantei|tomei|bebi|lanchei|coloquei|foi|foram|hoje|no|na|meu|minha|prato|refeicao|refeição)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVoiceQuantity(segment: string, food: FoodItem): { quantity: number; unit: QuantityUnit } {
  const parsed = parseQuantityFromText(segment);
  if (hasExplicitUnit(segment)) return parsed;
  return {
    quantity: extractSpokenNumber(segment) ?? 1,
    unit: food.defaultUnit,
  };
}

function splitVoiceText(rawText: string): string[] {
  const base = rawText
    .replace(/\s+(?:e|mais|com|tamb[eé]m)\s+/gi, ',')
    .split(/[,;]/)
    .map(cleanVoiceSegment)
    .filter(Boolean);

  if (base.length > 1) return base;

  const text = cleanVoiceSegment(rawText);
  const matches = FOOD_DB
    .flatMap((food) => [food.name, ...food.aliases].map((term) => ({ food, term })))
    .map(({ food, term }) => {
      const index = text.toLowerCase().indexOf(term.toLowerCase());
      return index >= 0 ? { food, term, index } : null;
    })
    .filter(Boolean) as { food: FoodItem; term: string; index: number }[];

  if (matches.length <= 1) return [text].filter(Boolean);

  return matches
    .sort((a, b) => a.index - b.index)
    .map((match, index, list) => {
      const start = Math.max(0, index === 0 ? 0 : match.index - 12);
      const end = list[index + 1]?.index ?? text.length;
      return text.slice(start, end).trim();
    })
    .filter(Boolean);
}

function parseVoiceMeal(rawText: string): MealDraft[] {
  return splitVoiceText(rawText).flatMap((segment, index) => {
    const food = findFood(segment);
    if (!food) return [];
    const parsed = parseVoiceQuantity(segment, food);
    const unit = food.nutritionPer[parsed.unit] ? parsed.unit : food.defaultUnit;
    const quantity = parsed.quantity > 0 ? parsed.quantity : 1;
    return [{
      key: `${food.id}_${index}_${quantity}_${unit}`,
      food,
      foodText: food.name,
      foodFound: true,
      quantity,
      unit,
      nutrition: calculateNutrition(food, quantity, unit),
      sourceNote: `Falado: ${segment}`,
    }];
  });
}

function emptyNutrition(): ReturnType<typeof calculateNutrition> {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function recalcMealDraft(item: MealDraft, changes: Partial<MealDraft>): MealDraft {
  const next = { ...item, ...changes };
  if (!next.food) {
    return {
      ...next,
      foodFound: false,
      nutrition: emptyNutrition(),
    };
  }
  const unit = next.food.nutritionPer[next.unit] ? next.unit : next.food.defaultUnit;
  const quantity = next.quantity > 0 ? next.quantity : 1;
  return {
    ...next,
    foodFound: true,
    unit,
    quantity,
    nutrition: calculateNutrition(next.food, quantity, unit),
  };
}

// ─── Add Meal Modal ───────────────────────────────────────────────────────────

function AddMealModal({
  visible, onClose, onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (entry: MealEntry) => void;
}) {
  const goals    = useStore(selectGoals);
  const user     = useStore((s) => s.user);
  const todayLog = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const addEntry = useStore((s) => s.addEntry);

  const [foodQuery, setFoodQuery] = useState('');
  const [quantity,  setQuantity]  = useState('1');
  const [unit,      setUnit]      = useState<QuantityUnit>('porcao');
  const [estimated, setEstimated] = useState<ReturnType<typeof calculateNutrition> | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [foodItem,  setFoodItem]  = useState<FoodItem | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const suggestions = React.useMemo(() => searchFoods(foodQuery), [foodQuery]);
  const availableUnits = React.useMemo(() => getFoodUnits(foodItem), [foodItem]);
  const frequentFoods = React.useMemo(() => {
    const counts = new Map<string, { food: FoodItem; count: number }>();
    const addFood = (foodName: string, amount = 1) => {
      const food = findFood(foodName);
      if (!food) return;
      const current = counts.get(food.id);
      counts.set(food.id, { food, count: (current?.count ?? 0) + amount });
    };

    todayLog?.entries.forEach((entry) => addFood(entry.foodName, 2));
    savedMeals.forEach((meal) => {
      meal.entries.forEach((entry) => addFood(entry.foodName, Math.max(1, meal.usageCount + 1)));
    });

    const ranked = Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.food.name.localeCompare(b.food.name))
      .map((item) => item.food);

    return ranked.length > 0 ? ranked.slice(0, 10) : FOOD_DB.slice(0, 10);
  }, [savedMeals, todayLog]);

  const estimate = useCallback(() => {
    const food = foodItem ?? findFood(foodQuery);
    if (!food) { setEstimated(null); return; }
    const selectedUnit = food.nutritionPer[unit] ? unit : food.defaultUnit;
    const nutr = calculateNutrition(food, parseQtyInput(quantity), selectedUnit);
    setEstimated(nutr);
  }, [foodItem, foodQuery, quantity, unit]);

  React.useEffect(() => { estimate(); }, [estimate]);

  React.useEffect(() => {
    if (!visible) return;
    setFoodQuery('');
    setQuantity('1');
    setUnit('porcao');
    setEstimated(null);
    setFoodItem(null);
    setAddedCount(0);
  }, [visible]);

  function handleSelectFood(food: FoodItem) {
    setFoodItem(food);
    setFoodQuery(food.name);
    setQuantity('1');
    setUnit(food.defaultUnit);
  }

  function handleFoodQuery(value: string) {
    setFoodQuery(value);
    if (foodItem && value !== foodItem.name) {
      setFoodItem(null);
    }
  }

  async function handleAdd() {
    if (!user || !goals) return;
    const food = foodItem ?? findFood(foodQuery);
    if (!food) { Alert.alert('Alimento não encontrado', 'Tente outro nome ou seja mais específico.'); return; }

    const selectedUnit = food.nutritionPer[unit] ? unit : food.defaultUnit;
    const parsedQuantity = parseQtyInput(quantity);
    const nutr = calculateNutrition(food, parsedQuantity, selectedUnit);

    setSaving(true);
    try {
      const payload = {
        foodName:  `${food.name} (${parsedQuantity} ${UNIT_LABELS[selectedUnit]})`,
        emoji:     food.emoji,
        quantity:  parsedQuantity,
        unit:      selectedUnit,
        nutrition: nutr,
        source:    'manual',
      } as const;
      const entry = isFirebaseConfigured && user.id !== 'dev_user'
        ? await addMealEntry(user.id, goals, payload)
        : {
            ...payload,
            id: generateId(),
            userId: user.id,
            addedAt: new Date(),
          };
      addEntry(entry);
      onAdded(entry);
      setFoodQuery('');
      setQuantity('1');
      setUnit('porcao');
      setEstimated(null);
      setFoodItem(null);
      setAddedCount((count) => count + 1);
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !estimated;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Adicionar alimentos</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0 ? `${addedCount} alimento(s) adicionados hoje` : 'Monte a refeição sem sair desta tela'}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <View style={modal.searchPanel}>
            <Text style={modal.label}>Alimento</Text>
            <TextInput
              style={modal.input}
              value={foodQuery}
              onChangeText={handleFoodQuery}
              placeholder="Busque: arroz, file frango, brocoli..."
              placeholderTextColor={Colors.gray400}
              autoFocus
            />
            <Text style={modal.subLabel}>
              {todayLog?.entries.length || savedMeals.length ? 'Mais usados por você' : 'Atalhos populares'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modal.chipsScroll}>
              <View style={modal.chips}>
                {frequentFoods.map((food) => (
                  <TouchableOpacity key={food.id} style={modal.chip} onPress={() => handleSelectFood(food)}>
                    <Text style={modal.chipText}>{food.emoji} {food.name.replace(/ cozido\/mexido| cozido| grelhado/g, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={modal.suggestionBox}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {suggestions.map((food) => {
                const selected = foodItem?.id === food.id;
                return (
                  <TouchableOpacity
                    key={food.id}
                    style={[modal.foodOption, selected && modal.foodOptionActive]}
                    onPress={() => handleSelectFood(food)}
                  >
                    <Text style={modal.foodEmoji}>{food.emoji}</Text>
                    <View style={modal.foodInfo}>
                      <Text style={[modal.foodName, selected && modal.foodNameActive]}>{food.name}</Text>
                      <Text style={modal.foodUnit}>Padrão: {UNIT_LABELS[food.defaultUnit]}</Text>
                    </View>
                    {selected && <MaterialIcons name="check-circle" size={20} color={Colors.green600} />}
                  </TouchableOpacity>
                );
              })}
              {suggestions.length === 0 && (
                <View style={modal.noResults}>
                  <Text style={modal.noResultsText}>Nenhum alimento encontrado.</Text>
                </View>
              )}
            </ScrollView>
          </View>

          <View style={modal.bottomPanel}>
            <View style={modal.qtyRow}>
              <View style={modal.qtyField}>
                <Text style={modal.label}>Quantidade</Text>
                <TextInput
                  style={modal.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              <View style={modal.qtyHintBox}>
                <Text style={modal.qtyHintTitle}>Dica</Text>
                <Text style={modal.qtyHint}>Use gramas para maior precisão quando souber o peso.</Text>
              </View>
            </View>

            <Text style={modal.label}>Unidade</Text>
            <View style={modal.unitWrap}>
              {availableUnits.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[modal.unitChip, unit === u && modal.unitChipActive]}
                  onPress={() => setUnit(u)}
                >
                  <Text style={[modal.unitChipText, unit === u && modal.unitChipTextActive]}>{UNIT_LABELS[u]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {estimated && (
              <View style={modal.estimateBox}>
                <Text style={modal.estimateTitle}>Estimativa nutricional</Text>
                <View style={modal.estimateGrid}>
                  <EstVal label="kcal"  val={String(estimated.kcal)} />
                  <EstVal label="Prot"  val={`${estimated.protein}g`} color={Colors.protein} />
                  <EstVal label="Carb"  val={`${estimated.carbs}g`}   color={Colors.carbs}   />
                  <EstVal label="Gord"  val={`${estimated.fat}g`}     color={Colors.fat}     />
                  <EstVal label="Fibra" val={`${estimated.fiber}g`}   color={Colors.fiber}   />
                </View>
              </View>
            )}

            <View style={modal.actions}>
              <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
                <Text style={modal.btnCancelText}>Fechar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnAdd, (isEmpty || saving) && modal.btnDisabled]}
                onPress={handleAdd}
                disabled={isEmpty || saving}
              >
                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={modal.btnAddText}>Adicionar outro</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EstVal({ label, val, color }: { label: string; val: string; color?: string }) {
  return (
    <View style={modal.estItem}>
      <Text style={[modal.estVal, color ? { color } : {}]}>{val}</Text>
      <Text style={modal.estLabel}>{label}</Text>
    </View>
  );
}

// ─── Voice Modal ──────────────────────────────────────────────────────────────

function VoiceModal({
  visible, onClose, onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (items: MealDraft[]) => void;
}) {
  const [listening,   setListening]   = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);

  React.useEffect(() => {
    if (!visible) return;
    setTranscript('');
    setEditableDrafts([]);
    setAddedCount(0);
  }, [visible]);

  React.useEffect(() => {
    setEditableDrafts(parseVoiceMeal(transcript));
  }, [transcript]);

  React.useEffect(() => {
    if (!speechModule) return undefined;

    const startSub = speechModule.addListener('start', () => setListening(true));
    const endSub = speechModule.addListener('end', () => setListening(false));
    const resultSub = speechModule.addListener('result', (event) => {
      setTranscript(event.results[0]?.transcript ?? '');
    });
    const errorSub = speechModule.addListener('error', (event) => {
      setListening(false);
      console.warn('Voice error', event);
    });

    return () => {
      startSub.remove();
      endSub.remove();
      resultSub.remove();
      errorSub.remove();
    };
  }, [speechModule]);

  async function toggle() {
    if (!speechModule || !speechModule.isRecognitionAvailable()) {
      Alert.alert(
        'Voz indisponível no Expo Go',
        'O reconhecimento de voz precisa de uma development build. Preenchi um exemplo para você testar a confirmação.'
      );
      setTranscript('4 colheres de arroz, 1 concha de feijão e 1 filé de frango');
      return;
    }

    if (listening) {
      speechModule.stop();
      setListening(false);
    } else {
      setTranscript('');
      try {
        const permission = await speechModule.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permissão necessária', 'Autorize o microfone para registrar refeições por voz.');
          return;
        }
        speechModule.start({
          lang: 'pt-BR',
          interimResults: true,
          continuous: false,
        });
      } catch (e) {
        // Fallback simulation in dev
        console.warn('Voice fallback', e);
        setTranscript('4 colheres de arroz e 1 filé de frango médio');
      }
    }
  }

  function confirm() {
    onConfirm(editableDrafts);
    setAddedCount((count) => count + editableDrafts.length);
    setTranscript('');
    setEditableDrafts([]);
  }

  function updateDraft(key: string, updater: (item: MealDraft) => MealDraft) {
    setEditableDrafts((items) => items.map((item) => item.key === key ? updater(item) : item));
  }

  function removeDraft(key: string) {
    setEditableDrafts((items) => items.filter((item) => item.key !== key));
  }

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found = findFood(value);
      if (!found) {
        return { ...item, foodText: value, foodFound: false };
      }
      const unit = found.nutritionPer[item.unit] ? item.unit : found.defaultUnit;
      return recalcMealDraft(item, {
        food: found,
        foodText: value,
        foodFound: true,
        unit,
      });
    });
  }

  function updateDraftQuantity(key: string, value: string) {
    updateDraft(key, (item) => recalcMealDraft(item, { quantity: parseQtyInput(value) }));
  }

  function updateDraftUnit(key: string, nextUnit: QuantityUnit) {
    updateDraft(key, (item) => recalcMealDraft(item, { unit: nextUnit }));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Fale o que você comeu</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0 ? `${addedCount} alimento(s) adicionados hoje` : 'Diga vários alimentos na mesma frase.'}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[voiceModal.circle, listening && voiceModal.circleActive]}
            onPress={toggle}
          >
            <MaterialIcons name={listening ? 'stop' : 'mic'} size={40} color={listening ? Colors.white : Colors.purpleD} />
          </TouchableOpacity>

          <Text style={voiceModal.tip}>
            {listening ? 'Ouvindo... fale agora' : 'Toque para começar a falar'}
          </Text>

          <View style={voiceModal.transcript}>
            <Text style={voiceModal.transcriptText}>
              {transcript || 'Aguardando...'}
            </Text>
          </View>

          <View style={voiceModal.previewBox}>
            <Text style={voiceModal.exTitle}>Itens detectados</Text>
            {editableDrafts.length === 0 ? (
              <Text style={voiceModal.previewEmpty}>Fale algo como: "4 colheres de arroz, 1 concha de feijão e 1 filé de frango".</Text>
            ) : (
              editableDrafts.map((item) => (
                <View key={item.key} style={voiceModal.editCard}>
                  <View style={voiceModal.editHeader}>
                    <Text style={voiceModal.previewEmoji}>{item.food?.emoji ?? '?'}</Text>
                    <View style={voiceModal.previewInfo}>
                      <TextInput
                        style={[voiceModal.foodInput, !item.foodFound && voiceModal.inputError]}
                        value={item.foodText}
                        onChangeText={(value) => updateDraftFood(item.key, value)}
                        placeholder="Alimento"
                        placeholderTextColor={Colors.gray400}
                      />
                      {!item.foodFound && <Text style={voiceModal.errorText}>Alimento não encontrado na base.</Text>}
                    </View>
                    <TouchableOpacity style={voiceModal.removeBtn} onPress={() => removeDraft(item.key)}>
                      <MaterialIcons name="close" size={18} color={Colors.gray600} />
                    </TouchableOpacity>
                  </View>

                  <View style={voiceModal.editRow}>
                    <View style={voiceModal.quantityEdit}>
                      <Text style={voiceModal.smallLabel}>Qtd.</Text>
                      <TextInput
                        style={voiceModal.quantityInput}
                        value={String(item.quantity).replace('.', ',')}
                        onChangeText={(value) => updateDraftQuantity(item.key, value)}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={Colors.gray400}
                      />
                    </View>
                    <View style={voiceModal.unitEdit}>
                      <Text style={voiceModal.smallLabel}>Unidade</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={voiceModal.unitRow}>
                          {getFoodUnits(item.food).map((unitOption) => (
                            <TouchableOpacity
                              key={unitOption}
                              style={[voiceModal.unitMiniChip, item.unit === unitOption && voiceModal.unitMiniChipActive]}
                              onPress={() => updateDraftUnit(item.key, unitOption)}
                            >
                              <Text style={[voiceModal.unitMiniText, item.unit === unitOption && voiceModal.unitMiniTextActive]}>
                                {UNIT_LABELS[unitOption]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  </View>

                  <Text style={voiceModal.previewMeta}>
                    {Math.round(item.nutrition.kcal)} kcal · P:{Math.round(item.nutrition.protein)}g · C:{Math.round(item.nutrition.carbs)}g · G:{Math.round(item.nutrition.fat)}g
                  </Text>
                  {item.sourceNote ? (
                    <Text style={voiceModal.spokenText}>{item.sourceNote}</Text>
                  ) : null}
                  </View>
              ))
            )}
          </View>

          <Text style={voiceModal.exTitle}>Dicas rápidas</Text>
          <Text style={voiceModal.example}>Use frases como "2 ovos", "100 gramas de frango", "1 xícara de leite".</Text>
          <Text style={voiceModal.example}>Se não falar quantidade, o app usa a porção padrão daquele alimento.</Text>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, (editableDrafts.length === 0 || hasInvalidDraft) && modal.btnDisabled]}
              onPress={confirm}
              disabled={editableDrafts.length === 0 || hasInvalidDraft}
            >
              <Text style={modal.btnAddText}>Adicionar e continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Photo Modal ──────────────────────────────────────────────────────────────

function PhotoModal({
  visible, onClose, onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (items: MealDraft[]) => void;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);

  React.useEffect(() => {
    if (!visible) return;
    setImageUri(null);
    setSummary('');
    setAnalyzing(false);
    setEditableDrafts([]);
    setAddedCount(0);
  }, [visible]);

  async function pickImage(source: 'camera' | 'library') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permissão necessária', source === 'camera'
        ? 'Autorize a câmera para registrar refeições por foto.'
        : 'Autorize o acesso às fotos para escolher uma imagem do prato.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.65,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.65,
          base64: true,
        });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('Imagem inválida', 'Não consegui preparar esta foto para análise.');
      return;
    }

    setImageUri(asset.uri);
    await analyzePhoto(asset.base64, asset.mimeType ?? 'image/jpeg');
  }

  async function analyzePhoto(base64: string, mimeType: string) {
    setAnalyzing(true);
    setSummary('');
    setEditableDrafts([]);
    try {
      const result = await analyzeMealPhoto(base64, mimeType);
      setSummary(result.summary ?? '');
      const drafts = result.items.map((item, index) => {
        const food = findFood(item.foodName) ?? null;
        const unit = food && food.nutritionPer[item.unit] ? item.unit : food?.defaultUnit ?? item.unit;
        const quantity = item.quantity > 0 ? item.quantity : 1;
        return {
          key: `photo_${index}_${item.foodName}_${quantity}_${unit}`,
          food,
          foodText: food?.name ?? item.foodName,
          foodFound: Boolean(food),
          quantity,
          unit,
          nutrition: food ? calculateNutrition(food, quantity, unit) : emptyNutrition(),
          sourceNote: item.notes
            ? `IA: ${item.notes}${item.confidence != null ? ` · confiança ${Math.round(item.confidence * 100)}%` : ''}`
            : item.confidence != null
              ? `IA: confiança ${Math.round(item.confidence * 100)}%`
              : undefined,
        };
      });
      setEditableDrafts(drafts);
      if (drafts.length === 0) {
        Alert.alert('Nada identificado', 'Tente uma foto mais clara do prato ou adicione manualmente.');
      }
    } catch (e) {
      console.warn('Photo meal analysis failed', e);
      Alert.alert('Erro ao analisar foto', 'Não consegui identificar o prato agora. Tente novamente ou use a entrada manual.');
    } finally {
      setAnalyzing(false);
    }
  }

  function confirm() {
    onConfirm(editableDrafts);
    setAddedCount((count) => count + editableDrafts.length);
    setImageUri(null);
    setSummary('');
    setEditableDrafts([]);
  }

  function updateDraft(key: string, updater: (item: MealDraft) => MealDraft) {
    setEditableDrafts((items) => items.map((item) => item.key === key ? updater(item) : item));
  }

  function removeDraft(key: string) {
    setEditableDrafts((items) => items.filter((item) => item.key !== key));
  }

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found = findFood(value);
      if (!found) {
        return { ...item, food: null, foodText: value, foodFound: false, nutrition: emptyNutrition() };
      }
      const unit = found.nutritionPer[item.unit] ? item.unit : found.defaultUnit;
      return recalcMealDraft(item, {
        food: found,
        foodText: value,
        foodFound: true,
        unit,
      });
    });
  }

  function updateDraftQuantity(key: string, value: string) {
    updateDraft(key, (item) => recalcMealDraft(item, { quantity: parseQtyInput(value) }));
  }

  function updateDraftUnit(key: string, nextUnit: QuantityUnit) {
    updateDraft(key, (item) => recalcMealDraft(item, { unit: nextUnit }));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.bg}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <View style={modal.modalHeader}>
            <View>
              <Text style={modal.title}>Foto do prato</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0 ? `${addedCount} alimento(s) adicionados hoje` : 'A IA identifica e você confere antes de salvar.'}
              </Text>
            </View>
            <TouchableOpacity style={modal.closePill} onPress={onClose}>
              <Text style={modal.closePillText}>Concluir</Text>
            </TouchableOpacity>
          </View>

          <View style={photoModal.photoActions}>
            <TouchableOpacity style={photoModal.photoButton} onPress={() => pickImage('camera')} disabled={analyzing}>
              <MaterialIcons name="photo-camera" size={22} color={Colors.green600} />
              <Text style={photoModal.photoButtonText}>Tirar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={photoModal.photoButton} onPress={() => pickImage('library')} disabled={analyzing}>
              <MaterialIcons name="photo-library" size={22} color={Colors.green600} />
              <Text style={photoModal.photoButtonText}>Galeria</Text>
            </TouchableOpacity>
          </View>

          {imageUri ? (
            <Image source={{ uri: imageUri }} style={photoModal.previewImage} resizeMode="cover" />
          ) : (
            <View style={photoModal.emptyImage}>
              <MaterialIcons name="restaurant" size={34} color={Colors.gray400} />
              <Text style={photoModal.emptyImageText}>Escolha uma foto clara do prato para começar.</Text>
            </View>
          )}

          {analyzing && (
            <View style={photoModal.loadingBox}>
              <ActivityIndicator color={Colors.green400} />
              <Text style={photoModal.loadingText}>Analisando alimentos e porções...</Text>
            </View>
          )}

          {summary ? <Text style={photoModal.summary}>{summary}</Text> : null}

          <View style={voiceModal.previewBox}>
            <Text style={voiceModal.exTitle}>Itens detectados</Text>
            {editableDrafts.length === 0 ? (
              <Text style={voiceModal.previewEmpty}>Depois da análise, confira os alimentos aqui e ajuste o que precisar.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator>
                {editableDrafts.map((item) => (
                  <View key={item.key} style={voiceModal.editCard}>
                    <View style={voiceModal.editHeader}>
                      <Text style={voiceModal.previewEmoji}>{item.food?.emoji ?? '?'}</Text>
                      <View style={voiceModal.previewInfo}>
                        <TextInput
                          style={[voiceModal.foodInput, !item.foodFound && voiceModal.inputError]}
                          value={item.foodText}
                          onChangeText={(value) => updateDraftFood(item.key, value)}
                          placeholder="Alimento"
                          placeholderTextColor={Colors.gray400}
                        />
                        {!item.foodFound && <Text style={voiceModal.errorText}>Alimento não encontrado na base.</Text>}
                      </View>
                      <TouchableOpacity style={voiceModal.removeBtn} onPress={() => removeDraft(item.key)}>
                        <MaterialIcons name="close" size={18} color={Colors.gray600} />
                      </TouchableOpacity>
                    </View>

                    <View style={voiceModal.editRow}>
                      <View style={voiceModal.quantityEdit}>
                        <Text style={voiceModal.smallLabel}>Qtd.</Text>
                        <TextInput
                          style={voiceModal.quantityInput}
                          value={String(item.quantity).replace('.', ',')}
                          onChangeText={(value) => updateDraftQuantity(item.key, value)}
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={voiceModal.unitEdit}>
                        <Text style={voiceModal.smallLabel}>Unidade</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={voiceModal.unitRow}>
                            {getFoodUnits(item.food).map((unitOption) => (
                              <TouchableOpacity
                                key={unitOption}
                                style={[voiceModal.unitMiniChip, item.unit === unitOption && voiceModal.unitMiniChipActive]}
                                onPress={() => updateDraftUnit(item.key, unitOption)}
                              >
                                <Text style={[voiceModal.unitMiniText, item.unit === unitOption && voiceModal.unitMiniTextActive]}>
                                  {UNIT_LABELS[unitOption]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>

                    <Text style={voiceModal.previewMeta}>
                      {Math.round(item.nutrition.kcal)} kcal · P:{Math.round(item.nutrition.protein)}g · C:{Math.round(item.nutrition.carbs)}g · G:{Math.round(item.nutrition.fat)}g
                    </Text>
                    {item.sourceNote ? <Text style={voiceModal.spokenText}>{item.sourceNote}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btnAdd, (editableDrafts.length === 0 || hasInvalidDraft || analyzing) && modal.btnDisabled]}
              onPress={confirm}
              disabled={editableDrafts.length === 0 || hasInvalidDraft || analyzing}
            >
              <Text style={modal.btnAddText}>Adicionar e continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Today Log ────────────────────────────────────────────────────────────────

function TodayEntry({ entry, onDelete }: { entry: MealEntry; onDelete: () => void }) {
  const time = new Date(entry.addedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={logStyle.row}>
      <Text style={logStyle.emoji}>{entry.emoji}</Text>
      <View style={logStyle.info}>
        <View style={logStyle.infoTop}>
          <View style={logStyle.timeBadge}><Text style={logStyle.timeTxt}>{time}</Text></View>
        </View>
        <Text style={logStyle.name}>{entry.foodName}</Text>
        <Text style={logStyle.macros}>
          P:{Math.round(entry.nutrition.protein)}g · C:{Math.round(entry.nutrition.carbs)}g · G:{Math.round(entry.nutrition.fat)}g
        </Text>
      </View>
      <View style={logStyle.right}>
        <Text style={logStyle.kcal}>{Math.round(entry.nutrition.kcal)}</Text>
        <Text style={logStyle.kcalLabel}>kcal</Text>
        <TouchableOpacity onPress={onDelete} style={logStyle.delBtn}>
          <Text style={logStyle.delTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function AddMealScreen() {
  const todayLog   = useStore((s) => s.todayLog);
  const savedMeals = useStore(selectSavedMeals);
  const removeEntry = useStore((s) => s.removeEntry);
  const goals       = useStore(selectGoals);
  const user        = useStore((s) => s.user);
  const addEntryFn  = useStore((s) => s.addEntry);

  const [addModal,   setAddModal]   = useState(false);
  const [voiceModal, setVoiceModal] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);

  async function saveDraftItems(items: MealDraft[], source: 'voice' | 'photo') {
    if (!user || !goals) return;
    if (items.length === 0) {
      Alert.alert('Nenhum alimento para adicionar', 'Revise os itens detectados antes de confirmar.');
      return;
    }

    for (const item of items) {
      if (!item.food) continue;
      const payload = {
        foodName:  `${item.food.name} (${item.quantity} ${UNIT_LABELS[item.unit]})`,
        emoji:     item.food.emoji,
        quantity:  item.quantity,
        unit:      item.unit,
        nutrition: item.nutrition,
        source,
      } as const;
      const entry = isFirebaseConfigured && user.id !== 'dev_user'
        ? await addMealEntry(user.id, goals, payload)
        : {
            ...payload,
            id: generateId(),
            userId: user.id,
            addedAt: new Date(),
          };
      addEntryFn(entry);
    }
  }

  async function handleVoiceConfirm(items: MealDraft[]) {
    if (items.length === 0) {
      Alert.alert('Não entendi os alimentos', 'Tente falar com quantidade e nome do alimento, por exemplo: 2 ovos e 1 fatia de pão.');
      return;
    }
    await saveDraftItems(items, 'voice');
  }

  async function handlePhotoConfirm(items: MealDraft[]) {
    await saveDraftItems(items, 'photo');
  }

  async function quickAdd(mealId: string) {
    if (!user || !goals) return;
    const meal = savedMeals.find((m) => m.id === mealId);
    if (!meal) return;
    if (isFirebaseConfigured && user.id !== 'dev_user') {
      await incrementMealUsage(mealId);
    }
    for (const e of meal.entries) {
      const payload = { ...e, source: 'saved', savedMealId: mealId } as const;
      const entry = isFirebaseConfigured && user.id !== 'dev_user'
        ? await addMealEntry(user.id, goals, payload)
        : {
            ...payload,
            id: generateId(),
            userId: user.id,
            addedAt: new Date(),
          };
      addEntryFn(entry);
    }
  }

  async function handleDeleteEntry(entry: MealEntry) {
    if (user && goals && isFirebaseConfigured && user.id !== 'dev_user') {
      try {
        await removeMealEntry(user.id, goals, entry);
      } catch {
        Alert.alert('Erro', 'Não foi possível remover este alimento do Firebase.');
        return;
      }
    }
    removeEntry(entry.id);
  }

  const entries = todayLog?.entries ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Registrar refeição</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Buttons */}
        <TouchableOpacity style={styles.btnManual} onPress={() => setAddModal(true)}>
          <MaterialIcons name="edit-note" size={24} color={Colors.white} />
          <Text style={styles.btnManualText}>Digitar o que comi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnVoice} onPress={() => setVoiceModal(true)}>
          <MaterialIcons name="mic" size={22} color={Colors.purpleD} />
          <Text style={styles.btnVoiceText}>Falar o que comi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPhoto} onPress={() => setPhotoModal(true)}>
          <MaterialIcons name="photo-camera" size={22} color={Colors.green600} />
          <Text style={styles.btnPhotoText}>Fotografar prato</Text>
        </TouchableOpacity>

        {/* Saved meals */}
        {savedMeals.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Refeições salvas</Text>
            {savedMeals.map((m) => (
              <View key={m.id} style={styles.savedCard}>
                <View style={styles.savedLeft}>
                  <Text style={styles.savedEmoji}>{m.emoji}</Text>
                  <View>
                    <Text style={styles.savedName}>{m.name}</Text>
                    <Text style={styles.savedInfo}>
                      {Math.round(m.totalNutrition.kcal)} kcal · P:{Math.round(m.totalNutrition.protein)}g
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.quickAddBtn} onPress={() => quickAdd(m.id)}>
                  <Text style={styles.quickAddTxt}>+ Adicionar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Today log */}
        <Text style={styles.sectionLabel}>Registro de hoje ({entries.length})</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyLog}>
            <Text style={styles.emptyLogText}>Nenhum alimento registrado</Text>
          </View>
        ) : (
          <View style={styles.logList}>
            {entries.slice().reverse().map((entry) => (
              <TodayEntry key={entry.id} entry={entry} onDelete={() => handleDeleteEntry(entry)} />
            ))}
          </View>
        )}
      </ScrollView>

      <AddMealModal visible={addModal} onClose={() => setAddModal(false)} onAdded={() => {}} />
      <VoiceModal   visible={voiceModal} onClose={() => setVoiceModal(false)} onConfirm={handleVoiceConfirm} />
      <PhotoModal   visible={photoModal} onClose={() => setPhotoModal(false)} onConfirm={handlePhotoConfirm} />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  headerBar:   { width: '100%', maxWidth: Platform.OS === 'web' ? 760 : undefined, alignSelf: 'center', backgroundColor: Colors.white, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold },
  scroll:      { width: '100%', maxWidth: Platform.OS === 'web' ? 760 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: 100 },

  btnManual: {
    backgroundColor: Colors.green400, borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginBottom: Spacing.sm,
    flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm,
  },
  btnManualText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
  btnVoice: {
    backgroundColor: Colors.purpleL, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.purple,
    flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm,
  },
  btnVoiceText: { color: Colors.purpleD, fontSize: Typography.base, fontWeight: Typography.semibold },
  btnPhoto: {
    backgroundColor: Colors.green50, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.lg,
    borderWidth: 1.5, borderColor: Colors.green400,
    flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm,
  },
  btnPhotoText: { color: Colors.green600, fontSize: Typography.base, fontWeight: Typography.semibold },

  sectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },

  savedCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  savedLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  savedEmoji:   { fontSize: 24 },
  savedName:    { fontSize: Typography.md, fontWeight: Typography.semibold },
  savedInfo:    { fontSize: Typography.xs, color: Colors.gray400 },
  quickAddBtn:  { backgroundColor: Colors.green50, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.green400 },
  quickAddTxt:  { color: Colors.green600, fontSize: Typography.sm, fontWeight: Typography.semibold },

  emptyLog:     { alignItems: 'center', padding: Spacing.xl },
  emptyLogText: { color: Colors.gray400, fontSize: Typography.md },

  logList: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
});

const logStyle = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  emoji:    { fontSize: 24, width: 36, textAlign: 'center' },
  info:     { flex: 1 },
  infoTop:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  timeBadge:{ backgroundColor: Colors.gray50, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  timeTxt:  { fontSize: Typography.xs, color: Colors.gray400 },
  name:     { fontSize: Typography.md, fontWeight: Typography.semibold },
  macros:   { fontSize: Typography.xs, color: Colors.gray400 },
  right:    { alignItems: 'flex-end', gap: 2 },
  kcal:     { fontSize: Typography.md, fontWeight: Typography.bold },
  kcalLabel:{ fontSize: Typography.xs, color: Colors.gray400 },
  delBtn:   { marginTop: 4, padding: 4 },
  delTxt:   { color: Colors.gray400, fontSize: Typography.sm },
});

const modal = StyleSheet.create({
  bg:       { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:    { height: '92%', width: '100%', maxWidth: Platform.OS === 'web' ? 720 : undefined, alignSelf: 'center', backgroundColor: Colors.white, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.base, paddingBottom: Spacing.lg },
  handle:   { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.base },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.base },
  title:    { fontSize: Typography.lg, fontWeight: Typography.bold },
  subtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  closePill: { backgroundColor: Colors.gray50, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  closePillText: { color: Colors.gray600, fontWeight: Typography.semibold, fontSize: Typography.sm },
  label:    { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray400, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  subLabel: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.semibold, marginBottom: 6 },
  input:    { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.md, fontSize: Typography.base, marginBottom: Spacing.sm },
  chipsScroll: { marginBottom: Spacing.sm },
  chips:    { flexDirection: 'row', gap: 6, paddingRight: Spacing.base },
  chip:     { backgroundColor: Colors.green50, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.green600 },
  searchPanel: { flexShrink: 0 },
  suggestionBox: { flex: 1, minHeight: 160, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm, backgroundColor: Colors.white },
  foodOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  foodOptionActive: { backgroundColor: Colors.green50 },
  foodEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  foodInfo: { flex: 1 },
  foodName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gray800 },
  foodNameActive: { color: Colors.green600 },
  foodUnit: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  noResults: { padding: Spacing.md, alignItems: 'center' },
  noResultsText: { fontSize: Typography.sm, color: Colors.gray400 },
  bottomPanel: { flexShrink: 0, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  qtyRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  qtyField: { width: 120 },
  qtyHintBox: { flex: 1, backgroundColor: Colors.gray50, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.sm },
  qtyHintTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray600, marginBottom: 2 },
  qtyHint: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16 },
  unitWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  unitChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.white },
  unitChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  unitChipText: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.semibold },
  unitChipTextActive: { color: Colors.green600 },

  estimateBox:  { backgroundColor: Colors.green50, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm },
  estimateTitle:{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.green600, marginBottom: Spacing.xs },
  estimateGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  estItem:      { alignItems: 'center' },
  estVal:       { fontSize: Typography.base, fontWeight: Typography.bold },
  estLabel:     { fontSize: Typography.xs, color: Colors.gray400 },

  actions:     { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  btnCancel:   { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  btnCancelText: { fontSize: Typography.base, color: Colors.gray600 },
  btnAdd:      { flex: 2, backgroundColor: Colors.green400, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnAddText:  { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
});

const voiceModal = StyleSheet.create({
  circle:       { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.purpleL, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderWidth: 3, borderColor: Colors.purple, marginVertical: Spacing.md },
  circleActive: { backgroundColor: Colors.purple },
  tip:          { textAlign: 'center', fontSize: Typography.sm, color: Colors.gray400, marginBottom: Spacing.sm },
  transcript:   { backgroundColor: Colors.gray50, borderRadius: Radius.sm, padding: Spacing.md, minHeight: 60, marginBottom: Spacing.md },
  transcriptText: { fontSize: Typography.md, color: Colors.gray800 },
  exTitle:      { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  example:      { fontSize: Typography.sm, color: Colors.gray600, fontStyle: 'italic', marginBottom: 4, backgroundColor: Colors.gray50, borderRadius: 6, padding: 6 },
  previewBox:   { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  previewEmpty: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  previewRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  previewInfo:  { flex: 1 },
  previewName:  { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.gray800 },
  previewMeta:  { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  editCard:     { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm },
  editHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  foodInput:    { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 7, fontSize: Typography.sm, color: Colors.gray800, backgroundColor: Colors.white },
  inputError:   { borderColor: Colors.danger, backgroundColor: Colors.proteinL },
  errorText:    { fontSize: Typography.xs, color: Colors.danger, marginTop: 3 },
  removeBtn:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  editRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  quantityEdit: { width: 86 },
  unitEdit:     { flex: 1 },
  smallLabel:   { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.semibold, marginBottom: 4 },
  quantityInput:{ borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 7, fontSize: Typography.sm, color: Colors.gray800 },
  unitRow:      { flexDirection: 'row', gap: 6, paddingRight: Spacing.sm },
  unitMiniChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 7, backgroundColor: Colors.white },
  unitMiniChipActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  unitMiniText: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.semibold },
  unitMiniTextActive: { color: Colors.green600 },
  spokenText:   { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3, fontStyle: 'italic' },
});

const photoModal = StyleSheet.create({
  photoActions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  photoButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.green400,
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  photoButtonText: { color: Colors.green600, fontSize: Typography.sm, fontWeight: Typography.bold },
  previewImage: {
    width: '100%',
    height: 170,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    marginBottom: Spacing.sm,
  },
  emptyImage: {
    height: 150,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyImageText: { marginTop: Spacing.xs, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.green50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  loadingText: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.semibold },
  summary: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
