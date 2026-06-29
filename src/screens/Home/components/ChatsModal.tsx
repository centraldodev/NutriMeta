import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { NutritionistPatientLink } from '../../../types';
import { modalStyles } from '../styles';
import { BottomSheet } from '../../../components/BottomSheet';

export function ChatsModal({
  visible,
  onClose,
  chatLinks,
  unreadChatCounts,
  onOpenChat,
}: {
  visible: boolean;
  onClose: () => void;
  chatLinks: NutritionistPatientLink[];
  unreadChatCounts: Record<string, number>;
  onOpenChat: (link: NutritionistPatientLink) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Chats">
      <ScrollView contentContainerStyle={modalStyles.scroll}>
        {chatLinks.length === 0 ? (
          <View style={modalStyles.emptyNotice}>
            <MaterialIcons name="chat-bubble-outline" size={34} color={Colors.gray400} />
            <Text style={modalStyles.emptyNoticeText}>Seus chats iniciados aparecerão aqui.</Text>
          </View>
        ) : (
          chatLinks.map((link) => {
            const unread = unreadChatCounts[link.id] ?? 0;
            return (
              <TouchableOpacity key={link.id} style={modalStyles.noticeCard} onPress={() => onOpenChat(link)}>
                <Text style={modalStyles.noticeTitle}>Chat com nutricionista</Text>
                <Text style={modalStyles.noticeText}>{link.nutritionistName}</Text>
                <Text style={modalStyles.noticeMeta}>
                  {unread > 0 ? `${unread} mensagem(ns) nova(s)` : 'Toque para continuar a conversa'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}
