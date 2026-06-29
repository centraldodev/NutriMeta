import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Radius, Spacing, Typography } from "../../../constants/theme";
import { calculateNutrition, UNIT_LABELS } from "../../../constants/foodDatabase";
import { FoodItem, MealPeriod, QuantityUnit } from "../../../types";
import { formatNutritionDetails } from "../../../utils/nutrition";
import { isAiLimitError, showAiLimitAlert } from "../../../utils/aiErrors";
import { analyzeMealPhoto } from "../../../services/photoMealAiService";
import { FoodIcon } from "../../../components/FoodIcon";
import { MealDraft } from "../types";
import { findBestFood, findAnyFood, parseOptionalQtyInput } from "../utils/foodSearch";
import {
  getFoodUnits,
  recalcMealDraft,
  createAiFood,
  getDefaultMealPeriod,
  emptyNutrition,
} from "../utils/mealUtils";
import { compatibleDetectedUnit } from "../utils/voiceParser";
import { modal, voiceModal } from "../modalStyles";
import { MealPeriodPicker } from "./MealPeriodPicker";
import { BottomSheet } from "../../../components/BottomSheet";
import { ModalActionBar } from "../../../components/ModalActionBar";

const photoModal = StyleSheet.create({
  photoActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  photoButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.green400,
    borderRadius: Radius.md,
    backgroundColor: Colors.green50,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  photoButtonText: {
    color: Colors.green600,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  previewImage: {
    width: "100%",
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
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyImageText: {
    marginTop: Spacing.xs,
    fontSize: Typography.sm,
    color: Colors.gray400,
    textAlign: "center",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.green50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  loadingText: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.semibold,
  },
  summary: {
    fontSize: Typography.sm,
    color: Colors.gray600,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  captionBox: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  captionLabel: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  captionInput: {
    minHeight: 58,
    fontSize: Typography.sm,
    color: Colors.gray800,
    lineHeight: 19,
    textAlignVertical: "top",
  },
});

// ─── Photo Modal ──────────────────────────────────────────────────────────────

export function PhotoModal({
  visible,
  onClose,
  onConfirm,
  customFoods,
  onCreateFood,
  allowPhotoOnlyPost = false,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (
    items: MealDraft[],
    mealPeriod: MealPeriod,
    photo?: {
      imageUri: string;
      mimeType?: string;
      summary: string;
      caption: string;
    },
  ) => Promise<void> | void;
  customFoods: FoodItem[];
  onCreateFood?: (
    foodName: string,
    preferredUnit: QuantityUnit,
  ) => Promise<FoodItem>;
  allowPhotoOnlyPost?: boolean;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>();
  const [summary, setSummary] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [editableDrafts, setEditableDrafts] = useState<MealDraft[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(
    getDefaultMealPeriod(),
  );
  const hasInvalidDraft = editableDrafts.some((item) => !item.foodFound);
  const canConfirmPhotoOnly =
    allowPhotoOnlyPost && Boolean(imageUri) && postCaption.trim().length > 0;
  const canConfirm =
    !analyzing &&
    !confirming &&
    !hasInvalidDraft &&
    (editableDrafts.length > 0 || canConfirmPhotoOnly);

  React.useEffect(() => {
    if (!visible) return;
    setImageUri(null);
    setImageMimeType(undefined);
    setSummary("");
    setPostCaption("");
    setAnalyzing(false);
    setEditableDrafts([]);
    setAddedCount(0);
    setConfirming(false);
    setMealPeriod(getDefaultMealPeriod());
  }, [visible]);

  async function pickImage(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permissão necessária",
        source === "camera"
          ? "Autorize a câmera para registrar refeições por foto."
          : "Autorize o acesso às fotos para escolher uma imagem do prato.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
          });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert(
        "Imagem inválida",
        "Não consegui preparar esta foto para análise.",
      );
      return;
    }

    setImageUri(asset.uri);
    setImageMimeType(asset.mimeType ?? "image/jpeg");
    await analyzePhoto(asset.base64, asset.mimeType ?? "image/jpeg");
  }

  async function analyzePhoto(base64: string, mimeType: string) {
    setAnalyzing(true);
    setSummary("");
    setPostCaption("");
    setEditableDrafts([]);
    try {
      const result = await analyzeMealPhoto(base64, mimeType);
      setSummary(result.summary ?? "");
      const drafts = result.items.map((item, index) => {
        const foundFood =
          findBestFood(item.foodName, customFoods, 24) ??
          findAnyFood(item.foodName, customFoods);
        const food = foundFood ?? createAiFood(item, index);
        const unit = food ? compatibleDetectedUnit(food, item.unit) : item.unit;
        const quantity = item.quantity > 0 ? item.quantity : 1;
        const isAiCreated = !foundFood && Boolean(food);
        const linkedToBase = Boolean(foundFood);
        return {
          key: `photo_${index}_${item.foodName}_${quantity}_${unit}`,
          food,
          foodText: food?.name ?? item.foodName,
          foodFound: Boolean(food),
          quantityText: String(quantity).replace(".", ","),
          quantity,
          unit,
          nutrition: food
            ? calculateNutrition(food, quantity, unit)
            : emptyNutrition(),
          sourceNote: item.notes
            ? `IA: ${item.notes}${linkedToBase ? ` · vinculado à base como ${food?.name}` : ""}${isAiCreated ? " · alimento cadastrado por estimativa" : ""}${item.confidence != null ? ` · confiança ${Math.round(item.confidence * 100)}%` : ""}`
            : item.confidence != null
              ? `IA: ${linkedToBase ? `vinculado à base · ` : ""}${isAiCreated ? "alimento cadastrado por estimativa · " : ""}confiança ${Math.round(item.confidence * 100)}%`
              : linkedToBase
                ? `IA: vinculado à base como ${food?.name}`
                : isAiCreated
                  ? "IA: alimento cadastrado por estimativa nutricional"
                  : undefined,
        };
      });
      setEditableDrafts(drafts);
      if (drafts.length === 0) {
        Alert.alert(
          "Nada identificado",
          "Tente uma foto mais clara do prato ou adicione manualmente.",
        );
      }
    } catch (e) {
      console.warn("Photo meal analysis failed", e);
      if (isAiLimitError(e)) {
        showAiLimitAlert();
        return;
      }
      Alert.alert(
        "Erro ao analisar foto",
        "Não consegui identificar o prato agora. Tente novamente ou use a entrada manual.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function confirm() {
    const itemsToSave = editableDrafts;
    const caption = postCaption.trim() || summary;
    const photo = imageUri
      ? { imageUri, mimeType: imageMimeType, summary, caption }
      : undefined;
    setConfirming(true);
    try {
      await onConfirm(itemsToSave, mealPeriod, photo);
      setAddedCount((count) => count + itemsToSave.length);
      setImageUri(null);
      setImageMimeType(undefined);
      setSummary("");
      setPostCaption("");
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

  async function resolveDraftWithAi(item: MealDraft) {
    if (!onCreateFood) return;
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
      console.warn("Photo AI food creation failed", error);
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

  function updateDraftFood(key: string, value: string) {
    updateDraft(key, (item) => {
      const found =
        findBestFood(value, customFoods, 24) ?? findAnyFood(value, customFoods);
      if (!found) {
        return {
          ...item,
          food: null,
          foodText: value,
          foodFound: false,
          resolveFailed: false,
          nutrition: emptyNutrition(),
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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Foto do prato"
      subtitle={
        addedCount > 0
          ? `${addedCount} alimento(s) adicionados hoje`
          : "A IA identifica e você confere antes de salvar."
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
            <View style={photoModal.photoActions}>
              <TouchableOpacity
                style={photoModal.photoButton}
                onPress={() => pickImage("camera")}
                disabled={analyzing}
              >
                <MaterialIcons
                  name="photo-camera"
                  size={22}
                  color={Colors.green600}
                />
                <Text style={photoModal.photoButtonText}>Tirar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={photoModal.photoButton}
                onPress={() => pickImage("library")}
                disabled={analyzing}
              >
                <MaterialIcons
                  name="photo-library"
                  size={22}
                  color={Colors.green600}
                />
                <Text style={photoModal.photoButtonText}>Galeria</Text>
              </TouchableOpacity>
            </View>

            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={photoModal.previewImage}
                resizeMode="cover"
              />
            ) : (
              <View style={photoModal.emptyImage}>
                <MaterialIcons
                  name="restaurant"
                  size={34}
                  color={Colors.gray400}
                />
                <Text style={photoModal.emptyImageText}>
                  Escolha uma foto clara do prato para começar.
                </Text>
              </View>
            )}

            {analyzing && (
              <View style={photoModal.loadingBox}>
                <ActivityIndicator color={Colors.green400} />
                <Text style={photoModal.loadingText}>
                  Analisando alimentos e porções...
                </Text>
              </View>
            )}

            {summary ? <Text style={photoModal.summary}>{summary}</Text> : null}

            {imageUri ? (
              <View style={photoModal.captionBox}>
                <Text style={photoModal.captionLabel}>
                  Título ou descrição do post
                </Text>
                <TextInput
                  style={photoModal.captionInput}
                  value={postCaption}
                  onChangeText={setPostCaption}
                  placeholder="Ex: Almoço de hoje com arroz, feijão e frango"
                  placeholderTextColor={Colors.gray400}
                  multiline
                  maxLength={180}
                />
              </View>
            ) : null}

            <View style={voiceModal.previewBox}>
              <MealPeriodPicker value={mealPeriod} onChange={setMealPeriod} />
              <Text style={voiceModal.exTitle}>Itens detectados</Text>
              {editableDrafts.length === 0 ? (
                <Text style={voiceModal.previewEmpty}>
                  {allowPhotoOnlyPost
                    ? "Se a IA não identificar alimentos, você ainda pode publicar a foto usando a descrição acima."
                    : "Depois da análise, confira os alimentos aqui e ajuste o que precisar."}
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
                              : "Alimento não encontrado na base."}
                          </Text>
                        )}
                        {!item.foodFound && !item.resolving && onCreateFood && (
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
          </ScrollView>

      <ModalActionBar
        onCancel={onClose}
        onConfirm={confirm}
        cancelLabel="Fechar"
        confirmLabel={
          editableDrafts.length === 0 && canConfirmPhotoOnly
            ? "Publicar foto"
            : "Adicionar e continuar"
        }
        loading={confirming}
        disabled={!canConfirm}
      />
    </BottomSheet>
  );
}
