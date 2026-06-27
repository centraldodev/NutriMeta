import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { UNIT_LABELS } from '../constants/foodDatabase';
import {
  addCommunityComment,
  addCommunityPost,
  deleteCommunityPost,
  findCommunityUserByNickname,
  followCommunityUser,
  subscribeCommunityFriends,
  subscribeCommunityComments,
  subscribeFollowing,
  subscribeCommunityPosts,
  unfollowCommunityUser,
  updateCommunityPost,
} from '../services/groupService';
import { analyzeMealPhoto, PhotoMealAiItem } from '../services/photoMealAiService';
import { useStore } from '../store';
import { formatBrasiliaDate, formatNutritionDetails, getBrasiliaHour, getInitials, sumNutrition } from '../utils/nutrition';
import { isAiLimitError, showAiLimitAlert } from '../utils/aiErrors';
import { CommunityComment, CommunityPost, FoodNutrition, MealPeriod, QuantityUnit } from '../types';

const GLOBAL_COMMUNITY_ID = 'global';
const WEB_FIXED_COMMUNITY_FAB_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed' } as any)
  : null;

const MEAL_LABELS: Record<CommunityPost['mealPeriod'], string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

const VISIBILITY_OPTIONS: {
  key: NonNullable<CommunityPost['visibility']>;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}[] = [
  { key: 'public', label: 'Público', icon: 'public' },
  { key: 'friends', label: 'Amigos', icon: 'people' },
  { key: 'private', label: 'Só eu', icon: 'lock' },
];

type FriendOption = {
  id: string;
  name: string;
  nickname?: string;
};

function getDefaultMealPeriod(): MealPeriod {
  const hour = getBrasiliaHour();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

function multiplyNutrition(nutrition: FoodNutrition | undefined, quantity: number): FoodNutrition {
  const base = nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 };
  const result = {} as FoodNutrition;
  (Object.entries(base) as [keyof FoodNutrition, number | undefined][]).forEach(([key, value]) => {
    if (typeof value === 'number') result[key] = Math.round(value * quantity * 10) / 10 as never;
  });
  result.kcal = Math.round(result.kcal ?? 0);
  return result;
}

function postDateLabel(date: Date): string {
  return formatBrasiliaDate(date, { day: '2-digit', month: '2-digit' });
}

function PostCard({
  post,
  comments,
  commentValue,
  isFollowing,
  isOwnPost,
  onCommentChange,
  onSendComment,
  onToggleFollow,
  onEditPost,
  onDeletePost,
}: {
  post: CommunityPost;
  comments: CommunityComment[];
  commentValue: string;
  isFollowing: boolean;
  isOwnPost: boolean;
  onCommentChange: (value: string) => void;
  onSendComment: () => void;
  onToggleFollow: () => void;
  onEditPost: () => void;
  onDeletePost: () => void;
}) {
  const nutrition = formatNutritionDetails(post.nutrition, { includeKcal: true });
  const foodNames = post.foodNames.filter(Boolean).join(', ');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorInitials || getInitials(post.authorName)}</Text>
        </View>
        <View style={styles.postAuthorWrap}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          {post.authorNickname ? <Text style={styles.postNickname}>@{post.authorNickname}</Text> : null}
          <Text style={styles.postMeta}>{MEAL_LABELS[post.mealPeriod]} · {postDateLabel(post.createdAt)}</Text>
          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        </View>
        {isOwnPost ? (
          <View style={styles.postMenuWrap}>
            <TouchableOpacity
              style={styles.postMenuButton}
              onPress={() => setMenuOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Opções do post"
            >
              <MaterialIcons name="more-horiz" size={22} color={Colors.gray600} />
            </TouchableOpacity>
            {menuOpen ? (
              <View style={styles.postMenu}>
                <TouchableOpacity
                  style={styles.postMenuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    onEditPost();
                  }}
                >
                  <MaterialIcons name="edit" size={18} color={Colors.green600} />
                  <Text style={styles.postMenuText}>Editar post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.postMenuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    onDeletePost();
                  }}
                >
                  <MaterialIcons name="delete-outline" size={18} color={Colors.danger} />
                  <Text style={[styles.postMenuText, styles.postMenuTextDanger]}>Excluir post</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            onPress={onToggleFollow}
          >
            <MaterialIcons
              name={isFollowing ? 'check' : 'person-add-alt-1'}
              size={16}
              color={isFollowing ? Colors.green600 : Colors.white}
            />
            <Text style={[styles.followText, isFollowing && styles.followTextActive]}>
              {isFollowing ? 'Seguindo' : 'Seguir'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.postImageFrame}>
        <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
      </View>

      <View style={styles.postBody}>
        {post.taggedUserNames?.length ? (
          <Text style={styles.taggedText}>
            Com {post.taggedUserNames.join(', ')}
          </Text>
        ) : null}
        {foodNames ? <Text style={styles.foodNames}>{foodNames}</Text> : null}
        {foodNames && nutrition ? <Text style={styles.nutritionText}>{nutrition}</Text> : null}
      </View>

      <View style={styles.commentBlock}>
        {comments.slice(0, 3).map((comment) => (
          <View key={comment.id} style={styles.commentItem}>
            <Text style={styles.commentAuthor}>{comment.authorName}</Text>
            <Text style={styles.commentMessage}>{comment.message}</Text>
          </View>
        ))}
        {comments.length === 0 && <Text style={styles.noComments}>Seja a primeira pessoa a comentar.</Text>}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={commentValue}
            onChangeText={onCommentChange}
            placeholder="Comente sobre o prato..."
            placeholderTextColor={Colors.gray400}
            maxLength={240}
          />
          <TouchableOpacity style={styles.commentSend} onPress={onSendComment}>
            <MaterialIcons name="send" size={17} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

type CommunityDetectedFood = {
  key: string;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: FoodNutrition;
  confidence?: number;
};

function CommunityPostModal({
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{isEditing ? 'Editar post' : 'Novo post'}</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

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
                <View style={modalStyles.tagSearchBox}>
                  <MaterialIcons name="search" size={18} color={Colors.gray400} />
                  <TextInput
                    style={modalStyles.tagSearchInput}
                    value={tagSearch}
                    onChangeText={setTagSearch}
                    placeholder="Buscar amigo por nome ou @nickname"
                    placeholderTextColor={Colors.gray400}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
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

          <View style={modalStyles.actions}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.publishBtn, publishing && modalStyles.aiButtonDisabled]}
              onPress={publish}
              disabled={publishing}
            >
              {publishing ? <ActivityIndicator color={Colors.white} /> : <Text style={modalStyles.publishText}>{isEditing ? 'Salvar' : 'Publicar'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function RankingScreen({
  fabBottomOffset = Spacing.base,
}: {
  fabBottomOffset?: number;
}) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [communityFriends, setCommunityFriends] = useState<FriendOption[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResult, setFriendSearchResult] = useState<FriendOption | null>(null);
  const [friendSearchStatus, setFriendSearchStatus] = useState<'idle' | 'searching' | 'notFound'>('idle');
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends'>('friends');
  const [photoModal, setPhotoModal] = useState(false);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);

  const displayName = profile?.name ?? user?.name ?? 'Usuário';
  const displayNickname = profile?.nickname ?? user?.nickname;

  useEffect(() => {
    if (!isFirebaseConfigured || user?.id === 'dev_user') return undefined;
    return subscribeCommunityPosts(setPosts);
  }, [user?.id]);

  useEffect(() => {
    if (!isFirebaseConfigured || user?.id === 'dev_user') return undefined;
    return subscribeCommunityComments(GLOBAL_COMMUNITY_ID, setComments);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !isFirebaseConfigured || user.id === 'dev_user') return undefined;
    return subscribeFollowing(user.id, setFollowingIds);
  }, [user]);

  useEffect(() => {
    if (!user || !isFirebaseConfigured || user.id === 'dev_user') return undefined;
    return subscribeCommunityFriends(user.id, setCommunityFriends);
  }, [user]);

  const commentsByPost = useMemo(() => {
    const map = new Map<string, CommunityComment[]>();
    comments.forEach((comment) => {
      map.set(comment.targetUserId, [...(map.get(comment.targetUserId) ?? []), comment]);
    });
    return map;
  }, [comments]);

  const filteredPosts = useMemo(() => {
    const visiblePosts = posts.filter((post) => {
      const visibility = post.visibility ?? 'public';
      const isTagged = (post.taggedUserIds ?? []).includes(user?.id ?? '');
      if (post.authorId === user?.id) return true;
      if (isTagged) return true;
      if (visibility === 'private') return false;
      if (visibility === 'friends') return followingIds.includes(post.authorId);
      return true;
    });
    if (feedFilter === 'all') return visiblePosts;
    return visiblePosts.filter((post) => (
      post.authorId === user?.id ||
      followingIds.includes(post.authorId) ||
      (post.taggedUserIds ?? []).includes(user?.id ?? '')
    ));
  }, [feedFilter, followingIds, posts, user?.id]);

  const friendOptions = useMemo<FriendOption[]>(() => {
    const byId = new Map<string, FriendOption>();
    communityFriends.forEach((friend) => {
      byId.set(friend.id, friend);
    });
    posts.forEach((post) => {
      if (!followingIds.includes(post.authorId)) return;
      byId.set(post.authorId, {
        id: post.authorId,
        name: post.authorName,
        nickname: post.authorNickname,
      });
    });
    return Array.from(byId.values()).sort((a, b) => (a.nickname ?? a.name).localeCompare(b.nickname ?? b.name));
  }, [communityFriends, followingIds, posts]);

  async function handleSendComment(postId: string) {
    if (!user) return;
    const message = (commentInputs[postId] ?? '').trim();
    if (!message) return;

    if (!isFirebaseConfigured || user.id === 'dev_user') {
      const localComment: CommunityComment = {
        id: `${postId}_${Date.now()}`,
        groupId: GLOBAL_COMMUNITY_ID,
        targetUserId: postId,
        authorId: user.id,
        authorName: displayName,
        message,
        createdAt: new Date(),
      };
      setComments((items) => [localComment, ...items]);
      setCommentInputs((items) => ({ ...items, [postId]: '' }));
      return;
    }

    try {
      await addCommunityComment(GLOBAL_COMMUNITY_ID, postId, user.id, displayName, message);
      setCommentInputs((items) => ({ ...items, [postId]: '' }));
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o comentário agora.');
    }
  }

  async function handleToggleFollow(authorId: string) {
    if (!user || user.id === authorId) return;
    const isFollowing = followingIds.includes(authorId);
    const postAuthor = posts.find((post) => post.authorId === authorId);

    setFollowingIds((items) => (
      isFollowing ? items.filter((id) => id !== authorId) : [...items, authorId]
    ));

    if (!isFirebaseConfigured || user.id === 'dev_user') return;

    try {
      if (isFollowing) {
        await unfollowCommunityUser(user.id, authorId);
      } else {
        await followCommunityUser(user.id, authorId, postAuthor ? {
          name: postAuthor.authorName,
          nickname: postAuthor.authorNickname,
        } : undefined);
      }
    } catch {
      setFollowingIds((items) => (
        isFollowing ? [...items, authorId] : items.filter((id) => id !== authorId)
      ));
      Alert.alert('Erro', 'Não foi possível atualizar esse perfil agora.');
    }
  }

  async function handleSearchFriend() {
    if (!user) return;
    const query = friendSearch.trim();
    if (!query) return;
    if (!isFirebaseConfigured || user.id === 'dev_user') {
      Alert.alert('Firebase necessário', 'A busca por nickname usa a base de usuários do Firebase.');
      return;
    }

    setFriendSearchStatus('searching');
    setFriendSearchResult(null);
    try {
      const result = await findCommunityUserByNickname(query);
      if (!result || result.id === user.id) {
        setFriendSearchStatus('notFound');
        return;
      }
      setFriendSearchResult(result);
      setFriendSearchStatus('idle');
    } catch {
      setFriendSearchStatus('notFound');
    }
  }

  async function handleAddFriendBySearch(friend: FriendOption) {
    if (!user) return;
    setFollowingIds((items) => (items.includes(friend.id) ? items : [...items, friend.id]));
    setCommunityFriends((items) => (
      items.some((item) => item.id === friend.id)
        ? items
        : [...items, friend].sort((a, b) => (a.nickname ?? a.name).localeCompare(b.nickname ?? b.name))
    ));

    try {
      await followCommunityUser(user.id, friend.id, {
        name: friend.name,
        nickname: friend.nickname,
      });
      setFriendSearch('');
      setFriendSearchResult(null);
      Alert.alert('Amigo adicionado', `@${friend.nickname ?? friend.name} foi adicionado à sua lista.`);
    } catch {
      setFollowingIds((items) => items.filter((id) => id !== friend.id));
      setCommunityFriends((items) => items.filter((item) => item.id !== friend.id));
      Alert.alert('Erro', 'Não foi possível adicionar esse amigo agora.');
    }
  }

  async function handlePublishPost(post: {
    imageUri: string;
    mimeType?: string;
    caption: string;
    visibility: NonNullable<CommunityPost['visibility']>;
    mealPeriod: MealPeriod;
    items: CommunityDetectedFood[];
    taggedUserIds: string[];
    taggedUserNames: string[];
  }) {
    if (!user) {
      Alert.alert('Perfil não carregado', 'Aguarde o app carregar seus dados e tente novamente.');
      return;
    }

    if (!isFirebaseConfigured || user.id === 'dev_user') {
      Alert.alert('Firebase necessário', 'Para publicar no feed, ative o Firebase e use um login real.');
      return;
    }

    try {
      await addCommunityPost({
        authorId: user.id,
        authorName: displayName,
        authorNickname: displayNickname,
        imageUri: post.imageUri,
        imageMimeType: post.mimeType,
        caption: post.caption,
        visibility: post.visibility,
        taggedUserIds: post.taggedUserIds,
        taggedUserNames: post.taggedUserNames,
        nutrition: sumNutrition(post.items.map((item) => ({ nutrition: item.nutrition }))),
        foodNames: post.items.map((item) => item.name).filter(Boolean),
        mealPeriod: post.mealPeriod,
      });
      Alert.alert('Publicado', 'Sua foto foi publicada na comunidade.');
    } catch (error) {
      console.warn('Failed to publish community post', error);
      Alert.alert('Erro', 'Não consegui publicar a foto no feed agora.');
      throw error;
    }
  }

  async function handleUpdatePost(post: {
    postId: string;
    caption: string;
    visibility: NonNullable<CommunityPost['visibility']>;
    taggedUserIds: string[];
    taggedUserNames: string[];
  }) {
    if (!user) return;
    if (!isFirebaseConfigured || user.id === 'dev_user') {
      Alert.alert('Firebase necessário', 'Para editar posts, use um login real com Firebase ativo.');
      return;
    }
    try {
      await updateCommunityPost({
        postId: post.postId,
        authorId: user.id,
        caption: post.caption,
        visibility: post.visibility,
        taggedUserIds: post.taggedUserIds,
        taggedUserNames: post.taggedUserNames,
      });
      Alert.alert('Post atualizado', 'Suas alterações foram salvas.');
      setEditingPost(null);
    } catch (error) {
      console.warn('Failed to update community post', error);
      Alert.alert('Erro', 'Não consegui editar este post agora.');
      throw error;
    }
  }

  function confirmDeletePost(post: CommunityPost) {
    if (!user) return;
    Alert.alert(
      'Excluir post',
      'Deseja excluir este post da comunidade?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCommunityPost(post.id, user.id);
              Alert.alert('Post excluído', 'O post foi removido da comunidade.');
            } catch (error) {
              console.warn('Failed to delete community post', error);
              Alert.alert('Erro', 'Não consegui excluir este post agora.');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.eyebrow}>Comunidade</Text>
            <Text style={styles.title}>Pratos da comunidade</Text>
            <Text style={styles.subtitle}>Compartilhe fotos, acompanhe amigos e use IA quando quiser estimar os nutrientes.</Text>
          </View>
          <TouchableOpacity
            style={styles.headerFriendsButton}
            onPress={() => setFriendsModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir amigos"
          >
            <MaterialIcons name="group" size={22} color={Colors.green600} />
            {friendOptions.length > 0 ? (
              <Text style={styles.headerFriendsBadge}>{friendOptions.length}</Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterBtn, feedFilter === 'friends' && styles.filterBtnActive]}
            onPress={() => setFeedFilter('friends')}
          >
            <MaterialIcons
              name="people"
              size={18}
              color={feedFilter === 'friends' ? Colors.green600 : Colors.gray400}
            />
            <Text style={[styles.filterText, feedFilter === 'friends' && styles.filterTextActive]}>
              Amigos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, feedFilter === 'all' && styles.filterBtnActive]}
            onPress={() => setFeedFilter('all')}
          >
            <MaterialIcons
              name="public"
              size={18}
              color={feedFilter === 'all' ? Colors.green600 : Colors.gray400}
            />
            <Text style={[styles.filterText, feedFilter === 'all' && styles.filterTextActive]}>
              Geral
            </Text>
          </TouchableOpacity>
        </View>

        {filteredPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="restaurant" size={42} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>
              {feedFilter === 'friends' ? 'Nada dos amigos ainda' : 'Nenhum prato publicado ainda'}
            </Text>
            <Text style={styles.emptyText}>
              {feedFilter === 'friends'
                ? 'Siga usuários no feed geral para montar sua lista de amigos.'
                : 'As fotos analisadas pela IA aparecerão aqui com nutrientes e comentários.'}
            </Text>
          </View>
        ) : (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              comments={commentsByPost.get(post.id) ?? []}
              commentValue={commentInputs[post.id] ?? ''}
              isFollowing={followingIds.includes(post.authorId)}
              isOwnPost={post.authorId === user?.id}
              onCommentChange={(value) => setCommentInputs((items) => ({ ...items, [post.id]: value }))}
              onSendComment={() => handleSendComment(post.id)}
              onToggleFollow={() => handleToggleFollow(post.authorId)}
              onEditPost={() => {
                setEditingPost(post);
                setPhotoModal(true);
              }}
              onDeletePost={() => confirmDeletePost(post)}
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.communityFab, WEB_FIXED_COMMUNITY_FAB_STYLE, { bottom: fabBottomOffset }]}
        onPress={() => {
          setEditingPost(null);
          setPhotoModal(true);
        }}
      >
        <MaterialIcons name="photo-camera" size={25} color={Colors.green600} />
      </TouchableOpacity>

      <CommunityPostModal
        visible={photoModal}
        onClose={() => {
          setPhotoModal(false);
          setEditingPost(null);
        }}
        onPublish={handlePublishPost}
        onUpdate={handleUpdatePost}
        editingPost={editingPost}
        friends={friendOptions}
      />
      <Modal
        visible={friendsModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendsModalOpen(false)}
      >
        <View style={styles.friendsModalOverlay}>
          <TouchableOpacity style={styles.friendsModalBackdrop} onPress={() => setFriendsModalOpen(false)} />
          <View style={styles.friendsModalSheet}>
            <View style={styles.friendsModalHeader}>
              <View>
                <Text style={styles.friendsModalTitle}>Amigos</Text>
                <Text style={styles.friendsModalSubtitle}>Busque por nickname para adicionar pessoas.</Text>
              </View>
              <TouchableOpacity style={styles.friendsModalClose} onPress={() => setFriendsModalOpen(false)}>
                <MaterialIcons name="close" size={20} color={Colors.gray600} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.friendsModalContent}>
              <View style={styles.friendSearchRow}>
                <View style={styles.friendSearchInputWrap}>
                  <Text style={styles.friendSearchPrefix}>@</Text>
                  <TextInput
                    style={styles.friendSearchInput}
                    value={friendSearch}
                    onChangeText={(value) => {
                      setFriendSearch(value.replace(/^@+/, '').toLowerCase());
                      setFriendSearchResult(null);
                      setFriendSearchStatus('idle');
                    }}
                    placeholder="buscar nickname"
                    placeholderTextColor={Colors.gray400}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleSearchFriend}
                  />
                </View>
                <TouchableOpacity
                  style={styles.friendSearchButton}
                  onPress={handleSearchFriend}
                  disabled={friendSearchStatus === 'searching'}
                >
                  {friendSearchStatus === 'searching' ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <MaterialIcons name="search" size={19} color={Colors.white} />
                  )}
                </TouchableOpacity>
              </View>
              {friendSearchStatus === 'notFound' ? (
                <Text style={styles.friendSearchFeedback}>Nenhum usuário encontrado com esse nickname.</Text>
              ) : null}
              {friendSearchResult ? (
                <View style={styles.friendResult}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>{getInitials(friendSearchResult.name)}</Text>
                  </View>
                  <View style={styles.friendResultInfo}>
                    <Text style={styles.friendResultName}>{friendSearchResult.name}</Text>
                    <Text style={styles.friendResultNickname}>@{friendSearchResult.nickname}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.friendResultButton,
                      followingIds.includes(friendSearchResult.id) && styles.friendResultButtonActive,
                    ]}
                    onPress={() => handleAddFriendBySearch(friendSearchResult)}
                    disabled={followingIds.includes(friendSearchResult.id)}
                  >
                    <Text style={[
                      styles.friendResultButtonText,
                      followingIds.includes(friendSearchResult.id) && styles.friendResultButtonTextActive,
                    ]}>
                      {followingIds.includes(friendSearchResult.id) ? 'Adicionado' : 'Adicionar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.friendsModalListHeader}>
                <Text style={styles.friendsTitle}>Amigos adicionados</Text>
                <Text style={styles.friendsCount}>{friendOptions.length}</Text>
              </View>
              {friendOptions.length === 0 ? (
                <Text style={styles.friendsEmpty}>
                  Procure um amigo pelo nickname para adicioná-lo.
                </Text>
              ) : (
                <View style={styles.friendsModalList}>
                  {friendOptions.map((friend) => (
                    <View key={friend.id} style={styles.friendListItem}>
                      <View style={styles.friendAvatar}>
                        <Text style={styles.friendAvatarText}>{getInitials(friend.name)}</Text>
                      </View>
                      <View style={styles.friendResultInfo}>
                        <Text style={styles.friendResultName}>{friend.name}</Text>
                        <Text style={styles.friendResultNickname}>@{friend.nickname ?? friend.name}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerFriendsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.green100,
    position: 'relative',
  },
  headerFriendsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: Colors.green600,
    color: Colors.white,
    textAlign: 'center',
    paddingHorizontal: 5,
    fontSize: 10,
    fontWeight: Typography.bold,
    lineHeight: 19,
  },
  eyebrow: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gray800 },
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  scroll: { width: '100%', maxWidth: Platform.OS === 'web' ? 760 : undefined, alignSelf: 'center', padding: Spacing.base, paddingBottom: 110 },
  filterBar: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  filterBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  filterBtnActive: { backgroundColor: Colors.green50, borderColor: Colors.green100 },
  filterText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gray400 },
  filterTextActive: { color: Colors.green600 },
  friendsModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 80, 65, 0.22)' },
  friendsModalBackdrop: { ...StyleSheet.absoluteFillObject },
  friendsModalSheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '82%',
    alignSelf: 'center',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Colors.white,
    paddingTop: Spacing.sm,
  },
  friendsModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  friendsModalTitle: { fontSize: Typography.lg, color: Colors.gray800, fontWeight: Typography.bold },
  friendsModalSubtitle: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400 },
  friendsModalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  friendsModalContent: { padding: Spacing.md, paddingBottom: Spacing.xl },
  friendsModalListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  friendsTitle: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  friendsCount: { minWidth: 26, overflow: 'hidden', borderRadius: Radius.full, backgroundColor: Colors.green50, color: Colors.green600, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 2, fontSize: Typography.xs, fontWeight: Typography.bold },
  friendSearchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  friendSearchInputWrap: { flex: 1, minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.gray50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm },
  friendSearchPrefix: { fontSize: Typography.md, color: Colors.green600, fontWeight: Typography.bold, marginRight: 2 },
  friendSearchInput: { flex: 1, minHeight: 40, paddingVertical: 0, fontSize: Typography.sm, color: Colors.gray800 },
  friendSearchButton: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green600 },
  friendSearchFeedback: { fontSize: Typography.xs, color: Colors.danger, marginBottom: Spacing.xs },
  friendResult: { minHeight: 54, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.green100, backgroundColor: Colors.green50, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.xs, marginBottom: Spacing.xs },
  friendResultInfo: { flex: 1, minWidth: 0 },
  friendResultName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  friendResultNickname: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.semibold },
  friendResultButton: { minHeight: 34, borderRadius: Radius.full, backgroundColor: Colors.green600, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  friendResultButtonActive: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.green100 },
  friendResultButtonText: { fontSize: Typography.xs, color: Colors.white, fontWeight: Typography.bold },
  friendResultButtonTextActive: { color: Colors.green600 },
  friendsEmpty: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  friendsModalList: { gap: Spacing.xs },
  friendListItem: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, padding: Spacing.sm },
  friendAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  friendAvatarText: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  postCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'visible', marginBottom: Spacing.sm, zIndex: 1, ...Shadows.sm },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, zIndex: 30 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50 },
  avatarText: { color: Colors.green600, fontWeight: Typography.bold },
  postAuthorWrap: { flex: 1 },
  postAuthor: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.gray800 },
  postNickname: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.semibold, marginTop: 1 },
  postMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  postMenuWrap: { position: 'relative', zIndex: 40 },
  postMenuButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  postMenu: {
    position: 'absolute',
    top: 38,
    right: 0,
    width: 164,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    paddingVertical: 4,
    zIndex: 100,
    ...Shadows.md,
  },
  postMenuItem: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  postMenuText: { flex: 1, fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.semibold },
  postMenuTextDanger: { color: Colors.danger },
  followBtn: {
    minHeight: 34,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.green400,
    borderWidth: 1,
    borderColor: Colors.green400,
  },
  followBtnActive: { backgroundColor: Colors.green50, borderColor: Colors.green100 },
  followText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.white },
  followTextActive: { color: Colors.green600 },
  postImageFrame: { width: '100%', aspectRatio: 1, maxHeight: 520, overflow: 'hidden', backgroundColor: Colors.gray50 },
  postImage: { width: '100%', height: '100%' },
  postBody: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  caption: { fontSize: Typography.sm, color: Colors.gray800, lineHeight: 19, marginTop: 4 },
  taggedText: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, marginBottom: 6 },
  foodNames: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: 4 },
  nutritionText: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  commentBlock: { padding: Spacing.md },
  commentItem: { marginBottom: Spacing.xs },
  commentAuthor: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.green600 },
  commentMessage: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 18 },
  noComments: { fontSize: Typography.sm, color: Colors.gray400, marginBottom: Spacing.sm },
  commentInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs },
  commentInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'web' ? Spacing.sm : 8, fontSize: Typography.sm, color: Colors.gray800 },
  commentSend: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green400 },
  communityFab: {
    position: 'absolute',
    right: Spacing.base,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.green400,
    backgroundColor: Colors.green50,
    ...Shadows.md,
  },
  emptyState: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl },
  emptyTitle: { marginTop: Spacing.sm, fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800 },
  emptyText: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray400, lineHeight: 20, textAlign: 'center' },
});

const modalStyles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 80, 65, 0.2)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
  },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gray800 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  label: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: Spacing.sm, marginBottom: 6 },
  captionInput: {
    minHeight: 86,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: Typography.sm,
    color: Colors.gray800,
    textAlignVertical: 'top',
    backgroundColor: Colors.white,
  },
  postPreviewFrame: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.gray50 },
  postPreview: { width: '100%', height: '100%' },
  emptyPhoto: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.gray50, alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  emptyPhotoText: { marginTop: Spacing.xs, fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  photoButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  photoButton: { flex: 1, minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.green100, backgroundColor: Colors.green50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  photoButtonText: { fontSize: Typography.sm, color: Colors.green600, fontWeight: Typography.bold },
  aiButton: { minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.green400, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  aiButtonDisabled: { opacity: 0.65 },
  aiButtonText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  detectedBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, marginTop: Spacing.sm, backgroundColor: Colors.gray50 },
  detectedTitle: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold, marginBottom: 4 },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  detectedInfo: { flex: 1 },
  detectedName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  detectedMeta: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray600 },
  detectedConfidence: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  detectedTotal: { marginTop: Spacing.xs, fontSize: Typography.xs, color: Colors.gray600, fontWeight: Typography.semibold },
  visibilityRow: { flexDirection: 'row', gap: Spacing.xs },
  visibilityChip: { flex: 1, minHeight: 40, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  visibilityChipActive: { borderColor: Colors.green100, backgroundColor: Colors.green50 },
  visibilityText: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.bold },
  visibilityTextActive: { color: Colors.green600 },
  emptyFriendsText: { fontSize: Typography.sm, color: Colors.gray400, lineHeight: 18 },
  tagSearchBox: {
    minHeight: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  tagSearchInput: { flex: 1, minHeight: 40, paddingVertical: 0, fontSize: Typography.sm, color: Colors.gray800 },
  tagResults: { marginTop: Spacing.xs, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tagResultRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tagAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  tagAvatarText: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold },
  tagResultInfo: { flex: 1, minWidth: 0 },
  tagResultName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  tagResultNickname: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.semibold },
  taggedAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  taggedAvatarWrap: { width: 44, height: 44, position: 'relative' },
  taggedAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100 },
  taggedRemoveBadge: { position: 'absolute', top: -3, right: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.danger, borderWidth: 2, borderColor: Colors.white },
  actions: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.bold },
  publishBtn: { flex: 1.4, minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center' },
  publishText: { fontSize: Typography.sm, color: Colors.white, fontWeight: Typography.bold },
});
