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
import { FoodItem, MealPeriod, QuantityUnit } from "../../../types";
import { formatNutritionDetails } from "../../../utils/nutrition";
import { isAiLimitError, showAiLimitAlert } from "../../../utils/aiErrors";
import { FoodIcon } from "../../../components/FoodIcon";
import { MealDraft } from "../types";
import { findBestFood, findAnyFood, parseOptionalQtyInput } from "../utils/foodSearch";
import {
  getFoodUnits,
  loadSpeechRecognitionModule,
  recalcMealDraft,
  getDefaultMealPeriod,
} from "../utils/mealUtils";
import { parseVoiceMeal, compatibleDetectedUnit } from "../utils/voiceParser";
import { modal, voiceModal } from "../styles";
import { MealPeriodPicker } from "./AddMealModal";

// ─── Voice Modal ──────────────────────────────────────────────────────────────

function VoiceModal({
  visible,
  onClose,
  onConfirm,
  customFoods,
  onCreateFood,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (
    items: MealDraft[],
    mealPeriod: MealPeriod,
  ) => Promise<void> | void;
  customFoods: FoodItem[];
  onCreateFood: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );
  const speechModule = React.useMemo(loadSpeechRecognitionModule, []);
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);

  React.useEffect(() => {
    if (!visible) return;
    setTranscript("");
    setEditableDrafts([]);
    setAddedCount(0);
    setConfirming(false);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  React.useEffect(() => {
    setEditableDrafts(parseVoiceMeal(transcript, customFoods));
  }, [customFoods, transcript]);

  async function resolveDraftWithAi(item: MealDraft) {
    setEditableDrafts((items) =>
      items.map((draft) =>
        draft.key === item.key
          ? {
              ...draft,
              resolving: true,
              resolveFailed: false,
              sourceNote: "Cadastrando alimento com IA...",
            }
          : draft,
      ),
    );

    try {
      const food = await onCreateFood(item.foodText, item.unit);
      setEditableDrafts((items) =>
        items.map((draft) => {
          if (draft.key !== item.key) return draft;
          const unit = food.nutritionPer[draft.unit]
            ? draft.unit
            : food.defaultUnit;
          return recalcMealDraft(
            {
              ...draft,
              food,
              foodText: food.name,
              foodFound: true,
              resolving: false,
              resolveFailed: false,
              sourceNote: "IA cadastrou este alimento nos seus alimentos.",
            },
            { unit },
          );
        }),
      );
    } catch (error) {
      console.warn("Voice AI food creation failed", error);
      if (isAiLimitError(error)) {
        showAiLimitAlert();
      }
      setEditableDrafts((items) =>
        items.map((draft) =>
          draft.key === item.key
            ? {
                ...draft,
                resolving: false,
                resolveFailed: true,
                sourceNote: isAiLimitError(error)
                  ? "Limite de IA atingido. Revise o alimento manualmente."
                  : "Não consegui cadastrar este alimento automaticamente.",
              }
            : draft,
        ),
      );
    }
  }

  React.useEffect(() => {
    if (!speechModule) return undefined;

    const startSub = speechModule.addListener("start", () =>
      setListening(true),
    );
    const endSub = speechModule.addListener("end", () => setListening(false));
    const resultSub = speechModule.addListener("result", (event) => {
      setTranscript(event.results[0]?.transcript ?? "");
    });
    const errorSub = speechModule.addListener("error", (event) => {
      setListening(false);
      console.warn("Voice error", event);
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
        "Voz indisponível no Expo Go",
        "O reconhecimento de voz precisa de uma development build. Preenchi um exemplo para você testar a confirmação.",
      );
      setTranscript(
        "4 colheres de arroz, 1 concha de feijão e 1 filé de frango",
      );
      return;
    }

    if (listening) {
      speechModule.stop();
      setListening(false);
    } else {
      setTranscript("");
      try {
        const permission = await speechModule.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permissão necessária",
            "Autorize o microfone para registrar refeições por voz.",
          );
          return;
        }
        speechModule.start({
          lang: "pt-BR",
          interimResults: true,
          continuous: false,
        });
      } catch (e) {
        // Fallback simulation in dev
        console.warn("Voice fallback", e);
        setTranscript("4 colheres de arroz e 1 filé de frango médio");
      }
    }
  }

  async function confirm() {
    const itemsToSave = editableDrafts;
    setConfirming(true);
    try {
      await onConfirm(itemsToSave, mealPeriod);
      setAddedCount((count) => count + itemsToSave.length);
      setTranscript("");
      setEditableDrafts([]);
    } finally {
      setConfirming(false);
    }
  }

  function updateDraft(key: string, updater: (item: MealDraft) => MealDraft) {
    setEditableDrafts((items) =>
      items.map((item) => (item.key === key ? updater(item) : item)),
    );
  }

  function removeDraft(key: string) {
    setEditableDrafts((items) => items.filter((item) => item.key !== key));
  }

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found =
        findBestFood(value, customFoods, 24) ?? findAnyFood(value, customFoods);
      if (!found) {
        return {
          ...item,
          foodText: value,
          foodFound: false,
          resolveFailed: false,
        };
      }
      const unit = compatibleDetectedUnit(found, item.unit);
      return recalcMealDraft(item, {
        food: found,
        foodText: value,
        foodFound: true,
        unit,
      });
    });
  }

  function updateDraftQuantity(key: string, value: string) {
    updateDraft(key, (item) =>
      recalcMealDraft(item, {
        quantityText: value,
        quantity: parseOptionalQtyInput(value),
      }),
    );
  }

  function updateDraftUnit(key: string, nextUnit: QuantityUnit) {
    updateDraft(key, (item) => recalcMealDraft(item, { unit: nextUnit }));
  }

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
              <Text style={modal.title}>Fale o que você comeu</Text>
              <Text style={modal.subtitle}>
                {addedCount > 0
                  ? `${addedCount} alimento(s) adicionados hoje`
                  : "Diga vários alimentos na mesma frase."}
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
            <TouchableOpacity
              style={[voiceModal.circle, listening && voiceModal.circleActive]}
              onPress={toggle}
            >
              <MaterialIcons
                name={listening ? "stop" : "mic"}
                size={40}
                color={listening ? Colors.white : Colors.purpleD}
              />
            </TouchableOpacity>

            <Text style={voiceModal.tip}>
              {listening
                ? "Ouvindo... fale agora"
                : "Toque para começar a falar"}
            </Text>

            <View style={voiceModal.transcript}>
              <Text style={voiceModal.transcriptText}>
                {transcript || "Aguardando..."}
              </Text>
            </View>

            <View style={voiceModal.previewBox}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
              <Text style={voiceModal.exTitle}>Itens detectados</Text>
              {editableDrafts.length === 0 ? (
                <Text style={voiceModal.previewEmpty}>
                  Fale algo como: "4 colheres de arroz, 1 concha de feijão e 1
                  filé de frango".
                </Text>
              ) : (
                editableDrafts.map((item) => (
                  <View key={item.key} style={voiceModal.editCard}>
                    <View style={voiceModal.editHeader}>
                      <View style={voiceModal.previewEmoji}>
                        <FoodIcon
                          name={item.food?.name ?? item.foodText}
                          emoji={item.food?.emoji}
                        />
                      </View>
                      <View style={voiceModal.previewInfo}>
                        <TextInput
                          style={[
                            voiceModal.foodInput,
                            !item.foodFound && voiceModal.inputError,
                          ]}
                          value={item.foodText}
                          onChangeText={(value) =>
                            updateDraftFood(item.key, value)
                          }
                          placeholder="Alimento"
                          placeholderTextColor={Colors.gray400}
                        />
                        {!item.foodFound && (
                          <Text style={voiceModal.errorText}>
                            {item.resolving
                              ? "Cadastrando com IA..."
                              : "Alimento ainda sem cadastro."}
                          </Text>
                        )}
                        {!item.foodFound && !item.resolving && (
                          <TouchableOpacity
                            style={voiceModal.aiCreateBtn}
                            onPress={() => resolveDraftWithAi(item)}
                          >
                            <MaterialIcons
                              name="auto-awesome"
                              size={15}
                              color={Colors.green600}
                            />
                            <Text style={voiceModal.aiCreateText}>
                              Cadastrar com IA
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={voiceModal.removeBtn}
                        onPress={() => removeDraft(item.key)}
                      >
                        <MaterialIcons
                          name="close"
                          size={18}
                          color={Colors.gray600}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={voiceModal.editRow}>
                      <View style={voiceModal.quantityEdit}>
                        <Text style={voiceModal.smallLabel}>Qtd.</Text>
                        <TextInput
                          style={voiceModal.quantityInput}
                          value={item.quantityText}
                          onChangeText={(value) =>
                            updateDraftQuantity(item.key, value)
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={Colors.gray400}
                        />
                      </View>
                      <View style={voiceModal.unitEdit}>
                        <Text style={voiceModal.smallLabel}>Unidade</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          <View style={voiceModal.unitRow}>
                            {getFoodUnits(item.food).map((unitOption) => (
                              <TouchableOpacity
                                key={unitOption}
                                style={[
                                  voiceModal.unitMiniChip,
                                  item.unit === unitOption &&
                                    voiceModal.unitMiniChipActive,
                                ]}
                                onPress={() =>
                                  updateDraftUnit(item.key, unitOption)
                                }
                              >
                                <Text
                                  style={[
                                    voiceModal.unitMiniText,
                                    item.unit === unitOption &&
                                      voiceModal.unitMiniTextActive,
                                  ]}
                                >
                                  {UNIT_LABELS[unitOption]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>

                    <Text style={voiceModal.previewMeta}>
                      {formatNutritionDetails(item.nutrition, {
                        includeKcal: true,
                      })}
                    </Text>
                    {item.sourceNote ? (
                      <Text style={voiceModal.spokenText}>
                        {item.sourceNote}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            <Text style={voiceModal.exTitle}>Dicas rápidas</Text>
            <Text style={voiceModal.example}>
              Use frases como "2 ovos", "100 gramas de frango", "1 xícara de
              leite".
            </Text>
            <Text style={voiceModal.example}>
              Se não falar quantidade, o app usa a porção padrão daquele
              alimento.
            </Text>
          </ScrollView>

          <View style={modal.actions}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modal.btnAdd,
                (editableDrafts.length === 0 ||
                  hasInvalidDraft ||
                  confirming) &&
                  modal.btnDisabled,
              ]}
              onPress={confirm}
              disabled={
                editableDrafts.length === 0 || hasInvalidDraft || confirming
              }
            >
              {confirming ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={modal.btnAddText}>Adicionar e continuar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default VoiceModal;
