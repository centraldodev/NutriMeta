import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

export function NativeTimePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date | null, dismissed: boolean) => void;
}) {
  function handleChange(event: DateTimePickerEvent, date?: Date) {
    onChange(date ?? null, event.type === 'dismissed');
  }

  return (
    <DateTimePicker
      value={value}
      mode="time"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      is24Hour
      onChange={handleChange}
    />
  );
}
