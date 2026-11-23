import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Local reminders: Thursday evening check-in and Sunday "last day" nudge. */
export async function setReminders(on: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!on) return false;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Halfway through the week', body: 'How many workouts so far? Check your pact.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 5, hour: 18, minute: 0 },
  });
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Last day of the week', body: 'One more workout could keep you even.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 10, minute: 0 },
  });
  return true;
}
