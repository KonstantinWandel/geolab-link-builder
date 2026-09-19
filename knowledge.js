/* Fachwissen des Link Builders: Schlüsselarten, was sich womit verbinden lässt, welche
   Fallstricke dabei bekannt sind, und die Bausteine für den erzeugten Code.
   Getrennt von app.js, damit man eine Regel ändern kann, ohne die Oberfläche anzufassen. */

/* ---------------------------------------------------------------- Schlüsselarten */
/* family entscheidet, was überhaupt zusammenpassen kann: eine Gebietskennung an eine
   Gebietskennung, eine Jahresangabe an eine Jahresangabe, eine Fallnummer an eine Fallnummer.
   rank ist die Feinheit der Gebietsebene, 1 = Bund, 6 = Punkt. */
const KEYS = {
  pid:   { label: 'Person', hint: 'pid', family: 'unit' },
  hid:   { label: 'Household', hint: 'hid', family: 'unit' },
  cid:   { label: 'Original household', hint: 'cid', family: 'unit' },
  caseid:{ label: 'Case id', hint: 'your id column', family: 'unit' },
  year:  { label: 'Year', hint: 'syear / Jahr', family: 'time' },

  ags2:  { label: 'Federal state', hint: 'AGS, 2 digits, e.g. 05', family: 'geo', rank: 2, digits: 2, level: 'state' },
  ags3:  { label: 'Government region', hint: 'AGS, 3 digits, e.g. 053', family: 'geo', rank: 3, digits: 3, level: 'govdistrict' },
  ags5:  { label: 'District (Kreis)', hint: 'AGS / Kreiskennziffer, 5 digits, e.g. 05315', family: 'geo', rank: 4, digits: 5, level: 'district' },
  ags8:  { label: 'Municipality (Gemeinde)', hint: 'AGS, 8 digits, e.g. 05315000', family: 'geo', rank: 5, digits: 8, level: 'municipality' },
  nuts1: { label: 'NUTS-1', hint: 'e.g. DEA', family: 'geo', rank: 2, level: 'state' },
  nuts2: { label: 'NUTS-2', hint: 'e.g. DEA2', family: 'geo', rank: 3, level: 'govdistrict' },
  nuts3: { label: 'NUTS-3', hint: 'e.g. DEA23', family: 'geo', rank: 4, level: 'district' },
  plz:   { label: 'Postcode (PLZ)', hint: '5 digits, e.g. 50667', family: 'geo', rank: 4.5, digits: 5, level: 'postcode' },
  wk:    { label: 'Bundestag constituency', hint: '1 to 299', family: 'geo', rank: 4.5, level: 'constituency' },
  grid:  { label: 'Grid cell (1 km)', hint: 'INSPIRE id, e.g. 1kmN2689E4337', family: 'geo', rank: 6, level: 'grid' },
  grid100: { label: 'Grid cell (100 m)', hint: 'INSPIRE id, e.g. 100mN26895E43370', family: 'geo', rank: 6, level: 'grid100' },
  ortsteil: { label: 'Quarter (Ortsteil)', hint: 'the municipality code plus a local suffix', family: 'geo', rank: 5.5, level: 'subdistrict' },
  coord: { label: 'Coordinates', hint: 'ETRS89 / UTM 32N', family: 'geo', rank: 6, level: 'point' },
  other: { label: 'Other classification', hint: 'not one of the standard geographies', family: 'geo', rank: 0, level: 'other' }
};

/* Welche Ebene die Katalogangabe meint, als Schlüsselart. */
const LEVEL_TO_KEY = {
  state: 'ags2', govdistrict: 'ags3', district: 'ags5', municipality: 'ags8',
  postcode: 'plz', constituency: 'wk', grid: 'grid', point: 'coord',
  grid100: 'grid100', subdistrict: 'ortsteil', other: 'other'
};
/* Der Index führt bei einem Teil der Datensätze die NUTS-Bezeichnung statt des deutschen
   Gebietsnamens (INKAR etwa hat Indikatoren, deren einzige Ebene "NUTS2" heißt). Sie werden auf
   dieselbe Gebietsebene abgebildet, behalten aber ihre eigene Schlüsselart: in so einer Datei
   steht ein NUTS-Code und kein amtlicher Gemeindeschlüssel, und der Unterschied ist genau der,
   vor dem dieses Werkzeug warnen soll. */
const NUTS_ALIAS = {
  NUTS1: { level: 'state', key: 'nuts1' },
  NUTS2: { level: 'govdistrict', key: 'nuts2' },
  NUTS3: { level: 'district', key: 'nuts3' },
  LAU: { level: 'municipality', key: 'ags8' }
};

const LEVEL_LABEL = {
  state: 'Federal states', govdistrict: 'Government regions', district: 'Districts',
  municipality: 'Municipalities', postcode: 'Postcodes', constituency: 'Constituencies',
  grid: '1 km grid', grid100: '100 m grid', point: 'Points',
  subdistrict: 'Quarters (Ortsteile)', other: 'Other'
};

/* ------------------------------------------------- Was passt womit zusammen */
/* Liefert für ein Schlüsselpaar den Modus der Verbindung und, wo nötig, die Warnung.
   mode: direct    identisch, nichts zu tun
         derive    aus dem einen lässt sich das andere rechnen (Stellen abschneiden)
         crosswalk braucht eine Zuordnungstabelle
         weighted  braucht eine gewichtete Zuordnung, weil die Gebiete sich überschneiden
         spatial   braucht eine räumliche Verschneidung
         no        geht nicht */
function matchKeys(a, b) {
  const A = KEYS[a], B = KEYS[b];
  if (!A || !B) return { mode: 'no', why: 'Unknown key type.' };
  if (A.family !== B.family) {
    return { mode: 'no', why: `A ${A.label.toLowerCase()} column and a ${B.label.toLowerCase()} column describe different things, so they cannot be matched on.` };
  }
  /* Zwei Koordinatenspalten sind nicht deshalb dasselbe, weil sie beide Punkte enthalten:
     zwei Messpunkte fallen so gut wie nie auf dieselbe Stelle. Sie werden über die Fläche
     verbunden, in der sie liegen, oder über die Entfernung, nie über Gleichheit. */
  if (a === 'coord' && b === 'coord') {
    return { mode: 'spatial', why: 'Two sets of points are not matched by equal coordinates. Give both the area they fall in, or match them by distance to the nearest one.' };
  }
  if (a === b) return { mode: 'direct' };
  if (A.family === 'unit' || A.family === 'time') {
    return { mode: 'no', why: 'These two identifiers are not the same thing, even though both identify a case.' };
  }

  const pair = [a, b].sort().join('|');
  const table = {
    'ags3|ags5': { mode: 'derive', op: 'truncate', why: 'The first three digits of a district code are its government region.' },
    'ags2|ags5': { mode: 'derive', op: 'truncate', why: 'The first two digits of a district code are its federal state.' },
    'ags2|ags8': { mode: 'derive', op: 'truncate', why: 'The first two digits of a municipality code are its federal state.' },
    'ags3|ags8': { mode: 'derive', op: 'truncate', why: 'The first three digits of a municipality code are its government region.' },
    'ags5|ags8': { mode: 'derive', op: 'truncate', why: 'The first five digits of a municipality code are its district.' },
    'ags5|nuts3': { mode: 'crosswalk', why: 'NUTS-3 and the district code describe the same areas but use different codes. The mapping is a lookup table, it cannot be computed from the string.' },
    'ags2|nuts1': { mode: 'crosswalk', why: 'NUTS-1 and the two-digit state code describe the same 16 states with different codes. A 16-row lookup table settles it.' },
    'ags3|nuts2': { mode: 'crosswalk', why: 'NUTS-2 regions mostly follow the government regions, with exceptions in several states. Use the official correspondence table, do not assume.' },
    'nuts1|nuts3': { mode: 'derive', op: 'truncate', why: 'The first three characters of a NUTS-3 code are its NUTS-1 region.' },
    'nuts2|nuts3': { mode: 'derive', op: 'truncate', why: 'The first four characters of a NUTS-3 code are its NUTS-2 region.' },
    'nuts1|nuts2': { mode: 'derive', op: 'truncate', why: 'The first three characters of a NUTS-2 code are its NUTS-1 region.' },
    'ags5|plz': { mode: 'weighted', why: 'Postcodes are a delivery geography of Deutsche Post. They cross district boundaries and districts contain many of them, so no code can be derived either way.' },
    'ags8|plz': { mode: 'weighted', why: 'Postcodes cross municipal boundaries, and a large municipality holds dozens of them. There is no clean one-to-one mapping.' },
    'ags2|plz': { mode: 'weighted', why: 'Most postcodes sit inside one federal state, but not all of them do, so this is still a weighted allocation rather than a rule.' },
    'ags5|wk': { mode: 'weighted', why: 'Constituencies are drawn to equal population, not along district boundaries. Cities are split into several, and rural constituencies span several districts.' },
    'ags8|wk': { mode: 'weighted', why: 'Constituency boundaries follow municipalities only in part, and they are redrawn between elections.' },
    'ags5|grid': { mode: 'spatial', why: 'A grid cell is a square on the map, a district is an administrative area. Cells on a boundary belong partly to each side.' },
    'ags8|grid': { mode: 'spatial', why: 'A grid cell is a square on the map and does not respect municipal boundaries.' },
    'ags5|coord': { mode: 'spatial', why: 'A coordinate becomes a district by point-in-polygon against the official boundaries for the right reference date.' },
    'ags8|coord': { mode: 'spatial', why: 'A coordinate becomes a municipality by point-in-polygon against the official boundaries for the right reference date.' },
    'coord|grid': { mode: 'spatial', why: 'A coordinate falls into exactly one grid cell, computed from the projected coordinates.' },
    'coord|plz': { mode: 'spatial', why: 'Postcode areas have no official open geometry from the statistical offices; the commonly used polygons are derived from OpenStreetMap.' },

    /* 100-m-Zellen. Die INSPIRE-Kennung der groeberen Zelle steckt in der feineren, ist aber
       kein Praefix davon: Nord- und Ostwert verlieren je eine Stelle, das Praefix wechselt.
       Deshalb eine eigene Rechenvorschrift und kein substr. */
    'grid|grid100': { mode: 'derive', op: 'gridcoarsen', why: 'A 100 m cell lies inside exactly one 1 km cell, and its INSPIRE identifier already says which. The coarser id is computed from the finer one, it is not a prefix of it.' },
    'coord|grid100': { mode: 'spatial', why: 'A coordinate falls into exactly one 100 m cell, computed from the projected coordinates.' },
    'ags5|grid100': { mode: 'spatial', why: 'A 100 m cell is a square on the map, a district is an administrative area. Cells on a boundary belong partly to each side.' },
    'ags8|grid100': { mode: 'spatial', why: 'A 100 m cell is a square on the map and does not respect municipal boundaries.' },

    /* Ortsteile. Wie sie nummeriert werden, entscheidet die Gemeinde selbst, also gibt es
       keine Regel, die den einen Schluessel in den anderen rechnet. */
    'ags8|ortsteil': { mode: 'crosswalk', why: 'A quarter belongs to exactly one municipality, but the way quarters are numbered is the municipality\u2019s own. Take the municipality code from the file rather than cutting it out of the quarter code.' },
    'ags5|ortsteil': { mode: 'crosswalk', why: 'A quarter belongs to one municipality and therefore to one district, through the municipality. Use the table that carries both.' },
    'coord|ortsteil': { mode: 'spatial', why: 'Quarter boundaries are published by the municipality, not by the statistical offices, so a point falls into one by point-in-polygon against that municipality\u2019s own geometry.' }
  };
  if (table[pair]) return table[pair];
  /* Ein Punkt ist keine Kennziffer, die in einer Zuordnungstabelle steht: er wird durch einen
     Punkt-in-Polygon-Schritt zu einer Fläche, und zwar gegen die Grenzen des richtigen
     Gebietsstandes. Die Tabelle oben führt das für Kreis, Gemeinde, Gitter und PLZ auf; für
     alles Übrige galt bisher die allgemeine Auskunft "Zuordnungstabelle", und der Bauplan
     verband dann eine Koordinatenspalte direkt mit einem Wahlkreisschlüssel. */
  if (a === 'coord' || b === 'coord') {
    const ziel = KEYS[a === 'coord' ? b : a];
    return { mode: 'spatial', why: `A coordinate is a point, not a code. It becomes ${ziel ? ziel.label.toLowerCase() : 'an area'} by point-in-polygon against the boundaries for the right reference date.` };
  }
  /* Dasselbe Argument für die Gitterzelle: ein Quadrat auf der Karte kennt keine Verwaltungs-
     grenze, es wird verschnitten und nicht nachgeschlagen. */
  if (a === 'grid100' || b === 'grid100') {
    return { mode: 'spatial', why: 'A 100 m cell is a square on the map. It has to be intersected with the areas, cells on a boundary belong partly to each side.' };
  }
  if (a === 'grid' || b === 'grid') {
    return { mode: 'spatial', why: 'A grid cell is a square on the map. It has to be intersected with the areas, cells on a boundary belong partly to each side.' };
  }
  if (a === 'other' || b === 'other') {
    return { mode: 'crosswalk', why: 'One side is a classification the builder does not know. Check by hand which areas it is built from.' };
  }
  return { mode: 'crosswalk', why: 'These two geographies do not nest into one another. You need a correspondence table.' };
}

/* --------------------------------------------------- Gebietsstand: die großen Brüche */
/* Nur die Reformen auf Kreisebene, die eine Zeitreihe wirklich zerreißen. Auf Gemeindeebene
   passiert so etwas fast jedes Jahr, deshalb steht dort der Hinweis statt einer Liste. */
const REFORMS = [
  { year: 2007, where: 'Saxony-Anhalt', what: 'District reform: 21 rural districts became 11.' },
  { year: 2008, where: 'Saxony', what: 'District reform: 22 rural districts became 10, and 7 district-free cities became 3.' },
  { year: 2009, where: 'North Rhine-Westphalia', what: 'Aachen city and district merged into the Städteregion Aachen (05334).' },
  { year: 2011, where: 'Mecklenburg-Western Pomerania', what: 'District reform: 12 rural districts and 6 district-free cities became 6 and 2.' },
  { year: 2016, where: 'Lower Saxony', what: 'Göttingen and Osterode am Harz merged into the new district of Göttingen (03159).' },
  { year: 2021, where: 'Thuringia', what: 'Eisenach lost its district-free status and was absorbed into the Wartburgkreis (16063).' }
];

/* ------------------------------------------------------ quellenspezifische Hinweise */
const SOURCE_NOTES = {
  destatisMissing: {
    code: 'na = c\\(',
    title: 'Destatis files use letters where a number is missing',
    body: 'Exports from GENESIS, the Regionaldatenbank and the Zensus write a legend character instead of a value: <code>-</code> nothing occurred, <code>.</code> unknown or confidential, <code>...</code> not yet available, <code>/</code> too uncertain to publish, <code>x</code> cell blocked. Read naively, every one of them turns the column into text or, worse, silently becomes zero.',
    fix: 'Read the value column as text first, then convert, mapping those characters to missing.'
  },
  decimalComma: {
    code: 'read_csv2',
    title: 'German number and date format',
    body: 'German exports use a comma as the decimal separator, a dot as the thousands separator, and semicolons between fields. Some are still Latin-1 rather than UTF-8, which turns every umlaut into a replacement character.',
    fix: 'Use a reader for semicolon-separated German files and state the encoding.'
  },
  projection: {
    title: 'Some of these years are projections, not observations',
    body: 'The Wegweiser Kommune carries a population projection that runs to 2040. A projected value is a model result. Joined onto survey years it looks exactly like a measurement.',
    fix: 'Keep observed and projected years apart, or cut the table at the last observed year.'
  },
  singleYear: {
    title: 'This is one reference date, not a time series',
    body: 'The 2022 census describes 15 May 2022. Attaching it to a panel gives every wave the same value, which is a fixed characteristic of the area rather than something that changes over time.',
    fix: 'Treat it as time-constant context, and say so when you report it.'
  },
  gridSource: {
    title: 'Grid data is geometry, not a table with an area code',
    body: 'These files come as GeoPackage or raster. There is no district column to join on; the cell has a position.',
    fix: 'Aggregate the cells to the areas you need first, in a GIS or with sf/terra, then join the result.'
  },
  pointSource: {
    title: 'These records are locations, not area values',
    body: 'Stations, stops, plants and firms are points. Counting them per district is a choice you make, and the count depends on whether you count inside the boundary, within a radius, or the nearest one.',
    fix: 'Decide the measure first (count in area, count within x km, distance to the nearest), then build it.'
  },
  restricted: {
    title: 'This source is microdata that has to be applied for',
    body: 'Research data centre products are not downloads. The linkage runs inside the centre, on their machines or by remote execution.',
    fix: 'Use the plan and the code as the application attachment and as the script you send in.'
  }
};

/* ------------------------------------------------------------------ Vorlagen */
/* Die Blöcke, die man ohne Suche auf die Fläche ziehen kann. Die SOEP-Blöcke bilden die
   tatsächliche Struktur von SOEP-Core v41 ab: die Regionalangaben stehen in regionl und
   hängen am Haushalt und am Jahr, nicht an der Person. */
/* ------------------------------------------------------------------ raeumliche Masse */
/* Alles daruber beantwortet "in welchem Gebiet liegt diese Zeile". Das hier beantwortet
   "was ist um sie herum", und das ist die andere Haelfte der Geodatenliteratur: Erreichbarkeit,
   Dichte, Merkmale des Wohnumfelds, also genau das, was SoRa liefert.
   Sie sind Bloecke mit Parametern und keine Verbindungen, weil der Radius, das k und die
   Bandbreite die Entscheidungen sind, an denen das Ergebnis haengt, und eine Linie zwischen
   zwei Kaesten keine Entscheidung tragen kann. Jedes von ihnen beginnt an einer Koordinate. */
const MEASURES = {
  dist_nearest: {
    label: 'Distance to the nearest', short: 'distance',
    blurb: 'Straight-line distance from each case to the closest feature of a target layer.',
    params: ['target', 'out'], outSuffix: '_dist_m',
    unitNote: 'one row per case, one new column in metres',
    decision: 'Straight-line distance is not travel time. Where the question is reachability, a road network or a travel-time matrix says something different, and often something else entirely in rural areas.',
    r: (p) => [
      `# Distance to the nearest ${p.target}, in metres.`,
      `targets <- sf::st_read("${p.targetFile}", quiet = TRUE) |> sf::st_transform(25832)`,
      `i <- sf::st_nearest_feature(pts, targets)`,
      `pts$${p.out} <- as.numeric(sf::st_distance(pts, targets[i, ], by_element = TRUE))`
    ],
    stata: (p) => [
      `* Stata has no spatial join. geonear gives the nearest neighbour on a sphere:`,
      `* geonear id lat lon using "${p.target}.dta", n(tid tlat tlon) nearcount(1)`,
      `* It returns great-circle distance, which differs from the projected distance R computes.`
    ]
  },
  count_radius: {
    label: 'Count within a radius', short: 'count in radius',
    blurb: 'How many features of a target layer lie within r metres of each case.',
    params: ['target', 'radius', 'out'], outSuffix: '_count',
    unitNote: 'one row per case, one new count column',
    decision: 'The radius is the finding. A count within 500 m and within 5 km are different variables, and a result that only holds at one radius is a result about that radius.',
    r: (p) => [
      `# How many ${p.target} lie within ${p.radius} m of each case.`,
      `targets <- sf::st_read("${p.targetFile}", quiet = TRUE) |> sf::st_transform(25832)`,
      `buf <- sf::st_buffer(pts, ${p.radius})`,
      `pts$${p.out} <- lengths(sf::st_intersects(buf, targets))`
    ],
    stata: (p) => [
      `* Build this column in R or a GIS and merge it back on the case id:`,
      `* merge 1:1 <id> using "${p.out}.dta", keep(master match) nogenerate`
    ]
  },
  mean_radius: {
    label: 'Neighbourhood mean (egohood)', short: 'mean in radius',
    blurb: 'Area-weighted mean of a grid or small-area value within r metres of each case.',
    params: ['target', 'radius', 'value', 'out'], outSuffix: '_mean',
    unitNote: 'one row per case, one new column',
    decision: 'This is the egohood: a neighbourhood centred on the person rather than on an administrative boundary. The radius has to be argued for, and varying it is the usual way to show the finding does not hang on one number.',
    r: (p) => [
      `# Area-weighted mean of ${p.value} within ${p.radius} m of each case.`,
      `cells <- sf::st_read("${p.targetFile}", quiet = TRUE) |> sf::st_transform(25832)`,
      `buf <- sf::st_buffer(pts, ${p.radius})`,
      `buf$.case <- seq_len(nrow(buf))`,
      `ov <- suppressWarnings(sf::st_intersection(buf, cells))`,
      `ov$.w <- as.numeric(sf::st_area(ov))`,
      `ag <- stats::aggregate(list(.v = ov$${p.value} * ov$.w, .w = ov$.w), by = list(.case = ov$.case), FUN = sum, na.rm = TRUE)`,
      `pts$${p.out} <- (ag$.v / ag$.w)[match(seq_len(nrow(pts)), ag$.case)]`,
      `# A case whose buffer meets no cell comes back NA. Count those before using the column.`
    ],
    stata: (p) => [
      `* Area-weighted overlay is not available in Stata. Build it in R or a GIS,`,
      `* then merge the one column back on the case id.`
    ]
  },
  knn: {
    label: 'Mean distance to the k nearest', short: 'k nearest',
    blurb: 'Mean straight-line distance to the k closest features, a density measure that needs no radius.',
    params: ['target', 'k', 'out'], outSuffix: '_knn_m',
    unitNote: 'one row per case, one new column in metres',
    decision: 'k replaces the radius as the thing you have to justify. It adapts to local density, which is its advantage over a fixed radius and also what makes it harder to interpret.',
    r: (p) => [
      `# Mean distance to the ${p.k} nearest ${p.target}, in metres.`,
      `targets <- sf::st_read("${p.targetFile}", quiet = TRUE) |> sf::st_transform(25832)`,
      `d <- sf::st_distance(pts, targets)`,
      `pts$${p.out} <- apply(d, 1, function(row) mean(sort(as.numeric(row))[1:min(${p.k}, length(row))]))`,
      `# st_distance builds a full matrix. Above roughly 10,000 x 10,000 use nngeo::st_nn instead.`
    ],
    stata: (p) => [
      `* geonear with nearcount(${p.k}) gives the k nearest, on great-circle distance:`,
      `* geonear id lat lon using "${p.target}.dta", n(tid tlat tlon) nearcount(${p.k})`
    ]
  },
  kde: {
    label: 'Kernel density at the point', short: 'kernel density',
    blurb: 'Density of a target layer at each case, smoothed with a bandwidth instead of cut off at a radius.',
    params: ['target', 'bandwidth', 'out'], outSuffix: '_kde',
    unitNote: 'one row per case, one new density column',
    decision: 'The bandwidth does what a radius does, and it does it smoothly: a feature just outside a buffer counts for nothing, while under a kernel it still counts a little. The bandwidth is the decision, and the units of the result depend on it.',
    r: (p) => [
      `# Kernel density of ${p.target} at each case, bandwidth ${p.bandwidth} m.`,
      `# Needs spatstat.explore. The result is features per square metre;`,
      `# multiply by 1e6 to read it per square kilometre.`,
      `targets <- sf::st_read("${p.targetFile}", quiet = TRUE) |> sf::st_transform(25832)`,
      `bb  <- sf::st_bbox(c(sf::st_as_sfc(sf::st_bbox(targets)), sf::st_as_sfc(sf::st_bbox(pts))))`,
      `win <- spatstat.geom::owin(c(bb["xmin"], bb["xmax"]), c(bb["ymin"], bb["ymax"]))`,
      `tc  <- sf::st_coordinates(sf::st_centroid(sf::st_geometry(targets)))`,
      `pp  <- spatstat.geom::ppp(tc[, 1], tc[, 2], window = win)`,
      `dens <- spatstat.explore::density.ppp(pp, sigma = ${p.bandwidth})`,
      `pc  <- sf::st_coordinates(pts)`,
      `pts$${p.out} <- spatstat.geom::interp.im(dens, pc[, 1], pc[, 2])`
    ],
    stata: (p) => [
      `* Kernel density over a point pattern is not available in Stata.`,
      `* Build it in R (spatstat) or a GIS and merge the column back on the case id.`
    ]
  }
};

/* Welche Parameter ein Mass anbietet, mit den Werten, mit denen ein frischer Block startet.
   Radien in Metern. */
/* Eine Zielebene aus dem Katalog muss das erzeugte Skript erst besorgen, und dabei entscheidet
   sich, ob die Zahlen später noch etwas wert sind. Drei Dinge macht dieser Vorlauf deshalb, und
   jedes einzelne aus einem Grund, der schon jemanden Geld gekostet hat:

   1. Er holt die Ebene EINMAL und legt sie als Datei ab. OpenStreetMap ändert sich täglich, also
      ist nicht die Abfrage der Beleg, sondern die Datei. Wer zweimal rechnet, rechnet sonst
      gegen zwei verschiedene Wirklichkeiten und sieht es nicht.
   2. Er schreibt das Datum des Abrufs daneben. Ohne das ist eine Distanz zur nächsten Apotheke
      keine reproduzierbare Größe, sondern eine Momentaufnahme ohne Zeitstempel.
   3. Er vergleicht die geholte Zahl mit der, die taginfo für Deutschland nennt. Eine Abfrage,
      die abbricht oder gedrosselt wird, liefert kein Fehlerzeichen, sondern weniger Punkte, und
      daraus wird eine zu große Entfernung, die völlig plausibel aussieht.

   Bewusst ohne osmdata: die Abfrage liegt fertig im Katalog, `[out:json]` mit `out center;` ist
   genau das, was gebraucht wird, und jsonlite plus sf hat jeder, der die Maße ohnehin rechnet. */
function zielVorlauf(p) {
  if (!p.overpass) return [];
  const f = p.targetFile, d = f + '.downloaded';
  const zahl = p.osmN ? `about ${p.osmN.toLocaleString('en-US')}` : 'an unknown number of';
  return [
    `# Target layer: ${p.target} (OpenStreetMap, ${p.osmTag}), ${zahl} objects in Germany`,
    `# according to taginfo${p.osmAsOf ? ' on ' + p.osmAsOf : ''}. Data (c) OpenStreetMap contributors, ODbL.`,
    `# Fetched once and kept in ${f}. OpenStreetMap changes every day, so the FILE is what makes`,
    `# your numbers reproducible, not the query. Delete it to refresh, and report the date in ${d}.`,
    `if (!file.exists("${f}")) {`,
    `  query <- '${p.overpass.replace(/'/g, "\\'")}'`,
    `  raw <- jsonlite::fromJSON(paste0("https://overpass-api.de/api/interpreter?data=",`,
    `                                   utils::URLencode(query, reserved = TRUE)))`,
    `  el <- raw$elements`,
    `  # nwr returns nodes with lon/lat and ways/relations with center$lon/center$lat.`,
    `  lon <- if (!is.null(el$lon)) el$lon else rep(NA_real_, nrow(el))`,
    `  lat <- if (!is.null(el$lat)) el$lat else rep(NA_real_, nrow(el))`,
    `  if (!is.null(el$center)) {`,
    `    lon <- ifelse(is.na(lon), el$center$lon, lon)`,
    `    lat <- ifelse(is.na(lat), el$center$lat, lat)`,
    `  }`,
    `  ok <- !is.na(lon) & !is.na(lat)`,
    `  layer <- sf::st_as_sf(data.frame(osm_id = el$id[ok], lon = lon[ok], lat = lat[ok]),`,
    `                        coords = c("lon", "lat"), crs = 4326)`,
    `  sf::st_write(sf::st_transform(layer, 25832), "${f}", quiet = TRUE)`,
    `  writeLines(as.character(Sys.Date()), "${d}")`,
    `}`,
    ...(p.osmN ? [
      `# A throttled or truncated Overpass answer returns fewer points, never an error, and a`,
      `# missing point silently becomes a larger distance. So compare before you trust it.`,
      `.n <- nrow(sf::st_read("${f}", quiet = TRUE))`,
      `if (.n < ${Math.round(p.osmN * 0.5)}) stop(sprintf(`,
      `  "${p.target}: only %d features, taginfo counted ${p.osmN}. Fetch again before using this.", .n))`,
    ] : []),
    ''
  ];
}

const MEASURE_PARAMS = {
  target:    { label: 'Target layer', kind: 'target', def: 'facilities' },
  value:     { label: 'Value column', kind: 'text', def: 'value' },
  out:       { label: 'New column', kind: 'text', def: '' },
  radius:    { label: 'Radius (m)', kind: 'number', def: 1000, min: 50, max: 50000 },
  bandwidth: { label: 'Bandwidth (m)', kind: 'number', def: 1000, min: 50, max: 50000 },
  k:         { label: 'k', kind: 'number', def: 5, min: 1, max: 100 }
};

const TEMPLATES = [
  {
    id: 'soep_person', group: 'Your analysis table', kind: 'base',
    title: 'SOEP person-year', subtitle: 'ppathl / pgen, SOEP-Core v41',
    unit: 'one row per person and survey year',
    keys: [
      { type: 'pid', name: 'pid' },
      { type: 'hid', name: 'hid' },
      { type: 'year', name: 'syear' }
    ],
    note: 'The person file carries no area code. The household number and the survey year are what leads to the regional file.',
    surveyWeight: 'phrf',
    reader: { r: 'haven::read_dta("ppathl.dta")', stata: 'use "ppathl.dta", clear' }
  },
  {
    id: 'soep_hh', group: 'Your analysis table', kind: 'base',
    title: 'SOEP household-year', subtitle: 'hbrutto / hgen, SOEP-Core v41',
    unit: 'one row per household and survey year',
    keys: [
      { type: 'hid', name: 'hid' },
      { type: 'year', name: 'syear' }
    ],
    note: 'hgen carries hgnuts1, the federal state as a NUTS-1 code. Everything finer sits in the regional file.',
    surveyWeight: 'hhrf',
    reader: { r: 'haven::read_dta("hgen.dta")', stata: 'use "hgen.dta", clear' }
  },
  {
    id: 'own', group: 'Your analysis table', kind: 'base',
    title: 'Your own table', subtitle: 'survey, register or administrative data',
    unit: 'one row per case',
    editable: true,
    keys: [
      { type: 'caseid', name: 'id' },
      { type: 'year', name: 'year' },
      { type: 'ags5', name: 'district' }
    ],
    note: 'Set the columns you actually have. Every key you add here becomes a place a link can start.',
    surveyWeight: '',
    reader: { r: 'readr::read_csv2("my_data.csv")', stata: 'import delimited "my_data.csv", clear' }
  },
  {
    id: 'regionl', group: 'Bridges and lookups', kind: 'bridge',
    title: 'SOEPregion (regionl)', subtitle: 'the SOEP regional file, FDZ only',
    unit: 'one row per household and survey year',
    restricted: true,
    keys: [
      { type: 'hid', name: 'hid' },
      { type: 'year', name: 'syear' },
      { type: 'ags2', name: 'bula' },
      { type: 'ags5', name: 'kkz' },
      { type: 'ags5', name: 'kkz_rek', rec: true, note: 'district code recoded to the boundaries of 31.12.2023, the same reference date INKAR and the BBSR system use' },
      { type: 'ags8', name: 'gkz' },
      { type: 'plz', name: 'plz' },
      { type: 'nuts3', name: 'nuts3_c' }
    ],
    note: 'This is the file that turns a SOEP household into a place. It is not part of the standard distribution: it is applied for separately and used inside the FDZ SOEP.',
    reader: { r: 'haven::read_dta("regionl.dta")', stata: 'use "regionl.dta", clear' }
  },
  {
    id: 'xwalk_nuts', group: 'Bridges and lookups', kind: 'bridge',
    title: 'AGS to NUTS-3', subtitle: 'official correspondence table',
    unit: 'one row per district',
    keys: [
      { type: 'ags5', name: 'ags' },
      { type: 'nuts3', name: 'nuts3' }
    ],
    note: 'Published by Destatis and by Eurostat. Both codes change when districts are merged, so the table has a reference date too.',
    quelle: { label: 'Eurostat correspondence tables (NUTS to AGS)',
              url: 'https://ec.europa.eu/eurostat/web/nuts/correspondence-tables' },
    reader: { r: 'readr::read_csv2("ags_nuts3.csv")', stata: 'import delimited "ags_nuts3.csv", clear' }
  },
  {
    id: 'xwalk_plz', group: 'Bridges and lookups', kind: 'bridge',
    title: 'Postcode to district', subtitle: 'weighted allocation table',
    unit: 'one row per postcode and district pair',
    keys: [
      { type: 'plz', name: 'plz' },
      { type: 'ags5', name: 'ags' }
    ],
    weightCol: 'share',
    note: 'A postcode that spans two districts appears twice, with a share that adds to one. The statistical offices publish no official free version of this; the usual sources are the census grid or OpenStreetMap postcode polygons.',
    quelle: { label: 'Build it yourself: census grid at the BKG open-data server',
              url: 'https://gdz.bkg.bund.de/index.php/default/open-data.html',
              warn: 'There is no official free postcode-to-district table. Whatever you use, check that the shares add to one per postcode; the script does that too.' },
    reader: { r: 'readr::read_csv2("plz_ags.csv")', stata: 'import delimited "plz_ags.csv", clear' }
  },
  {
    id: 'xwalk_gebietsstand', group: 'Bridges and lookups', kind: 'bridge',
    title: 'District boundary crosswalk', subtitle: 'old code to current code',
    unit: 'one row per old district code',
    keys: [
      { type: 'ags5', name: 'ags_old' },
      { type: 'ags5', name: 'ags_2023' }
    ],
    note: 'Needed whenever a series crosses one of the district reforms. The BBSR reference system and the Destatis Gebietsstand tables both carry it.',
    quelle: { label: 'Destatis Gemeindeverzeichnis, with the Gebietsstand tables',
              url: 'https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html' },
    reader: { r: 'readr::read_csv2("gebietsstand.csv")', stata: 'import delimited "gebietsstand.csv", clear' }
  },
  {
    id: 'geocode', group: 'Bridges and lookups', kind: 'bridge',
    title: 'Coordinates to area', subtitle: 'point-in-polygon, done once in a GIS',
    unit: 'one row per location',
    keys: [
      { type: 'coord', name: 'lon_lat' },
      { type: 'ags8', name: 'gem' },
      { type: 'ags5', name: 'krs' },
      { type: 'grid', name: 'cell' }
    ],
    spatial: true,
    note: 'Turns a coordinate into the areas it falls in. In practice you run it on your own table; it stands here as its own step so the three choices it hides stay visible.',
    reader: { r: 'readr::read_csv2("points_with_areas.csv")', stata: 'import delimited "points_with_areas.csv", clear' },
    recipe: {
      r: [
        'library(sf)',
        '# Boundaries for the right reference date, from the BKG (VG250, free and official).',
        'gem <- st_read("vg250_gem.gpkg") |> st_transform(25832)',
        '# Your points. Say which columns hold them and which CRS they are in:',
        '# 4326 is plain longitude/latitude, 25832 is ETRS89 / UTM 32N.',
        'pts <- st_as_sf(points, coords = c("lon", "lat"), crs = 4326) |> st_transform(25832)',
        'points_with_areas <- st_join(pts, gem["AGS"], join = st_within) |>',
        '  rename(gem = AGS) |> mutate(krs = substr(gem, 1, 5))',
        '# Die INSPIRE-Zelle folgt aus den projizierten Koordinaten (EPSG 25832), 1 km Kantenlänge.',
        'koord <- sf::st_coordinates(points_with_areas)',
        'points_with_areas$cell <- sprintf("1kmN%04dE%04d", floor(koord[, 2] / 1000), floor(koord[, 1] / 1000))',
        'points_with_areas <- sf::st_drop_geometry(points_with_areas)',
        '# Overlapping polygons would give a point two areas and silently double the row.',
        'stopifnot(nrow(points_with_areas) == nrow(pts))',
        '# A point that falls in no polygon comes back NA: count those before moving on.'
      ]
    }
  },
  {
    id: 'xwalk_grid', group: 'Bridges and lookups', kind: 'bridge',
    title: 'Grid cells to areas', subtitle: 'area-weighted aggregation',
    unit: 'one row per cell and area',
    keys: [
      { type: 'grid', name: 'cell' },
      { type: 'ags8', name: 'gem' },
      { type: 'ags5', name: 'krs' }
    ],
    weightCol: 'area_share',
    spatial: true,
    note: 'A 1 km cell on a boundary belongs partly to each side. This table says how much, so the cells can be aggregated to areas honestly.',
    reader: { r: 'readr::read_csv2("grid_to_area.csv")', stata: 'import delimited "grid_to_area.csv", clear' }
  },
  {
    id: 'xwalk_wk', group: 'Bridges and lookups', kind: 'bridge',
    title: 'Constituency to district', subtitle: 'weighted allocation table',
    unit: 'one row per constituency and district pair',
    keys: [
      { type: 'wk', name: 'wkr_nr' },
      { type: 'ags5', name: 'ags' }
    ],
    weightCol: 'share',
    note: 'Constituencies are drawn to equal population and are redrawn between elections, so the mapping is many-to-many and holds only for one election year.',
    reader: { r: 'readr::read_csv2("wk_ags.csv")', stata: 'import delimited "wk_ags.csv", clear' }
  },
  {
    id: 'bbsr_ref', group: 'Bridges and lookups', kind: 'bridge',
    title: 'BBSR spatial reference 2023', subtitle: 'district and municipality typologies',
    unit: 'one row per municipality, with its district',
    keys: [
      { type: 'ags8', name: 'GEM' },
      { type: 'ags5', name: 'KRS' }
    ],
    note: 'Adds the settlement typologies (RegioStaR, degree of urbanisation, spatial planning regions) to any area code, on the 2023 boundaries.',
    reader: { r: 'readxl::read_excel("bbsr_raumgliederung_2023.xlsx")', stata: 'import excel "bbsr_raumgliederung_2023.xlsx", firstrow clear' }
  },

  /* Die raeumlichen Masse. Jedes haengt an der Koordinate der Analysetabelle und erzeugt je
     eine Spalte, ist also keine Tabelle, die verbunden wird, sondern ein Schritt davor. */
  ...Object.keys(MEASURES).map((op) => {
    const m = MEASURES[op];
    return {
      id: 'measure_' + op, group: 'Spatial measures', kind: 'measure', measure: op,
      title: m.label, subtitle: m.short, unit: m.unitNote, spatial: true,
      params: Object.fromEntries(m.params.map((k) => [k, MEASURE_PARAMS[k].def])),
      keys: [{ type: 'coord', name: 'lon_lat' }],
      note: m.blurb + ' ' + m.decision,
      reader: null
    };
  })
];

/* Die Produkte, die ohne Suche in der Palette stehen. Auswahl nach dem, was in der Praxis am
   häufigsten an Umfragedaten gespielt wird, plus je ein Beispiel für die schwierigen Fälle
   (Raster, Wahlkreise, Geometrien). Schlüssel ist `key|name` aus catalogue.json. */
/* Vier Punktebenen stehen sichtbar in der Palette, der Rest ueber die Suche. Ausgewaehlt nach
   dem, wofuer Erreichbarkeit in der Sozialforschung tatsaechlich gemessen wird: Versorgung,
   Betreuung, Anbindung, Wohnumfeld. */
const ZIELE_VORN = ['osm:pharmacy', 'osm:kindergarten', 'osm:railway_station', 'osm:playground'];

const FEATURED = [
  'inkar|INKAR: Arbeitslosigkeit',
  'inkar|INKAR: Bevölkerung',
  'inkar|INKAR: Privateinkommen und private Schulden',
  'inkar|INKAR: Erreichbarkeit',
  'regionalstatistik|GENESIS-Tabelle (Regionaldatenbank)',
  'regionalatlas|Bevölkerungsstand - Geburten - Gestorbene - Wanderungen',
  'ba_arbeitsmarktreport|Eckwerte',
  'zensus2022|Zensus-2022-Tabelle',
  'wegweiser_kommune|Wegweiser Kommune: Soziale Lage',
  'deutschlandatlas|Wie wir wohnen',
  'migration_integration|Migration.Integration.Regionen',
  'dwd_cdc|Rasterdaten (1 km) für Deutschland',
  'breitband|Breitbandatlas (Festnetz und Mobilfunk)',
  'wahlergebnisse|Bundestags- und Europawahlergebnisse'
];


/* Welche Brücke ein bestimmtes Schlüsselpaar überhaupt erst verbindbar macht. Damit kann die
   Prüfung nicht nur sagen, dass etwas fehlt, sondern es auch einsetzen. */
const BRIDGE_FOR = {
  'ags5|nuts3': 'xwalk_nuts', 'ags2|nuts1': 'xwalk_nuts', 'ags3|nuts2': 'xwalk_nuts',
  'ags5|plz': 'xwalk_plz', 'ags8|plz': 'xwalk_plz', 'ags2|plz': 'xwalk_plz',
  'ags5|wk': 'xwalk_wk', 'ags8|wk': 'xwalk_wk',
  'ags5|coord': 'geocode', 'ags8|coord': 'geocode', 'coord|grid': 'geocode', 'coord|plz': 'geocode',
  'ags5|grid': 'xwalk_grid', 'ags8|grid': 'xwalk_grid',
  'ags5|grid100': 'xwalk_grid', 'ags8|grid100': 'xwalk_grid',
  'coord|grid100': 'geocode', 'coord|ortsteil': 'geocode'
};
function bridgeFor(a, b) {
  return BRIDGE_FOR[[a, b].sort().join('|')] || null;
}
