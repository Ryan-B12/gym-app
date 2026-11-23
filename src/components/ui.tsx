import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = {
  bg: '#0E0F12',
  card: '#181A20',
  card2: '#1F222A',
  line: '#2A2D36',
  text: '#F4F5F7',
  sub: '#A3A8B3',
  dim: '#7D828D',
  me: '#FF7A1A',
  meInk: '#1A0E05',
  meSoft: '#2A1A0C',
  partner: '#5AA2FF',
  good: '#7FE0A8',
  goodSoft: '#16281F',
  warn: '#FF8A8A',
  warnSoft: '#2A1618',
};

export const F = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: C.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: C.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: C.text },
  body: { fontSize: 15, color: C.text, lineHeight: 21 },
  sub: { fontSize: 14, color: C.sub, lineHeight: 20 },
  small: { fontSize: 12, color: C.sub },
  label: { fontSize: 12, color: C.sub, fontWeight: '700' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Screen({ children, scroll = true, padded = true, footer }: {
  children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode;
}) {
  const inner = <View style={[{ gap: 16 }, padded && { padding: 20, paddingBottom: 40 }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView> : <View style={{ flex: 1 }}>{inner}</View>}
      {footer ? <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'me' | 'good' | 'warn' }) {
  const toneStyle = tone === 'me' ? { backgroundColor: C.meSoft, borderColor: '#6B3A12' }
    : tone === 'good' ? { backgroundColor: C.goodSoft, borderColor: '#2C5A41' }
    : tone === 'warn' ? { backgroundColor: C.warnSoft, borderColor: '#5A2A30' } : null;
  return <View style={[s.card, toneStyle, style]}>{children}</View>;
}

export function T({ children, style, ...rest }: TextProps & { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[F.body, style]} {...rest}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, busy, style, small }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'partner';
  icon?: IconName; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = kind === 'primary' ? C.me : kind === 'partner' ? C.partner : kind === 'secondary' ? C.card2 : 'transparent';
  const fg = kind === 'primary' ? C.meInk : kind === 'partner' ? '#071423' : kind === 'danger' ? C.warn : C.text;
  const border = kind === 'secondary' || kind === 'ghost' ? C.line : kind === 'danger' ? '#5A2A30' : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!busy }}
      onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [
        s.btn, small && { height: 44, paddingHorizontal: 14 },
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={small ? 16 : 19} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.chip, on && { backgroundColor: C.meSoft, borderColor: C.me }]}
    >
      {icon ? <Icon name={icon} size={16} color={on ? C.me : C.sub} /> : null}
      <Text style={{ color: on ? C.text : C.sub, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Choice({ title, detail, on, onPress, icon }: { title: string; detail?: string; on: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={title}
      onPress={onPress}
      style={[s.choice, on && { borderColor: C.me, backgroundColor: C.meSoft }]}
    >
      {icon ? <Icon name={icon} size={22} color={on ? C.me : C.sub} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
        {detail ? <Text style={F.sub}>{detail}</Text> : null}
      </View>
      <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.me : C.dim} />
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={F.label}>{label}</Text>
      <TextInput placeholderTextColor={C.dim} style={s.input} accessibilityLabel={label} {...props} />
      {hint ? <Text style={F.small}>{hint}</Text> : null}
    </View>
  );
}

export function Progress({ value, color = C.me, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, backgroundColor: C.line, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, suffix }: {
  value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Less" onPress={() => onChange(Math.max(min, value - step))} style={s.stepBtn}>
        <Icon name="remove" size={22} />
      </Pressable>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', minWidth: 90, textAlign: 'center' }}>{value}{suffix ? ` ${suffix}` : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => onChange(Math.min(max, value + step))} style={s.stepBtn}>
        <Icon name="add" size={22} />
      </Pressable>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 12, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={F.h2}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.stepBtn}>
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Badge({ label, color = C.good, icon }: { label: string; color?: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={12} color={color} /> : null}
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  btn: { height: 54, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.text, paddingHorizontal: 14, fontSize: 16 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
});
