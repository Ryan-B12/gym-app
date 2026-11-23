import { Card, F, Screen, T } from '../components/ui';

// PLACEHOLDER — have a lawyer write the real Terms and Privacy Policy before launch.
export default function Legal() {
  return (
    <Screen>
      <T style={F.h2}>Terms of Use (draft)</T>
      <Card>
        <T>This app gives general fitness information. It is not medical advice and is not a substitute for a doctor or a certified trainer. Talk to a doctor before starting any exercise program.</T>
        <T>Coach suggestions are only suggestions. You decide what weight to lift and how hard to train, and you train at your own risk.</T>
        <T>You must be 18 or older. Partner pacts are an honor system between friends. The app never holds, sends or collects money.</T>
        <T style={F.small}>Draft for testing only. Not final terms.</T>
      </Card>
      <T style={F.h2}>Privacy (draft)</T>
      <Card>
        <T>We store your account email, workouts, plan and the answers you give us. Health check answers, pain notes and body stats are visible only to you.</T>
        <T>Your pact partner can see your name, your workouts and whether you trained at your gym. They never see your health answers, body stats or why you paused.</T>
        <T>Gym check-in uses your location once when you start a workout to answer "at the gym: yes or no." We never store where you are.</T>
        <T>You can delete your account and all your data any time from the Me tab.</T>
        <T style={F.small}>Draft for testing only. Not a final policy.</T>
      </Card>
    </Screen>
  );
}
