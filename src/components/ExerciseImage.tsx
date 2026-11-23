import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SPRITE } from '../content/sprites';
import type { Exercise } from '../lib/types';
import { C, Icon } from './ui';

/**
 * One exercise photo. Normal builds load the photo's own URL.
 * Demo builds for hosts with a file limit pack photos into sheets ("sprite:<n>")
 * and this shows the right cell of the sheet, cropped like contentFit="cover".
 */
export function ExerciseImage({ ex, frame = 0, style, label }: {
  ex: Exercise; frame?: number; style: StyleProp<ViewStyle>; label?: string;
}) {
  const src = ex.images[frame] ?? ex.images[0];
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  if (!src) {
    return (
      <View style={[{ backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Icon name="fitness" color={C.sub} />
      </View>
    );
  }
  if (!src.startsWith('sprite:')) {
    return <Image source={src} style={style as never} contentFit="cover" transition={120} accessibilityLabel={label ?? ex.name} recyclingKey={src} />;
  }
  const k = Number(src.slice(7));
  const { cols, rows, cellW, cellH, perSheet, base } = SPRITE;
  const sheet = Math.floor(k / perSheet);
  const pos = k % perSheet;
  const col = pos % cols;
  const row = Math.floor(pos / cols);
  let img = null;
  if (box) {
    const scale = Math.max(box.w / cellW, box.h / cellH);
    const dx = (box.w - cellW * scale) / 2 - col * cellW * scale;
    const dy = (box.h - cellH * scale) / 2 - row * cellH * scale;
    img = (
      <Image
        source={`${(globalThis as { __B?: string }).__B ?? '/'}${base}${sheet}.jpg`}
        style={{ position: 'absolute', left: dx, top: dy, width: cols * cellW * scale, height: rows * cellH * scale }}
        contentFit="fill"
        accessibilityLabel={label ?? ex.name}
      />
    );
  }
  return (
    <View
      style={[{ overflow: 'hidden', backgroundColor: C.card2 }, style]}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {img}
    </View>
  );
}
