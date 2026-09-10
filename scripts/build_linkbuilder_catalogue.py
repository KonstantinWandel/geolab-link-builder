#!/usr/bin/env python3
"""Baut den Datenkatalog des Link Builders aus dem GeoDB-Index.

    python3 scripts/build_linkbuilder_catalogue.py

Liest `destatis-rag/soep_metadata_output/geodb_metadata.json` (den Index, den auch der
GeoDB-Finder serviert) und schreibt `tools/link-builder/catalogue.json`. Der Katalog hat zwei
Ebenen, weil die beiden Fragen verschieden sind:

  * `products`  ist das, was man auf die Arbeitsfläche zieht: ein Datenprodukt, also eine
    Tabellenfamilie einer Quelle, mit den Gebietsebenen und Jahren, die ihre Datensätze
    wirklich abdecken. Das ist die Einheit, die man verknüpft.
  * `items`     ist der Suchindex über die einzelnen Indikatoren und Tabellen. Wer nach
    "Arbeitslosenquote" sucht, landet über den Eintrag beim passenden Produkt.

Erzeugtes Artefakt, nicht von Hand bearbeiten: die Korrekturen gehören in dieses Skript
(Werkstattregel aus destatis-rag/CLAUDE.md, "fix the generator, never its output").
"""
from __future__ import annotations

import json
import pathlib
import collections
import datetime

HIER = pathlib.Path(__file__).resolve().parent
WURZEL = HIER.parent
QUELLE = WURZEL.parent / "destatis-rag" / "soep_metadata_output" / "geodb_metadata.json"
QUELLE_INKAR = WURZEL.parent / "destatis-rag" / "soep_metadata_output" / "inkar_metadata_2025.json"
ZIEL = WURZEL / "tools" / "link-builder" / "catalogue.json"

# Gebietsebenen, auf denen sich überhaupt verknüpfen lässt. "Bund" und "Weitere Gliederungen"
# fallen heraus: das eine ist eine einzige Zeile, das andere ist alles Mögliche.
EBENEN = {
    "Bundesländer": "state",
    "Regierungsbezirke": "govdistrict",
    "Kreise": "district",
    "Gemeinden": "municipality",
    "PLZ": "postcode",
    "Bundestagswahlkreise": "constituency",
    "Rasterzellen": "grid",
    "Ortsteile": "subdistrict",
    "Adressen/Koordinaten": "point",
}
# Kurzzeichen je Ebene, damit der Suchindex klein bleibt.
KUERZEL = {"state": "s", "govdistrict": "r", "district": "d", "municipality": "m",
           "postcode": "p", "constituency": "c", "grid": "g", "subdistrict": "u", "point": "o"}
# Nur diese Satzarten beschreiben Daten, die man an Mikrodaten anspielen kann. Glossareinträge,
# Formatbeschreibungen und Portalkarten sind Nachschlagewerke, keine Datentabellen.
SATZARTEN = {"table", "regional_indicator", "indicator", "climate_dataset", "dataset"}

# Was in der heruntergeladenen Datei tatsächlich in der Schlüsselspalte steht. Nur eingetragen,
# wo es geprüft ist; wo nichts steht, sagt die Oberfläche das auch so.
SCHLUESSEL_HINWEISE = {
    "regionalstatistik": "Der ffcsv-Export legt den Gebietsschlüssel in `1_variable_attribute_code`; "
                         "die Stellenzahl folgt der regionalen Tiefe der Tabelle (2 Land, 5 Kreis, 8 Gemeinde).",
    "genesis_bund": "Der ffcsv-Export legt den Gebietsschlüssel in `1_variable_attribute_code`. "
                    "Viele Tabellen der Bundesdatenbank sind nur bis Bundesland tief.",
    "zensus2022": "Der ffcsv-Export legt den Gebietsschlüssel in `1_variable_attribute_code`. "
                  "Welche Ebene eine Tabelle hat, steckt in ihrem Code, nicht in einem Parameter.",
    "regionalatlas": "Die Werte stammen aus der Regionalstatistik; der Export führt den "
                     "Gebietsschlüssel als `schluessel`.",
    "inkar": "INKAR-Ausgaben führen den amtlichen Schlüssel als `Kennziffer` und den Namen als "
             "`Raumeinheit`. Kennziffern sind Text mit führender Null. Der Gebietsstand ist der "
             "des BBSR-Raumgliederungssystems 2023, also derselbe wie bei SOEP `kkz_rek`.",
    "dwd_cdc": "Stationsdaten haben `Stations_id` und Koordinaten, keinen Gebietsschlüssel: "
               "sie müssen erst räumlich zugeordnet werden. Die Rasterdaten liegen als 1-km-Gitter vor.",
    "breitband": "Die Gitterdateien sind GeoPackages mit Zellgeometrie, keine Tabelle mit "
                 "Gebietsschlüssel; die Gemeinde- und Kreisdateien haben einen.",
}

# Kurze, ehrliche Einordnung je Quelle. Sie steht im Block auf der Arbeitsfläche.
QUELLEN_NOTIZ = {
    "regionalstatistik": "Regionaldatenbank der statistischen Ämter: die tiefste amtliche Quelle, "
                         "viele Tabellen bis Gemeindeebene.",
    "genesis_bund": "GENESIS-Online des Bundes: bundesweite Statistik, regional meist nur bis Bundesland.",
    "zensus2022": "Zensus 2022: Stichtag 15.05.2022, eine einzige Erhebung, also keine Zeitreihe.",
    "regionalatlas": "Regionalatlas: eine kuratierte Auswahl von Indikatoren der Regionalstatistik, "
                     "fertig gerechnet und einheitlich benannt.",
    "wegweiser_kommune": "Wegweiser Kommune der Bertelsmann Stiftung, mit Vorausberechnungen bis 2040.",
    "ba_arbeitsmarktreport": "Statistik der Bundesagentur für Arbeit, monatlich und als Jahreswerte.",
    "ba_strukturdaten": "Strukturdaten der Bundesagentur für Arbeit.",
    "ba_arbeitsmarkt_kommunal": "Kommunale Arbeitsmarktzahlen der Bundesagentur für Arbeit.",
    "dwd_cdc": "Deutscher Wetterdienst, Climate Data Center: Stationsmessungen und 1-km-Raster.",
    "breitband": "Breitbandatlas / Gigabit-Grundbuch: Versorgungsgrade, auch als Gitterzellen.",
    "deutschlandatlas": "Deutschlandatlas des BBSR und des BMWSB: Karten zu Lebensverhältnissen.",
    "ioer_monitor": "IÖR-Monitor: Flächennutzung und Siedlungsstruktur, auch als Raster.",
    "migration_integration": "Migration.Integration.Regionen, Kreisebene, Berichtsjahr 2022.",
    "btw_strukturdaten": "Strukturdaten zu den Bundestagswahlkreisen der Bundeswahlleiterin.",
    "wahlergebnisse": "Amtliche Wahlergebnisse, teils bis auf Gemeindeebene.",
    "uba_luft": "Umweltbundesamt, Luftqualität: Messstationen mit Koordinaten.",
    "gbe": "Gesundheitsberichterstattung der Länder, Indikatorensatz.",
    "laendermonitor": "Ländermonitor frühkindliche Bildungssysteme.",
    "bkg": "Bundesamt für Kartographie und Geodäsie: die Geometrien selbst, nicht Sachdaten.",
    "boris_d": "BORIS-D: Bodenrichtwerte der Gutachterausschüsse.",
    "unfallatlas": "Unfallatlas der statistischen Ämter: Einzelunfälle mit Koordinate.",
    "osm_poi": "OpenStreetMap-Punktdaten, über taginfo ausgezählt.",
    "db_isr": "Infrastrukturregister der Deutschen Bahn.",
    "db_stada": "Bahnhofsdaten der Deutschen Bahn, mit Koordinaten.",
    "hochschulkompass": "Hochschulkompass: Hochschulstandorte.",
    "bundes_klinik_atlas": "Bundes-Klinik-Atlas: Krankenhausstandorte und Leistungen.",
    "gba_qualitaetsbericht": "Qualitätsberichte der Krankenhäuser, nach Berichtsstruktur erschlossen.",
    "fdz_statistik": "Forschungsdatenzentren der statistischen Ämter: Mikrodaten auf Antrag.",
    "fdz_iab": "Forschungsdatenzentrum der Bundesagentur für Arbeit im IAB: Mikrodaten auf Antrag.",
    "fdz_ruhr": "FDZ Ruhr am RWI: Datenangebote auf Antrag.",
    "marktstammdaten": "Marktstammdatenregister: Energieanlagen mit Standort.",
    "opendata_oepnv": "Open-Data-ÖPNV: Fahrplandaten im GTFS-Format.",
    "transit_formats": "Beschreibung der GTFS- und NeTEx-Felder, keine Messwerte.",
    "pks": "Polizeiliche Kriminalstatistik.",
    "offeneregister": "offeneregister.de: Handelsregisterdaten.",
    "german_companies": "Unternehmensdaten mit Sitzangabe.",
    "mid": "Mobilität in Deutschland: Erhebungswellen und Auswertungstabellen.",
    "destatis_mobilitaet": "Mobilitätsstatistiken des Bundes.",
    "uba_laerm": "Umgebungslärm: die Kartierung liegt bei den Ländern, hier nur der Rahmen.",
    "ba_glossar": "Begriffsdefinitionen der BA-Statistik, kein Datenbestand.",
    "geoportal": "Portalkarte, kein einzelner Datensatz.",
    "inkar": "INKAR des BBSR: die klassische Indikatorensammlung zur Raumbeobachtung, "
             "Kreise und Gemeinden, lange Reihen, Gebietsstand 2023 durchgängig zurückgerechnet.",
}


def jahr(w):
    try:
        j = int(w)
    except (TypeError, ValueError):
        return None
    # Der Index trägt vereinzelt Vorausberechnungen bis 2070 und Reihenanfänge vor 1900.
    return j if 1900 <= j <= 2060 else None


def main() -> None:
    saetze = json.loads(QUELLE.read_text(encoding="utf-8"))

    gruppen: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for s in saetze:
        if s.get("item_type") not in SATZARTEN:
            continue
        if not (set(s.get("spatial_levels") or []) & set(EBENEN)):
            continue
        name = (s.get("dataset_label") or s.get("dataset") or s.get("source_label") or "").strip()
        gruppen[(s["source_key"], name)].append(s)

    produkte, eintraege = [], []
    for (schluessel, name), teil in sorted(gruppen.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        pid = f"{schluessel}::{len(produkte)}"
        ebenen = sorted({EBENEN[l] for s in teil for l in (s.get("spatial_levels") or []) if l in EBENEN})
        j0 = [j for s in teil if (j := jahr(s.get("year_start")))]
        j1 = [j for s in teil if (j := jahr(s.get("year_end")))]
        beispiel = teil[0]
        produkte.append({
            "id": pid,
            "key": schluessel,
            "source": beispiel.get("source_label") or schluessel,
            "name": name or beispiel.get("source_label") or schluessel,
            "n": len(teil),
            "levels": ebenen,
            "y0": min(j0) if j0 else None,
            "y1": max(j1) if j1 else None,
            "url": beispiel.get("portal_url") or beispiel.get("source_url") or "",
            "note": QUELLEN_NOTIZ.get(schluessel, ""),
            "keyHint": SCHLUESSEL_HINWEISE.get(schluessel, ""),
            "themes": [t for t, _ in collections.Counter(
                (s.get("theme") or "").strip() for s in teil if (s.get("theme") or "").strip()
            ).most_common(4)],
        })
        for s in teil:
            eintraege.append([
                (s.get("label") or "").strip()[:130],
                len(produkte) - 1,
                jahr(s.get("year_start")) or 0,
                jahr(s.get("year_end")) or 0,
                "".join(sorted({KUERZEL[EBENEN[l]] for l in (s.get("spatial_levels") or []) if l in EBENEN})),
                s.get("indicator_url") or s.get("source_url") or "",
            ])

    # INKAR liegt in einer eigenen Datei, weil es der Finder getrennt indexiert. Es gehört
    # hierher, denn es ist die Quelle, die am häufigsten an Umfragedaten gespielt wird, und die
    # einzige mit einer Jahresabdeckung je Gebietsebene.
    inkar = json.loads(QUELLE_INKAR.read_text(encoding="utf-8"))
    nach_thema: dict[str, list[dict]] = collections.defaultdict(list)
    for s_ in inkar:
        if set(s_.get("spatial_levels") or []) & set(EBENEN):
            nach_thema[(s_.get("theme") or "Weitere Indikatoren").strip()].append(s_)
    for thema, teil in sorted(nach_thema.items()):
        idx = len(produkte)
        ebenen = sorted({EBENEN[l] for s_ in teil for l in s_["spatial_levels"] if l in EBENEN})
        j0 = [j for s_ in teil if (j := jahr(s_.get("year_start")))]
        j1 = [j for s_ in teil if (j := jahr(s_.get("year_end")))]
        produkte.append({
            "id": f"inkar::{idx}",
            "key": "inkar",
            "source": "INKAR (BBSR)",
            "name": f"INKAR: {thema}",
            "n": len(teil),
            "levels": ebenen,
            "y0": min(j0) if j0 else None,
            "y1": max(j1) if j1 else None,
            "url": "https://www.inkar.de/",
            "note": QUELLEN_NOTIZ["inkar"],
            "keyHint": SCHLUESSEL_HINWEISE["inkar"],
            "themes": [thema],
        })
        for s_ in teil:
            eintraege.append([
                (s_.get("name") or s_.get("short_name") or "").strip()[:130],
                idx,
                jahr(s_.get("year_start")) or 0,
                jahr(s_.get("year_end")) or 0,
                "".join(KUERZEL[EBENEN[l]] for l in s_["spatial_levels"] if l in EBENEN),
                s_.get("indicator_url") or "https://www.inkar.de/",
            ])

    # Die Notizen je Quelle wandern mit in den Katalog: die Live-Suche liefert Datensätze
    # direkt aus dem GeoDB-Index, und die Oberfläche soll dafür dieselben Hinweise zeigen
    # wie für einen Block aus dem Katalog, ohne dass die Texte zweimal gepflegt werden.
    quellen = {}
    for k in sorted(set(list(QUELLEN_NOTIZ) + list(SCHLUESSEL_HINWEISE))):
        quellen[k] = {"note": QUELLEN_NOTIZ.get(k, ""), "keyHint": SCHLUESSEL_HINWEISE.get(k, "")}

    ziel = {
        "built": datetime.date.today().isoformat(),
        "origin": f"GeoDB-Index, {len(saetze)} Datensätze",
        "levelCodes": {v: k for k, v in KUERZEL.items()},
        "levelNames": EBENEN,
        "sources": quellen,
        "products": produkte,
        "items": eintraege,
    }
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(json.dumps(ziel, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(produkte)} Produkte, {len(eintraege)} Einträge -> {ZIEL} "
          f"({ZIEL.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
