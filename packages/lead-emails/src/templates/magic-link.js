import { plural } from '../util.js';
import * as c from './common.js';

/** (5) Passwordless sign-in link. The link is signed, so it is never decorated with UTM parameters. */
export default {
  name: 'magic-link',
  description: 'Passwordless sign-in link.',
  guardPii: false,
  schema: {
    recipientFirstName: { ...c.firstName, required: false },
    magicLinkUrl: { type: 'url', utm: false },
    expiresInMinutes: { type: 'int', min: 1, max: 24 * 60 },
    requestedFrom: { type: 'string', max: 80, required: false },
    manageNotificationsUrl: c.manageNotificationsUrl
  },
  build(d, { link }) {
    const url = link(d.magicLinkUrl, { utm: false });
    const greeting = d.recipientFirstName ? `${d.recipientFirstName}, use` : 'Use';
    const blocks = [
      { type: 'p', text: `${greeting} the button below to sign in to AfterVue. The link works once and expires in ${plural(d.expiresInMinutes, 'minute')}.` },
      { type: 'button', label: 'Sign in to AfterVue', url },
      { type: 'link', label: 'If the button does not work, copy this link into your browser:', url }
    ];
    if (d.requestedFrom) {
      blocks.push({ type: 'note', text: `This request came from ${d.requestedFrom}.` });
    }
    blocks.push({ type: 'note', text: 'If you did not request this link, no action is needed. Nobody can sign in without access to this mailbox.' });
    return {
      subject: 'Your AfterVue sign-in link',
      preheader: `This link signs you in once and expires in ${plural(d.expiresInMinutes, 'minute')}.`,
      eyebrow: 'Sign in',
      heading: 'Your sign-in link',
      blocks,
      why: 'You received this because someone requested a sign-in link for this address.'
    };
  }
};
