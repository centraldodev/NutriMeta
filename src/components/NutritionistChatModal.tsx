import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { isFirebaseConfigured } from '../config';
import {
  markChatMessagesRead,
  sendChatMessage,
  subscribeChatMessages,
} from '../services/nutritionistChatService';
import { NutritionistChatMessage, NutritionistPatientLink } from '../types';
import { formatBrasiliaTime } from '../utils/nutrition';

export function NutritionistChatModal({
  visible,
  link,
  currentUserId,
  currentUserName,
  onClose,
}: {
  visible: boolean;
  link: NutritionistPatientLink | null;
  currentUserId: string | null | undefined;
  currentUserName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<NutritionistChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  const otherName = currentUserId === link?.nutritionistId ? link?.patientName : link?.nutritionistName;

  useEffect(() => {
    if (!visible || !link || !isFirebaseConfigured) {
      setMessages([]);
      return undefined;
    }
    const unsubscribe = subscribeChatMessages(link.id, setMessages);
    return unsubscribe;
  }, [link, visible]);

  useEffect(() => {
    if (!visible || !link || !currentUserId || !isFirebaseConfigured) return;
    markChatMessagesRead(link.id, currentUserId).catch((error) => {
      console.warn('Failed to mark chat as read', error);
    });
  }, [currentUserId, link, messages.length, visible]);

  async function handleSend() {
    if (!link || !currentUserId || !messageText.trim()) return;
    if (!isFirebaseConfigured) {
      Alert.alert('Firebase necessário', 'O chat precisa de sincronização com Firebase.');
      return;
    }
    setSending(true);
    try {
      await sendChatMessage({
        link,
        senderId: currentUserId,
        senderName: currentUserName,
        text: messageText,
      });
      setMessageText('');
    } catch (error) {
      console.warn('Failed to send chat message', error);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem agora.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.bg}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Chat</Text>
              <Text style={styles.subtitle}>{otherName ?? 'Conversa'}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="chat-bubble-outline" size={34} color={Colors.gray400} />
                <Text style={styles.emptyText}>Comece a conversa por aqui.</Text>
              </View>
            ) : (
              messages.map((message) => {
                const mine = message.senderId === currentUserId;
                return (
                  <View key={message.id} style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
                    {!mine ? <Text style={styles.messageAuthor}>{message.senderName}</Text> : null}
                    <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text>
                    <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
                      {formatBrasiliaTime(message.createdAt)}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Digite uma mensagem..."
              placeholderTextColor={Colors.gray400}
              multiline
              maxLength={800}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!messageText.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!messageText.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color={Colors.white} /> : <MaterialIcons name="send" size={18} color={Colors.white} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    maxHeight: '82%',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 640 : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing.base,
  },
  handle: { width: 44, height: 5, borderRadius: Radius.full, backgroundColor: Colors.borderMd, alignSelf: 'center', marginTop: Spacing.sm, marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerText: { flex: 1 },
  title: { fontSize: Typography.lg, color: Colors.gray800, fontWeight: Typography.bold },
  subtitle: { marginTop: 2, fontSize: Typography.sm, color: Colors.gray400 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  messages: { minHeight: 260 },
  messageContent: { padding: Spacing.base, gap: Spacing.sm },
  emptyBox: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { marginTop: Spacing.sm, fontSize: Typography.sm, color: Colors.gray400 },
  messageBubble: { maxWidth: '82%', borderRadius: Radius.md, padding: Spacing.sm },
  messageMine: { alignSelf: 'flex-end', backgroundColor: Colors.green400 },
  messageOther: { alignSelf: 'flex-start', backgroundColor: Colors.gray50 },
  messageAuthor: { fontSize: Typography.xs, color: Colors.green600, fontWeight: Typography.bold, marginBottom: 2 },
  messageText: { fontSize: Typography.sm, color: Colors.gray800, lineHeight: 19 },
  messageTextMine: { color: Colors.white },
  messageTime: { marginTop: 4, fontSize: Typography.xs, color: Colors.gray400, alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.75)' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  input: { flex: 1, maxHeight: 92, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: Typography.sm, color: Colors.gray800 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.green400, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.55 },
});
