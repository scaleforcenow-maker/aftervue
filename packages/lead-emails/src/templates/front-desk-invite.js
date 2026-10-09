import { plural } from '../util.js';
import * as c from './common.js';

/** (6) Front-desk invitation. The accept link is signed, so no UTM. */
export default {
  name: 'front-desk-invite',
  description: 'An owner invited a front-desk team member to the practice inbox.',
  guardPii: false,
  schema: {
    practiceName: c.practiceName,
    inviteeFirstName: { ...c.firstName, required: false },
    invitedByName: { type: 'string', max: 60 },
    role: { type: 'string', enum: ['front-desk', 'owner'], required: false, default: 'front-desk' },
    acceptUrl: { type: 'url', utm: false },
    expiresInDays: { type: 'int', min: 1, max: 30 },
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.acceptUrl, { utm: false });
    const roleLabel = d.role === 'owner' ? 'an owner' : 'a front-desk member';
    const greeting = d.inviteeFirstName ? `${d.inviteeFirstName}, ${d.invitedByName}` : d.invitedByName;
    return {
      subject: `Invitation: ${d.practiceName} on AfterVue`,
      preheader: `${d.invitedByName} invited you to work leads for ${d.practiceName}.`,
      eyebrow: 'Invitation',
      heading: `Join ${d.practiceName} on AfterVue`,
      blocks: [
        { type: 'p', text: `${greeting} has invited you to join ${d.practiceName} as ${roleLabel}. You will be able to see new leads, reply to them and mark them as contacted or booked.` },
        { type: 'button', label: 'Accept the invitation', url },
        { type: 'link', label: 'If the button does not work, copy this link into your browser:', url },
        { type: 'note', text: `This invitation expires in ${plural(d.expiresInDays, 'day')}. After that, ask ${d.invitedByName} to send a new one.` },
        { type: 'note', text: 'Lead details are protected health information. Only open the inbox on a device the practice controls.' }
      ],
      why: `You received this because ${d.invitedByName} invited you to the ${d.practiceName} team on AfterVue.`
    };
  }
};
