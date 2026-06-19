import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import { UNIT_LABELS } from '../constants/foodDatabase';
import { PhotoModal, MealDraft, getWaterMl } from './AddMealScreen';
import {
  addCommunityComment,
  addCommunityPost,
  followCommunityUser,
  subscribeCommunityComments,
  subscribeFollowing,
  subscribeCommunityPosts,
  unfollowCommunityUser,
} from '../services/groupService';
import { addMealEntry } from '../services/nutritionService';
import { getCustomFoods, saveCustomFood } from '../services/customFoodService';
import { useStore, selectGoals } from '../store';
import { formatNutritionDetails, generateId, getInitials, sumNutrition } from '../utils/nutrition';
import { CommunityComment, CommunityPost, FoodItem, MealEntry, MealPeriod } from '../types';

const GLOBAL_COMMUNITY_ID = 'global';
const WEB_FIXED_COMMUNITY_FAB_STYLE = Platform.OS === 'web'
  ? ({ position: 'fixed' } as any)
  : null;
type MealEntryPayload = Omit<MealEntry, 'id' | 'userId' | 'addedAt'>;

const MEAL_LABELS: Record<CommunityPost['mealPeriod'], string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  dinner: 'Jantar',
  snack: 'Lanche',
  hydration: 'Hidratação',
};

function timeAgo(date: Date): string {
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
}: {
  post: CommunityPost;
  comments: CommunityComment[];
  commentValue: string;
  isFollowing: boolean;
  isOwnPost: boolean;
  onCommentChange: (value: string) => void;
  onSendComment: () => void;
  onToggleFollow: () => void;
}) {
  const nutrition = formatNutritionDetails(post.nutrition, { includeKcal: true });

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorInitials || getInitials(post.authorName)}</Text>
        </View>
        <View style={styles.postAuthorWrap}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postMeta}>{MEAL_LABELS[post.mealPeriod]} · {timeAgo(post.createdAt)}</Text>
        </View>
        {!isOwnPost && (
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

      <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />

      <View style={styles.postBody}>
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        <Text style={styles.foodNames}>{post.foodNames.join(', ')}</Text>
        {nutrition ? <Text style={styles.nutritionText}>{nutrition}</Text> : null}
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

export function RankingScreen({
  fabBottomOffset = Spacing.base,
}: {
  fabBottomOffset?: number;
}) {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const goals = useStore(selectGoals);
  const addEntry = useStore((s) => s.addEntry);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends'>('friends');
  const [photoModal, setPhotoModal] = useState(false);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);

  const displayName = profile?.name ?? user?.name ?? 'Usuário';

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
    let active = true;
    if (!user) {
      setCustomFoods([]);
      return undefined;
    }
    getCustomFoods(user.id)
      .then((foods) => {
        if (active) setCustomFoods(foods);
      })
      .catch((error) => {
        console.warn('Failed to load custom foods for community photo shortcut', error);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const commentsByPost = useMemo(() => {
    const map = new Map<string, CommunityComment[]>();
    comments.forEach((comment) => {
      map.set(comment.targetUserId, [...(map.get(comment.targetUserId) ?? []), comment]);
    });
    return map;
  }, [comments]);

  const filteredPosts = useMemo(() => {
    if (feedFilter === 'all') return posts;
    return posts.filter((post) => post.authorId === user?.id || followingIds.includes(post.authorId));
  }, [feedFilter, followingIds, posts, user?.id]);

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

    setFollowingIds((items) => (
      isFollowing ? items.filter((id) => id !== authorId) : [...items, authorId]
    ));

    if (!isFirebaseConfigured || user.id === 'dev_user') return;

    try {
      if (isFollowing) {
        await unfollowCommunityUser(user.id, authorId);
      } else {
        await followCommunityUser(user.id, authorId);
      }
    } catch {
      setFollowingIds((items) => (
        isFollowing ? [...items, authorId] : items.filter((id) => id !== authorId)
      ));
      Alert.alert('Erro', 'Não foi possível atualizar esse perfil agora.');
    }
  }

  async function handlePhotoConfirm(items: MealDraft[], mealPeriod: MealPeriod, photo?: { imageUri: string; summary: string; caption: string }) {
    if (!user || !goals) {
      Alert.alert('Perfil não carregado', 'Aguarde o app carregar seus dados e tente novamente.');
      return;
    }

    const validItems = items.filter((item) => item.food);
    if (validItems.length === 0) {
      Alert.alert('Nenhum alimento válido', 'Revise os itens detectados antes de publicar.');
      return;
    }

    for (const item of validItems) {
      if (!item.food) continue;
      const payload = {
        foodName: `${item.food.name} (${item.quantity} ${UNIT_LABELS[item.unit]})`,
        emoji: item.food.emoji,
        quantity: item.quantity,
        unit: item.unit,
        nutrition: item.nutrition,
        waterMl: getWaterMl(item.food, item.quantity, item.unit),
        mealPeriod: getWaterMl(item.food, item.quantity, item.unit) ? 'hydration' : mealPeriod,
        source: 'photo',
      } satisfies MealEntryPayload;

      let entry: MealEntry;
      try {
        entry = isFirebaseConfigured && user.id !== 'dev_user'
          ? await addMealEntry(user.id, goals, payload)
          : { ...payload, id: generateId(), userId: user.id, addedAt: new Date() };
      } catch (error) {
        console.warn('Community photo meal save failed, using local entry', error);
        entry = { ...payload, id: generateId(), userId: user.id, addedAt: new Date() };
      }

      addEntry(entry);

      if (item.food.id.startsWith('global_')) {
        try {
          const foods = await saveCustomFood(user.id, item.food);
          setCustomFoods(foods);
        } catch (error) {
          console.warn('Failed to save community shortcut custom food', error);
        }
      }
    }

    if (!photo) {
      Alert.alert('Refeição salva', 'A foto não ficou disponível para publicar no feed.');
      return;
    }

    if (!isFirebaseConfigured || user.id === 'dev_user') {
      Alert.alert('Refeição salva', 'Para publicar a foto na comunidade, ative o Firebase e use um login real.');
      return;
    }

    try {
      await addCommunityPost({
        authorId: user.id,
        authorName: displayName,
        imageUri: photo.imageUri,
        caption: photo.caption,
        nutrition: sumNutrition(validItems.map((item) => ({ nutrition: item.nutrition }))),
        foodNames: validItems.map((item) => item.food?.name ?? item.foodText).filter(Boolean),
        mealPeriod,
      });
      Alert.alert('Publicado', 'Sua foto foi publicada na comunidade.');
    } catch (error) {
      console.warn('Failed to publish community shortcut post', error);
      Alert.alert('Refeição salva', 'Não consegui publicar a foto no feed agora.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Comunidade</Text>
        <Text style={styles.title}>Pratos da comunidade</Text>
        <Text style={styles.subtitle}>Publique fotos analisadas pela IA com informações nutricionais.</Text>
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

        <View style={styles.helpPanel}>
          <MaterialIcons name="photo-camera" size={22} color={Colors.green600} />
          <Text style={styles.helpText}>
            Para publicar, toque no FAB de câmera, fotografe o prato e confirme os itens detectados pela IA.
          </Text>
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
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.communityFab, WEB_FIXED_COMMUNITY_FAB_STYLE, { bottom: fabBottomOffset }]}
        onPress={() => setPhotoModal(true)}
      >
        <MaterialIcons name="photo-camera" size={25} color={Colors.green600} />
      </TouchableOpacity>

      <PhotoModal
        visible={photoModal}
        onClose={() => setPhotoModal(false)}
        onConfirm={handlePhotoConfirm}
        customFoods={customFoods}
      />
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
  helpPanel: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.green50, borderWidth: 1, borderColor: Colors.green100, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  helpText: { flex: 1, fontSize: Typography.sm, color: Colors.green600, lineHeight: 19, fontWeight: Typography.semibold },
  postCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.sm, ...Shadows.sm },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green50 },
  avatarText: { color: Colors.green600, fontWeight: Typography.bold },
  postAuthorWrap: { flex: 1 },
  postAuthor: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.gray800 },
  postMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
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
  postImage: { width: '100%', height: 300, backgroundColor: Colors.gray50 },
  postBody: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  caption: { fontSize: Typography.sm, color: Colors.gray800, lineHeight: 20, marginBottom: Spacing.xs },
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
