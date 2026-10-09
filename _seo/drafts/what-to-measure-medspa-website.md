---
title: "What to Measure on a Medspa Website: Consults, Not Traffic"
description: "A measurement guide for medspa owners with no analytics team: four numbers that matter, Plausible or GA4 setup, UTM rules, call tracking, and privacy."
slug: what-to-measure-medspa-website
date: 2026-10-09
cluster: "F"
target_page: "/"
keywords:
  - medspa website conversion
  - increase medspa consultation bookings
  - medspa lead generation
internal_links: ["/", "/app/", "/services.html"]
sources:
  - name: "Plausible docs: Custom event goals"
    url: https://plausible.io/docs/custom-event-goals
    status: "unverified from sandbox (host blocked by network policy); content confirmed through search snippets of docs.plausible.io"
  - name: "Google Analytics Help: [GA4] Recommended events"
    url: https://support.google.com/analytics/answer/9267735
    status: "unverified from sandbox (host blocked by network policy); event list confirmed through search snippets"
  - name: "Google Business Profile UTM guidance"
    url: https://support.google.com/business/
    status: "unverified from sandbox; no official help article surfaced in search, so the article relies on general UTM practice and does not cite Google for it"
  - name: "HHS OCR bulletin: Use of Online Tracking Technologies by HIPAA Covered Entities and Business Associates"
    url: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html
    status: "unverified from sandbox (host blocked by network policy); June 2024 partial vacatur confirmed through law-firm summaries"
status: draft
---

Traffic is the number every medspa owner can quote and the one that matters least. A practice website has one job: turn a curious visitor into a consultation that actually happens. If nobody on your team owns analytics, you do not need a dashboard with forty tiles. You need four numbers, a way to collect them without a developer, and fifteen minutes a week to read them.

## The four numbers that matter

1. **Booking starts.** Visitors who click a book or request button, open the consultation form, or tap your booking link. This is intent.
2. **Completed requests.** Forms submitted, booking confirmations reached, or calls placed. This is the website's real output.
3. **Consults held.** Not scheduled, held. This number lives in your booking software, not your analytics tool.
4. **Treatments scheduled.** Consults that became a treatment appointment.

The ratios between neighbours tell you where to work. Many visitors but few starts means the page or the offer is the problem. Many starts but few completions means the form or booking flow has friction. Many completions but few consults held points at follow-up speed. Many consults held but few treatments scheduled is a consult-room issue, not a website one. Traffic is the denominator under all of this, useful context and a poor goal.

## Setting them up in Plausible

Plausible is a cookieless analytics service, which keeps the setup light and avoids a consent banner in most cases. Custom events are the mechanism for the first two numbers. The docs describe two ways to send one: switch your snippet to the tagged-events script and add a class such as `plausible-event-name=Booking+Start` to the button, or call `plausible('Booking Start')` from your own code. Either way, the event does nothing until you create a goal in the dashboard with the exact same name. Plausible also accepts custom properties on an event, handy for a generic treatment category.

## Setting them up in GA4

Google Analytics 4 publishes a list of recommended event names, and lead generation has its own set. The event `generate_lead` is meant for a submitted form, so fire it on a completed request and mark it as a key event. The later stages, `qualify_lead`, `working_lead`, and `close_convert_lead`, are designed for data sent from a CRM or offline process. Do not force consults held and treatments scheduled into GA4. Keep a spreadsheet or use the report in your booking software, and put the four numbers side by side on Monday. For the top of the funnel, a custom event named `booking_start` is fine.

## UTM discipline for Instagram and Google Business Profile

A UTM is a short tag added to a link so your analytics tool knows where the click came from. Without one, Google Business Profile clicks tend to blend into organic or direct traffic, and Instagram bio clicks often show as direct. Two rules make this manageable. First, agree on one lowercase spelling for each source and medium and write it down. Instagram gets `utm_source=instagram&utm_medium=social&utm_campaign=bio`, and your profile gets `utm_source=google&utm_medium=gbp&utm_campaign=profile`. Second, keep tags off internal links on your own site, or you will overwrite the original source mid-visit. After you save the profile link, click it from the live listing on a phone to confirm the tags survive.

## Call tracking caveats

Phone calls are real conversions for a medspa and easy to lose in the data. Call tracking services swap in a different number per source, which works, but it changes the number shown on your profile and muddies listing consistency. Call recordings also capture health details, so either turn recording off or treat the vendor as a business associate with a signed agreement. The simplest honest approach is a tap-to-call event on mobile, counted as a booking start, plus a front-desk tally of calls that booked.

## Privacy: what never goes into an analytics event

An analytics event should carry a page, an event name, and at most a generic property. Never a name, email, phone number, photo, date of birth, or free-text note. Never a treatment detail that identifies a person. The HHS Office for Civil Rights bulletin on online tracking technologies set out the agency's view of when website data can be protected health information. A federal court vacated the portion covering unauthenticated public pages in June 2024, and the rest remains as guidance. Court rulings do not change what a patient expects, and state privacy laws apply regardless. If you would not want a vendor to see it, do not put it in an event.

## Where a preview tool fits in the funnel

An embedded before-and-after preview adds three events between the visit and the booking start: preview started, preview generated, and booking click. These are intent signals that sharpen the first ratio. If visitors generate previews but do not click through to book, the handoff needs work. If they click through but do not complete, the booking page needs work. The events carry only a generic treatment area, never the photo.

AfterVue's own event layer works this way. Properties are sanitized before anything leaves the browser, so photos, which AfterVue never stores, and free text never reach analytics. The booking click is recorded as the key event, because AfterVue does not book consults. It hands the visitor to the practice's booking page, and previews are illustrative AI previews, not promises of a result. With the [preview app](/app/) or our [services](/services.html), the events arrive ready to count.

## The weekly 15-minute review

Pick a day and a time and keep it. Pull the four numbers for last week and for the previous four weeks. Find the ratio that moved the most and ask why. Change one thing, note it with the date, and leave the rest alone until next week. Resist adding metrics. The owners who improve medspa website conversion over a year are the ones who looked at the same four numbers fifty times.

Want to see preview events and the booking handoff on a real site? [Book a live demo](/).
