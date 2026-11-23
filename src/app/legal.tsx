import { useState } from 'react';
import { View } from 'react-native';
import { C, Card, Chip, F, Row, Screen, T } from '../components/ui';
import { LEGAL } from '../content/legal';

// DRAFT text from docs/legal/. Have a lawyer finalize it before launch.
export default function Legal() {
  const [tab, setTab] = useState<'terms' | 'privacy'>('terms');
  return (
    <Screen>
      <Row>
        <Chip label="Terms of Use" on={tab === 'terms'} onPress={() => setTab('terms')} />
        <Chip label="Privacy" on={tab === 'privacy'} onPress={() => setTab('privacy')} />
      </Row>
      <Card>
        {LEGAL[tab].map((b, i) => {
          if (b.t === 'title') return <T key={i} style={F.h2}>{b.x}</T>;
          if (b.t === 'h') return <T key={i} style={[F.h3, { marginTop: 8 }]}>{b.x}</T>;
          if (b.t === 'note') return <T key={i} style={[F.small, { color: C.warn }]}>{b.x}</T>;
          if (b.t === 'li') return (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <T style={{ color: C.sub }}>•</T><T style={{ flex: 1 }}>{b.x}</T>
            </View>
          );
          return <T key={i}>{b.x}</T>;
        })}
      </Card>
    </Screen>
  );
}
