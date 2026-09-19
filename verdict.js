/* Das Urteil des Merkmalsregisters, herausgelöst aus seiner Darstellung.

   Warum als eigene Datei: die Frage "messen diese beiden dasselbe?" wird an zwei Stellen
   gestellt und darf nicht zweimal beantwortet werden. Im Register vergleicht man zwei
   angehakte Zeilen. Im Link Builder hängt jemand zwei Indikatoren an dieselbe Analysetabelle
   und merkt nie, dass der eine durch alle zivilen Erwerbspersonen teilt und der andere durch
   die abhängigen. Dieselbe Entscheidung, zwei Orte, also eine Datei.

   Der Modul gibt Daten zurück, keine Zeichenkette mit Markup: wer zeichnet, entscheidet
   selbst, wie es aussieht. Er ist bewusst ohne Abhängigkeiten und ohne Modulsystem, weil
   beide Seiten klassische Skripte sind. */

/* Die Felder, an denen sich zwei Fassungen unterscheiden können, in der Reihenfolge, in der
   sie jemanden interessieren. Der Nenner steht vorn, weil er der Grund ist, aus dem es das
   Register gibt. */
const REGISTER_FELDER = [
  ['Divided by', 'nenner'],
  /* INKAR veröffentlicht dieselbe Kennzahl in mehreren Erhebungen mit verschiedener Abdeckung.
     Ohne die Zeile "Survey" stehen zwei gleich benannte Fassungen nebeneinander und der
     Vergleich nennt den Unterschied nicht beim Namen. */
  ['Survey', 'blatt'],
  ['Formula', 'formel'],
  ['Reference period', 'zeitbezug'],
  ['Boundary vintage', 'gebietsstand'],
  ['Subgroup', 'gruppe'],
  ['Unit', 'einheit'],
  ['Underlying statistic', 'statistik'],
];

function registerJahre(j0, j1) {
  if (!j0 && !j1) return 'not stated';
  if (j0 && j1 && j0 !== j1) return `${j0}–${j1}`;
  return String(j0 || j1);
}

/* Manche Quellen tragen als "Statistik" nur die Überschrift des Tabellenblatts ein, die schon
   in der Bezeichnung steht. Das ist kein Unterschied, das ist ein Echo. */
function istEcho(wert, v) {
  return wert && v.bezeichnung && v.bezeichnung.toLowerCase().startsWith(wert.toLowerCase());
}

/* Vergleicht zwei Fassungen und gibt zurück, worin sie sich unterscheiden und was das heißt.
   `urteil.art` ist die Sache, an der man eine Entscheidung festmachen kann:
     'nenner'      die beiden teilen durch Verschiedenes, die Zahlen sind nicht vergleichbar
     'unbekannt'   mindestens eine Quelle nennt ihren Nenner nicht
     'gleich'      die Beschreibungen nennen keinen Unterschied
     'sonst'       gleicher Nenner, aber n andere Unterschiede */
function fassungenVergleichen(a, b) {
  const zeilen = [];
  let unterschiede = 0;
  REGISTER_FELDER.forEach(([titel, f]) => {
    let av = (a[f] || '').trim(), bv = (b[f] || '').trim();
    if (f === 'nenner') {
      av = av || (a.art ? `not a ratio · ${a.art}` : '');
      bv = bv || (b.art ? `not a ratio · ${b.art}` : '');
    }
    if (f === 'statistik' && istEcho(av, a) && istEcho(bv, b)) return;
    if (!av && !bv) return;
    const anders = av.toLowerCase() !== bv.toLowerCase();
    if (anders) unterschiede++;
    zeilen.push({ titel, feld: f, a: av, b: bv, anders });
  });
  const jahreAnders = registerJahre(a.j0, a.j1) !== registerJahre(b.j0, b.j1);
  if (jahreAnders) unterschiede++;
  zeilen.push({ titel: 'Years', feld: 'jahre', a: registerJahre(a.j0, a.j1),
                b: registerJahre(b.j0, b.j1), anders: jahreAnders });

  /* Das Urteil zählt nur, was in den Beschreibungen wirklich verschieden ist. Es sagt nie,
     dass zwei Zahlen gleich sind, sondern nur, dass die Quellen keinen Unterschied nennen. */
  const nennerAnders = (a.nenner || '').toLowerCase() !== (b.nenner || '').toLowerCase();
  const beideNenner = !!(a.nenner && b.nenner);
  let art, text;
  if (nennerAnders && beideNenner) {
    art = 'nenner';
    text = `Different denominators. One divides by ${a.nenner}, the other by ${b.nenner}. ` +
           'Two numbers built this way are not comparable, and the difference is not constant across regions.';
  } else if (!beideNenner) {
    art = 'unbekannt';
    text = 'At least one source does not state its denominator. Before you compare these two, ' +
           'look the missing one up at the source; the labels alone do not settle it.';
  } else if (unterschiede === 0) {
    art = 'gleich';
    text = 'The sources describe these two the same way. That is not proof the numbers match, ' +
           'but nothing in the published descriptions separates them.';
  } else {
    art = 'sonst';
    text = `Same denominator, ${unterschiede} other difference${unterschiede === 1 ? '' : 's'}. ` +
           'Reference period and boundary vintage are the ones that most often explain a gap ' +
           'between two otherwise identical figures.';
  }
  return { zeilen, unterschiede, urteil: { art, text, nennerAnders, beideNenner } };
}

/* Welche Fassung ein angehängter Indikator ist. Gesucht wird innerhalb einer Quelle, weil
   dieselbe Bezeichnung bei mehreren Quellen vorkommt und die Quelle das Einzige ist, was
   sie sicher trennt. Erst genau, dann auf den Anfang, dann gar nicht: eine geratene Fassung
   wäre schlimmer als keine, weil daran ein Urteil über Vergleichbarkeit hinge. */
function fassungFinden(begriff, label, quelleKey) {
  if (!begriff || !label) return null;
  const v = begriff.varianten || [];
  const t = String(label).trim().toLowerCase();
  const inQuelle = quelleKey ? v.filter((x) => x.quelle === quelleKey) : v;
  const kandidaten = inQuelle.length ? inQuelle : v;
  return kandidaten.find((x) => (x.bezeichnung || '').trim().toLowerCase() === t) ||
         kandidaten.find((x) => (x.bezeichnung || '').trim().toLowerCase().startsWith(t)) ||
         kandidaten.find((x) => t.startsWith((x.bezeichnung || '').trim().toLowerCase())) ||
         null;
}
