/**
 * Fixture data for every template. All names are obviously fake, no phone
 * numbers, no email addresses, no treatment interests, no photos. These are
 * the inputs used by the tests and by the committed previews.
 */

const manageNotificationsUrl = 'https://app.getaftervue.com/settings/notifications';
const inboxUrl = 'https://app.getaftervue.com/inbox';
const timeZone = 'America/New_York';
const practiceName = 'Sample Medspa';

export const fixtures = {
  'new-lead': {
    practiceName,
    leadFirstName: 'A. Sample',
    source: 'widget',
    receivedAt: '2026-10-08T18:05:00Z',
    timeZone,
    assigneeFirstName: 'B. Sample',
    inboxUrl: `${inboxUrl}/leads/ld_sample_0001`,
    manageNotificationsUrl
  },
  'nudge-24h': {
    practiceName,
    leadFirstName: 'A. Sample',
    assigneeFirstName: 'B. Sample',
    receivedAt: '2026-10-07T18:05:00Z',
    hoursWaiting: 24,
    timeZone,
    inboxUrl: `${inboxUrl}/leads/ld_sample_0001`,
    manageNotificationsUrl
  },
  'owner-cc-72h': {
    practiceName,
    leadFirstName: 'A. Sample',
    assigneeFirstName: 'B. Sample',
    receivedAt: '2026-10-05T18:05:00Z',
    hoursWaiting: 72,
    timeZone,
    inboxUrl: `${inboxUrl}/leads/ld_sample_0001`,
    manageNotificationsUrl
  },
  'weekly-digest': {
    practiceName,
    weekStart: '2026-10-02',
    weekEnd: '2026-10-08',
    timeZone,
    newLeads: 14,
    countsByStatus: [
      { status: 'New', count: 3 },
      { status: 'Contacted', count: 6 },
      { status: 'Booked', count: 4 },
      { status: 'Closed', count: 1 }
    ],
    responseTime: {
      respondedCount: 11,
      medianMinutes: 47,
      withinOneHourCount: 8
    },
    oldestUntouched: [
      { firstName: 'A. Sample', hoursWaiting: 70 },
      { firstName: 'C. Sample', hoursWaiting: 31 },
      { firstName: 'D. Sample', hoursWaiting: 9 }
    ],
    inboxUrl,
    manageNotificationsUrl
  },
  'magic-link': {
    recipientFirstName: 'B. Sample',
    magicLinkUrl: 'https://app.getaftervue.com/auth/verify?token=sample-token-not-real',
    expiresInMinutes: 15,
    requestedFrom: 'Safari on iPad',
    manageNotificationsUrl
  },
  'front-desk-invite': {
    practiceName,
    inviteeFirstName: 'B. Sample',
    invitedByName: 'A. Owner Sample',
    role: 'front-desk',
    acceptUrl: 'https://app.getaftervue.com/invite/accept?token=sample-invite-not-real',
    expiresInDays: 7,
    manageNotificationsUrl
  },
  'retention-purge': {
    practiceName,
    retentionDays: 90,
    deletedCount: 23,
    purgedBefore: '2026-07-10',
    purgedAt: '2026-10-08T07:00:00Z',
    timeZone,
    settingsUrl: 'https://app.getaftervue.com/settings/retention',
    manageNotificationsUrl
  },
  'export-ready': {
    practiceName,
    rowCount: 142,
    rangeStart: '2026-07-01T04:00:00Z',
    rangeEnd: '2026-10-01T04:00:00Z',
    downloadUrl: 'https://storage.googleapis.com/sample-bucket/exports/sample.csv?X-Goog-Signature=not-a-real-signature',
    expiresAt: '2026-10-09T18:00:00Z',
    timeZone,
    manageNotificationsUrl
  }
};

export default fixtures;
