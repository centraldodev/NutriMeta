import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  emoji?: string;
  name?: string;
  size?: number;
  variant?: 'plain' | 'badge';
};

function normalize(value?: string) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function has(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function iconForFood(name?: string, emoji?: string): IconName {
  const text = normalize(`${name ?? ''} ${emoji ?? ''}`);

  if (has(text, ['pizza', '🍕'])) return 'pizza';
  if (has(text, ['hamburguer', 'hamburger', 'x-salada', 'x-bacon', 'x-egg', 'x-tudo', '🍔'])) return 'hamburger';
  if (has(text, ['cachorro-quente', 'hot dog', 'sanduiche', 'misto quente', 'bauru', 'beirute', '🥪'])) return 'food-variant';
  if (has(text, ['pao', 'croissant', 'torrada', '🥐'])) return 'food-croissant';
  if (has(text, ['macarrao', 'massa', 'lasanha', 'nhoque', 'espaguete', 'yakisoba', '🍝'])) return 'noodles';
  if (has(text, ['arroz', 'risoto', '🍚'])) return 'rice';
  if (has(text, ['feijao', 'lentilha', 'grao de bico', 'ervilha', '🫘'])) return 'seed';
  if (has(text, ['tapioca', 'cuscuz', 'polvilho', 'farinha', 'farofa', 'granola', 'cereal', '🌾', '🫓'])) return 'grain';

  if (has(text, ['frango', 'galinha', 'peru', '🍗'])) return 'food-drumstick';
  if (has(text, ['bife', 'carne', 'picanha', 'alcatra', 'contra', 'costela', 'cupim', '🥩'])) return 'food-steak';
  if (has(text, ['bacon', 'linguica', 'calabresa', 'presunto', 'salsicha', '🥓'])) return 'food-hot-dog';
  if (has(text, ['peixe', 'tilapia', 'salmao', 'atum', 'sardinha', '🐟'])) return 'fish';
  if (has(text, ['camarao', 'frutos do mar', '🦐'])) return 'fish';
  if (has(text, ['ovo', 'omelete', '🥚'])) return 'egg';

  if (has(text, ['leite', 'iogurte', '🥛'])) return 'cup';
  if (has(text, ['queijo', '🧀'])) return 'cheese';
  if (has(text, ['azeite', 'oleo', 'manteiga', 'margarina', 'maionese', '🫒'])) return 'bottle-tonic';
  if (has(text, ['amendoim', 'castanha', 'nozes', 'semente', '🥜'])) return 'peanut';

  if (has(text, ['agua', 'suco', 'refrigerante', 'vitamina', 'achocolatado', '🥤', '💧', '🧃'])) return 'cup-water';
  if (has(text, ['cafe', '☕'])) return 'coffee';
  if (has(text, ['cerveja', '🍺'])) return 'beer';
  if (has(text, ['vinho', '🍷'])) return 'glass-wine';

  if (has(text, ['banana', '🍌'])) return 'fruit-cherries';
  if (has(text, ['uva', '🍇'])) return 'fruit-grapes';
  if (has(text, ['abacaxi', '🍍'])) return 'fruit-pineapple';
  if (has(text, ['melancia', '🍉'])) return 'fruit-watermelon';
  if (has(text, ['maca', 'fruta', 'goiaba', 'pera', 'morango', 'manga', 'mamao', '🍎', '🍓', '🥭', '🍊', '🫐'])) return 'food-apple';

  if (has(text, ['cenoura', '🥕'])) return 'carrot';
  if (has(text, ['milho', '🌽'])) return 'corn';
  if (has(text, ['tomate', '🍅'])) return 'fruit-cherries';
  if (has(text, ['cogumelo', 'champignon', '🍄'])) return 'mushroom';
  if (has(text, ['pimenta', 'pimentao', '🌶️'])) return 'chili-mild';
  if (has(text, ['batata', 'mandioca', 'macaxeira', 'inhame', '🥔'])) return 'food-variant';
  if (has(text, ['salada', 'alface', 'couve', 'verdura', 'legume', '🥬', '🥗'])) return 'leaf';

  if (has(text, ['bolo', 'torta', 'cupcake', '🍰'])) return 'cake-variant';
  if (has(text, ['brigadeiro', 'chocolate', 'doce', 'sorvete', 'biscoito', 'bolacha', '🍬'])) return 'candy';
  if (has(text, ['coxinha', 'pastel', 'empada', 'esfiha', 'kibe', 'risole', 'croquete', '🥟'])) return 'food';
  if (has(text, ['batata frita', 'fritas', 'chips', '🍟'])) return 'french-fries';
  if (has(text, ['sopa', 'caldo', 'canja', '🍲'])) return 'pot-steam';
  if (has(text, ['whey', 'creatina', 'suplemento', '💪'])) return 'arm-flex';

  return 'silverware-fork-knife';
}

export function FoodIcon({ emoji, name, size = 22, variant = 'badge' }: Props) {
  const icon = iconForFood(name, emoji);
  const color = Colors.green600;

  if (variant === 'plain') {
    return <MaterialCommunityIcons name={icon} size={size} color={color} />;
  }

  return (
    <View style={[styles.badge, { width: size + 14, height: size + 14, borderRadius: (size + 14) / 2 }]}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
  },
});
