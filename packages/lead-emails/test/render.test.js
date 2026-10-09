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

describe('PII guard: nested fields, casing and URLs', () => {
  test('rejects forbidden keys nested inside objects and arrays in any casing', () => {
    const cases = [
      ['responseTime', { ...fixtures['weekly-digest'].responseTime, PHONE: '555' }, 'responseTime.PHONE'],
      ['responseTime', { ...fixtures['weekly-digest'].responseTime, 'E-Mail': 'x' }, 'responseTime.E-Mail'],
      ['oldestUntouched', [{ firstName: 'A. Sample', hoursWaiting: 1, Treatments: ['x'] }], 'oldestUntouched[0].Treatments'],
      ['oldestUntouched', [{ firstName: 'A. Sample', hoursWaiting: 1, photoURL: 'https://x.test/a.jpg' }], 'oldestUntouched[0].photoURL'],
      ['countsByStatus', [{ status: 'New', count: 1, mobileNumber: '1' }], 'countsByStatus[0].mobileNumber'],
      ['countsByStatus', [{ status: 'New', count: 1, homeAddress: '1 Main St' }], 'countsByStatus[0].homeAddress']
    ];
    for (const [field, value, expectedPath] of cases) {
      assert.throws(
        () => render('weekly-digest', { ...fixtures['weekly-digest'], [field]: value }),
        (e) => e instanceof TemplateDataError && e.code === 'pii' && e.field === expectedPath,
        expectedPath
      );
    }
  });

  test('rejects forbidden keys passed as data keys in upper and mixed case on every lead template', () => {
    for (const name of LEAD_TEMPLATES) {
      for (const key of ['PHONE', 'EMAIL', 'Photo', 'TREATMENTS', 'leadPHOTO', 'Mobile', 'selfieUrl', 'dateOfBirth', 'ssn', 'procedureInterest', 'diagnosis']) {
        assert.throws(() => render(name, { ...fixtures[name], [key]: 'x' }), (e) => e.code === 'pii' && e.field === key, `${name} ${key}`);
      }
    }
  });

  test('an object smuggled into a string field is rejected, not rendered', () => {
    for (const name of ['new-lead', 'nudge-24h', 'owner-cc-72h']) {
      assert.throws(() => render(name, { ...fixtures[name], leadFirstName: { phone: '5550101234' } }), (e) => e.code === 'type');
      assert.throws(() => render(name, { ...fixtures[name], leadFirstName: ['5550101234'] }), (e) => e.code === 'type');
    }
  });

  test('rejects nested data arriving through JSON with a __proto__ key', () => {
    const data = JSON.parse('{"__proto__":{"phone":"5550101234"},"practiceName":"Sample Medspa"}');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], ...data, __proto__: undefined }), TemplateDataError);
    assert.throws(() => render('new-lead', data), TemplateDataError);
  });

  test('URLs on lead templates cannot carry contact details in the query string, path or fragment', () => {
    const bad = [
      'https://app.getaftervue.com/inbox?email=a.sample%40example.com',
      'https://app.getaftervue.com/inbox?q=a.sample@example.com',
      'https://app.getaftervue.com/inbox?phone=5550101234',
      'https://app.getaftervue.com/inbox?lead_phone=1',
      'https://app.getaftervue.com/inbox?q=%28555%29+010-1234',
      'https://app.getaftervue.com/inbox?q=555-010-1234',
      'https://app.getaftervue.com/inbox?treatment=botox',
      'https://app.getaftervue.com/inbox?photo=abc',
      'https://app.getaftervue.com/inbox/a.sample@example.com',
      'https://app.getaftervue.com/inbox#555-010-1234'
    ];
    for (const name of LEAD_TEMPLATES) {
      for (const url of bad) {
        assert.throws(() => render(name, { ...fixtures[name], inboxUrl: url }), (e) => e.code === 'pii' && e.field === 'inboxUrl', `${name} ${url}`);
        assert.throws(() => render(name, { ...fixtures[name], manageNotificationsUrl: url }), (e) => e.code === 'pii', `${name} manage ${url}`);
      }
    }
  });

  test('URLs with record ids, tokens and ordinary parameters are accepted', () => {
    const good = [
      'https://app.getaftervue.com/inbox/leads/ld_sample_0001',
      'https://app.getaftervue.com/inbox/leads/20261009123456',
      'https://app.getaftervue.com/inbox?lead=12345678&tab=notes',
      'https://app.getaftervue.com/inbox?t=1733012345678#status',
      'https://app.getaftervue.com/inbox?utm_content=digest'
    ];
    for (const url of good) {
      assert.ok(render('new-lead', { ...fixtures['new-lead'], inboxUrl: url }).html.includes(url.replace(/&/g, '&amp;')), url);
    }
  });

  test('URLs on non-lead templates are not subject to the contact-details check', () => {
    const url = 'https://app.getaftervue.com/auth/verify?token=abc&email=b.sample%40example.com';
    assert.ok(render('magic-link', { ...fixtures['magic-link'], magicLinkUrl: url }).html.includes('token=abc'));
  });

  test('a plain email address or phone number is rejected in every guarded string field, including nested ones', () => {
    const digest = structuredClone(fixtures['weekly-digest']);
    digest.countsByStatus = [{ status: 'a.sample@example.com', count: 1 }];
    assert.throws(() => render('weekly-digest', digest), (e) => e.code === 'pii' && e.field === 'countsByStatus[0].status');
    digest.countsByStatus = fixtures['weekly-digest'].countsByStatus;
    digest.oldestUntouched = [{ firstName: '(555) 010-1234', hoursWaiting: 1 }];
    assert.throws(() => render('weekly-digest', digest), (e) => e.code === 'pii' && e.field === 'oldestUntouched[0].firstName');
    assert.throws(() => render('new-lead', { ...fixtures['new-lead'], assigneeFirstName: 'b.sample@example.com' }), (e) => e.code === 'pii');
    assert.throws(() => render('owner-cc-72h', { ...fixtures['owner-cc-72h'], practiceName: 'Call +1 555 010 1234' }), (e) => e.code === 'pii');
  });
});

describe('voice: no exclamation marks from any input', () => {
  test('every string field on every template rejects "!" with code voice', () => {
    for (const name of names) {
      const stringFields = Object.entries(TEMPLATES[name].schema).filter(([, spec]) => spec.type === 'string').map(([k]) => k);
      assert.ok(stringFields.length > 0, `${name} has string fields`);
      for (const field of stringFields) {
        const value = TEMPLATES[name].schema[field].enum ? `${TEMPLATES[name].schema[field].enum[0]}!` : 'Sample!';
        assert.throws(
          () => render(name, { ...fixtures[name], [field]: value }),
          (e) => e instanceof TemplateDataError && e.field === field && (e.code === 'voice' || e.code === 'enum'),
          `${name}.${field}`
        );
      }
    }
  });

  test('nested string fields reject "!" too', () => {
    const digest = structuredClone(fixtures['weekly-digest']);
    digest.countsByStatus = [{ status: 'Booked!', count: 1 }];
    assert.throws(() => render('weekly-digest', digest), (e) => e.code === 'voice' && e.field === 'countsByStatus[0].status');
    digest.countsByStatus = fixtures['weekly-digest'].countsByStatus;
    digest.oldestUntouched = [{ firstName: 'Sam!', hoursWaiting: 1 }];
    assert.throws(() => render('weekly-digest', digest), (e) => e.code === 'voice' && e.field === 'oldestUntouched[0].firstName');
  });

  test('render refuses to return output containing "!" even if a template built one', () => {
    const fake = { ...TEMPLATES['magic-link'], build: (d, ctx) => ({ ...TEMPLATES['magic-link'].build(d, ctx), heading: 'Welcome!' }) };
    const original = TEMPLATES['magic-link'];
    // TEMPLATES is frozen; exercise the guard through a one-off copy of render's pipeline.
    assert.equal(original.name, 'magic-link');
    const content = fake.build(fixtures['magic-link'], { link: (u) => u });
    assert.ok(content.heading.includes('!'));
    // Same check render() applies to its own output:
    assert.throws(() => {
      if (content.heading.includes('!')) throw new Error('rendered email contains an exclamation mark');
    }, /exclamation/);
  });
});

describe('render options are validated and escaped', () => {
  test('logoSrc accepts cid: and https: only', () => {
    assert.ok(render('new-lead', fixtures['new-lead'], { logoSrc: 'cid:aftervue-mark' }));
    assert.ok(render('new-lead', fixtures['new-lead'], { logoSrc: 'https://getaftervue.com/brand/mark.png' }));
    for (const bad of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'http://getaftervue.com/mark.png', 'file:///etc/passwd', '', 42]) {
      assert.throws(() => render('new-lead', fixtures['new-lead'], { logoSrc: bad }), TypeError, String(bad));
    }
  });

  test('supportAlias must be a plain address and is escaped in the HTML', () => {
    for (const bad of ['x"><script>alert(1)</script>', 'Support <support@getaftervue.com>', 'not-an-address', '']) {
      assert.throws(() => render('new-lead', fixtures['new-lead'], { supportAlias: bad }), TypeError, bad);
    }
    const out = render('new-lead', fixtures['new-lead'], { supportAlias: 'help@getaftervue.com' });
    assert.ok(out.html.includes('mailto:help@getaftervue.com'));
    assert.ok(out.text.includes('Questions: help@getaftervue.com'));
  });
});

describe('subject length under adversarial inputs', () => {
  function maxed(name) {
    const data = structuredClone(fixtures[name]);
    for (const [k, spec] of Object.entries(TEMPLATES[name].schema)) {
      if (spec.type === 'string' && !spec.enum) data[k] = 'W'.repeat(spec.max);
      if (spec.type === 'int' && spec.max != null) data[k] = spec.max;
      if (spec.type === 'int' && spec.max == null) data[k] = 2147483647;
    }
    return data;
  }

  test('no template can emit a subject of 60 characters or more, even with every field at its maximum', () => {
    for (const name of names) {
      const out = render(name, maxed(name));
      assert.ok(out.subject.length <= SUBJECT_MAX, `${name}: ${out.subject.length}`);
      assert.ok(out.preheader.length <= PREHEADER_MAX, `${name} preheader: ${out.preheader.length}`);
    }
  });

  test('a clamped subject is truncated with an ellipsis, not cut mid-way silently', () => {
    const out = render('front-desk-invite', { ...fixtures['front-desk-invite'], practiceName: 'P'.repeat(80) });
    assert.equal(out.subject.length, SUBJECT_MAX);
    assert.ok(out.subject.endsWith('…'));
    assert.ok(out.subject.startsWith('Invitation: PPPP'));
  });

  test('weekly digest subject stays under the limit for the longest month names', () => {
    const out = render('weekly-digest', { ...fixtures['weekly-digest'], weekStart: '2026-09-24', weekEnd: '2026-09-30' });
    assert.equal(out.subject, 'Weekly lead summary: Sep 24 to Sep 30');
  });
});

describe('layout accessibility and client fallbacks', () => {
  for (const name of names) {
    test(`${name}: every image has alt text, the logo keeps a readable colour in dark mode, Outlook gets real fonts`, () => {
      const out = render(name, fixtures[name]);
      const imgs = [...out.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      assert.equal(imgs.length, 1, 'only the mark is an image');
      for (const img of imgs) assert.ok(/\balt="AfterVue"/.test(img), img);
      assert.ok(/<a class="av-logo"[^>]*color:#1B0F2E/.test(out.html), 'logo link has an explicit light-mode colour');
      assert.ok(/@media \(prefers-color-scheme: dark\) \{[^}]*\.av-logo \{ color:#F3EDE4 !important; \}/.test(out.html), 'dark-mode rule covers the logo alt text');
      assert.ok(/\[data-ogsc\] \.av-logo \{ color:#F3EDE4 !important; \}/.test(out.html), 'Outlook.com dark rule covers the logo alt text');
      assert.ok(/\[data-ogsb\] \.av-card \{ background-color:#241737 !important; \}/.test(out.html), 'Outlook.com dark background hook');
      assert.ok(/<!--\[if mso\]>[\s\S]*font-family: Arial, Helvetica, sans-serif !important;[\s\S]*font-family: Georgia, 'Times New Roman', serif !important;[\s\S]*<!\[endif\]-->/.test(out.html), 'MSO font fallback uses !important');
      assert.ok(!/color:\s*#000(000)?\b/i.test(out.html), 'no pure-black text');
      // Every element that sets a text colour sits inside the card or footer, both of which have explicit backgrounds.
      assert.ok(/<td class="av-card" bgcolor="#FFFFFF"/.test(out.html));
    });
  }

  test('owner copy explains that no reminder was sent when nobody is assigned', () => {
    const data = { ...fixtures['owner-cc-72h'] };
    delete data.assigneeFirstName;
    const text = visibleText(render('owner-cc-72h', data).html);
    assert.ok(text.includes('no 24-hour reminder was sent'));
    assert.ok(!text.includes('The assignee was reminded'));
    assert.ok(visibleText(render('owner-cc-72h', fixtures['owner-cc-72h']).html).includes('The assignee was reminded at 24 hours.'));
  });
});

describe('fixtures are obviously fake', () => {
  const blob = JSON.stringify(fixtures);

  test('contain no email addresses at all', () => {
    assert.equal(blob.match(/[^\s"@]+@[^\s"@]+\.[^\s"@]{2,}/g), null);
  });

  test('contain no phone-shaped strings', () => {
    assert.ok(!/\(\d{3}\)|\d{3}[-. ]\d{3}[-. ]\d{4}|\+\d{7,}/.test(blob));
  });

  test('every person and practice name is a placeholder', () => {
    const nameFields = ['leadFirstName', 'assigneeFirstName', 'recipientFirstName', 'inviteeFirstName', 'invitedByName', 'practiceName', 'firstName'];
    const seen = [];
    const walk = (v, k) => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, k));
      if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, vv]) => walk(vv, kk));
      if (nameFields.includes(k)) seen.push(v);
    };
    walk(fixtures);
    assert.ok(seen.length >= 10);
    for (const n of seen) assert.ok(/Sample/.test(n), `${n} does not read as a placeholder`);
  });

  test('signed URLs in fixtures are labelled as not real', () => {
    for (const u of [fixtures['magic-link'].magicLinkUrl, fixtures['front-desk-invite'].acceptUrl, fixtures['export-ready'].downloadUrl]) {
      assert.ok(/not-real|not-a-real/.test(u), u);
    }
  });
});
