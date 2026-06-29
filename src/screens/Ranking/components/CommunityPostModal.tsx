import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { UNIT_LABELS } from '../../../constants/foodDatabase';
import { analyzeMealPhoto } from '../../../services/photoMealAiService';
import { formatNutritionDetails, getInitials, sumNutrition } from '../../../utils/nutrition';
import { isAiLimitError, showAiLimitAlert } from '../../../utils/aiErrors';
import { CommunityPost, MealPeriod } from '../../../types';
import { CommunityDetectedFood, FriendOption, VISIBILITY_OPTIONS } from '../types';
import { getDefaultMealPeriod, multiplyNutrition } from '../utils/communityUtils';
import { modalStyles } from '../styles';
import { BottomSheet } from '../../../components/BottomSheet';
import { ModalActionBar } from '../../../components/ModalActionBar';
import { SearchInput } from '../../../components/SearchInput';

export function CommunityPostModal({
  visible,
  onClose,
  onPublish,
  onUpdate,
  editingPost,
  friends,
}: {
  visible: boolean;
  onClose: () => void;
  onPublish: (post: {
    imageUri: string;
    mimeType?: string;
    caption: string;
    visibility: NonNullable<CommunityPost['visibility']>;
    mealPeriod: MealPeriod;
    items: CommunityDetectedFood[];
    taggedUserIds: string[];
    taggedUserNames: string[];
  }) => Promise<void>;
  onUpdate: (post: {
    postId: string;
    caption: string;
    visibility: NonNullable<CommunityPost['visibility']>;
    taggedUserIds: string[];
    taggedUserNames: string[];
  }) => Promise<void>;
  editingPost?: CommunityPost | null;
  friends: FriendOption[];
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>();
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<NonNullable<CommunityPost['visibility']>>('public');
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(getDefaultMealPeriod());
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [items, setItems] = useState<CommunityDetectedFood[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setImageUri(editingPost?.imageUrl ?? null);
    setImageBase64(null);
    setImageMimeType(undefined);
    setCaption(editingPost?.caption ?? '');
    setVisibility(editingPost?.visibility ?? 'public');
    setMealPeriod(editingPost?.mealPeriod ?? getDefaultMealPeriod());
    setTaggedUserIds(editingPost?.taggedUserIds ?? []);
    setTagSearch('');
    setItems([]);
    setAnalyzing(false);
    setPublishing(false);
  }, [editingPost, visible]);

  async function pickImage(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permissão necessária',
        source === 'camera'
          ? 'Autorize a câmera para publicar uma foto.'
          : 'Autorize o acesso às fotos para escolher uma imagem.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.55,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.55,
            base64: true,
          });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri || !asset.base64) {
      Alert.alert('Imagem inválida', 'Não consegui preparar esta foto para o post.');
      return;
    }

    setImageUri(asset.uri);
    setImageBase64(asset.base64);
    setImageMimeType(asset.mimeType ?? 'image/jpeg');
    setItems([]);
  }

  async function analyzePhoto() {
    if (!imageBase64) {
      Alert.alert('Foto necessária', 'Escolha uma foto antes de analisar com IA.');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeMealPhoto(imageBase64, imageMimeType ?? 'image/jpeg');
      if (result.summary && !caption.trim()) setCaption(result.summary);
      setItems(
        result.items.map((item, index) => ({
          key: `${item.foodName}_${index}_${Date.now()}`,
          name: item.foodName,
          quantity: item.quantity,
          unit: item.unit,
          nutrition: multiplyNutrition(item.nutritionPerUnit, item.quantity),
          confidence: item.confidence,
        })),
      );
      if (result.items.length === 0) {
        Alert.alert('Nada identificado', 'A IA não encontrou alimentos claros na foto.');
      }
    } catch (error) {
      console.warn('Community post photo analysis failed', error);
      if (isAiLimitError(error)) showAiLimitAlert();
      else Alert.alert('Erro ao analisar', 'Não consegui analisar esta foto agora.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function publish() {
    if (!editingPost && !imageUri) {
      Alert.alert('Foto necessária', 'Escolha uma foto para publicar.');
      return;
    }
    if (!caption.trim()) {
      Alert.alert('Descrição necessária', 'Escreva uma descrição para o post.');
      return;
    }
    setPublishing(true);
    try {
      const taggedUserNames = friends
        .filter((friend) => taggedUserIds.includes(friend.id))
        .map((friend) => friend.name);
      if (editingPost) {
        await onUpdate({
          postId: editingPost.id,
          caption: caption.trim(),
          visibility,
          taggedUserIds,
          taggedUserNames,
        });
        onClose();
        return;
      }
      await onPublish({
        imageUri: imageUri as string,
        mimeType: imageMimeType,
        caption: caption.trim(),
        visibility,
        mealPeriod,
        items,
        taggedUserIds,
        taggedUserNames,
      });
      onClose();
    } finally {
      setPublishing(false);
    }
  }

  const nutrition = sumNutrition(items.map((item) => ({ nutrition: item.nutrition })));
  const isEditing = Boolean(editingPost);
  const taggedFriends = useMemo(() => {
    return taggedUserIds.map((id) => {
      const friend = friends.find((item) => item.id === id);
      if (friend) return friend;
      const index = editingPost?.taggedUserIds?.indexOf(id) ?? -1;
      const name = index >= 0 ? editingPost?.taggedUserNames?.[index] : undefined;
      return name ? { id, name } : null;
    }).filter(Boolean) as FriendOption[];
  }, [editingPost, friends, taggedUserIds]);
  const tagResults = useMemo(() => {
    const normalized = tagSearch.trim().toLowerCase().replace(/^@+/, '');
    if (!normalized) return [];
    return friends
      .filter((friend) => !taggedUserIds.includes(friend.id))
      .filter((friend) => (
        friend.name.toLowerCase().includes(normalized) ||
        (friend.nickname ?? '').toLowerCase().includes(normalized)
      ))
      .slice(0, 6);
  }, [friends, tagSearch, taggedUserIds]);

  function addTaggedFriend(friend: FriendOption) {
    setTaggedUserIds((ids) => (ids.includes(friend.id) ? ids : [...ids, friend.id]));
    setTagSearch('');
  }

  function removeTaggedFriend(friendId: string) {
    setTaggedUserIds((ids) => ids.filter((id) => id !== friendId));
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Editar post' : 'Novo post'}>
      <ScrollView contentContainerStyle={modalStyles.content} keyboardShouldPersistTaps="handled">
            <Text style={modalStyles.label}>Descrição</Text>
            <TextInput
              style={modalStyles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Conte algo sobre esse prato..."
              placeholderTextColor={Colors.gray400}
              multiline
              maxLength={220}
            />

            <Text style={modalStyles.label}>Foto do post</Text>
            {imageUri ? (
              <View style={modalStyles.postPreviewFrame}>
                <Image source={{ uri: imageUri }} style={modalStyles.postPreview} resizeMode="cover" />
              </View>
            ) : (
              <View style={modalStyles.emptyPhoto}>
                <MaterialIcons name="add-a-photo" size={30} color={Colors.gray400} />
                <Text style={modalStyles.emptyPhotoText}>Escolha uma foto quadrada do prato.</Text>
              </View>
            )}

            {!isEditing ? (
              <View style={modalStyles.photoButtons}>
                <TouchableOpacity style={modalStyles.photoButton} onPress={() => pickImage('camera')}>
                  <MaterialIcons name="photo-camera" size={20} color={Colors.green600} />
                  <Text style={modalStyles.photoButtonText}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.photoButton} onPress={() => pickImage('library')}>
                  <MaterialIcons name="photo-library" size={20} color={Colors.green600} />
                  <Text style={modalStyles.photoButtonText}>Galeria</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isEditing ? (
              <TouchableOpacity
                style={[modalStyles.aiButton, (!imageUri || analyzing) && modalStyles.aiButtonDisabled]}
                onPress={analyzePhoto}
                disabled={!imageUri || analyzing}
              >
                {analyzing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <MaterialIcons name="auto-awesome" size={20} color={Colors.white} />
                )}
                <Text style={modalStyles.aiButtonText}>
                  {analyzing ? 'Analisando foto...' : 'IA: identificar alimentos e nutrientes'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {items.length > 0 ? (
              <View style={modalStyles.detectedBox}>
                <Text style={modalStyles.detectedTitle}>Alimentos identificados</Text>
                {items.map((item) => (
                  <View key={item.key} style={modalStyles.detectedRow}>
                    <View style={modalStyles.detectedInfo}>
                      <Text style={modalStyles.detectedName}>{item.name}</Text>
                      <Text style={modalStyles.detectedMeta}>
                        {item.quantity} {UNIT_LABELS[item.unit]} · {Math.round(item.nutrition.kcal)} kcal
                      </Text>
                    </View>
                    <Text style={modalStyles.detectedConfidence}>
                      {item.confidence != null ? `${Math.round(item.confidence * 100)}%` : ''}
                    </Text>
                  </View>
                ))}
                <Text style={modalStyles.detectedTotal}>
                  Total: {formatNutritionDetails(nutrition, { includeKcal: true })}
                </Text>
              </View>
            ) : null}

            <Text style={modalStyles.label}>Privacidade</Text>
            <View style={modalStyles.visibilityRow}>
              {VISIBILITY_OPTIONS.map((option) => {
                const active = visibility === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[modalStyles.visibilityChip, active && modalStyles.visibilityChipActive]}
                    onPress={() => setVisibility(option.key)}
                  >
                    <MaterialIcons
                      name={option.icon}
                      size={17}
                      color={active ? Colors.green600 : Colors.gray400}
                    />
                    <Text style={[modalStyles.visibilityText, active && modalStyles.visibilityTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={modalStyles.label}>Marcar amigo</Text>
            {friends.length === 0 ? (
              <Text style={modalStyles.emptyFriendsText}>
                Adicione amigos pelo botão de amigos na comunidade para marcar em posts.
              </Text>
            ) : (
              <View>
                <SearchInput
                  value={tagSearch}
                  onChangeText={setTagSearch}
                  placeholder="Buscar amigo por nome ou @nickname"
                />
                {tagResults.length > 0 ? (
                  <View style={modalStyles.tagResults}>
                    {tagResults.map((friend) => (
                      <TouchableOpacity
                        key={friend.id}
                        style={modalStyles.tagResultRow}
                        onPress={() => addTaggedFriend(friend)}
                      >
                        <View style={modalStyles.tagAvatar}>
                          <Text style={modalStyles.tagAvatarText}>{getInitials(friend.name)}</Text>
                        </View>
                        <View style={modalStyles.tagResultInfo}>
                          <Text style={modalStyles.tagResultName}>{friend.name}</Text>
                          {friend.nickname ? (
                            <Text style={modalStyles.tagResultNickname}>@{friend.nickname}</Text>
                          ) : null}
                        </View>
                        <MaterialIcons name="add-circle-outline" size={20} color={Colors.green600} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : tagSearch.trim() ? (
                  <Text style={modalStyles.emptyFriendsText}>Nenhum amigo encontrado.</Text>
                ) : null}
                {taggedFriends.length > 0 ? (
                  <View style={modalStyles.taggedAvatars}>
                    {taggedFriends.map((friend) => (
                      <TouchableOpacity
                        key={friend.id}
                        style={modalStyles.taggedAvatarWrap}
                        onPress={() => removeTaggedFriend(friend.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remover marcação de ${friend.name}`}
                      >
                        <View style={modalStyles.taggedAvatar}>
                          <Text style={modalStyles.tagAvatarText}>{getInitials(friend.name)}</Text>
                        </View>
                        <View style={modalStyles.taggedRemoveBadge}>
                          <MaterialIcons name="close" size={12} color={Colors.white} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

      <ModalActionBar
        onCancel={onClose}
        onConfirm={publish}
        confirmLabel={isEditing ? 'Salvar' : 'Publicar'}
        loading={publishing}
      />
    </BottomSheet>
  );
}
