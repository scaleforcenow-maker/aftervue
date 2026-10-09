import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { render, listTemplates, TEMPLATES, TemplateDataError, SUBJECT_MAX, PREHEADER_MAX, UTM_SOURCE } from '../src/index.js';
import { fixtures } from '../fixtures/index.js';
import { visibleText, hrefs, textUrls } from './helpers.js';

const names = listTemplates().map((t) => t.name);
const LEAD_TEMPLATES = ['new-lead', 'nudge-24h', 'owner-cc-72h', 'weekly-digest'];

describe('template catalogue', () => {
  test('exposes the eight templates in order', () => {
    assert.deepEqual(names, [
      'new-lead',
      'nudge-24h',
      'owner-cc-72h',
      'weekly-digest',
      'magic-link',
      'front-desk-invite',
      'retention-purge',
      'export-ready'
    ]);
  });

  test('every template has a fixture', () => {
    for (const name of names) assert.ok(fixtures[name], `fixture for ${name}`);
  });

  test('lead-carrying templates have the PII guard on', () => {
    for (const name of LEAD_TEMPLATES) assert.equal(TEMPLATES[name].guardPii, true, name);
  });

  test('unknown template name is rejected', () => {
    assert.throws(() => render('nope', {}), TemplateDataError);
  });
});

for (const name of names) {
  describe(`template ${name}`, () => {
    const out = render(name, fixtures[name]);
    const text = visibleText(out.html);

    test('renders with fixture data', () => {
      assert.equal(out.template, name);
      assert.ok(out.html.includes('<!DOCTYPE html'));
      assert.ok(out.html.length > 2000);
    });

    test(`subject is under 60 characters (${out.subject.length})`, () => {
      assert.ok(out.subject.length > 0);
      assert.ok(out.subject.length <= SUBJECT_MAX, `"${out.subject}" is ${out.subject.length} chars`);
    });

    test('preheader is present and bounded', () => {
      assert.ok(out.preheader.length > 10);
      assert.ok(out.preheader.length <= PREHEADER_MAX);
      assert.ok(out.html.includes(out.preheader.replace(/&/g, '&amp;')), 'preheader appears in the HTML');
    });

    test('plain-text part is present and mirrors the HTML', () => {
      assert.ok(out.text.length > 200);
      assert.ok(out.text.startsWith('AfterVue'));
      assert.ok(out.text.includes('support@getaftervue.com'));
      assert.ok(out.text.includes('Manage notifications:'));
      assert.ok(out.text.includes('You received this because'));
      // Every URL in the HTML body (minus the logo link and the Google Fonts stylesheet) is in the text part.
      const bodyLinks = hrefs(out.html).filter((h) => h.startsWith('http') && !h.includes('fonts.googleapis.com') && h !== 'https://getaftervue.com');
      for (const link of bodyLinks) assert.ok(out.text.includes(link), `text part carries ${link}`);
    });

    test('no exclamation marks in subject, preheader, visible HTML or text', () => {
      assert.ok(!out.subject.includes('!'));
      assert.ok(!out.preheader.includes('!'));
      assert.ok(!text.includes('!'), 'visible HTML text');
      assert.ok(!out.text.includes('!'), 'text part');
    });

    test('no marketing or outcome language', () => {
      const banned = /beauty score|guaranteed|amazing|transform|results you|limited time|act now|don't miss|free trial/i;
      assert.ok(!banned.test(text), text.match(banned)?.[0]);
      assert.ok(!banned.test(out.text));
    });

    test('layout: 600 px container, inlined styles, footer, logo variable', () => {
      assert.ok(out.html.includes('width="600"'));
      assert.ok(out.html.includes('max-width:600px'));
      assert.ok(/<td class="av-card"[^>]*style="/.test(out.html), 'card styles are inline');
      assert.ok(out.html.includes('src="cid:aftervue-mark"'), 'logo referenced by CID by default');
      assert.ok(!/src="data:/.test(out.html), 'no base64 images');
      assert.ok(out.html.includes('mailto:support@getaftervue.com'));
      assert.ok(out.html.includes('Manage notifications'));
      assert.ok(text.includes('You received this because'));
      assert.ok(out.html.includes('prefers-color-scheme: dark'));
      assert.ok(out.html.includes('name="color-scheme" content="light dark"'));
    });

    test('no PII in output beyond first names', () => {
      assert.ok(!/\(\d{3}\)|\d{3}-\d{4}/.test(text), 'no phone-shaped strings');
      const mails = text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi) || [];
      for (const m of mails) assert.equal(m, 'support@getaftervue.com', `only the role alias may appear, found ${m}`);
    });

    test('links carry no UTM by default', () => {
      for (const h of hrefs(out.html)) assert.ok(!h.includes('utm_source'), h);
      for (const u of textUrls(out.text)) assert.ok(!u.includes('utm_source'), u);
    });

    test('links carry utm_source=aftervue-leads when the flag is set, except signed links', () => {
      const withUtm = render(name, fixtures[name], { utm: true });
      const signedFields = Object.entries(TEMPLATES[name].schema)
        .filter(([, spec]) => spec.type === 'url' && spec.utm === false)
        .map(([k]) => fixtures[name][k]);
      const links = hrefs(withUtm.html).filter((h) => h.startsWith('http') && !h.includes('fonts.googleapis.com') && h !== 'https://getaftervue.com');
      assert.ok(links.length > 0);
      for (const h of links) {
        const url = new URL(h);
        const isSigned = signedFields.some((s) => h.startsWith(s));
        if (isSigned) {
          assert.ok(!url.searchParams.has('utm_source'), `signed link must stay untouched: ${h}`);
        } else {
          assert.equal(url.searchParams.get('utm_source'), UTM_SOURCE, h);
          assert.equal(url.searchParams.get('utm_medium'), 'email');
          assert.equal(url.searchParams.get('utm_campaign'), name);
        }
      }
      for (const u of textUrls(withUtm.text)) {
        const isSigned = signedFields.some((s) => u.startsWith(s));
        assert.equal(u.includes(`utm_source=${UTM_SOURCE}`), !isSigned, u);
      }
    });

    test('hosted logo URL can replace the CID', () => {
      const hosted = render(name, fixtures[name], { logoSrc: 'https://getaftervue.com/brand/mark.png' });
      assert.ok(hosted.html.includes('src="https://getaftervue.com/brand/mark.png"'));
      assert.ok(!hosted.html.includes('cid:aftervue-mark'));
    });
  });
}

describe('strict validation', () => {
  test('rejects unknown top-level fields on every template', () => {
    for (const name of names) {
      assert.throws(
        () => render(name, { ...fixtures[name], extraField: 'x' }),
        (e) => e instanceof TemplateDataError && e.code === 'unknown' && e.field === 'extraField',
        name
      );
    }
  });

  test('rejects unknown nested fields', () => {
    const data = structuredClone(fixtures['weekly-digest']);
    data.responseTime.averageSeconds = 10;
    assert.throws(() => render('weekly-digest', data), (e) => e.code === 'unknown' && e.field === 'responseTime.averageSeconds');
    data.responseTime = fixtures['weekly-digest'].responseTime;
    data.countsByStatus = [{ status: 'New', count: 1, note: 'x' }];
    assert.throws(() => render('weekly-digest', data), (e) => e.code === 'unknown' && e.field === 'countsByStatus[0].note');
  });

  test('rejects missing required fields', () => {
    for (const name of names) {
      const data = { ...fixtures[name] };
      delete data.manageNotificationsUrl;
      assert.throws(() => render(name, data), (e) => e.code === 'required' && e.field === 'manageNotificationsUrl', name);
    }
  });

  test('rejects wrong types, bad URLs and bad dates', () => {
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], leadFirstName: 42 }), (e) => e.code === 'type');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], inboxUrl: 'not a url' }), (e) => e.code === 'url');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], inboxUrl: 'http://app.getaftervue.com/x' }), (e) => e.code === 'url');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], inboxUrl: 'javascript:alert(1)' }), (e) => e.code === 'url');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], receivedAt: 'yesterday' }), (e) => e.code === 'date');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], source: 'carrier-pigeon' }), (e) => e.code === 'enum');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], timeZone: 'Mars/Olympus' }), (e) => e.code === 'timezone');
    assert.throws(() => render('nudge-24h', { ...fixtures['nudge-24h'], hoursWaiting: 1.5 }), (e) => e.code === 'type');
    assert.throws(() => render('nudge-24h', { ...fixtures['nudge-24h'], hoursWaiting: 0 }), (e) => e.code === 'min');
  });

  test('rejects over-long strings and multi-line names', () => {
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], leadFirstName: 'A'.repeat(33) }), (e) => e.code === 'max');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], leadFirstName: 'A\nSample' }), (e) => e.code === 'newline');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], practiceName: 'P'.repeat(81) }), (e) => e.code === 'max');
  });

  test('rejects non-object data', () => {
    assert.throws(() => render('new-lead', null), TemplateDataError);
    assert.throws(() => render('new-lead', 'string'), TemplateDataError);
    assert.throws(() => render('new-lead', []), TemplateDataError);
  });

  test('optional fields take defaults', () => {
    const data = { ...fixtures['new-lead'] };
    delete data.timeZone;
    delete data.assigneeFirstName;
    const out = render('new-lead', data);
    assert.ok(out.html.includes('6:05 PM'), 'UTC default time zone');
    assert.ok(!visibleText(out.html).includes('Assigned to'));
  });

  test('escapes HTML in user-supplied strings', () => {
    const out = render('new-lead', { ...fixtures['new-lead'], leadFirstName: '<b>Sam</b>' });
    assert.ok(!out.html.includes('<b>Sam</b>'));
    assert.ok(out.html.includes('&lt;b&gt;Sam&lt;/b&gt;'));
    assert.ok(out.text.includes('<b>Sam</b>'), 'text part is not HTML-escaped');
  });
});

describe('PII rejection on lead-carrying templates', () => {
  const forbiddenKeys = ['phone', 'email', 'photo', 'treatments', 'Phone', 'leadEmail', 'photoUrl', 'treatmentInterest', 'e-mail', 'mobilePhone'];

  for (const name of LEAD_TEMPLATES) {
    test(`${name} rejects forbidden field names`, () => {
      for (const key of forbiddenKeys) {
        assert.throws(
          () => render(name, { ...fixtures[name], [key]: 'x' }),
          (e) => e instanceof TemplateDataError && e.code === 'pii' && e.field === key,
          `${name} should reject ${key} with code pii`
        );
      }
    });

    test(`${name} rejects values that look like an email address or phone number`, () => {
      const field = name === 'weekly-digest' ? 'practiceName' : 'leadFirstName';
      for (const value of ['a.sample@example.com', '(555) 010-1234', '+1 555 010 1234', '5550101234']) {
        assert.throws(
          () => render(name, { ...fixtures[name], [field]: value }),
          (e) => e.code === 'pii',
          `${name} should reject "${value}"`
        );
      }
    });
  }

  test('weekly-digest rejects forbidden keys nested inside arrays', () => {
    const data = structuredClone(fixtures['weekly-digest']);
    data.oldestUntouched = [{ firstName: 'A. Sample', hoursWaiting: 3, phone: '555' }];
    assert.throws(() => render('weekly-digest', data), (e) => e.code === 'pii' && e.field === 'oldestUntouched[0].phone');
  });

  test('a lead first name with digits that is not a phone number is accepted', () => {
    const out = render('new-lead', { ...fixtures['new-lead'], leadFirstName: 'Sample 2nd' });
    assert.ok(out.subject.includes('Sample 2nd'));
  });

  test('non-lead templates still reject the same names as unknown fields', () => {
    for (const name of ['magic-link', 'front-desk-invite', 'retention-purge', 'export-ready']) {
      assert.throws(() => render(name, { ...fixtures[name], email: 'x' }), (e) => e.code === 'unknown' || e.code === 'pii', name);
    }
  });
});

describe('subject lines', () => {
  test('stay under 60 characters with maximum-length names', () => {
    const long = 'Maximilianabernadettejosephine'; // 30 chars, within the 32 limit
    const cases = {
      'new-lead': { leadFirstName: long },
      'nudge-24h': { leadFirstName: long },
      'owner-cc-72h': { leadFirstName: long },
      'front-desk-invite': { practiceName: 'P'.repeat(80) },
      'retention-purge': { deletedCount: 1234567 }
    };
    for (const [name, patch] of Object.entries(cases)) {
      const out = render(name, { ...fixtures[name], ...patch });
      assert.ok(out.subject.length <= SUBJECT_MAX, `${name}: "${out.subject}" (${out.subject.length})`);
    }
  });

  test('weekly digest subject names the week', () => {
    assert.equal(render('weekly-digest', fixtures['weekly-digest']).subject, 'Weekly lead summary: Oct 2 to Oct 8');
  });
});

describe('copy details', () => {
  test('new lead carries first name and inbox link only', () => {
    const out = render('new-lead', fixtures['new-lead']);
    const text = visibleText(out.html);
    assert.ok(text.includes('A. Sample'));
    assert.ok(out.html.includes('https://app.getaftervue.com/inbox/leads/ld_sample_0001'));
    assert.ok(!/treatment|botox|filler|photo/i.test(text));
  });

  test('owner CC shows Unassigned when nobody is assigned', () => {
    const data = { ...fixtures['owner-cc-72h'] };
    delete data.assigneeFirstName;
    assert.ok(visibleText(render('owner-cc-72h', data).html).includes('Unassigned'));
  });

  test('weekly digest shows counts and response times without the status table when empty', () => {
    const data = { ...fixtures['weekly-digest'], countsByStatus: [], oldestUntouched: [] };
    const text = visibleText(render('weekly-digest', data).html);
    assert.ok(text.includes('Median time to first reply 47 min'));
    assert.ok(!text.includes('still waiting'));
  });

  test('magic link states the expiry and never gets UTM', () => {
    const out = render('magic-link', fixtures['magic-link'], { utm: true });
    assert.ok(visibleText(out.html).includes('expires in 15 minutes'));
    assert.ok(out.html.includes('href="https://app.getaftervue.com/auth/verify?token=sample-token-not-real"'));
  });

  test('export link keeps its signature intact', () => {
    const out = render('export-ready', fixtures['export-ready'], { utm: true });
    assert.ok(out.html.includes(fixtures['export-ready'].downloadUrl.replace(/&/g, '&amp;')));
    assert.ok(out.text.includes(fixtures['export-ready'].downloadUrl));
  });

  test('retention notice carries counts and dates only', () => {
    const out = render('retention-purge', fixtures['retention-purge']);
    const text = visibleText(out.html);
    assert.ok(text.includes('23 leads removed'));
    assert.ok(text.includes('Jul 10, 2026'));
    assert.ok(!text.includes('Sample Medspa inbox'));
  });
});
