import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/theme";
import { isFirebaseConfigured } from "../../config";
import { signOut } from "../../services/authService";
import {
  createFoodPlan,
  getPatientRecentLogs,
  subscribePatientFoodPlans,
  updateFoodPlan,
  updatePatientProfile,
} from "../../services/nutritionistService";
import {
  getLinkedPatientProfiles,
  sendNutritionistInvite,
  subscribeLinkedPatientProfiles,
  subscribeNutritionistAcceptedLinks,
} from "../../services/nutritionistLinkService";
import { subscribeUnreadChatCountByLink } from "../../services/nutritionistChatService";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FoodIcon } from "../../components/FoodIcon";
import { NutritionistChatModal } from "../../components/NutritionistChatModal";
import { NutritionDataHelpModal } from "../../components/NutritionDataHelpModal";
import { ShoppingPdfModal } from "../../components/ShoppingPdfModal";
import { useStore } from "../../store";
import {
  DailyLog,
  FoodPlan,
  MealEntry,
  NutritionistPatientLink,
  UserProfile,
} from "../../types";
import {
  calcMacroGoals,
  dateDaysAgoBrasilia,
} from "../../utils/nutrition";
import { DEFAULT_GOALS, EMPTY_TOTAL, PATIENT_LOG_LOOKBACK_DAYS } from "./types";
import {
  averageNutritionForDates,
  averageWaterForDates,
  buildMealDistribution,
  buildTopFoods,
  buildWeekRanges,
  buildWeeklyAlerts,
  mealPeriodOrder,
  totalNutritionForDates,
  totalWaterForDates,
} from "./utils/weeklyAnalysis";
import { PatientEditModal } from "./components/PatientEditModal";
import { FoodPlanModal } from "./components/FoodPlanModal";
import { PatientSummaryTab } from "./components/PatientSummaryTab";
import { PatientPlansTab } from "./components/PatientPlansTab";
import { PatientWeeklyTab } from "./components/PatientWeeklyTab";
import { PatientRecordsTab } from "./components/PatientRecordsTab";
import { SearchInput } from "../../components/SearchInput";
import { BottomSheet } from "../../components/BottomSheet";
import { ModalActionBar } from "../../components/ModalActionBar";
import { styles } from "./styles";

function NutritionistScreen() {
  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const { width: viewportWidth } = useWindowDimensions();
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    dateDaysAgoBrasilia(0),
  );
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [acceptedLinks, setAcceptedLinks] = useState<NutritionistPatientLink[]>(
    [],
  );
  const [unreadChatCounts, setUnreadChatCounts] = useState<
    Record<string, number>
  >({});
  const [chatLink, setChatLink] = useState<NutritionistPatientLink | null>(
    null,
  );
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [foodPlanOpen, setFoodPlanOpen] = useState(false);
  const [editingFoodPlan, setEditingFoodPlan] = useState<FoodPlan | null>(null);
  const [shoppingPdfOpen, setShoppingPdfOpen] = useState(false);
  const [foodPlans, setFoodPlans] = useState<FoodPlan[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [chatNotificationsOpen, setChatNotificationsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activePatientView, setActivePatientView] = useState<
    "summary" | "plans" | "records" | "weekly"
  >("summary");
  const [nutrientsExpanded, setNutrientsExpanded] = useState(false);
  const patientDateScrollRef = React.useRef<ScrollView>(null);
  const compactAdherenceLayout = viewportWidth < 560;

  const selectedPatient =
    patients.find((patient) => patient.userId === selectedPatientId) ?? null;
  const logsByDate = useMemo(
    () => new Map(logs.map((log) => [log.date, log])),
    [logs],
  );
  const selectedLog = logsByDate.get(selectedDate) ?? null;
  const selectedPatientLink =
    acceptedLinks.find((link) => link.patientId === selectedPatientId) ?? null;
  const unreadChatLinks = acceptedLinks.filter(
    (link) => (unreadChatCounts[link.id] ?? 0) > 0,
  );
  const unreadChatTotal = unreadChatLinks.reduce(
    (sum, link) => sum + (unreadChatCounts[link.id] ?? 0),
    0,
  );
  const patientGoals = useMemo(
    () =>
      selectedPatient?.macroGoals ??
      (selectedPatient ? calcMacroGoals(selectedPatient) : DEFAULT_GOALS),
    [selectedPatient],
  );
  const patientDates = useMemo(
    () =>
      Array.from({ length: PATIENT_LOG_LOOKBACK_DAYS }, (_item, index) =>
        dateDaysAgoBrasilia(PATIENT_LOG_LOOKBACK_DAYS - 1 - index),
      ),
    [],
  );
  const weekRanges = useMemo(buildWeekRanges, []);
  const selectedWeek = weekRanges[selectedWeekIndex] ?? weekRanges[0];
  const previousWeek = weekRanges[selectedWeekIndex + 1];
  const selectedWeekLogs = useMemo(
    () =>
      selectedWeek.dates
        .map((date) => logsByDate.get(date))
        .filter(Boolean) as DailyLog[],
    [logsByDate, selectedWeek],
  );
  const selectedWeekAverage = useMemo(
    () => averageNutritionForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekTotal = useMemo(
    () => totalNutritionForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekWaterTotal = useMemo(
    () => totalWaterForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const selectedWeekWaterAverage = useMemo(
    () => averageWaterForDates(selectedWeek.dates, logsByDate),
    [logsByDate, selectedWeek],
  );
  const previousWeekAverage = useMemo(
    () =>
      previousWeek
        ? averageNutritionForDates(previousWeek.dates, logsByDate)
        : EMPTY_TOTAL,
    [logsByDate, previousWeek],
  );
  const previousWeekWaterAverage = useMemo(
    () =>
      previousWeek ? averageWaterForDates(previousWeek.dates, logsByDate) : 0,
    [logsByDate, previousWeek],
  );
  const periodAverage = useMemo(
    () => averageNutritionForDates(patientDates, logsByDate),
    [logsByDate, patientDates],
  );
  const periodAverageWaterMl = useMemo(
    () => averageWaterForDates(patientDates, logsByDate),
    [logsByDate, patientDates],
  );
  const selectedWeekAlerts = useMemo(
    () => buildWeeklyAlerts(selectedWeek.dates, logsByDate, patientGoals),
    [logsByDate, patientGoals, selectedWeek],
  );
  const selectedWeekTopFoods = useMemo(
    () => buildTopFoods(selectedWeekLogs),
    [selectedWeekLogs],
  );
  const selectedWeekMealDistribution = useMemo(
    () => buildMealDistribution(selectedWeekLogs),
    [selectedWeekLogs],
  );

  async function loadPatients() {
    if (!isFirebaseConfigured || !user) return;
    setLoadingPatients(true);
    try {
      const loaded = await getLinkedPatientProfiles(user.id);
      setPatients(loaded);
      setSelectedPatientId((current) => {
        if (current && loaded.some((patient) => patient.userId === current))
          return current;
        return loaded[0]?.userId ?? null;
      });
    } catch (error) {
      console.warn("Failed to load nutritionist patients", error);
      Alert.alert("Erro", "Não foi possível carregar os pacientes agora.");
    } finally {
      setLoadingPatients(false);
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return undefined;
    setLoadingPatients(true);
    const unsubscribe = subscribeLinkedPatientProfiles(
      user.id,
      (loaded) => {
        setPatients(loaded);
        setSelectedPatientId((current) => {
          if (current && loaded.some((patient) => patient.userId === current))
            return current;
          return loaded[0]?.userId ?? null;
        });
        setLoadingPatients(false);
      },
      (error) => {
        console.warn("Failed to load nutritionist patients", error);
        Alert.alert("Erro", "Não foi possível carregar os pacientes agora.");
        setLoadingPatients(false);
      },
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setAcceptedLinks([]);
      return undefined;
    }
    return subscribeNutritionistAcceptedLinks(user.id, setAcceptedLinks);
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setUnreadChatCounts({});
      return undefined;
    }
    return subscribeUnreadChatCountByLink(user.id, setUnreadChatCounts);
  }, [user]);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      if (!selectedPatientId || !isFirebaseConfigured) {
        setLogs([]);
        return;
      }
      setLoadingLogs(true);
      try {
        const loaded = await getPatientRecentLogs(
          selectedPatientId,
          PATIENT_LOG_LOOKBACK_DAYS,
        );
        if (!active) return;
        setLogs(loaded);
        setSelectedDate(dateDaysAgoBrasilia(0));
        setSelectedWeekIndex(0);
        setNutrientsExpanded(false);
      } catch (error) {
        console.warn("Failed to load patient logs", error);
        Alert.alert(
          "Erro",
          "Não foi possível carregar os registros deste paciente.",
        );
      } finally {
        if (active) setLoadingLogs(false);
      }
    }
    loadLogs();
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId || !isFirebaseConfigured) {
      setFoodPlans([]);
      return undefined;
    }
    return subscribePatientFoodPlans(selectedPatientId, setFoodPlans);
  }, [selectedPatientId]);

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) =>
      patient.name.toLowerCase().includes(normalized),
    );
  }, [patients, search]);

  const entriesByPeriod = useMemo(() => {
    const groups = new Map<MealEntry["mealPeriod"], MealEntry[]>();
    selectedLog?.entries.forEach((entry) => {
      groups.set(entry.mealPeriod, [
        ...(groups.get(entry.mealPeriod) ?? []),
        entry,
      ]);
    });
    return Array.from(groups.entries())
      .map(
        ([period, entries]) =>
          [
            period,
            entries
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
              ),
          ] as [MealEntry["mealPeriod"], MealEntry[]],
      )
      .sort(
        ([periodA], [periodB]) =>
          mealPeriodOrder(periodA) - mealPeriodOrder(periodB),
      );
  }, [selectedLog]);

  async function handleSignOut() {
    setLogoutLoading(true);
    try {
      await signOut();
    } catch {
      // Even if Firebase is offline, clear the in-memory app state.
    } finally {
      setLogoutLoading(false);
      setLogoutConfirmOpen(false);
      clearAuth();
    }
  }

  async function handleSendInvite() {
    if (!user || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      await sendNutritionistInvite({
        nutritionistId: user.id,
        nutritionistName: user.name,
        nutritionistEmail: user.email,
        patientEmail: inviteEmail,
      });
      setInviteEmail("");
      setInviteModalOpen(false);
      Alert.alert(
        "Solicitação enviada",
        "O paciente receberá o convite nas notificações da página inicial.",
      );
      await loadPatients();
    } catch (error: any) {
      const message =
        error?.message === "patient_not_found"
          ? "Não encontramos um paciente cadastrado com esse e-mail."
          : error?.message === "patient_is_nutritionist"
            ? "Esse e-mail pertence a uma conta de nutricionista."
            : error?.message === "self_invite"
              ? "Você não pode enviar convite para sua própria conta."
              : error?.message === "already_accepted"
                ? "Esse paciente já aceitou seu acesso."
                : "Não foi possível enviar a solicitação agora.";
      Alert.alert("Convite não enviado", message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleSavePatientProfile(nextProfile: UserProfile) {
    try {
      await updatePatientProfile(nextProfile);
      const savedProfile = { ...nextProfile, updatedAt: new Date() };
      setPatients((items) =>
        items.map((item) =>
          item.userId === savedProfile.userId ? savedProfile : item,
        ),
      );
      Alert.alert(
        "Paciente atualizado",
        "Dados e metas nutricionais foram salvos.",
      );
    } catch (error) {
      console.warn("Failed to update patient profile", error);
      Alert.alert(
        "Erro",
        "Não foi possível salvar os dados do paciente agora.",
      );
      throw error;
    }
  }

  async function handleCreateFoodPlan(
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt">,
  ) {
    try {
      await createFoodPlan(plan);
      Alert.alert(
        "Plano criado",
        "O plano alimentar e a lista de compras já estão disponíveis para o paciente.",
      );
    } catch (error) {
      console.warn("Failed to create food plan", error);
      Alert.alert("Erro", "Não foi possível criar o plano alimentar agora.");
      throw error;
    }
  }

  async function handleSaveFoodPlan(
    plan: Omit<FoodPlan, "id" | "createdAt" | "updatedAt"> | FoodPlan,
  ) {
    if ("id" in plan) {
      try {
        await updateFoodPlan(plan);
        Alert.alert(
          "Plano atualizado",
          "O paciente será notificado sobre a alteração.",
        );
      } catch (error) {
        console.warn("Failed to update food plan", error);
        Alert.alert(
          "Erro",
          "Não foi possível atualizar o plano alimentar agora.",
        );
        throw error;
      }
      return;
    }
    await handleCreateFoodPlan(plan);
  }

  function openNewFoodPlan() {
    setEditingFoodPlan(null);
    setFoodPlanOpen(true);
  }

  function openEditFoodPlan(plan: FoodPlan) {
    setEditingFoodPlan(plan);
    setFoodPlanOpen(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View style={styles.headerAvatar}>
            <MaterialIcons
              name="medical-services"
              size={20}
              color={Colors.green600}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Nutricionista</Text>
            <Text style={styles.title} numberOfLines={1}>
              {user?.name || "Nutricionista"}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityLabel="Notificações"
            style={styles.headerNotifyBtn}
            onPress={() => {
              setHeaderMenuOpen(false);
              setChatNotificationsOpen(true);
            }}
          >
            <MaterialIcons
              name="notifications-none"
              size={21}
              color={Colors.green600}
            />
            {unreadChatTotal > 0 ? (
              <View style={styles.headerNotificationDot} />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Abrir menu"
            accessibilityState={{ expanded: headerMenuOpen }}
            style={styles.headerNotifyBtn}
            onPress={() => setHeaderMenuOpen((open) => !open)}
          >
            <MaterialIcons
              name={headerMenuOpen ? "close" : "menu"}
              size={24}
              color={Colors.green600}
            />
          </TouchableOpacity>
          {headerMenuOpen ? (
            <View style={styles.headerMenu}>
              <TouchableOpacity
                style={styles.headerMenuItem}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  setInviteModalOpen(true);
                }}
              >
                <MaterialIcons name="person-add-alt-1" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Adicionar paciente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerMenuItem}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  setHelpOpen(true);
                }}
              >
                <MaterialIcons name="help-outline" size={20} color={Colors.green600} />
                <Text style={styles.headerMenuText}>Ajuda</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerMenuItem}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  setLogoutConfirmOpen(true);
                }}
              >
                <MaterialIcons name="logout" size={20} color={Colors.danger} />
                <Text style={[styles.headerMenuText, styles.headerMenuTextDanger]}>Sair</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!isFirebaseConfigured ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-off" size={38} color={Colors.gray400} />
            <Text style={styles.emptyTitle}>Firebase necessário</Text>
            <Text style={styles.emptyText}>
              O acesso do nutricionista usa dados sincronizados dos pacientes.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Pacientes</Text>
              <SearchInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar paciente"
              />
              {loadingPatients ? (
                <ActivityIndicator color={Colors.green400} />
              ) : filteredPatients.length === 0 ? (
                <Text style={styles.mutedText}>
                  Nenhum paciente vinculado ainda. Envie uma solicitação e
                  aguarde o aceite.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.patientRow}
                >
                  {filteredPatients.map((patient) => {
                    const active = patient.userId === selectedPatientId;
                    const patientLink = acceptedLinks.find(
                      (link) => link.patientId === patient.userId,
                    );
                    const unread = patientLink
                      ? (unreadChatCounts[patientLink.id] ?? 0)
                      : 0;
                    return (
                      <TouchableOpacity
                        key={patient.userId}
                        style={[
                          styles.patientCard,
                          active && styles.patientCardActive,
                        ]}
                        onPress={() => setSelectedPatientId(patient.userId)}
                      >
                        <View style={styles.patientNameRow}>
                          <Text
                            style={[
                              styles.patientName,
                              active && styles.patientNameActive,
                            ]}
                          >
                            {patient.name}
                          </Text>
                          {unread > 0 ? (
                            <View style={styles.patientUnreadBadge}>
                              <Text style={styles.patientUnreadText}>
                                {unread}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.patientMeta}>
                          {patient.age} anos · {patient.weight}kg
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedPatient ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.patientViewTabs}
              >
                {[
                  { key: "summary", label: "Resumo", icon: "person" },
                  {
                    key: "plans",
                    label: "Plano alimentar",
                    icon: "restaurant-menu",
                  },
                  {
                    key: "records",
                    label: "Registros",
                    icon: "event-note",
                  },
                  { key: "weekly", label: "Análise semanal", icon: "insights" },
                ].map((item) => {
                  const active = activePatientView === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.patientViewTab,
                        active && styles.patientViewTabActive,
                      ]}
                      onPress={() =>
                        setActivePatientView(
                          item.key as typeof activePatientView,
                        )
                      }
                    >
                      <MaterialIcons
                        name={item.icon as any}
                        size={17}
                        color={active ? Colors.white : Colors.green600}
                      />
                      <Text
                        style={[
                          styles.patientViewTabText,
                          active && styles.patientViewTabTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            {selectedPatient && activePatientView === "summary" ? (
              <PatientSummaryTab
                patient={selectedPatient}
                link={selectedPatientLink}
                unreadChatCounts={unreadChatCounts}
                onEdit={() => setEditPatientOpen(true)}
                onChat={setChatLink}
              />
            ) : null}

            {selectedPatient && activePatientView === "plans" ? (
              <PatientPlansTab
                foodPlans={foodPlans}
                onShowPdf={() => setShoppingPdfOpen(true)}
                onNewPlan={openNewFoodPlan}
                onEditPlan={openEditFoodPlan}
              />
            ) : null}

            {selectedPatient ? (
              <>
                {activePatientView === "weekly" ? (
                  <PatientWeeklyTab
                    selectedWeek={selectedWeek}
                    selectedWeekIndex={selectedWeekIndex}
                    weekRanges={weekRanges}
                    selectedWeekLogs={selectedWeekLogs}
                    selectedWeekAverage={selectedWeekAverage}
                    selectedWeekTotal={selectedWeekTotal}
                    selectedWeekWaterTotal={selectedWeekWaterTotal}
                    selectedWeekWaterAverage={selectedWeekWaterAverage}
                    previousWeek={previousWeek}
                    previousWeekAverage={previousWeekAverage}
                    previousWeekWaterAverage={previousWeekWaterAverage}
                    periodAverage={periodAverage}
                    periodAverageWaterMl={periodAverageWaterMl}
                    selectedWeekAlerts={selectedWeekAlerts}
                    selectedWeekTopFoods={selectedWeekTopFoods}
                    selectedWeekMealDistribution={selectedWeekMealDistribution}
                    patientGoals={patientGoals}
                    compactAdherenceLayout={compactAdherenceLayout}
                    onWeekSelect={setSelectedWeekIndex}
                  />
                ) : null}

                {activePatientView === "records" ? (
                  <PatientRecordsTab
                    logs={logs}
                    loadingLogs={loadingLogs}
                    selectedDate={selectedDate}
                    patientDates={patientDates}
                    logsByDate={logsByDate}
                    selectedLog={selectedLog}
                    entriesByPeriod={entriesByPeriod}
                    nutrientsExpanded={nutrientsExpanded}
                    patientDateScrollRef={patientDateScrollRef}
                    onDateSelect={(date) => { setSelectedDate(date); setNutrientsExpanded(false); }}
                    onToggleNutrients={() => setNutrientsExpanded((current) => !current)}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <Modal
        visible={inviteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteModalOpen(false)}
      >
        <View style={styles.centerModalBg}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setInviteModalOpen(false)}
          />
          <View style={styles.inviteModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Adicionar paciente</Text>
                <Text style={styles.inviteModalSubtitle}>
                  Envie uma solicitação usando o e-mail cadastrado pelo
                  paciente.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setInviteModalOpen(false)}
              >
                <MaterialIcons name="close" size={20} color={Colors.gray600} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>E-mail do paciente</Text>
            <View style={styles.inviteModalInputBox}>
              <MaterialIcons name="email" size={19} color={Colors.gray400} />
              <TextInput
                style={styles.inviteModalInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="email@paciente.com"
                placeholderTextColor={Colors.gray400}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <ModalActionBar
              onCancel={() => setInviteModalOpen(false)}
              onConfirm={handleSendInvite}
              confirmLabel="Enviar solicitação"
              loading={inviteLoading}
              disabled={!inviteEmail.trim()}
            />
          </View>
        </View>
      </Modal>
      <NutritionistChatModal
        visible={Boolean(chatLink)}
        link={chatLink}
        currentUserId={user?.id}
        currentUserName={user?.name ?? "Nutricionista"}
        onClose={() => setChatLink(null)}
      />
      <NutritionDataHelpModal
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
      <BottomSheet
        visible={chatNotificationsOpen}
        onClose={() => setChatNotificationsOpen(false)}
        title="Notificações"
      >
        <ScrollView contentContainerStyle={styles.modalScroll}>
          {unreadChatLinks.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons
                name="notifications-none"
                size={34}
                color={Colors.gray400}
              />
              <Text style={styles.emptyText}>
                Nenhuma mensagem nova no momento.
              </Text>
            </View>
          ) : (
            unreadChatLinks.map((link) => (
              <TouchableOpacity
                key={link.id}
                style={styles.notificationCard}
                onPress={() => {
                  setChatNotificationsOpen(false);
                  setChatLink(link);
                }}
              >
                <Text style={styles.notificationTitle}>Mensagem nova</Text>
                <Text style={styles.notificationText}>
                  {link.patientName} enviou {unreadChatCounts[link.id] ?? 0} mensagem(ns).
                </Text>
                <Text style={styles.notificationMeta}>
                  Toque para abrir o chat.
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </BottomSheet>
      <ConfirmDialog
        visible={logoutConfirmOpen}
        title="Sair da conta"
        message="Você quer sair do NutriMeta?"
        confirmText="Sair"
        destructive
        loading={logoutLoading}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
      <PatientEditModal
        visible={editPatientOpen}
        patient={selectedPatient}
        onClose={() => setEditPatientOpen(false)}
        onSave={handleSavePatientProfile}
      />
      <FoodPlanModal
        visible={foodPlanOpen}
        patient={selectedPatient}
        nutritionist={user ? { id: user.id, name: user.name } : null}
        initialPlan={editingFoodPlan}
        onClose={() => {
          setFoodPlanOpen(false);
          setEditingFoodPlan(null);
        }}
        onSave={handleSaveFoodPlan}
      />
      <ShoppingPdfModal
        visible={shoppingPdfOpen}
        plan={foodPlans[0] ?? null}
        plans={foodPlans}
        onClose={() => setShoppingPdfOpen(false)}
      />
    </SafeAreaView>
  );
}

export default NutritionistScreen;
