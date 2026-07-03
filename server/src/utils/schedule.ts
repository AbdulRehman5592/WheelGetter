import cronParser from 'cron-parser';
import moment from 'moment-timezone';

// Function to compute next run date based on the cron pattern and timezone
export function computeNextRun(cronExpression: string, timezone: string) {
  try {
    const interval = cronParser.parseExpression(cronExpression, { tz: timezone });
    return interval.next().toDate();
  } catch (err) {
    console.error('Error parsing cron expression:', err);
    return null;
  }
}
