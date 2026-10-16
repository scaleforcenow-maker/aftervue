/**
 * @aftervue/lead-emails
 *
 * render(templateName, data, options) -> { template, subject, preheader, html, text }
 *
 * Options:
 *   utm                   boolean, default false. When true, every link that is
 *                         not a signed URL gets utm_source=aftervue-leads,
 *                         utm_medium=email and utm_campaign=<template>.
 *   logoSrc               'cid:aftervue-mark' (default) or an https URL for the
 *                         AfterVue mark. Never base64; any other scheme throws.
 *   supportAlias          footer address, default support@getaftervue.com.
 *                         Must be a plain address (no display name, no markup).
 */

import { validateTemplateData, TemplateDataError } from './validate.js';
import { withUtm } from './links.js';
import { renderHtml, renderText, DEFAULT_LOGO_SRC } from './layout.js';

import newLead from './templates/new-lead.js';
import nudge24h from './templates/nudge-24h.js';
import ownerCc72h from './templates/owner-cc-72h.js';
import weeklyDigest from './templates/weekly-digest.js';
import magicLink from './templates/magic-link.js';
import frontDeskInvite from './templates/front-desk-invite.js';
import retentionPurge from './templates/retention-purge.js';
import exportReady from './templates/export-ready.js';

export { TemplateDataError } from './validate.js';
export { UTM_SOURCE } from './links.js';

export const SUBJECT_MAX = 59; // "under 60 characters"
export const PREHEADER_MAX = 110;

const TEMPLATE_LIST = [newLead, nudge24h, ownerCc72h, weeklyDigest, magicLink, frontDeskInvite, retentionPurge, exportReady];

export const TEMPLATES = Object.freeze(Object.fromEntries(TEMPLATE_LIST.map((t) => [t.name, t])));

export function listTemplates() {
  return TEMPLATE_LIST.map((t) => ({ name: t.name, description: t.description, guardPii: t.guardPii === true }));
}

function clampSubject(subject) {
  if (subject.length <= SUBJECT_MAX) return subject;
  // Safety net only. Schema maximums keep fixture subjects well under the limit.
  return subject.slice(0, SUBJECT_MAX - 1).trimEnd() + '…';
}

function assertNoExclamation(where, value) {
  if (value.includes('!')) {
    throw new Error(`${where} contains an exclamation mark, which the AfterVue voice does not use`);
  }
}

const LOGO_SRC = /^(cid:[A-Za-z0-9._-]+|https:\/\/\S+)$/;
const SUPPORT_ALIAS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function checkOptions(options) {
  if (options.logoSrc !== undefined && (typeof options.logoSrc !== 'string' || !LOGO_SRC.test(options.logoSrc))) {
    throw new TypeError('render: options.logoSrc must be "cid:<id>" or an https URL (never data: or any other scheme)');
  }
  if (options.supportAlias !== undefined && (typeof options.supportAlias !== 'string' || !SUPPORT_ALIAS.test(options.supportAlias))) {
    throw new TypeError('render: options.supportAlias must be a plain email address');
  }
}

export function render(templateName, data, options = {}) {
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new TemplateDataError(`Unknown template "${templateName}"`, { code: 'template' });
  }
  checkOptions(options);
  const clean = validateTemplateData(template, data);
  const utm = options.utm === true;

  const link = (url, linkOpts = {}) =>
    withUtm(url, { utm: linkOpts.utm === false ? false : utm, campaign: template.name });

  const content = template.build(clean, { link });
  content.subject = clampSubject(content.subject);
  if (content.preheader.length > PREHEADER_MAX) {
    content.preheader = content.preheader.slice(0, PREHEADER_MAX - 1).trimEnd() + '…';
  }
  assertNoExclamation('subject', content.subject);
  assertNoExclamation('preheader', content.preheader);

  const layoutOpts = {
    logoSrc: options.logoSrc || DEFAULT_LOGO_SRC,
    manageNotificationsUrl: link(clean.manageNotificationsUrl),
    supportAlias: options.supportAlias
  };

  const text = renderText(content, layoutOpts);
  // The text part is built from the same content model as the HTML with no
  // markup, so checking it covers every visible string in both parts.
  assertNoExclamation('rendered email', text);

  return {
    template: template.name,
    subject: content.subject,
    preheader: content.preheader,
    html: renderHtml(content, layoutOpts),
    text
  };
}
