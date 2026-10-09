# Kuusikud – veebirakendus

Riigimetsa noored kuusikud (kuusk enamuspuuliik, kuused 10–30 a) kaardil.
Andmed: Keskkonnaagentuur, metsaregister (CC BY 4.0), seis 09.10.2026.
Aluskaart ja ortofoto: Maa- ja Ruumiamet.

ÜLESPANEK (GitHub Pages, tasuta)
1. Loo konto github.com-is ja tee uus avalik repositoorium, nt "kuusikud".
2. Vajuta "uploading an existing file" ja lohista sinna KÕIK selle kausta
   failid ja alamkaustad (index.html, app.js, app.css, sw.js,
   manifest.webmanifest, data/, icons/, vendor/). Vajuta "Commit changes".
3. Settings → Pages → Branch: main, kaust / (root) → Save.
4. Mõne minuti pärast on rakendus aadressil
   https://SINU-KASUTAJANIMI.github.io/kuusikud/

Asukoht töötab ainult https-aadressil, seega faili otse arvutist avades
asukohanuppu kasutada ei saa.

IPHONE'IS
1. Ava aadress Safaris.
2. Jaga-nupp → "Lisa avakuvale".
3. Esimesel asukohanupu vajutusel luba asukoht.
   Kui keelasid kogemata: Seaded → Privaatsus ja turvalisus →
   Asukohateenused → Safari veebisaidid → "Rakenduse kasutamisel".

VÕRGUÜHENDUSETA
Rakendus ja kõik kuusikud salvestuvad telefoni esimesel avamisel.
Ortofoto ruudud salvestuvad neis kohtades, mida oled kaardil vaadanud
(kuni ~3000 ruutu). Enne metsa minekut sirvi sihtkoht kodus läbi.

ANDMETE UUENDAMINE
Asenda data/kuusikud.json uuega ja muuda sw.js failis VERSION rida,
et telefonid laadiksid uue versiooni.

UUENDUSED 09.10.2026
- Raiutud alad: kuusikud, kus pärast inventeerimist on metsateatisega
  registreeritud lageraie, raadamine või muu uuendusraie, on vaikimisi
  peidetud (Filtrid → Peida raiutud alad). Harvendus- ja sanitaarraie
  kuvatakse kuusiku juures infona.
- Leidude logi: nupp „Leid“ salvestab asukoha, kuupäeva, koguse ja
  märkuse. Leiud on vahekaardil „Leiud“, kust saab teha varukoopia,
  selle taastada või leiud GPX-failina alla laadida.
