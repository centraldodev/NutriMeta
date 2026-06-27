import React, { useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { CommunityComment, CommunityPost } from '../../../types';
import { formatNutritionDetails, getInitials } from '../../../utils/nutrition';
import { MEAL_LABELS } from '../types';
import { postDateLabel } from '../utils/communityUtils';
import { styles } from '../styles';

export function PostCard({
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
