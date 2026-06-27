import React from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Spacing, Typography } from '../constants/theme';

const SOURCES = [
  {
    title: 'Mifflin-St Jeor - metabolismo basal',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
  {
    title: 'National Academies - Dietary Reference Intakes',
    url: 'https://nap.nationalacademies.org/topic/380/food-and-nutrition',
  },
  {
    title: 'NCBI Bookshelf - Dietary Reference Intakes',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK545442/',
  },
  {
    title: 'NIH ODS - vitaminas e minerais',
    url: 'https://ods.od.nih.gov/factsheets/list-all/',
  },
  {
    title: 'Dietary Guidelines for Americans',
    url: 'https://www.dietaryguidelines.gov/',
  },
  {
    title: 'CDC - perda de peso gradual',
    url: 'https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html',
  },
  {
    title: 'ISSN - proteína para pessoas ativas',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
  },
  {
    title: 'USDA FoodData Central - referência complementar',
    url: 'https://fdc.nal.usda.gov/',
  },
  {
    title: 'TBCA - Tabela Brasileira de Composição de Alimentos',
    url: 'https://www.tbca.net.br/',
  },
  {
    title: 'TACO - Tabela Brasileira de Composição de Alimentos',
    url: 'https://www.nepa.unicamp.br/taco/',
  },
  {
    title: 'Open Food Facts',
    url: 'https://world.openfoodfacts.org/',
  },
];

export function NutritionDataHelpModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  function openSource(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Não foi possível abrir o link', 'Tente novamente em alguns instantes.');
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Fontes e cálculos</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.intro}>
              As metas são estimativas iniciais calculadas localmente a partir do perfil. O app não consulta essas fontes em tempo real; ele usa constantes e fórmulas derivadas das referências abaixo. As metas podem ser ajustadas pelo paciente ou nutricionista e não substituem avaliação clínica individual.
            </Text>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Metas energéticas</Text>
              <Text style={styles.text}>
                Usamos Mifflin-St Jeor para metabolismo basal, multiplicador de atividade e ajustes práticos por objetivo: déficit para emagrecimento, manutenção ou superávit para ganho de massa/peso. Os pisos calóricos são guardrails conservadores, não prescrição clínica.
              </Text>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Macronutrientes e micronutrientes</Text>
              <Text style={styles.text}>
                Vitaminas e minerais seguem valores de referência por sexo e idade quando disponíveis. Proteína, carboidratos e gorduras ficam dentro das faixas DRI/AMDR; objetivo e atividade apenas movem a distribuição dentro desses limites.
              </Text>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Base de alimentos</Text>
              <Text style={styles.text}>
                A base ativa do app usa arquivos locais baseados principalmente em TACO/TBCA e estimativas brasileiras de pratos e produtos. Para produtos industrializados fora da base, o app tenta Open Food Facts. Quando ainda não existe dado suficiente, a IA pode auxiliar no cadastro, mas o usuário deve revisar os valores antes de salvar.
              </Text>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Links usados como referência</Text>
              {SOURCES.map((source) => (
                <TouchableOpacity key={source.url} onPress={() => openSource(source.url)}>
                  <Text style={styles.sourceLink}>{source.title}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.footnote}>
              Observação: pessoas com condições médicas, uso de medicação, gestação, lactação ou dieta terapêutica devem confirmar metas e restrições com profissional de saúde.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    maxHeight: '84%',
    maxWidth: Platform.OS === 'web' ? 660 : undefined,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    alignSelf: 'stretch',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gray800 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  scroll: { paddingBottom: Spacing.sm },
  intro: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20, marginBottom: Spacing.md },
  block: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  blockTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray800, marginBottom: 6 },
  text: { fontSize: Typography.sm, color: Colors.gray600, lineHeight: 20 },
  sourceLink: {
    fontSize: Typography.sm,
    color: Colors.green600,
    fontWeight: Typography.semibold,
    lineHeight: 22,
    marginBottom: 8,
  },
  footnote: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    lineHeight: 18,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
});
