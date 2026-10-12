# Laboratori de modulacions digitals — v2

Variant de la versió principal del laboratori: el tipus de modulació es tria amb **pestanyes a la part superior** i s’ha eliminat el mode «Compara». La resta de funcions és idèntica.

Webapp educativa en català per explorar com una seqüència de bits es converteix en símbols i com aquests modulen una portadora amb **ASK, FSK, PSK i QAM**. Funciona íntegrament al navegador, sense dependències, comptes ni serveis externs.

## Com executar-la

**Opció 1:** obre `index.html` directament al navegador (doble clic).

**Opció 2 (recomanada en una aula o xarxa):** serveix la carpeta amb qualsevol servidor estàtic, per exemple:

```bash
python3 -m http.server 8765
```

i obre `http://localhost:8765`. Es pot publicar tal qual a qualsevol allotjament estàtic (Moodle, GitHub Pages, servidor del centre…).

Proves del model de càlcul (opcional, necessita Node):

```bash
node tests/model.test.js
```

## Controls principals

| Zona | Què fa |
|---|---|
| **1. Bits a transmetre** | 1–96 bits; espais i salts de línia com a separadors. «Bits aleatoris», «Patró altern» i «Restableix». Els errors s'expliquen en català i es mantenen les darreres dades vàlides. |
| **Pestanyes superiors** | ASK · FSK · PSK · QAM. Es poden recórrer amb les fletxes ← →, Inici i Fi. Canviar de modulació no modifica els bits i cada pestanya recorda la seva M. |
| **2. Modulació** | Nombre de símbols M de la modulació activa. |
| **3. Paràmetres** | Durada de símbol Tₛ (ms), portadora f꜀ (kHz) i, només en FSK, separació Δf. |
| **Disposició dels bits** | A la targeta de la constel·lació (ASK, PSK, QAM): «Binària natural» o «Gray». Opcionalment, unes línies entre veïns mostren quants bits canvien (en vermell si són 2 o més). Afecta les taules, el senyal i les exportacions. |
| **Reproducció** | Reprodueix / Pausa / Símbol anterior / Símbol següent. Un cursor recorre el senyal i ressalta el símbol actiu a totes les vistes. |
| **Zoom temporal** | −, + i «Tot», amb una barra de desplaçament per a transmissions llargues. |
| **Selecció** | Clic (o fletxes ← →) sobre qualsevol gràfica temporal, un xip de símbol, una fila de les taules o un punt de la constel·lació. Bits, fragment del senyal, punt/to i propietats es ressalten alhora. «Anterior / Següent» recorren les ocurrències d'un mateix símbol. |
| **Descàrregues** | PNG de les gràfiques, resum TXT i taula CSV de símbols. |

## Visualitzacions

- **A.** Bits com a senyal binari agrupats en símbols (S1, S2…); els bits de farciment surten en taronja.
- **B.** Portadora de referència sense modular (també es pot superposar al senyal).
- **C.** Senyal modulat s(t) real, amb els límits i els bits de cada símbol. En FSK s'hi afegeix la freqüència instantània (**C2**).
- **D.** Constel·lació I/Q (ASK, PSK, QAM) amb la mateixa escala als dos eixos, o diagrama de tons (FSK).
- **E.** Taula de correspondències de tots els M símbols i taula de la seqüència transmesa.

## Model

- Unitats de simulació: temps en ms i freqüències en kHz. S'han triat valors baixos per poder veure les oscil·lacions; per defecte, Tₛ = 1 ms i f꜀ = 5 kHz (5 cicles per símbol).
- ASK/PSK: s(t) = Aₙ·cos(2πf꜀t + φₙ) amb temps global. QAM: s(t) = Iₙ·cos(2πf꜀t) − Qₙ·sin(2πf꜀t).
- FSK de fase contínua (CPFSK): fₘ = f꜀ + [m − (M−1)/2]·Δf, amb Δf limitat perquè cap to quedi per sota de 0,5 kHz.
- Correspondència fixa, amb el bit més significatiu primer: binària natural (per defecte) o Gray (posició i amb gray(i) = bits; en 16-QAM, Gray a cada eix: 00→−3, 01→−1, 11→+1, 10→+3). Amb M = 2 i 4-QAM, les dues coincideixen.
- Com a mínim 48 mostres per cicle de la freqüència més alta.
- És un model idealitzat amb canvis de símbol abruptes, sense filtratge ni conformació de polsos.

## Estructura

```
index.html          interfície
css/styles.css      estils
js/model.js         càlculs (sense dependències del DOM)
js/app.js           gràfiques, interacció, pestanyes i exportacions
tests/model.test.js comprovacions dels criteris d'acceptació
```
