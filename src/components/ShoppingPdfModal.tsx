import React, { useMemo } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { FoodPlan, FoodPlanMeal } from '../types';
import { formatBrasiliaDate } from '../utils/nutrition';

type ShoppingPdfItem = {
  name: string;
  amount: number;
  unit: 'g' | 'ml' | 'un';
  quantityLabel: string;
  priceLabel: string;
  estimatedPrice: number;
};

function normalizeItemName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function unitAmountForPurchase(name: string, quantity: number, unit?: FoodPlanMeal['items'][number]['unit']) {
  const normalized = normalizeItemName(name);
  if (unit === 'litro') return { amount: quantity * 1000, unit: 'ml' as const };
  if (unit === 'mililitro') return { amount: quantity, unit: 'ml' as const };
  if (unit === 'grama') return { amount: quantity, unit: 'g' as const };
  if (unit === 'unidade' && /\b(ovo|ovos)\b/.test(normalized)) return { amount: quantity, unit: 'un' as const };

  const gramsByUnit: Record<string, number> = {
    colher_sopa: 15,
    colher_cha: 5,
    xicara: 160,
    concha: 120,
    fatia: 30,
    unidade: /\b(banana|maca|maça|laranja|pera)\b/.test(normalized) ? 120 : 100,
    porcao: 100,
    file: 120,
    bife_pequeno: 80,
    bife_medio: 120,
    bife_grande: 180,
  };
  return { amount: quantity * (gramsByUnit[unit ?? 'porcao'] ?? 100), unit: 'g' as const };
}

function priceRuleForFood(name: string, unit: ShoppingPdfItem['unit']) {
  const normalized = normalizeItemName(name);
  if (unit === 'ml') {
    if (/\b(leite|iogurte|suco|agua|água)\b/.test(normalized)) return { price: 5, base: 1000, label: 'R$ 5,00/L' };
    return { price: 6, base: 1000, label: 'R$ 6,00/L' };
  }
  if (unit === 'un') {
    if (/\b(ovo|ovos)\b/.test(normalized)) return { price: 1.2, base: 1, label: 'R$ 1,20/un' };
    return { price: 3, base: 1, label: 'R$ 3,00/un' };
  }
  if (/\b(frango|peito de frango|file de frango|filé de frango)\b/.test(normalized)) return { price: 22, base: 1000, label: 'R$ 22,00/kg' };
  if (/\b(carne|patinho|alcatra|coxao|coxão|bife)\b/.test(normalized)) return { price: 38, base: 1000, label: 'R$ 38,00/kg' };
  if (/\b(peixe|tilapia|tilápia|salmao|salmão|atum)\b/.test(normalized)) return { price: 45, base: 1000, label: 'R$ 45,00/kg' };
  if (/\b(arroz)\b/.test(normalized)) return { price: 6, base: 1000, label: 'R$ 6,00/kg' };
  if (/\b(feijao|feijão|lentilha|grao de bico|grão de bico)\b/.test(normalized)) return { price: 8, base: 1000, label: 'R$ 8,00/kg' };
  if (/\b(banana|maca|maça|laranja|pera|mamao|mamão|abacate)\b/.test(normalized)) return { price: 7, base: 1000, label: 'R$ 7,00/kg' };
  if (/\b(alface|tomate|brocolis|brócolis|cenoura|abobrinha|couve|espinafre)\b/.test(normalized)) return { price: 10, base: 1000, label: 'R$ 10,00/kg' };
  return { price: 15, base: 1000, label: 'R$ 15,00/kg' };
}

function formatMoney(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatPurchaseAmount(amount: number, unit: ShoppingPdfItem['unit']) {
  if (unit === 'g') return amount >= 1000 ? `${(amount / 1000).toFixed(2).replace('.', ',')} kg` : `${Math.round(amount)} g`;
  if (unit === 'ml') return amount >= 1000 ? `${(amount / 1000).toFixed(2).replace('.', ',')} L` : `${Math.round(amount)} ml`;
  return `${Math.ceil(amount)} un`;
}

function collectFoodPlanItems(plans: FoodPlan[]) {
  return plans.flatMap((plan) => plan.meals).flatMap((meal) => [
    ...meal.items,
    ...(meal.substitutions ?? []).flatMap((option) => option.items),
  ]);
}

function buildEstimatedShoppingList(plans: FoodPlan[]): ShoppingPdfItem[] {
  const grouped = new Map<string, { name: string; amount: number; unit: ShoppingPdfItem['unit'] }>();
  collectFoodPlanItems(plans).forEach((item) => {
    const quantity = item.quantityValue && item.quantityValue > 0 ? item.quantityValue : 1;
    const estimated = unitAmountForPurchase(item.name, quantity, item.unit);
    const key = `${normalizeItemName(item.name)}_${estimated.unit}`;
    const current = grouped.get(key);
    grouped.set(key, {
      name: current?.name ?? titleCase(item.name),
      unit: estimated.unit,
      amount: (current?.amount ?? 0) + estimated.amount,
    });
  });

  return Array.from(grouped.values())
    .map((item) => {
      const price = priceRuleForFood(item.name, item.unit);
      return {
        ...item,
        quantityLabel: formatPurchaseAmount(item.amount, item.unit),
        priceLabel: price.label,
        estimatedPrice: (item.amount / price.base) * price.price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pdfSafeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function encodeBase64(value: string) {
  const encoder = (globalThis as { btoa?: (text: string) => string }).btoa;
  if (encoder) return encoder(value);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let index = 0;
  while (index < value.length) {
    const c1 = value.charCodeAt(index++);
    const c2 = value.charCodeAt(index++);
    const c3 = value.charCodeAt(index++);
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = Number.isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = Number.isNaN(c3) ? 64 : c3 & 63;
    output += chars.charAt(e1) + chars.charAt(e2) + chars.charAt(e3) + chars.charAt(e4);
  }
  return output;
}

function createSimplePdfDataUri(title: string, lines: string[]) {
  const pageLines = [title, '', ...lines];
  const chunks: string[][] = [];
  for (let index = 0; index < pageLines.length; index += 42) {
    chunks.push(pageLines.slice(index, index + 42));
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  chunks.forEach((chunk) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    const stream = chunk
      .map((line, index) => `BT /F1 ${index === 0 ? 16 : 10} Tf 50 ${790 - index * 17} Td (${pdfSafeText(line)}) Tj ET`)
      .join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return `data:application/pdf;base64,${encodeBase64(body)}`;
}

function buildShoppingPdf(plans: FoodPlan[]) {
  const items = buildEstimatedShoppingList(plans);
  const total = items.reduce((sum, item) => sum + item.estimatedPrice, 0);
  const title =
    plans.length === 1
      ? plans[0].title
      : `Todos os planos alimentares (${plans.length})`;
  const nutritionistName = plans[0]?.nutritionistName ?? 'NutriMeta';
  const lines = [
    `Plano: ${title}`,
    `Nutricionista: ${nutritionistName}`,
    `Gerado em: ${formatBrasiliaDate(new Date(), { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    ...(plans.length > 1
      ? ['', 'Planos incluidos:', ...plans.map((plan) => `- ${plan.title}`)]
      : []),
    '',
    'Lista consolidada:',
    ...items.map((item) => `- ${item.name}: ${item.quantityLabel} | ${item.priceLabel} | estimado ${formatMoney(item.estimatedPrice)}`),
    '',
    `Total estimado: ${formatMoney(total)}`,
    'Valores sao medias aproximadas e podem variar por cidade, marca, safra e mercado.',
  ];
  return {
    title,
    items,
    total,
    dataUri: createSimplePdfDataUri(`Lista de compras - ${title}`, lines),
  };
}

export function ShoppingPdfModal({
  plan,
  plans,
  visible,
  onClose,
}: {
  plan: FoodPlan | null;
  plans?: FoodPlan[];
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const activePlans = useMemo(
    () => (plans && plans.length > 0 ? plans : plan ? [plan] : []),
    [plan, plans],
  );
  const pdf = useMemo(
    () => (activePlans.length > 0 ? buildShoppingPdf(activePlans) : null),
    [activePlans],
  );
  const compact = width < 520 || height < 720;
  const previewHeight = Math.round(
    Math.max(
      compact ? 220 : 300,
      Math.min(
        compact ? height * 0.42 : height * 0.5,
        Platform.OS === 'web' ? 430 : 320,
      ),
    ),
  );
  const sheetMaxHeight = Math.round(height * (compact ? 0.94 : 0.88));

  function downloadPdf() {
    if (!pdf) return;
    const fileName = `lista-compras-${pdf.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'plano'}.pdf`;
    if (Platform.OS === 'web') {
      const documentRef = (globalThis as any).document;
      if (!documentRef) return;
      const link = documentRef.createElement('a');
      link.href = pdf.dataUri;
      link.download = fileName;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    Linking.openURL(pdf.dataUri).catch(() => {
      Alert.alert('Download indisponível', 'No celular, abra pelo app web para baixar o PDF.');
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.bg}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Lista de compras</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={20} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          {pdf ? (
            <>
              <View style={styles.summary}>
                <Text style={styles.planTitle} numberOfLines={2}>{pdf.title}</Text>
                <Text style={styles.meta}>
                  {pdf.items.length} item(ns) · total estimado {formatMoney(pdf.total)}
                </Text>
              </View>
              <View style={[styles.preview, { height: previewHeight }]}>
                {Platform.OS === 'web'
                  ? React.createElement('iframe' as any, {
                      src: pdf.dataUri,
                      title: 'Lista de compras em PDF',
                      style: { width: '100%', height: '100%', border: 0 },
                    })
                  : (
                    <ScrollView contentContainerStyle={styles.fallback}>
                      {pdf.items.map((item) => (
                        <View key={`${item.name}_${item.unit}`} style={styles.item}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemMeta}>
                            {item.quantityLabel} · {item.priceLabel} · {formatMoney(item.estimatedPrice)}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
              </View>
              <TouchableOpacity style={styles.downloadBtn} onPress={downloadPdf}>
                <MaterialIcons name="download" size={20} color={Colors.white} />
                <Text style={styles.downloadText}>Baixar PDF</Text>
              </TouchableOpacity>
              <Text style={styles.disclaimer}>
                Preços são médias aproximadas e podem variar por cidade, marca, safra e mercado.
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 80, 65, 0.18)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingTop: Spacing.sm },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: Typography.lg, color: Colors.gray800, fontWeight: Typography.bold },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  summary: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  planTitle: { fontSize: Typography.base, color: Colors.gray800, fontWeight: Typography.bold },
  meta: { marginTop: 3, fontSize: Typography.sm, color: Colors.gray600, fontWeight: Typography.semibold },
  preview: { height: Platform.OS === 'web' ? 430 : 320, marginHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.gray50 },
  fallback: { padding: Spacing.sm },
  item: { paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemName: { fontSize: Typography.sm, color: Colors.gray800, fontWeight: Typography.bold },
  itemMeta: { marginTop: 3, fontSize: Typography.xs, color: Colors.gray600, lineHeight: 17 },
  downloadBtn: { minHeight: 44, marginHorizontal: Spacing.md, marginTop: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.green400, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  downloadText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },
  disclaimer: { marginHorizontal: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.sm, fontSize: Typography.xs, color: Colors.gray400, lineHeight: 16, textAlign: 'center' },
});
