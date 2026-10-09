/** Schema fragments shared by several templates. */

export const practiceName = { type: 'string', max: 80 };
export const manageNotificationsUrl = { type: 'url' };
export const timeZone = { type: 'timezone', required: false, default: 'UTC' };
export const firstName = { type: 'string', max: 32 };
export const inboxUrl = { type: 'url' };

export const SOURCE_LABELS = {
  widget: 'Website preview widget',
  ipad: 'iPad consult mode',
  website: 'Website form'
};

export const source = { type: 'string', enum: Object.keys(SOURCE_LABELS) };
