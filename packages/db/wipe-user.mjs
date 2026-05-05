import { db } from './index.ts';
import { events, scorecards, users } from './schema.ts';
import { eq, count } from 'drizzle-orm';

const USER_ID = '2585904f-51e7-4e0f-a9f1-c9f0850528fe';

const user = await db.query.users.findFirst({ where: eq(users.id, USER_ID) });
if (!user) { console.error('user not found'); process.exit(1); }
console.log(`user: ${user.githubLogin} (${user.email})`);

const [{ value: eventsBefore }] = await db.select({ value: count() }).from(events).where(eq(events.userId, USER_ID));
const [{ value: scorecardsBefore }] = await db.select({ value: count() }).from(scorecards).where(eq(scorecards.userId, USER_ID));
console.log(`before: events=${eventsBefore} scorecards=${scorecardsBefore}`);

const dEvents = await db.delete(events).where(eq(events.userId, USER_ID)).returning({ id: events.id });
const dScorecards = await db.delete(scorecards).where(eq(scorecards.userId, USER_ID)).returning({ id: scorecards.id });
console.log(`deleted: events=${dEvents.length} scorecards=${dScorecards.length}`);

const [{ value: eventsAfter }] = await db.select({ value: count() }).from(events).where(eq(events.userId, USER_ID));
const [{ value: scorecardsAfter }] = await db.select({ value: count() }).from(scorecards).where(eq(scorecards.userId, USER_ID));
console.log(`after: events=${eventsAfter} scorecards=${scorecardsAfter}`);

process.exit(0);
