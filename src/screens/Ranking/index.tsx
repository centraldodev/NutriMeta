import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { isFirebaseConfigured } from '../../config';
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
} from '../../services/groupService';
import { useStore } from '../../store';
import { getInitials, sumNutrition } from '../../utils/nutrition';
import { CommunityComment, CommunityPost, MealPeriod } from '../../types';
import {
  GLOBAL_COMMUNITY_ID,
  WEB_FIXED_COMMUNITY_FAB_STYLE,
  FriendOption,
  CommunityDetectedFood,
} from './types';
import { styles } from './styles';
import { PostCard } from './components/PostCard';
import { CommunityPostModal } from './components/CommunityPostModal';

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

      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
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
        }
        renderItem={({ item: post }) => (
          <PostCard
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
        )}
      />

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

export default RankingScreen;
