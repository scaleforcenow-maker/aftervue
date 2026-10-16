import { formatDateTime, formatHours } from '../util.js';
import * as c from './common.js';

/** (2) 24-hour nudge -> the assignee, while the lead is still "new". */
export default {
  name: 'nudge-24h',
  description: 'The assigned team member has not contacted a lead after 24 hours.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    leadFirstName: c.firstName,
    assigneeFirstName: c.firstName,
    receivedAt: { type: 'date' },
    hoursWaiting: { type: 'int', min: 1, max: 24 * 365 },
    timeZone: c.timeZone,
    inboxUrl: c.inboxUrl,
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.inboxUrl);
    return {
      subject: `24-hour reminder: ${d.leadFirstName}`,
      preheader: `${d.leadFirstName} has been waiting ${formatHours(d.hoursWaiting)} for a first reply.`,
      eyebrow: 'Reminder',
      heading: `${d.leadFirstName} is still waiting`,
      blocks: [
        { type: 'p', text: `${d.assigneeFirstName}, this lead is assigned to you and is still marked new after ${formatHours(d.hoursWaiting)}.` },
        {
          type: 'facts',
          rows: [
            ['First name', d.leadFirstName],
            ['Received', formatDateTime(d.receivedAt, d.timeZone)],
            ['Waiting', formatHours(d.hoursWaiting)]
          ]
        },
        { type: 'button', label: 'Open the lead', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url },
        { type: 'note', text: 'Marking the lead as contacted in the inbox stops these reminders. If the lead has already been reached another way, update the status so the record is accurate.' }
      ],
      why: `You received this because this lead at ${d.practiceName} is assigned to you in AfterVue.`
    };
  }
};
