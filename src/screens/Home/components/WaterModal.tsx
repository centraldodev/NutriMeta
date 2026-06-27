import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { waterStyles } from '../styles';

export function WaterModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amountMl: number) => void;
}) {
  const options = [
    { label: '100 ml', sub: 'alguns goles', amount: 100 },
    { label: '250 ml', sub: '1 copo', amount: 250 },
    { label: '500 ml', sub: 'garrafa pequena', amount: 500 },
    { label: '1 litro', sub: 'garrafa grande', amount: 1000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={waterStyles.bg}>
        <TouchableOpacity style={waterStyles.backdrop} onPress={onClose} />
        <View style={waterStyles.card}>
          <Text style={waterStyles.title}>Quanto de água você bebeu?</Text>
          <View style={waterStyles.grid}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.amount}
                style={waterStyles.option}
                onPress={() => {
                  onAdd(option.amount);
                  onClose();
                }}
              >
                <Text style={waterStyles.optionTitle}>{option.label}</Text>
                <Text style={waterStyles.optionSub}>{option.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
