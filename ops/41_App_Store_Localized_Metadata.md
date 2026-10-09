# 41 · App Store Localized Metadata — AfterVue AI (iOS)

**App:** AfterVue AI · bundle `com.aftervue.kiosk` · version 1.0
**Locales:** en-US (source, approved), es-MX, pt-BR
**Machine-readable copy:** `ops/41_metadata.json` (App Store Connect API field names)
**Validator:** `python3 -I tools/appstore/check_metadata.py` (limits, trademark rule, untranslated name,
keyword rules, disclaimer phrases, no phone/price, and a cross-check that this file matches the JSON)
**Tests:** `python3 -I tools/appstore/test_check_metadata.py` (one failing fixture per rule)
**Prepared:** 2026-10-09 · reviewed 2026-10-09

This file is the human-readable review copy. The JSON is the file to upload. If you edit
one, edit the other and re-run the validator: it fails when a table value, a character count or a
fenced description here differs from the JSON. Counts are Unicode code points (Python `len()`),
which is how App Store Connect counts.

Scope rules applied: the repo is public, so this file contains no review notes, activation
codes, phone numbers, personal names or AfterVue pricing. The App Privacy questionnaire is
not part of this file.

## 1. Field tables

### English (U.S.) — en-US (source, approved)

| Field | Value | Chars | Limit |
|---|---|---:|---:|
| Name | AfterVue AI | 11 | 30 |
| Subtitle | Before & After for Medspas | 26 | 30 |
| Promotional text | Show patients their own likely result on your iPad — lips, cheeks, jawline, brow, under-eye, skin — then book. No beauty scores. No judgment. | 141 | 170 |
| Keywords | medspa,injector,aesthetic,filler,lips,wrinkles,consult,preview,simulator,jawline,cheeks,skin,clinic | 99 | 100 |
| What's New | First release. | 14 | 4000 |
| Description | see §2 (en-US) | 2108 | 4000 |
| Privacy policy URL | https://getaftervue.com/privacy.html | — | — |
| Marketing URL | https://getaftervue.com | — | — |
| Support URL | *not set — fill in before upload* | — | — |

### Spanish (Mexico) — es-MX

| Field | Value | Chars | Limit |
|---|---|---:|---:|
| Name | AfterVue AI | 11 | 30 |
| Subtitle | Antes y después para clínicas | 29 | 30 |
| Promotional text | Muestra a cada paciente su posible resultado en tu iPad: labios, pómulos, mandíbula, cejas, ojeras, piel. Luego, agenda la cita. Sin puntajes de belleza. Sin juicios. | 166 | 170 |
| Keywords | medicina estética,rellenos,ácido hialurónico,labios,arrugas,toxina,simulador,armonización facial | 96 | 100 |
| What's New | Primera versión. | 16 | 4000 |
| Description | see §2 (es-MX) | 2529 | 4000 |
| Privacy policy URL | https://getaftervue.com/privacy.html | — | — |
| Marketing URL | https://getaftervue.com | — | — |
| Support URL | *not set — fill in before upload* | — | — |

### Portuguese (Brazil) — pt-BR

| Field | Value | Chars | Limit |
|---|---|---:|---:|
| Name | AfterVue AI | 11 | 30 |
| Subtitle | Antes e depois para clínicas | 28 | 30 |
| Promotional text | Mostre ao paciente o resultado provável no iPad: lábios, maçãs do rosto, mandíbula, sobrancelhas, olheiras, pele. Depois, agende. Sem notas de beleza. Sem julgamentos. | 167 | 170 |
| Keywords | estética,harmonização facial,preenchimento,ácido hialurônico,lábios,rugas,injetor,toxina,simulador | 98 | 100 |
| What's New | Primeira versão. | 16 | 4000 |
| Description | see §2 (pt-BR) | 2490 | 4000 |
| Privacy policy URL | https://getaftervue.com/privacy.html | — | — |
| Marketing URL | https://getaftervue.com | — | — |
| Support URL | *not set — fill in before upload* | — | — |

## 2. Full descriptions

### en-US (2108/4000 chars)

```text
AfterVue AI turns a consult into a preview. A patient sits with your iPad, takes a front and side photo, and sees a photoreal before/after of their own face for the treatments you offer — with a slider that moves from subtle to enhanced. Built for medspas, injectors and aesthetic practices.

FOR PRACTICES
AfterVue AI is activated with a practice code from your AfterVue subscription. It is not a consumer app: the practice owns the device, the session and the conversation. Subscribe and manage billing at getaftervue.com.

WHAT PATIENTS SEE
• Their own photo, front and side profile
• A before/after slider for every selected treatment
• Up to three treatments stacked at once
• Adjustable intensity from Before to Subtle, Typical and Enhanced
• A "Simulated preview" label on every image

TREATMENTS INCLUDED
Forehead and frown lines · crow's feet · jaw slimming · brow lift · lip filler · cheek filler · jawline and chin contouring · under-chin and jowl contouring · nose bump softening (profile) · under-eye rejuvenation · upper eyelid tightening · skin resurfacing and glow · IPL photofacial · RF microneedling. Your practice code enables only the treatments you offer.

BUILT FOR THE TREATMENT ROOM
• Kiosk mode: attract screen, idle reset, and an optional Face ID / passcode lock on staff settings
• Provider consent step before any photo is taken
• Save the preview for the patient
• Session log export (CSV) for the practice — no patient photos are stored
• English, Spanish and Portuguese (Brazil)

PRIVACY
The patient's photo is sent to AfterVue's AI rendering partner only to create the preview. AfterVue does not keep it, never sells it and never uses it to train AI. Full policy: getaftervue.com/privacy.html

IMPORTANT
Every image is an AI-generated illustration, not a guarantee of results. Individual results vary. Patients should review treatment options, benefits and risks with a qualified provider before deciding on any treatment. AfterVue AI is not a medical device and does not diagnose, recommend or book treatments.

Subscriptions are purchased on getaftervue.com, not in the app.
```

### es-MX (2529/4000 chars)

```text
AfterVue AI convierte la consulta en una vista previa. El paciente se sienta con tu iPad, se toma una foto de frente y otra de perfil, y ve un antes y después fotorrealista de su propio rostro para los tratamientos que ofreces, con un control deslizante que va de sutil a realzado. Diseñada para medspas, inyectores y clínicas de medicina estética.

PARA CLÍNICAS
AfterVue AI se activa con el código de clínica de tu suscripción a AfterVue. No es una app para el público en general: la clínica es dueña del dispositivo, de la sesión y de la conversación. Suscríbete y administra tu facturación en getaftervue.com.

LO QUE VE EL PACIENTE
• Su propia foto, de frente y de perfil
• Un control deslizante de antes y después para cada tratamiento seleccionado
• Hasta tres tratamientos combinados a la vez
• Intensidad ajustable: Antes, Sutil, Típico y Realzado
• La etiqueta "Vista previa simulada" en cada imagen

TRATAMIENTOS INCLUIDOS
Líneas de la frente y del entrecejo · patas de gallo · afinamiento mandibular · elevación de cejas · relleno de labios · relleno de pómulos · contorno de mandíbula y mentón · contorno de papada y flacidez mandibular · suavizado de la giba nasal (perfil) · rejuvenecimiento de ojeras · tensado del párpado superior · resurfacing y luminosidad de la piel · fotofacial IPL · microagujas con radiofrecuencia. Tu código de clínica habilita únicamente los tratamientos que ofreces.

HECHA PARA EL CONSULTORIO
• Modo kiosco: pantalla de bienvenida, reinicio automático por inactividad y bloqueo opcional de los ajustes del personal con Face ID o código
• Paso de consentimiento del profesional antes de tomar cualquier foto
• Guarda la vista previa para el paciente
• Exportación del registro de sesiones (CSV) para la clínica; no se almacena ninguna foto de pacientes
• Inglés, español y portugués (Brasil)

PRIVACIDAD
La foto del paciente se envía al proveedor de renderizado con IA de AfterVue únicamente para crear la vista previa. AfterVue no la conserva, nunca la vende y nunca la usa para entrenar IA. Política completa: getaftervue.com/privacy.html

IMPORTANTE
Cada imagen es una ilustración generada por IA, no una garantía de resultados. Los resultados varían en cada persona. Los pacientes deben revisar las opciones de tratamiento, sus beneficios y riesgos con un profesional calificado antes de decidir cualquier tratamiento. AfterVue AI no es un dispositivo médico y no diagnostica, recomienda ni agenda tratamientos.

Las suscripciones se compran en getaftervue.com, no dentro de la app.
```

### pt-BR (2490/4000 chars)

```text
O AfterVue AI transforma a consulta em uma prévia. O paciente senta com o seu iPad, tira uma foto de frente e outra de perfil e vê um antes e depois fotorrealista do próprio rosto para os tratamentos que a sua clínica oferece, com um controle deslizante que vai do sutil ao acentuado. Feito para clínicas de estética, injetores e consultórios de harmonização facial.

PARA CLÍNICAS
O AfterVue AI é ativado com o código de clínica da sua assinatura AfterVue. Não é um app para o consumidor final: a clínica é dona do dispositivo, da sessão e da conversa. Assine e gerencie a cobrança em getaftervue.com.

O QUE O PACIENTE VÊ
• A própria foto, de frente e de perfil
• Um controle deslizante de antes e depois para cada tratamento selecionado
• Até três tratamentos combinados ao mesmo tempo
• Intensidade ajustável: Antes, Sutil, Típico e Acentuado
• O selo "Prévia simulada" em todas as imagens

TRATAMENTOS INCLUÍDOS
Rugas da testa e da glabela · pés de galinha · afinamento da mandíbula · lifting de sobrancelhas · preenchimento labial · preenchimento malar · contorno de mandíbula e queixo · contorno de papada e flacidez mandibular · suavização da giba nasal (perfil) · rejuvenescimento de olheiras · firmeza da pálpebra superior · resurfacing e viço da pele · luz intensa pulsada (IPL) · microagulhamento com radiofrequência. O seu código de clínica habilita somente os tratamentos que você oferece.

FEITO PARA A SALA DE PROCEDIMENTOS
• Modo quiosque: tela de espera, reinício automático por inatividade e bloqueio opcional das configurações da equipe por Face ID ou senha
• Etapa de consentimento do profissional antes de qualquer foto
• Salve a prévia para o paciente
• Exportação do registro de sessões (CSV) para a clínica; nenhuma foto de paciente é armazenada
• Inglês, espanhol e português (Brasil)

PRIVACIDADE
A foto do paciente é enviada ao parceiro de renderização por IA do AfterVue apenas para criar a prévia. O AfterVue não a guarda, nunca a vende e nunca a usa para treinar IA. Política completa: getaftervue.com/privacy.html

IMPORTANTE
Toda imagem é uma ilustração gerada por IA, não uma garantia de resultado. Os resultados variam de pessoa para pessoa. O paciente deve avaliar as opções de tratamento, seus benefícios e riscos com um profissional qualificado antes de decidir por qualquer procedimento. O AfterVue AI não é um dispositivo médico e não diagnostica, recomenda nem agenda tratamentos.

As assinaturas são compradas em getaftervue.com, não dentro do app.
```

## 3. Translator's note

**Register and audience.** Both translations are written for the clinic owner or lead
injector who reads the listing, not for the patient. They are adaptations, not word-for-word
renderings: sentence order and idiom were changed wherever the literal version read like a
translation. Spanish uses Mexican usage (tú, "agendar la cita", "pómulos", "ojeras",
"papada", "consultorio", "código") and avoids Spain-specific forms ("vosotros", "ordenador",
"cualificado"). Portuguese is Brazilian throughout ("você", "agende", "maçãs do rosto",
"olheiras", "senha", "equipe", "quiosque", "sala de procedimentos").

**"Practice" → clinic.** US English "practice" has no natural counterpart in either market;
"práctica"/"prática" would be an anglicism. Both locales use **clínica** ("código de clínica",
"la clínica es dueña…", "a clínica é dona…"). "Medspa" is a US trade term with little search
volume in Mexico or Brazil, so both subtitles say **clínicas** ("Antes y después para clínicas",
"Antes e depois para clínicas"); the Spanish description still names "medspas" once in the
opening line, next to "clínicas de medicina estética", because some Mexican clinics brand
themselves that way. Portuguese uses "clínicas de estética" and "consultórios de harmonização
facial", the phrase Brazilian injectors use to describe the category.

**Why the toxin brand name never appears.** The best-known wrinkle-relaxer brand is a
registered trademark of a pharmaceutical company. App Store Review Guideline 5.2 (Intellectual
Property) rejects metadata that uses third-party trademarks to describe or promote an app, and
keyword use is the most common trigger. The source copy names the *treatments* (forehead and
frown lines, crow's feet, jaw slimming) rather than the drug, and both translations keep that
framing. Where a category word was needed in the keyword list, the generic **toxina** (es and pt)
is used, which is how clinics in both markets refer to the class of wrinkle relaxers. The
validator fails any locale whose text contains the brand name (accent-folded, case-insensitive)
in any field; the blocked list lives in the validator script, not in the JSON, so the upload
file itself never contains the word.

**Treatment names.** Clinical names were preferred over marketing coinages so that a
practice can match them to its own menu:

| en-US | es-MX | pt-BR |
|---|---|---|
| forehead and frown lines | líneas de la frente y del entrecejo | rugas da testa e da glabela |
| crow's feet | patas de gallo | pés de galinha |
| jaw slimming | afinamiento mandibular | afinamento da mandíbula |
| brow lift | elevación de cejas | lifting de sobrancelhas |
| lip filler / cheek filler | relleno de labios / relleno de pómulos | preenchimento labial / preenchimento malar |
| jawline and chin contouring | contorno de mandíbula y mentón | contorno de mandíbula e queixo |
| under-chin and jowl contouring | contorno de papada y flacidez mandibular | contorno de papada e flacidez mandibular |
| nose bump softening (profile) | suavizado de la giba nasal (perfil) | suavização da giba nasal (perfil) |
| under-eye rejuvenation | rejuvenecimiento de ojeras | rejuvenescimento de olheiras |
| upper eyelid tightening | tensado del párpado superior | firmeza da pálpebra superior |
| skin resurfacing and glow | resurfacing y luminosidad de la piel | resurfacing e viço da pele |
| IPL photofacial | fotofacial IPL | luz intensa pulsada (IPL) |
| RF microneedling | microagujas con radiofrecuencia | microagulhamento com radiofrequência |

Terminology decisions worth knowing: in Brazil "bochechas" is the soft cheek (the area a
bichectomia *removes*), so cheek filler is **preenchimento malar** / "maçãs do rosto"; the nose
bump is the **giba nasal** in both languages ("dorso nasal" is the whole bridge); Brazilian
clinics sell IPL as **luz intensa pulsada**, while Mexican menus say "fotofacial IPL".
"Resurfacing", "IPL", "lifting" and "Face ID" are left in English: they are the terms used on
clinic menus and device marketing in both markets, and "Face ID" is Apple's product name.

**Intensity labels and the image label.** Before / Subtle / Typical / Enhanced →
Antes / Sutil / Típico / Realzado (es) and Antes / Sutil / Típico / Acentuado (pt).
"Simulated preview" → "Vista previa simulada" (es) and "Prévia simulada" (pt). These must
match the strings shown inside the app in each language; if the iOS string catalog uses a
different wording, change the listing to match the app, not the other way round.

**Disclaimers.** The legal statements were translated for identical meaning, with no
softening: every image is an AI illustration, not a guarantee; results vary; discuss options,
benefits and risks with a qualified provider before deciding; AfterVue AI is not a medical
device and does not diagnose, recommend or book; the patient's photo is sent to the rendering
provider only to create the preview and is not kept, sold or used for training; no patient
photos are stored; subscriptions are sold on getaftervue.com, not in the app. Spanish uses
"profesional calificado" (not "cualificado", which is Spain usage). Portuguese uses
"profissional qualificado" and "não diagnostica, recomenda nem agenda". Each locale's
`requiredPhrases` in the JSON lists the distinctive fragment of every disclaimer, and the
validator fails if any fragment is missing from that locale's description, so a future edit
cannot drop one silently.

**Keywords.** Apple indexes name and subtitle, so words already there must not be repeated in
the keyword field (the validator fails on repeats, accent-folded). Terms were chosen for how
clinic owners search in each market rather than by translating the English list:

- en-US (99/100): `medspa,injector,aesthetic,filler,lips,wrinkles,consult,preview,simulator,jawline,cheeks,skin,clinic`.
  The earlier `before after` repeated two subtitle words; those characters now carry
  `jawline,cheeks`. Everything else is unchanged from the approved source.
- es-MX (96/100): `medicina estética,rellenos,ácido hialurónico,labios,arrugas,toxina,simulador,armonización facial`.
  "medicina estética" is the name of the field in Mexico and combines with "clínicas" from the
  subtitle; "ácido hialurónico" is the highest-volume filler term in Mexico and across LatAm
  and outranks "rellenos", which is kept as the everyday word; "armonización facial" is the
  current trade phrase for combined injectable plans. "inyector" and "consulta" were dropped:
  Mexican clinic owners search by specialty ("medicina estética") rather than by the US job
  title, and "consulta" is too generic to rank.
- pt-BR (98/100): `estética,harmonização facial,preenchimento,ácido hialurônico,lábios,rugas,injetor,toxina,simulador`.
  "harmonização facial" is the dominant category term in Brazil and is deliberately spelled out
  despite its length; "ácido hialurônico" is the single most-searched filler term there.
  "clínica" is in the subtitle, so the keyword list carries "estética" alone and the two combine
  in search. "injetor/injetora" is current in the Brazilian HOF market, so it stays. "consulta"
  and "pele" were dropped to make room.

**Regional variants.** Spanish is written for Mexico but reads naturally across Latin America;
no Argentine ("vos") or Caribbean forms were used. A separate es-ES locale would need
"agendar" → "pedir cita", "calificado" → "cualificado" and "consultorio" → "consulta";
"código" and "pómulos" are fine in both. Portuguese is Brazil-only; a pt-PT locale is not planned and would
need different pronouns and vocabulary ("ecrã", "marcação").

**Compliance note for Brazil.** Before/after imagery in aesthetic-medicine advertising is
regulated by Brazilian medical and dental councils. The listing describes a simulation tool
owned by the practice and labels every image as a simulated illustration; it does not show or
promise a clinic's real results. The practice remains responsible for how it uses previews
with patients. Have Brazilian counsel confirm the listing wording before the pt-BR storefront
goes live.

**Open items before upload.**
- `supportUrl` is unset in all three locales. App Store Connect requires it; confirm the
  support page address on getaftervue.com and add it to the JSON (the validator warns until it is set).
- Screenshots and the App Privacy questionnaire are tracked separately (ops/40 and ops/34).

## 4. Validator output (2026-10-09)

```text
Checking /home/user/aftervue/ops/41_metadata.json
Locales: en-US, es-MX, pt-BR
Trademark terms blocked: 1; app name required verbatim: 'AfterVue AI'

== en-US ==
field             chars  limit  status
name                 11     30  ok
subtitle             26     30  ok
promotionalText     141    170  ok
keywords             99    100  ok
description        2108   4000  ok
whatsNew             14   4000  ok
  warning: supportUrl is not set (App Store Connect requires it)
  result: PASS

== es-MX ==
field             chars  limit  status
name                 11     30  ok
subtitle             29     30  ok
promotionalText     166    170  ok
keywords             96    100  ok
description        2529   4000  ok
whatsNew             16   4000  ok
  warning: supportUrl is not set (App Store Connect requires it)
  result: PASS

== pt-BR ==
field             chars  limit  status
name                 11     30  ok
subtitle             28     30  ok
promotionalText     167    170  ok
keywords             98    100  ok
description        2490   4000  ok
whatsNew             16   4000  ok
  warning: supportUrl is not set (App Store Connect requires it)
  result: PASS

== Markdown cross-check: 41_App_Store_Localized_Metadata.md ==
  result: PASS (tables and descriptions match the JSON)

OK: all 3 locale(s) within Apple's limits, disclaimers present, no forbidden terms
```
