import { formatDateWithYear, plural } from '../util.js';
import * as c from './common.js';

/** (7) Retention purge notice -> the owner. Carries counts and dates only. */
export default {
  name: 'retention-purge',
  description: 'Leads older than the retention window were deleted.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    retentionDays: { type: 'int', min: 1, max: 3650 },
    deletedCount: { type: 'int', min: 0 },
    purgedBefore: { type: 'date' },
    purgedAt: { type: 'date' },
    timeZone: c.timeZone,
    settingsUrl: { type: 'url' },
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.settingsUrl);
    const leads = plural(d.deletedCount, 'lead');
    return {
      subject: `Retention: ${leads} removed`,
      preheader: `Leads received before ${formatDateWithYear(d.purgedBefore, d.timeZone)} were deleted under your ${d.retentionDays}-day policy.`,
      eyebrow: 'Retention',
      heading: `${leads} removed under your retention policy`,
      blocks: [
        { type: 'p', text: `AfterVue keeps lead records for ${d.practiceName} for ${plural(d.retentionDays, 'day')}. Records older than that were permanently deleted, including names, contact details, notes and any attached photos.` },
        {
          type: 'facts',
          rows: [
            ['Records removed', String(d.deletedCount)],
            ['Received before', formatDateWithYear(d.purgedBefore, d.timeZone)],
            ['Run at', formatDateWithYear(d.purgedAt, d.timeZone)],
            ['Retention window', plural(d.retentionDays, 'day')]
          ]
        },
        { type: 'p', text: 'Deleted records cannot be restored. If you need a longer window, change it in settings before the next run. Exports are available to practices with a signed BAA.' },
        { type: 'button', label: 'Review retention settings', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url }
      ],
      why: `You received this because you are the owner of ${d.practiceName} and its retention window is ${plural(d.retentionDays, 'day')}.`
    };
  }
};
