import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../../constants/theme';
import { NutritionistPatientLink } from '../../../types';
import { selectNotifications, useStore } from '../../../store';
import { modalStyles } from '../styles';

export function NotificationsModal({
  visible,
  onClose,
  nutritionistInvites,
  chatLinks,
  unreadChatCounts,
  onRespondInvite,
  onOpenChat,
}: {
  visible: boolean;
  onClose: () => void;
  nutritionistInvites: NutritionistPatientLink[];
  chatLinks: NutritionistPatientLink[];
  unreadChatCounts: Record<string, number>;
  onRespondInvite: (linkId: string, status: 'accepted' | 'rejected') => void;
  onOpenChat: (link: NutritionistPatientLink) => void;
}) {
  const notifications = useStore(selectNotifications);
  const unreadChatLinks = chatLinks.filter((link) => (unreadChatCounts[link.id] ?? 0) > 0);
  const hasItems = notifications.length > 0 || nutritionistInvites.length > 0 || unreadChatLinks.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.bg}>
        <TouchableOpacity style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Notificações</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.scroll}>
            {!hasItems ? (
              <View style={modalStyles.emptyNotice}>
                <MaterialIcons name="notifications-none" size={34} color={Colors.gray400} />
                <Text style={modalStyles.emptyNoticeText}>Feedbacks e dicas aparecerão aqui.</Text>
              </View>
            ) : (
              <>
                {unreadChatLinks.map((link) => {
                  const unread = unreadChatCounts[link.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={`chat_${link.id}`}
                      style={modalStyles.noticeCard}
                      onPress={() => onOpenChat(link)}
                    >
                      <Text style={modalStyles.noticeTitle}>Mensagem nova</Text>
                      <Text style={modalStyles.noticeText}>
                        {link.nutritionistName} enviou {unread} mensagem(ns) no chat.
                      </Text>
                      <Text style={modalStyles.noticeMeta}>Toque para abrir a conversa.</Text>
                    </TouchableOpacity>
                  );
                })}
                {nutritionistInvites.map((invite) => (
                  <View key={invite.id} style={modalStyles.noticeCard}>
                    <Text style={modalStyles.noticeTitle}>Solicitação de nutricionista</Text>
                    <Text style={modalStyles.noticeText}>
                      {invite.nutritionistName} quer acessar seus registros nutricionais para acompanhamento.
                    </Text>
                    <Text style={modalStyles.noticeMeta}>{invite.nutritionistEmail}</Text>
                    <View style={modalStyles.noticeActions}>
                      <TouchableOpacity style={modalStyles.noticeRejectBtn} onPress={() => onRespondInvite(invite.id, 'rejected')}>
                        <Text style={modalStyles.noticeRejectText}>Recusar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={modalStyles.noticeAcceptBtn} onPress={() => onRespondInvite(invite.id, 'accepted')}>
                        <Text style={modalStyles.noticeAcceptText}>Aceitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {notifications.map((item) => (
                  <View key={item.id} style={[modalStyles.noticeCard, item.read && modalStyles.noticeCardRead]}>
                    <Text style={modalStyles.noticeTitle}>{item.userName || 'NutriMeta'}</Text>
                    <Text style={modalStyles.noticeText}>{item.message}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
