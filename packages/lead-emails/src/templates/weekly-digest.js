import { formatDate, formatMinutes, formatHours, plural } from '../util.js';
import * as c from './common.js';

/**
 * (4) Weekly digest -> the owner. Counts by status and a response-time
 * summary. The only lead information is first names of the oldest untouched
 * leads, capped at five.
 */
export default {
  name: 'weekly-digest',
  description: 'Weekly summary of lead counts and response times for the owner.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    weekStart: { type: 'date' },
    weekEnd: { type: 'date' },
    timeZone: c.timeZone,
    newLeads: { type: 'int', min: 0 },
    countsByStatus: {
      type: 'array',
      max: 12,
      items: {
        type: 'object',
        fields: {
          status: { type: 'string', max: 32 },
          count: { type: 'int', min: 0 }
        }
      }
    },
    responseTime: {
      type: 'object',
      fields: {
        respondedCount: { type: 'int', min: 0 },
        medianMinutes: { type: 'number', min: 0, required: false },
        withinOneHourCount: { type: 'int', min: 0 }
      }
    },
    oldestUntouched: {
      type: 'array',
      max: 5,
      required: false,
      default: [],
      items: {
        type: 'object',
        fields: {
          firstName: c.firstName,
          hoursWaiting: { type: 'int', min: 0 }
        }
      }
    },
    inboxUrl: c.inboxUrl,
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const range = `${formatDate(d.weekStart, d.timeZone)} to ${formatDate(d.weekEnd, d.timeZone)}`;
    const url = link(d.inboxUrl);
    const rt = d.responseTime;
    const responseRows = [
      ['New leads', String(d.newLeads)],
      ['Received a first reply', String(rt.respondedCount)],
      ['Replied within one hour', String(rt.withinOneHourCount)],
      ['Median time to first reply', rt.medianMinutes == null ? 'n/a' : formatMinutes(rt.medianMinutes)]
    ];
    const blocks = [
      { type: 'p', text: `Here is how ${d.practiceName} handled leads for the week of ${range}.` },
      { type: 'facts', rows: responseRows }
    ];
    if (d.countsByStatus.length) {
      blocks.push({
        type: 'table',
        columns: ['Status', 'Leads'],
        align: ['left', 'right'],
        rows: d.countsByStatus.map((s) => [s.status, String(s.count)])
      });
    }
    if (d.oldestUntouched.length) {
      blocks.push({ type: 'p', text: `${plural(d.oldestUntouched.length, 'lead')} still waiting for a first reply:` });
      blocks.push({
        type: 'table',
        columns: ['First name', 'Waiting'],
        align: ['left', 'right'],
        rows: d.oldestUntouched.map((l) => [l.firstName, formatHours(l.hoursWaiting)])
      });
    }
    blocks.push({ type: 'button', label: 'Open the inbox', url });
    blocks.push({ type: 'link', label: 'If the button does not work, copy this link into your browser:', url });
    return {
      subject: `Weekly lead summary: ${range}`,
      preheader: `${plural(d.newLeads, 'new lead')}, ${rt.respondedCount} replied to, for ${d.practiceName}.`,
      eyebrow: 'Weekly summary',
      heading: `Leads at ${d.practiceName}, ${range}`,
      blocks,
      why: `You received this because the weekly summary is on for ${d.practiceName} in AfterVue.`
    };
  }
};
