import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

export function NativeDatePicker({
  value,
  maximumDate,
  minimumDate,
  onChange,
}: {
  value: Date;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (date: Date | null, dismissed: boolean) => void;
}) {
  function handleChange(event: DateTimePickerEvent, date?: Date) {
    onChange(date ?? null, event.type === 'dismissed');
  }

  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      onChange={handleChange}
    />
  );
}
