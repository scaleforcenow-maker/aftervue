import { formatDateTime, formatHours } from '../util.js';
import * as c from './common.js';

/** (3) 72-hour owner copy, when a lead is still untouched. */
export default {
  name: 'owner-cc-72h',
  description: 'A lead has gone 72 hours without contact; the owner is copied.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    leadFirstName: c.firstName,
    assigneeFirstName: { ...c.firstName, required: false },
    receivedAt: { type: 'date' },
    hoursWaiting: { type: 'int', min: 1, max: 24 * 365 },
    timeZone: c.timeZone,
    inboxUrl: c.inboxUrl,
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.inboxUrl);
    const assignee = d.assigneeFirstName || 'Unassigned';
    const history = d.assigneeFirstName
      ? 'The assignee was reminded at 24 hours.'
      : 'Nobody is assigned to it, so no 24-hour reminder was sent.';
    return {
      subject: `72 hours untouched: ${d.leadFirstName}`,
      preheader: `A lead at ${d.practiceName} has had no first reply for ${formatHours(d.hoursWaiting)}.`,
      eyebrow: 'Owner copy',
      heading: `${d.leadFirstName} has not been contacted`,
      blocks: [
        { type: 'p', text: `This lead was received ${formatHours(d.hoursWaiting)} ago and is still marked new. ${history}` },
        {
          type: 'facts',
          rows: [
            ['First name', d.leadFirstName],
            ['Assigned to', assignee],
            ['Received', formatDateTime(d.receivedAt, d.timeZone)],
            ['Waiting', formatHours(d.hoursWaiting)]
          ]
        },
        { type: 'button', label: 'Open the lead', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url },
        { type: 'note', text: 'You can reassign the lead or contact the person yourself from the inbox. No further reminders are sent for this lead.' }
      ],
      why: `You received this because you are the owner of ${d.practiceName} in AfterVue and a lead has gone 72 hours without contact.`
    };
  }
};
