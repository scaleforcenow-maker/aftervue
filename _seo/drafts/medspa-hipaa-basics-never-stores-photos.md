---
title: "Medspa HIPAA Basics When You Never Store Photos"
description: "Learn when a consult photo is PHI, what a BAA covers, which vendor questions replace the HIPAA-compliant label, and run a ten-minute self-assessment."
slug: medspa-hipaa-basics-never-stores-photos
date: 2026-10-09
cluster: "I"
target_page: "/privacy.html"
internal_links: ["/privacy.html", "/app/", "/"]
keywords:
  primary: "medspa HIPAA basics"
  secondary:
    - "medspa business associate agreement"
    - "is a consult photo PHI"
    - "HIPAA compliant vendor claim"
    - "medspa data breach notification"
sources:
  - name: "HHS, Summary of the HIPAA Privacy Rule"
    url: "https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html"
  - name: "HHS, Business Associates"
    url: "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html"
  - name: "HHS, Breach Notification Rule"
    url: "https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html"
  - name: "New York Attorney General, SHIELD Act"
    url: "https://ag.ny.gov/resources/organizations/data-breach-reporting/shield-act"
  - name: "Florida Statutes, s. 501.171, Security of confidential personal information"
    url: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html"
status: "reviewed"
---
"We don't store anything" is a good policy and a poor legal theory. HIPAA attaches to a consult photo when it is created in connection with care, not when it lands on a hard drive. These medspa HIPAA basics cover what that means for a practice that keeps nothing: when a photo is protected health information, why a vendor is a business associate even without storage, what a business associate agreement does and does not do, and how state laws stack on top. This article is not legal advice, so have your attorney review anything you adopt.

## Medspa HIPAA basics: when a consult photo is PHI

The [HIPAA Privacy Rule](https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html) protects individually identifiable health information held by a covered entity or its business associates. Full-face photographs are on the HHS list of identifiers. A photo taken to plan a treatment is health information, and a face is an identifier. Stripping the name from the file does not change that.

Whether your practice is a covered entity depends on whether it sends health information electronically in a standard transaction, such as an insurance claim. A cash-only medspa may fall outside HIPAA and still owe duties under state law and its own privacy policy, so most owners run the practice as if HIPAA applies.

## Transmission versus storage, and why the vendor is a business associate

HHS keeps a narrow carve-out for conduits: services that only carry PHI, like the postal service. Anything else that creates, receives, maintains, or transmits PHI on your behalf is a [business associate](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html).

A preview tool receives the photo and renders an image from it. That is processing, not carriage, so the vendor is a business associate even if the photo is discarded seconds later. Never storing the photo shrinks the breach surface. It does not erase the relationship.

## What a BAA covers and what it leaves to you

A business associate agreement sets the permitted uses of the PHI, requires safeguards, obligates the vendor to report breaches, pushes the same terms down to subcontractors, and says what happens to the data when the contract ends. For a vendor that keeps nothing, the subcontractor clause matters most, because the rendering usually runs on someone else's infrastructure.

A BAA does not make your practice compliant. It is silent on the phone in your injector's pocket, the consent form, or the marketing authorization you need before a real photo appears in an ad. Device and messaging rules are in our HIPAA photo checklist, and the consent wording for AI previews is in our consent script article.
<!-- TODO: link the HIPAA photo checklist and consent script article to their /resources/ paths. -->

## Minimum necessary, applied to one photo

The Privacy Rule's minimum necessary standard asks you to use and disclose only the PHI a purpose requires. It does not apply to treatment disclosures to a provider, but it does apply to what you hand a vendor. For a consult photo that means the face and nothing else: no chart number in the filename, no intake notes alongside, no second photo just in case.

## Why "HIPAA-compliant" is a claim a vendor should not make

HHS does not certify software, so there is no HIPAA seal to earn. A vendor that prints "HIPAA-compliant" on a landing page is stating an opinion of itself. Ask for four things you can verify instead.

1. **BAA availability.** Will you sign one before I buy? A vendor that will not sign is telling you not to send PHI.
2. **Retention.** After the preview renders, is anything written to disk, a cache, a log, or an error report?
3. **Subprocessors.** Who runs the model, and is that provider bound by its own BAA? A vendor cannot pass PHI to an unbound subcontractor.
4. **Breach notification timelines.** The [Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html) gives a business associate up to 60 days after discovery to notify the covered entity, and you then owe patients notice within 60 days. Your BAA can set a shorter clock, and the state deadlines below say it should.

## How state laws stack on top

New York's [SHIELD Act](https://ag.ny.gov/resources/organizations/data-breach-reporting/shield-act) counts biometric information as private information, requires reasonable safeguards, and, since a December 2024 amendment, sets a 30-day clock from discovery for notifying affected residents. Florida's [Information Protection Act](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html) requires notice to individuals within 30 days, notice to the state when 500 or more Floridians are affected, and gives a third-party agent 10 days to tell you about a breach. A 60-day vendor clock cannot meet either.

Illinois, Texas, and Washington regulate biometric identifiers such as face geometry, with notice and consent before collection and limits on retention. They treat photographs differently from face scans, so ask a vendor whether it extracts or keeps face geometry.

## The ten-minute self-assessment

Each no is a task.

1. We know whether our practice is a HIPAA covered entity, in writing.
2. Every vendor that receives a consult photo has signed a BAA with us.
3. Each BAA names the vendor's subprocessors, and they are bound too.
4. Each BAA sets a breach clock short enough for our state's deadline.
5. Each vendor told us, in writing, what it retains after a preview renders.
6. Consult photos are taken on a device we control, not a personal phone.
7. We upload the face and nothing else.
8. Preview consent and marketing authorization are separate forms.
9. We know our state's breach deadline and who sends the notice.
10. One person owns this list and reviews it quarterly.

## Where AfterVue sits

AfterVue never stores patient photos. AfterVue uses the photo to render a photoreal, illustrative AI preview, then discards it. The rendering runs through an infrastructure provider under a business associate agreement, and AfterVue will sign a BAA on request. That describes how the system handles one photo. It is not a claim that AfterVue makes your practice "HIPAA-compliant", and we expect you to ask us the questions above. See our [privacy page](/privacy.html) and [app page](/app/).

**[Book a live demo](/)**
