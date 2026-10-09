---
title: "Medspa Website Conversion: Measure Consults, Not Traffic"
description: "Measure medspa website conversion with four numbers, not traffic: event setup in Plausible or GA4, UTM rules, call tracking, and a weekly review template."
slug: what-to-measure-medspa-website
date: 2026-10-09
cluster: "F"
target_page: "/"
keywords:
  - medspa website conversion
  - increase medspa consultation bookings
  - medspa lead generation
internal_links: ["/", "/app/", "/services.html", "/resources/"]
sources:
  - name: "Plausible docs: Custom event goals"
    url: https://docs.plausible.io/custom-event-goals
  - name: "Google Analytics Help: [GA4] Recommended events"
    url: https://support.google.com/analytics/answer/9267735
  - name: "HHS OCR bulletin: Use of Online Tracking Technologies by HIPAA Covered Entities and Business Associates"
    url: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html
  - name: "Nixon Peabody alert: Portions of OCR's bulletin on online tracking technologies deemed unlawful (July 3, 2024)"
    url: https://nixonpeabody.com/insights/alerts/2024/07/03/portions-of-ocrs-bulletin-on-online-tracking-technologies-deemed-unlawful
status: reviewed
---

Medspa website conversion comes down to four numbers, and traffic is not one of them. Count booking starts, completed requests, consults held, and treatments scheduled. The first two come from your analytics tool, the last two from your booking software, and all four fit on one line of a spreadsheet. Set them up once, read them for fifteen minutes a week, and you will know which part of the funnel to work on instead of guessing.

[The earlier article on why a medspa website is not converting](/resources/) covers what to fix. This one covers how to know whether the fix worked.

## The four numbers behind medspa website conversion

1. **Booking starts.** Clicks on a book or request button, the consultation form opening, or a tap on your booking link.
2. **Completed requests.** Forms submitted, a booking confirmation page reached, or a call placed from the site.
3. **Consults held.** Not scheduled, held. This number lives in your booking software.
4. **Treatments scheduled.** Consults that turned into a treatment appointment.

Read the ratios between neighbors. Many visitors but few starts points at the page or the offer. Many starts but few completions points at friction in the booking flow. Many completions but few consults held points at follow-up speed. Many consults held but few treatments scheduled is a consult-room issue, not a website one.

## Measurement setup checklist

No step needs a developer.

1. Pick one analytics tool, Plausible or Google Analytics 4, and install its snippet on every page, including the booking page if it lives on your domain.
2. Create the booking start event and fire it on every book or request button and on the form opening.
3. Create the completed request event, fire it on form submission or on the confirmation page, and mark it as the goal or key event.
4. Add a tap-to-call event on mobile and count it as a booking start.
5. Tag every external link that points at your site, starting with the Instagram bio and the Google Business Profile website button.
6. Decide where consults held and treatments scheduled will be read from each week.
7. Copy the weekly review template below and put the review on the calendar.

## Events in Plausible

Plausible's docs give two routes. Switch the snippet to the tagged-events script and add a class such as `plausible-event-name=Booking+Start` to the button, or call `plausible('Booking Start')` from your own code. The event does nothing until you create a goal in the dashboard with the exact same name. Custom properties are supported; use one for a generic treatment category.

## Events in GA4

Google publishes recommended event names, and lead generation has its own set. The event `generate_lead` is meant for a submitted form, so fire it on a completed request and mark it as a key event. The later stages, `qualify_lead`, `working_lead`, and `close_convert_lead`, are built for data sent from a CRM or an offline process. Leave consults held and treatments scheduled in your booking software. For the top of the funnel, a custom event named `booking_start` is fine.

## UTM rules for Instagram and Google Business Profile

Without tags, profile and bio clicks blend into organic or direct traffic. Two rules keep it manageable. First, agree on one lowercase spelling for each source and medium: Instagram gets `utm_source=instagram&utm_medium=social&utm_campaign=bio`, and your profile gets `utm_source=google&utm_medium=gbp&utm_campaign=profile`. Second, keep tags off links between pages on your own site, or you overwrite the original source mid-visit. After saving the profile link, open it from the live listing on a phone to confirm the tags survive.

## Call tracking caveats

Call tracking services swap in a different number per source, which changes the number shown on your listing. Call recordings capture health details, so either turn recording off or treat the vendor as a business associate with a signed agreement. The simplest honest approach is the tap-to-call event plus a front-desk tally of calls that booked.

## What never goes into an analytics event

An event carries a page, an event name, and at most a generic property. Never a name, email, phone number, photo, date of birth, or free-text note. The HHS Office for Civil Rights bulletin on online tracking technologies gives the agency's view of when website data is protected health information. In June 2024 a federal court in Texas vacated the part covering unauthenticated public pages, and the agency later withdrew its appeal; the rest stands as guidance. Court rulings do not change what a patient expects, and state privacy laws still apply. This is not legal advice.

## Where a preview tool fits in medspa lead generation

An embedded preview adds three events between the visit and the booking start: preview started, preview generated, and booking click. Previews without booking clicks mean the handoff needs work; booking clicks without completions mean the booking page does.

AfterVue's events carry a generic treatment area and nothing else. Photos are never stored, so there is nothing to leak into analytics. The booking click is the key event because AfterVue does not book consults; it hands the visitor to the practice's own booking page. Every preview is an illustrative AI preview, not a promise of a result. See it in the [preview app](/app/) and the [services](/services.html) behind it.

## Weekly review template to increase medspa consultation bookings

Copy this into a spreadsheet, one row per week, and keep five weeks visible.

- Week of:
- Booking starts:
- Completed requests:
- Consults held:
- Treatments scheduled:
- Ratio that moved the most:
- One change made, and the date:

Find the ratio that moved the most and ask why. Change one thing, note it, and leave the rest alone until next week. Resist adding metrics. The owners who improve over a year are the ones who looked at the same four numbers fifty times.

Want to see preview events and the booking handoff on a real site? [Book a live demo](/).
