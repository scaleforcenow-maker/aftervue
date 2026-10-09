import { formatDateTime } from '../util.js';
import * as c from './common.js';

/**
 * (1) New lead -> the practice (owner and front desk).
 * Carries the lead's first name and a link into the inbox. Nothing else.
 */
export default {
  name: 'new-lead',
  description: 'A new lead was captured and is waiting in the inbox.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    leadFirstName: c.firstName,
    source: c.source,
    receivedAt: { type: 'date' },
    timeZone: c.timeZone,
    assigneeFirstName: { ...c.firstName, required: false },
    inboxUrl: c.inboxUrl,
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const rows = [
      ['First name', d.leadFirstName],
      ['Source', c.SOURCE_LABELS[d.source]],
      ['Received', formatDateTime(d.receivedAt, d.timeZone)]
    ];
    if (d.assigneeFirstName) rows.push(['Assigned to', d.assigneeFirstName]);
    const url = link(d.inboxUrl);
    return {
      subject: `New lead: ${d.leadFirstName}`,
      preheader: `${d.leadFirstName} is waiting in the ${d.practiceName} inbox.`,
      eyebrow: 'New lead',
      heading: `${d.leadFirstName} would like to hear from ${d.practiceName}`,
      blocks: [
        { type: 'p', text: 'A new lead has been added to your AfterVue inbox. Contact details and notes are in the inbox, not in this email.' },
        { type: 'facts', rows },
        { type: 'button', label: 'Open the inbox', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url },
        { type: 'note', text: 'The inbox records the time of your first reply, which feeds the weekly summary.' }
      ],
      why: `You received this because new-lead alerts are on for ${d.practiceName} in AfterVue.`
    };
  }
};
