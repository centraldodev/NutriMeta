import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { googleAuthConfig } from '../config';
import { useStore } from '../store';
import {
  loginWithEmail,
  loginWithGoogleToken,
  registerWithEmail,
  resetPassword,
} from '../services/authService';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: Props) {
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [accountRole, setAccountRole] = useState<'user' | 'nutritionist'>('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const setUser = useStore((s) => s.setUser);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: googleAuthConfig.androidClientId || googleAuthConfig.webClientId,
    androidClientId: googleAuthConfig.androidClientId || googleAuthConfig.webClientId,
    iosClientId: googleAuthConfig.iosClientId || googleAuthConfig.webClientId,
    webClientId: googleAuthConfig.webClientId,
    selectAccount: true,
    language: 'pt-BR',
  });

  useEffect(() => {
    async function finishGoogleLogin(idToken: string) {
      setGoogleLoading(true);
      try {
        const user = await loginWithGoogleToken(idToken);
        setUser(user);
        onSuccess();
      } catch (err: any) {
        Alert.alert('Erro no Google', authErrorMessage(err));
      } finally {
        setGoogleLoading(false);
      }
    }

    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        finishGoogleLogin(idToken);
      } else {
        setGoogleLoading(false);
        Alert.alert('Erro no Google', 'Não recebemos o token do Google. Tente novamente.');
      }
    } else if (googleResponse?.type === 'error') {
      setGoogleLoading(false);
      Alert.alert('Erro no Google', 'Não foi possível concluir o login com Google.');
    } else if (googleResponse?.type === 'cancel') {
      setGoogleLoading(false);
    }
  }, [googleResponse, onSuccess, setUser]);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Atenção', 'Preencha e-mail e senha para continuar.');
      return;
    }

    setLoading(true);
    try {
      const user =
        mode === 'login'
          ? await loginWithEmail(email.trim(), password)
          : await registerWithEmail(email.trim(), password, name.trim() || 'Usuário', accountRole);
      setUser(user);
      onSuccess();
    } catch (err: any) {
      Alert.alert('Erro', authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!googleAuthConfig.webClientId && !googleAuthConfig.androidClientId) {
      Alert.alert('Google não configurado', 'Adicione o Google Client ID no app.json ou nas variáveis EXPO_PUBLIC_GOOGLE_*.');
      return;
    }

    setGoogleLoading(true);
    const result = await promptGoogleAsync();
    if (result.type !== 'success') {
      setGoogleLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email.trim()) {
      Alert.alert('Informe seu e-mail', 'Digite seu e-mail no campo acima para enviarmos a recuperação de senha.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim());
      Alert.alert('E-mail enviado', 'Enviamos um link para você redefinir sua senha.');
    } catch (err: any) {
      Alert.alert('Erro', authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoBox}>
              <MaterialIcons name="restaurant-menu" size={40} color={Colors.white} />
            </View>
            <Text style={styles.appName}>NutriMeta</Text>
            <Text style={styles.appSub}>Foco em macronutrientes, não só calorias</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Mode toggle */}
            <View style={styles.modeRow}>
              {(['login', 'register'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === 'login' ? 'Entrar' : 'Criar conta'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'register' && (
              <>
                <Text style={styles.label}>Seu nome</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: João Silva"
                  placeholderTextColor={Colors.gray400}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Tipo de acesso</Text>
                <View style={styles.roleRow}>
                  {([
                    ['user', 'Paciente', 'Acompanha refeições e metas'],
                    ['nutritionist', 'Nutricionista', 'Acesso completo aos pacientes'],
                  ] as const).map(([role, label, sub]) => {
                    const active = accountRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleCard, active && styles.roleCardActive]}
                        onPress={() => setAccountRole(role)}
                      >
                        <MaterialIcons
                          name={role === 'nutritionist' ? 'medical-services' : 'person'}
                          size={22}
                          color={active ? Colors.green600 : Colors.gray400}
                        />
                        <Text style={[styles.roleTitle, active && styles.roleTitleActive]}>{label}</Text>
                        <Text style={styles.roleSub}>{sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              placeholder="seu@email.com"
              placeholderTextColor={Colors.gray400}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={Colors.gray400}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={Colors.gray400}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {mode === 'login' ? 'Entrar' : 'Criar conta'}
                </Text>
              )}
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleResetPassword} disabled={loading}>
                <Text style={styles.forgotText}>Esqueci minha senha</Text>
              </TouchableOpacity>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.btnGoogle, (!googleRequest || googleLoading) && styles.btnDisabled]}
              onPress={handleGoogleLogin}
              disabled={!googleRequest || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color={Colors.gray800} />
              ) : (
                <Text style={styles.btnGoogleText}>Continuar com Google</Text>
              )}
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function authErrorMessage(err: any): string {
  return (
    err?.code === 'auth/invalid-credential' ? 'E-mail ou senha incorretos.' :
    err?.code === 'auth/user-not-found' ? 'Não encontramos uma conta com esse e-mail.' :
    err?.code === 'auth/wrong-password' ? 'Senha incorreta.' :
    err?.code === 'auth/email-already-in-use' ? 'Esse e-mail já está cadastrado.' :
    err?.code === 'auth/weak-password' ? 'Senha muito fraca (mín. 6 caracteres).' :
    err?.code === 'auth/invalid-email' ? 'E-mail inválido.' :
    err?.code === 'auth/network-request-failed' ? 'Sem conexão. Verifique sua internet.' :
    'Algo deu errado. Tente novamente.'
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.green600 },
  kav:  { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.base },

  hero: { width: '100%', maxWidth: Platform.OS === 'web' ? 420 : undefined, alignItems: 'center', marginBottom: Spacing.xl },
  logoBox: {
    width: 80, height: 80,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  appName:   { fontSize: Typography.xxxl, fontWeight: Typography.bold, color: Colors.white, marginBottom: 4 },
  appSub:    { fontSize: Typography.sm, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  card: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 420 : undefined,
    backgroundColor: Colors.white,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
  },

  modeRow: { flexDirection: 'row', marginBottom: Spacing.base, backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: 3 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  modeBtnActive: { backgroundColor: Colors.white },
  modeBtnText:       { fontSize: Typography.md, color: Colors.gray400, fontWeight: Typography.medium },
  modeBtnTextActive: { color: Colors.text ?? Colors.green600, fontWeight: Typography.bold },

  label: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gray600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.sm, padding: Spacing.md,
    fontSize: Typography.base, color: Colors.gray800,
    marginBottom: Spacing.md,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    padding: Spacing.md,
    fontSize: Typography.base,
    color: Colors.gray800,
  },
  passwordToggle: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  roleCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    minHeight: 96,
    backgroundColor: Colors.white,
  },
  roleCardActive: { borderColor: Colors.green400, backgroundColor: Colors.green50 },
  roleTitle: { marginTop: 4, fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  roleTitleActive: { color: Colors.green600 },
  roleSub: { marginTop: 2, fontSize: Typography.xs, color: Colors.gray400, lineHeight: 15 },

  btnPrimary: {
    backgroundColor: Colors.green400,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  btnPrimaryText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
  btnDisabled: { opacity: 0.6 },
  forgotBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  forgotText: { color: Colors.green600, fontSize: Typography.sm, fontWeight: Typography.semibold },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.gray400, fontSize: Typography.xs, fontWeight: Typography.semibold },
  btnGoogle: {
    borderWidth: 1.5,
    borderColor: Colors.borderMd,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  btnGoogleText: { color: Colors.gray800, fontSize: Typography.base, fontWeight: Typography.bold },
});
