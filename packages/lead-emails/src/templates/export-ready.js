import { formatDateTime, formatDateWithYear, plural } from '../util.js';
import * as c from './common.js';

/** (8) CSV export ready. BAA-gated, link only, expiring. The download link is signed, so no UTM. */
export default {
  name: 'export-ready',
  description: 'A CSV export of leads is ready to download.',
  guardPii: true,
  schema: {
    practiceName: c.practiceName,
    rowCount: { type: 'int', min: 0 },
    rangeStart: { type: 'date', required: false },
    rangeEnd: { type: 'date', required: false },
    downloadUrl: { type: 'url', utm: false },
    expiresAt: { type: 'date' },
    timeZone: c.timeZone,
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.downloadUrl, { utm: false });
    const rows = [
      ['Practice', d.practiceName],
      ['Rows', String(d.rowCount)],
      ['Link expires', formatDateTime(d.expiresAt, d.timeZone)]
    ];
    if (d.rangeStart && d.rangeEnd) {
      rows.splice(1, 0, ['Date range', `${formatDateWithYear(d.rangeStart, d.timeZone)} to ${formatDateWithYear(d.rangeEnd, d.timeZone)}`]);
    }
    return {
      subject: 'Your lead export is ready',
      preheader: `${plural(d.rowCount, 'row')} for ${d.practiceName}. The link expires ${formatDateTime(d.expiresAt, d.timeZone)}.`,
      eyebrow: 'Export',
      heading: 'Your CSV export is ready',
      blocks: [
        { type: 'p', text: 'The export you requested has been prepared. It is not attached to this email. Use the link below to download it.' },
        { type: 'facts', rows },
        { type: 'button', label: 'Download the export', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url },
        { type: 'note', text: 'The file contains protected health information and is available because a Business Associate Agreement is on file for this practice. Store it only where your HIPAA policy allows, and delete it when it is no longer needed. The link stops working at the time shown above.' }
      ],
      why: 'You received this because you requested a CSV export from AfterVue.'
    };
  }
};
