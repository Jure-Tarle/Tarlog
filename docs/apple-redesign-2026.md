# Tarlog Apple Redesign 2026

Stand: 18. Juli 2026

Release: 0.0.5

Status: Umsetzungsinventar und ehrlicher Abnahmeplan; native visuelle
Plattformgates bleiben offen

Aktueller Implementierungsstand: Desktop und Web bieten in den Einstellungen
die Auswahl **System**, **Hell** und **Dunkel**. System ist die empfohlene
Voreinstellung und folgt der Geräteanzeige; unter macOS wird zusätzlich das
native Tauri-Fensterthema gesetzt. Die Paletten verwenden semantische
Apple-Systemrollen für Canvas, Flächen, Text, Status und Akzent. Glass/Material
bleibt auf Navigation, Werkzeugleisten und temporäre Ebenen beschränkt;
Inhaltskarten sind opak. Reduzierte Transparenz, erhöhter Kontrast und fehlende
Backdrop-Filter besitzen opake Fallbacks.

Die Mobile-Vorbereitung verwendet auf iOS semantische UIKit-Farbrollen über
React Native `PlatformColor`, maximal fünf primäre Tab-Ziele, zugängliche
Auswahlzustände und Reduce-Motion-Verhalten. Expo SDK 52 und die JavaScript-
Tabbar sind jedoch kein Nachweis für Apples aktuellen nativen Liquid-Glass-
Renderer; auch diese Oberfläche wird bis zu einem SDK-Upgrade und einer
Geräteabnahme nur als Apple-inspiriert bezeichnet.
Der lokale Simulatorlauf erreicht derzeit wegen der bereits dokumentierten
pnpm-/Metro-Auflösung (`Unable to resolve "react"` aus Expo-Routen) kein
ausführbares Bundle. Typecheck und Build ersetzen diese Laufzeitabnahme nicht.

## 1. Ziel und Referenzrahmen

Tarlog soll ruhig, präzise und unmittelbar wirken: Zeit erfassen, Arbeit
nachvollziehen und abrechnen, ohne visuelle Ablenkung. Das Redesign übernimmt
nicht nur eine „Glas“-Optik, sondern Apples grundlegende Hierarchie: Inhalt
bleibt klar und überwiegend opak; Navigation, Werkzeugleisten und temporäre
Steuerebenen können Material und Tiefe verwenden. Jede Plattform behält dabei
ihre eigenen Konventionen.

Die aktuellen [Apple Design Resources](https://developer.apple.com/design/resources/)
führen **macOS 27** als neueste macOS-UI-Kit-Referenz. Deshalb ist macOS 27 das
visuelle Referenzziel. Das native Binary wurde lokal auf **macOS 26.5.2** mit
**Xcode 26.6** gebaut und in der Tauri-App visuell sowie über den macOS-
Accessibility-Tree stichprobenartig geprüft. Eine vollständige VoiceOver- und
Gerätematrix steht weiterhin aus. Das Paket behält
**macOS 10.15** als technisches Mindestziel; ein realer Lauf auf 10.15 steht
ebenso aus wie die Abnahme auf macOS 27. Neuere Materialien und Symbole
benötigen dort definierte Fallbacks.

Verbindliche Apple-Quellen für dieses Dokument:

- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials): Material ist eine funktionale Hierarchieebene, kein dekorativer Effekt auf jeder Karte.
- [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) und [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/): Navigation, Fensterverhalten, Informationsdichte und Desktop-Eingabe.
- [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode): semantische, adaptive Farben statt invertierter Festwerte.
- [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols) und [App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons/): systemgerechte Symbolik sowie eigenständige, skalierbare App-Identität.
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/), [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards/), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) und [Windows](https://developer.apple.com/design/human-interface-guidelines/windows): vollständige Bedienbarkeit jenseits von Pointer und Animation.
- WWDC25: [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/), [Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/) und [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/).

## 2. Technisches Inventar

### 2.1 Stack und Laufzeitmodelle

| Bereich | Bestand | Datenhaltung | Rolle im Redesign |
|---|---|---|---|
| Gemeinsamer Kern | TypeScript, `@tarlog/core`, Zod, Luxon | keine eigene Persistenz | Zeit-, Rundungs-, Abrechnungs-, Compliance- und versionierte Onboarding-Logik |
| Gemeinsames DB-Modell | Drizzle ORM, `@tarlog/db` | SQLite und PostgreSQL | zwei Dialekte mit möglichst gleicher Fachsemantik |
| macOS/Windows Desktop | Tauri 2, Rust, React 19, Vite 6, Motion | lokale SQLite-Datenbank | vollständiger Offline-Modus; optionaler, derzeit experimenteller Server-Sync |
| Web | Next.js 15, React 19, Custom-Node-Server, `ws` | PostgreSQL | selbst gehostete Mehrbrowser-Anwendung, REST, Long-Poll und WebSocket |
| Mobile-Vorbereitung | Expo 52, React Native 0.76, Expo Router | lokales Expo SQLite | vorbereitete iOS-Architektur; noch keine produktionsreife Sync-Strecke |
| Icons und Marke | Tarlog-Flow-Vektormarke, Plattform-Exports, Lucide; auf macOS zusätzlich AppKit/SF-Symbol-Brücke | Assets und native Laufzeit | SF Symbols nur auf Apple-Plattformen; kontrollierte Fallbacks anderswo |

### 2.2 Screen-Inventar

**Desktop, 13 Hauptbereiche**

1. Dashboard
2. Timer
3. Heute
4. Woche
5. Kunden
6. Projekte
7. Aufgaben
8. Reports
9. Rechnungen
10. Nachträge
11. Compliance
12. Einstellungen
13. Sync

Zusätzlich existieren der lokale Datenbank-Bootzustand, ein verpflichtendes
Erststart-Onboarding, Dialoge für Timerabschluss und Bearbeitung sowie native
Menü- und Tray-Einstiegspunkte.

**Web, Zugangsfluss plus 17 Arbeitsbereiche**

- Zugang: Setup des ersten Kontos, Login und Produkt-Onboarding.
- Zeit: Übersicht, Timer, Heute, Woche, Monat, Nachtragen.
- Organisation: Kunden, Projekte, Aufgaben, Anhänge.
- Finanzen: Reports, Rechnungen, Exporte.
- System: Einführung erneut öffnen, Compliance, Synchronisierung,
  Einstellungen.

**Mobile-Vorbereitung, 5 primäre Tabs plus sekundäre Route**

Timer, Heute, Woche, Nachtragen und Einstellungen bilden die primäre Tabbar.
Sync bleibt als sekundäre Route aus den Einstellungen erreichbar. Diese
Oberfläche ist im Redesign-Inventar enthalten, aber nicht Teil der
Produktionsfreigabe für Desktop und Web.

### 2.3 Kritische Daten- und Zustandsmodelle

- Timerzustände sind mehr als „an/aus“: `idle`, `running`, `paused`,
  `stopped`, `needs_description`, `sync_pending` und `conflict` müssen in
  Menü, Tray, Navigation und Hauptansicht dieselbe Bedeutung haben.
- Der lokale Desktop-Modus ist die Offline-Wahrheit der Desktop-App. Der
  Webmodus verwendet PostgreSQL als Server-Wahrheit.
- Tatsächliche Dauer und abrechenbare Dauer bleiben getrennt. Nachträge müssen
  ihre Herkunft sichtbar behalten.
- Onboarding-Fortschritt ist versioniert und speichert nur dauerhafte
  Checkpoints sowie erzeugte Kunden-/Projekt-IDs; Formulardrafts bleiben lokal
  in der aktuellen Ansicht.
- Sync benötigt explizite Zustände für verbunden, getrennt, ausstehend,
  Konflikt und Fehler. Ein neutraler „alles synchron“-Zustand darf nicht aus
  fehlender Verbindung abgeleitet werden.

## 3. Audit-Erkenntnisse und Prioritäten

| Priorität | Erkenntnis | Konsequenz / Stand |
|---|---|---|
| P0 | Eine Tauri-WebView ist keine vollständig native AppKit-/SwiftUI-Oberfläche. CSS-Material ist nicht identisch mit `NSVisualEffectView` oder aktuellen nativen Liquid-Glass-Komponenten. | Die App wird ehrlich als Hybrid gebaut: natives Fenster, Menü, Tray, Erscheinungsabgleich und SF-Symbol-Brücke; Navigation und Inhalte bleiben React in WKWebView/WebView2. Eine vollständige native Oberfläche würde eine separate AppKit-/SwiftUI-Migration erfordern. |
| P0 | Desktop- und Server-Sync hatten Vertragsdrift bei Pairing sowie Push-/Pull-Antworten; die Konfliktauflösung war nicht durchgängig belegt. | Adapterverträge und UI-Texte müssen den Serverendpunkten entsprechen. Bis ein realer Desktop↔Server-Roundtrip inklusive Konfliktfall automatisiert bestanden ist, bleibt der native Sync ausdrücklich experimentell. |
| P0 | Die lokale Rust-Migration enthielt nicht alle Tabellen, die Desktop-Repositories bereits abfragen. | Schema-Version 2 ergänzt Rechnungen und Compliance-Ergebnisse idempotent; Fresh-DB-, Upgrade- und Repository-Abfragen gehören zum Rust-Gate. |
| P0 | Eine neue App-Version darf nicht nur in einem Manifest stehen. | Root-, Workspace-, Tauri- und Rust-Version sowie Changelog und Release-Tag müssen vor Veröffentlichung übereinstimmen; Desktop-Release darf die Verifikationsgates nicht umgehen. |
| P1 | Die Webnavigation zeigt 17 Ziele dauerhaft; bei mittleren Windows-Breiten sinken Übersicht und Label-Lesbarkeit. | Primärnavigation nach Aufgabe gruppieren, seltene Systemziele in Einstellungen/Status verschieben und Navigation scrollbar halten. Aktiver Ort, Zurückweg und Timerzustand bleiben jederzeit sichtbar. |
| P1 | Desktop-Minimalbreite und CSS-Breakpoints waren nicht vollständig aufeinander abgestimmt. | Mindestgröße, kompakte Sidebar und Inhaltsraster als eine Matrix testen; kein Breakpoint darf durch die Fensterkonfiguration unerreichbar sein. |
| P1 | Native Timerbefehle können fachlich falsch wirken, wenn Menü/Tray unabhängig vom Timerstatus aktiv bleiben. | Aktivierung und Beschriftung aus einem gemeinsamen Timerzustand ableiten; Start, Pause, Fortsetzen und Stoppen sind gegenseitig konsistent. |
| P1 | Mehrere Screens besitzen keinen gleichwertigen Lade-, Leer-, Fehler-, Offline- oder Konfliktzustand. | Für jede datenabhängige Ansicht dieselbe Zustandsgrammatik und eine konkrete nächste Aktion bereitstellen. Keine rohe Exception als Endnutzeroberfläche. |
| P1 | Tastaturfokus, Routenwechsel und Textvergrößerung benötigen systematische Prüfung. | Fokus nach Navigation auf den Hauptinhalt setzen, sichtbare Fokusringe beibehalten, Dialoge einsperren und Fokus zurückgeben; Layout bei 200 % Textzoom testen. |
| P1 | SF Symbols sind systemabhängig; Rastermasken verlieren Teile der nativen Skalierung und Animation. | Native Symbole nur aus einer freigegebenen, öffentlich verfügbaren Liste laden; semantischer Lucide-/Asset-Fallback für alte macOS-Versionen, Windows und Web. |
| P2 | Desktop-Styles sind auf allgemeine und macOS-spezifische Dateien verteilt; Token können auseinanderlaufen. | Semantische Tokens als gemeinsame Quelle definieren, Plattformdateien nur für tatsächliche Abweichungen verwenden. |
| P2 | Zu viele schwebende Karten, Schatten oder Dauerschleifen verwässern die Apple-Hierarchie. | Material nur auf funktionalen Ebenen, Inhalte ruhiger und opaker; keine dekorative Bewegung ohne Zustandsinformation. |
| P2 | Icon-Export und Logo-Layer benötigen eine reproduzierbare Produktionskette. | Die vorbereiteten Vektor-Layer müssen nach Entsperren der Mac-Sitzung in Icon Composer als `.icon` erzeugt und anschließend als flache Exporte für ältere macOS-, Windows- und Webziele geprüft werden. Diese native Icon-Composer-Abnahme ist nicht erledigt. |

## 4. Zielbild und Informationsarchitektur

### 4.1 Produktcharakter

Das Zielgefühl ist **ruhig, vertrauenswürdig und direkt**. Die wichtigste
Aktion einer Ansicht ist sofort erkennbar, aber nicht dauerhaft überbetont.
Informationen erscheinen in der Reihenfolge „Status → Aufgabe → Detail“.
Animation bestätigt Ursache und räumliche Beziehung; sie ersetzt keine
Beschriftung.

### 4.2 Kanonische Informationsarchitektur

| Bereich | Primäre Ziele | Sekundäre Ziele / Einordnung |
|---|---|---|
| Erfassen | Übersicht, Timer, Heute | Woche und Monat als Zeitnavigation; Nachtragen als klarer alternativer Erfassungsweg |
| Organisieren | Kunden, Projekte, Aufgaben | Anhänge im Kontext der zugehörigen Entität statt als gleichwertiges tägliches Hauptziel, sofern Nutzungstests dies bestätigen |
| Auswerten | Reports, Rechnungen | Exporte und Compliance als spezialisierte Aufgaben innerhalb der Auswertung |
| System | Einstellungen | Einführung erneut öffnen, Sync-/Offline-Status, Backup und Geräteverwaltung als Systemfunktionen |

Desktop und Web dürfen unterschiedliche Routenzahlen behalten, verwenden aber
dieselben Begriffe und dieselbe fachliche Gruppierung. Die aktive
Timerinformation ist global sichtbar und führt direkt zum Timer. Sync ist ein
Status mit Handlung, kein rein dekorativer Navigationspunkt.

### 4.3 Fenster- und Navigationsmodell

- macOS: reguläres resizables Hauptfenster mit nativen Traffic Lights,
  Systemmenü und fensterbezogenen Befehlen. Die Sidebar ist ein stabiler
  Navigationsbereich; Inhalte scrollen unabhängig.
- Windows: reguläre Tauri/WebView2-Fensterkonventionen. Keine nachgezeichneten
  macOS-Traffic-Lights und keine Apple-exklusiven Tastaturglyphen.
- Web Desktop: feste, scrollbar bleibende Sidebar; bei mittlerer Breite
  kompakter Modus; mobil ein modaler Navigationsdrawer mit Fokusfalle und
  Rückgabe zum Auslöser.
- Mobil: eine primäre Aufgabe pro Ansicht; keine Desktop-Tabelle wird bloß
  horizontal verkleinert.

## 5. Designsystem

### 5.1 Semantische Tokens

Tokens benennen eine Rolle, nicht einen konkreten Farbwert. Helle und dunkle
Darstellung erhalten je eine explizite Palette; „Dark Mode“ ist keine
CSS-Invertierung.

| Kategorie | Kernrollen | Regel |
|---|---|---|
| Farbe | `canvas`, `surface`, `surface-raised`, `surface-sunken`, `material-control`, `text`, `text-muted`, `border`, `accent`, `success`, `warning`, `danger` | Kontrast und Bedeutung in beiden Modi separat prüfen; Status nie nur durch Farbe vermitteln |
| Material | `material-sidebar`, `material-toolbar`, `material-popover`, `scrim` | Nur Navigation, Werkzeug- und temporäre Ebenen dürfen deutlich transluzent sein; Inhaltskarten bleiben überwiegend opak |
| Typografie | system UI, semantische Größen, passende Zeilenhöhe und Tracking | macOS/Web auf `system-ui`/San-Francisco-Fallback; Windows auf Systemschrift. Große Überschriften enger, Fließtext neutral |
| Abstand | 4-Punkt-Grundraster mit 8/12/16/24/32-Schritten | Beziehungen über Nähe und Ausrichtung zeigen; Abstände in `rem` skalierbar halten |
| Radien | kleine Controls, Inhaltskarten, Materialflächen, große Dialoge | konzentrische Radien: innerer Radius folgt Außenradius minus Abstand |
| Schatten | `control`, `content`, `material`, `modal` | Tiefe nur dort, wo Ebenen tatsächlich überlagert sind; Dark Mode erhält geringere helle Kanten und kontrollierte Schatten |
| Dauer | `state`, `enter`, `layout` | Statusfeedback ca. 100 bis 180 ms; räumliche Layoutbewegung als kritisch gedämpfte Feder statt starre Show-Animation |

Auf macOS soll die Akzentfarbe nach Möglichkeit `AccentColor`/Systemakzent
folgen. Web und Windows verwenden einen stabilen Tarlog-Akzent mit genügend
Kontrast. Systemfarben werden nicht als fest eingebrannte RGB-Werte
missverstanden.

### 5.2 Komponenten

- **Sidebar:** semantische Gruppen, eindeutige Auswahl, optional kompakt,
  eigener Scrollbereich; keine Kartenwand innerhalb der Navigation.
- **Toolbar/Topbar:** nur ansichtsspezifische Hauptaktionen, Suche oder
  Navigation; Material darf Inhalt darunter räumlich trennen.
- **Buttons:** klare Hierarchie aus primär, sekundär, neutral, destruktiv und
  symbolisch. Pointer-Down/`:active` gibt sofortiges Feedback.
- **Formfelder:** sichtbares Label, Hilfe und Fehler direkt am Feld;
  Tastaturreihenfolge folgt der visuellen Reihenfolge.
- **Segmented Control:** nur für wenige gleichrangige, gegenseitig
  ausschließende Zustände; keine verkappte Hauptnavigation.
- **Tabellen/Listen:** kompakt auf Desktop, sortier- und tastaturbedienbar;
  mobile Darstellung als strukturierte Zeilen/Karten mit denselben Daten.
- **Dialog/Sheet/Popover:** entsteht räumlich aus dem Auslöser, hat eine
  eindeutige Hauptaktion, reagiert auf Escape und stellt Fokus wieder her.
- **Statusdarstellung:** laufend, pausiert, offline, ausstehend, Konflikt,
  Erfolg und Fehler verwenden jeweils Symbol, Text und Farbe.
- **Empty State:** beschreibt, warum die Ansicht leer ist, und bietet genau die
  passende nächste Aktion, etwa „Projekt erstellen“.

### 5.3 Material und Liquid Glass

Liquid Glass wird als **funktionale Steuerungsschicht** interpretiert:

1. Der Inhalts-Canvas bleibt ruhig und opak.
2. Sidebar und Toolbar können als schwere beziehungsweise leichte
   Materialstufe erscheinen.
3. Popover, Drawer und modale Oberflächen besitzen eine klarere Trennung und
   gegebenenfalls einen Scrim.
4. Materialflächen werden nicht ineinander gestapelt; Text liegt nicht auf
   unkontrolliert wechselndem Hintergrund.
5. Bei `prefers-reduced-transparency` oder fehlendem `backdrop-filter` wird das
   Material durch eine fast oder vollständig opake Systemfläche ersetzt.

Im aktuellen Tauri-Frontend ist diese Wirkung eine WebView-Approximation. Sie
darf in Dokumentation oder Marketing nicht als vollständig natives AppKit
Liquid Glass bezeichnet werden.

### 5.4 Motion

- Standardbewegungen sind kritisch gedämpft, ohne dekoratives Überschwingen;
  Zielwert: Dämpfung 1,0 und Reaktion ca. 0,3 bis 0,4 s.
- Leichtes Überschwingen ist nur nach einer tatsächlichen Impulsgeste zulässig.
- Bewegung startet am sichtbaren Istwert, bleibt unterbrechbar und führt beim
  Rückweg denselben räumlichen Pfad zurück.
- Navigation, Dialoge und Onboarding-Schritte erhalten unmittelbares
  Pressfeedback; Eingaben werden während einer Transition nicht blockiert.
- `prefers-reduced-motion` ersetzt räumliche Bewegung durch kurze Crossfades
  oder statische Zustandswechsel. Timer-Puls und sonstige Dauerschleifen werden
  deaktiviert.

### 5.5 Accessibility und Eingabe

- Vollständiger Tastaturpfad für Navigation, Timer, Formulare, Dialoge und
  Tabellen; macOS-Befehle stehen zusätzlich im Menü und zeigen korrekte
  Tastaturkurzbefehle.
- Sichtbarer Fokus mit ausreichendem Kontrast in Light und Dark Mode. Nach
  Routenwechsel fokussiert der Hauptinhalt; modale Oberflächen halten den
  Fokus und geben ihn zurück.
- Mindestens 44 × 44 CSS-Pixel bei grober Touch-Eingabe; kompaktere
  Desktop-Controls benötigen ausreichend Abstand und eine verlässliche
  Trefferfläche.
- Textzoom bis 200 %, lange deutsche Beschriftungen, VoiceOver-/Screenreader-
  Namen und Statusansagen gehören zur Abnahme.
- Reduzierte Bewegung, reduzierte Transparenz, erhöhter Kontrast und
  `forced-colors` erhalten eine funktional gleichwertige Darstellung.
- Destruktive Aktionen sind konkret benannt, nur bei irreversiblen Folgen
  bestätigt und nach Möglichkeit rückgängig zu machen.

## 6. Plattformstrategie

### 6.1 macOS: native Hülle, hybride Inhalte

**Nativ beziehungsweise öffentlich über AppKit/Tauri integrierbar:**

- `NSWindow`-Verhalten über die Tauri-Fensterkonfiguration, native Traffic
  Lights und Systemdarstellung;
- macOS-Menüleiste, Standardbefehle, Tastaturkürzel und Tray/Menu-Bar-Element;
- synchronisierte Light-/Dark-/System-Einstellung;
- freigegebene SF Symbols über eine kleine Rust/AppKit-Brücke mit semantischem
  Fallback;
- native Benachrichtigungen und Dateidialoge, wo die Anwendung sie benötigt.

**Hybrid in WKWebView:**

- Sidebar, Toolbardarstellung, Formulare, Tabellen, Dashboards, Onboarding und
  Fachdialoge sind React-Komponenten;
- Blur und Material entstehen dort durch CSS und WebKit, nicht durch eine
  automatisch native `NSVisualEffectView`-Hierarchie;
- AppKit-spezifische Erweiterungen dürfen nur öffentliche APIs nutzen und
  müssen auf dem Mindestziel sicher ausfallen.

Eine vollständig native macOS-App im engeren Sinn erfordert eine eigenständige
AppKit-/SwiftUI-Oberfläche. Diese Migration ist nicht Teil des Tauri-Redesigns
und darf nicht implizit als erledigt gelten.

### 6.2 Kompatibilitätsstufen

| Ziel | Erwartung | Fallback |
|---|---|---|
| macOS 27 | visuelles Referenzziel gemäß aktuellem Apple-UI-Kit; aktuelle Material-, Icon- und Sidebar-Sprache | keine Nutzung unveröffentlichter oder privater API; Verhalten bleibt wichtiger als Effekt |
| macOS 26.5.2 | lokale Build- und Laufzeitplattform | WebView-Material und Accessibility-Tree wurden auf Dashboard, Timer und Nachtrag stichprobenartig geprüft; Abweichung zu macOS 27 bleibt zu dokumentieren |
| macOS 10.15+ | technisches Mindestziel des Bundles | opake/klassisch transluzente Flächen, Symbol-Assets oder Lucide statt nicht verfügbarer SF Symbols, keine Annahme aktueller Liquid-Glass-Fähigkeiten |

Das Mindestziel ist erst dann als **unterstützt** zu bezeichnen, wenn ein
gebautes Paket dort startet und die Kernabläufe durchlaufen wurden. Eine
Konfigurationsangabe allein ist kein Kompatibilitätsnachweis.

### 6.3 Windows

Windows erhält dieselbe Tarlog-Informationshierarchie, dieselben semantischen
Tokens und dieselben Zustände, aber keine künstliche macOS-Fensterkopie.
WebView2 verwendet Windows-Systemschrift, Windows-gerechte Modifier-Texte und
Fensterkonventionen. Materialeffekte werden nur eingesetzt, wenn sie lesbar und
performant sind; sonst greifen opake Flächen. Lucide beziehungsweise eigene
Assets ersetzen SF Symbols. Tastatur, High Contrast/Forced Colors und
unterschiedliche Skalierungsfaktoren sind eigene Abnahmepunkte.

### 6.4 Web

Die Webanwendung überträgt Apples Prinzipien statt Apple-exklusive Komponenten:
ruhige Inhaltsflächen, funktionale Materialebenen, semantische Farben,
unterbrechbare Bewegung, klare Navigation und starke Tastaturbedienung. Sie
bleibt standardskonform und enthält keine macOS-Traffic-Lights oder
plattformfalsche Menümetaphern. Browser ohne Blur, mit reduzierter Transparenz
oder erzwungenen Farben erhalten einen vollständig opaken, funktionsgleichen
Fallback.

## 7. Onboarding

Das umgesetzte Onboarding ist ein versionierter Sechs-Schritt-Fluss:

1. **Willkommen**, Nutzen und Datenmodell erklären.
2. **Arbeitsbereich**, vorhandenes Projekt wählen oder Kunde und Projekt real
   anlegen; ohne unbestätigte Beispieldaten.
3. **Live-Timer**, Projekt wählen, aktive Arbeit starten, pausieren,
   fortsetzen und beenden verstehen.
4. **Nachtragen**, vergangene Arbeit mit Start, Ende, Pause und sichtbarer
   Herkunft erfassen.
5. **Sync**, lokaler Desktop-Modus, gemeinsame Browser-Wahrheit und Grenzen
   der experimentellen Desktop-Replikation klar unterscheiden.
6. **Fertig**, gewählten Arbeitsbereich bestätigen und direkt zu Timer oder
   Übersicht führen.

Für einen wirklich leeren Arbeitsbereich ist der Fluss verpflichtend. Ein
begonnener Stand wird nach Neustart fortgesetzt; erzeugte IDs verhindern
Dubletten bei Wiederholung. Bestehende Alt-Arbeitsbereiche werden nicht
rückwirkend blockiert. Ein abgeschlossenes Onboarding kann über die Einführung
erneut geöffnet werden, ohne seinen Pflichtstatus zurückzusetzen.

Im Web bleibt das technische Erstsetup des ersten Kontos bewusst vom
Produkt-Onboarding getrennt. Authentifizierung erklärt nicht die Bedienung; das
Onboarding erzeugt dagegen die fachliche Voraussetzung für Timer und Nachtrag.

## 8. Sync und Self-Hosting

### 8.1 Unterstütztes Modell

- **Desktop lokal:** vollständiger Offline-Betrieb mit SQLite; kein Server ist
  erforderlich.
- **Web selbst gehostet:** alle Browser derselben Tarlog-Instanz lesen und
  schreiben dieselbe PostgreSQL-Wahrheit. Das ist kein Geräte-Pairing zwischen
  Browsern.
- **Echtzeithinweis:** REST-Mutationen veröffentlichen Serverereignisse;
  Fachmutation, Audit und Sync-Ereignis werden gemeinsam transaktional
  gespeichert. `LISTEN/NOTIFY` weckt erst nach dem Commit; Delta und Long-Poll
  bleiben die kanonischen, nachholbaren Datenpfade.
  Long-Poll und der Custom-Node-WebSocket unter `/api/ws` aktualisieren andere
  Clients. Browser verwenden dafür ein kurzlebiges, einmal verwendbares
  Realtime-Ticket; native Geräte und Integrationen benötigen ein passend
  berechtigtes Device-/API-Token. Der Browser-Session-Cookie wird nicht als
  WebSocket-URL-Token verwendet.
- **Desktop↔Server:** Pairing, Outbox, Push/Pull, Cursor und Konfliktmodell sind
  architektonisch vorhanden. Die Strecke bleibt experimentell, bis ein
  reproduzierbarer End-to-End-Test lokale Änderungen, Neustart, Pull und
  Konfliktauflösung belegt.
- **Lokale Outbox:** Die SQLite-Outbox existiert, aber lokale Fachmutationen
  erzeugen noch nicht vollständig die zugehörigen Outbox-Ereignisse. Sie darf
  deshalb nicht als lückenlose Offline-Queue oder Backup beworben werden.
- **Sicherer Pull-Stand:** eingehende Desktop-Events werden zunächst dauerhaft
  mit `applied=0` vorgemerkt. Ohne erfolgreich abgewarteten Fach-Merge werden
  weder `applied=1` noch der Pull-Cursor fortgeschrieben. Weil der Fach-Merge
  aktuell noch nicht verdrahtet ist, endet ein Pull mit neuen Serverdaten
  ausdrücklich als wiederholbarer Fehler statt als vermeintlicher Erfolg.
- **Native Sicherheitsgrenzen:** Das Desktop-Geräte-Token liegt derzeit im
  WebView-`localStorage` statt im Betriebssystem-Keychain. Die Tauri-WebView
  hat noch keine aktivierte Content Security Policy (`csp: null`). Beides ist
  vor einer produktiven Freigabe der nativen Replikation zu beheben.

### 8.2 Self-Host-Betrieb

Der vorgesehene Serverbetrieb besteht aus dem Tarlog-Custom-Node-Server und
PostgreSQL. Er benötigt `DATABASE_URL`, einen langen zufälligen
`SESSION_SECRET`, eine korrekte öffentliche `NEXT_PUBLIC_APP_URL` und HTTPS vor
externem Zugriff. Der Reverse Proxy muss HTTP-Upgrade für `/api/ws` erlauben
und Long-Poll-Requests auf `/api/sync/poll` nicht vorzeitig beenden.

`TARLOG_TRUST_PROXY=0` ist der sichere Standard: Dann wird
`X-Forwarded-For` ignoriert und der direkte TCP-Peer als Client-IP für
Auth-/Pairing-Schutzlimits verwendet. Nur wenn ein lokaler, vertrauenswürdiger
Caddy oder Reverse-Proxy der einzige direkte Peer ist und eingehendes
`X-Forwarded-For` bereinigt beziehungsweise überschreibt, darf
`TARLOG_TRUST_PROXY=1` gesetzt werden. In allen anderen Topologien bleibt der
Wert `0`.

Backups müssen PostgreSQL-Dumps einschließen; ein JSON-Export ist kein
vollständiger Restore-Ersatz. Vor Updates werden Dump, Migration und
Healthcheck geprüft. Solange Pairing-Codes und Rate-Limits prozesslokal sind,
ist genau eine Webinstanz der sichere Standard. Skalierung auf mehrere
Instanzen benötigt einen gemeinsamen kurzlebigen Store.

### 8.3 Sync-UX-Vertrag

Jeder Client zeigt mindestens:

- Betriebsart: lokal oder Server;
- Verbindungsstatus und Zeitpunkt des letzten bestätigten Kontakts;
- Anzahl ausstehender lokaler Änderungen;
- Konflikte mit betroffener Entität und konkreter Auflösungsaktion;
- erklärbaren Fehler mit Wiederholen, ohne lokale Daten zu verwerfen.

„Synchronisiert“ darf nur nach bestätigtem Serverstand erscheinen. Offline ist
ein normaler Betriebszustand, kein pauschaler Fehler. Die Oberfläche darf
experimentellen Desktop-Sync nicht als produktionsreife Sicherung bewerben.

## 9. Test- und Viewport-Matrix

### 9.1 Automatisierte Gates

Frühere Baseline-Läufe sind kein Freigabenachweis für einen später veränderten
Commit. Für Release 0.0.5 müssen die folgenden Befehle auf dem exakten
Tag-Commit erfolgreich sein; die konkrete Ausgabe von CI beziehungsweise dem
Release-Handoff ist die maßgebliche Evidenz.

| Gate | Zweck | Release-0.0.5-Anforderung |
|---|---|---|
| `pnpm version:check v0.0.5` | Root-, Workspace-, Expo-, Tauri-, Cargo- und Lockfile-Versionen gegen den Release-Tag prüfen | muss vor Tag und Release bestehen |
| `pnpm -r typecheck` | Typverträge über Core, DB, Desktop, Web und Mobile | muss auf dem Tag-Commit bestehen |
| `pnpm -r test` | Fachlogik, UI-Helfer, Auth, Timer, Rechnung, PDF und Onboarding | muss auf dem Tag-Commit bestehen; keine dauerhaft hartkodierte Testzahl |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets` | Rust-Unit- und Integrationstests, lokaler Modus, Fresh DB, v1→v2 und idempotenter Wiederlauf | muss vollständig bestehen, nicht nur der einzelne `local_mode`-Test |
| `bash scripts/smoke.sh` | PostgreSQL-Migration, Auth, Kernmutationen, Sync-Konflikt und WebSocket-Widerruf | muss gegen eine Wegwerf-Datenbank bestehen; realer Reverse Proxy bleibt eigenes Gate |
| `pnpm -r build` und `pnpm --filter @tarlog/desktop exec tauri build --no-bundle` | Next-, Vite- und natives Tauri-Binary sowie gebündelte Version | müssen vor Tag/Release bestehen; ein Binary-Build ersetzt keine visuelle Plattformabnahme |
| `docker compose config --quiet` | aufgelöste Self-Host-Konfiguration einschließlich Loopback-Bindung und Proxy-Default | muss mit gesetztem `SESSION_SECRET` bestehen; realer Docker-Lauf bleibt eigener Nachweis |

### 9.2 Visuelle und interaktive Matrix

| Plattform / Viewport | Light | Dark | Kontrast/Reduktion | Stand |
|---|---:|---:|---:|---|
| Web 1440 × 1000 | ja | ja | Reduced Motion/Transparency separat | Setup, Onboarding und Dashboard im realen Browser geprüft |
| Web 1024 × 768 | erforderlich | erforderlich | Tastatur und 200 % Zoom | finale mittlere Navigation noch als Abnahmepunkt |
| Web 390 × 844 | ja | ja | grobe Eingabe, Drawer-Fokus | Onboarding und Workspace im realen Browser geprüft |
| macOS 26.5.2, 1100 × 720 und Mindestgröße | teilweise | teilweise | VoiceOver, Tastatur, Reduce Motion/Transparency/Contrast | Tauri-App visuell und im Accessibility-Tree auf Dashboard, Timer und Nachträgen geprüft; vollständige Matrix offen |
| macOS 27 | erforderlich | erforderlich | aktuelle Material-/Symbolwirkung | nicht lokal verfügbar; Referenz-, Geräte- oder VM-Test vor voller Aussage nötig |
| macOS 10.15 | erforderlich | erforderlich | Fallback ohne aktuelle Symbole/Materialien | noch nicht ausgeführt; Mindestziel deshalb bis dahin technisch, nicht verifiziert |
| Windows 11, 100/125/150 % | erforderlich | erforderlich | High Contrast, Tastatur, WebView2 | auf echtem Windows-Runner beziehungsweise Gerät offen |
| iOS/iPadOS Simulator und Gerät | erforderlich | erforderlich | VoiceOver, Dynamic Type, Reduce Motion/Transparency | Typecheck grün; Laufzeitabnahme durch dokumentierten pnpm-/Metro-Resolverfehler blockiert |

Für jeden Hauptscreen werden mindestens Normal-, Leer-, Lade-, Fehler-,
Offline- und, sofern relevant, Konfliktzustand geprüft. Screenshots allein
reichen nicht: Timer, Dialoge, Onboarding, Sidebar, Tastaturpfad, Fokus und
unterbrochene Animation müssen interaktiv getestet werden.

## 10. Offene Grenzen und Rest-Risiken

1. **Native Grenze:** Tauri bleibt eine hybride Architektur. Ohne
   AppKit-/SwiftUI-Neuentwicklung ist „vollständig nativ“ für Sidebar,
   Tabellen, Formulare und Liquid Glass nicht erreichbar.
2. **Desktop-Sync:** Ein produktionsreifer End-to-End-Nachweis einschließlich
   vollständiger lokaler Outbox-Befüllung, Fach-Merge, Konfliktauflösung,
   Keychain-Ablage, aktivierter CSP, Neustart und großem Backlog steht aus.
3. **Plattformabdeckung:** macOS 27, macOS 10.15 und Windows wurden in der
   lokalen macOS-26.5.2-Umgebung nicht real ausgeführt.
4. **Responsive Desktop-App:** Mindestfenstergröße, kompakte Sidebar und breite
   Fachansichten müssen gemeinsam auf erreichbare Breakpoints abgestimmt sein.
5. **Accessibility:** semantische Struktur und Media Queries sind vorhanden,
   ersetzen aber keine VoiceOver-, High-Contrast-, Textzoom- und
   Nur-Tastatur-Abnahme.
6. **Icon-Pipeline:** aktuelle geschichtete macOS-Icons und flache Legacy-
   Exporte müssen aus einer kontrollierten Masterquelle reproduzierbar gebaut
   und in Dock, Finder, Spotlight, Installer und Windows-Shell geprüft werden.
   Icon Composer und die vollständige native Icon-Abnahme wurden in diesem
   Lauf nicht durchgeführt.
7. **Web-Skalierung:** prozesslokale Pairing-Codes und Rate-Limits begrenzen den
   sicheren Standard auf eine Webinstanz, bis ein gemeinsamer Store existiert.
8. **Release-Ehrlichkeit:** Ein grüner Webtest belegt weder native
   macOS-Materialien noch Windows-Kompatibilität. Jede Freigabe nennt die real
   getesteten Betriebssysteme und die experimentellen Bereiche ausdrücklich.
9. **Mobile-Laufzeit:** Der Expo-Simulatorlauf bleibt bis zur Behebung der
   pnpm-/Metro-Modulauflösung blockiert; semantische iOS-Tokens und bestandene
   Typechecks sind kein Ersatz für die Geräte- und VoiceOver-Abnahme.

## 11. Definition of Done

Das Redesign gilt erst als vollständig abgenommen, wenn:

- Versionen, Changelog, Migrationen und Release-Tag konsistent sind;
- alle automatisierten Gates und Produktionsbuilds bestehen;
- jeder Hauptscreen in Light und Dark Mode sowie seinen relevanten
  Datenzuständen geprüft ist;
- macOS-Menü, Tray, Tastaturbefehle und Timerzustand dieselbe Fachlogik zeigen;
- Web bei Desktop-, Mittel- und Mobilbreite ohne abgeschnittene Primäraktionen
  funktioniert;
- reduzierte Bewegung, reduzierte Transparenz, erhöhter Kontrast,
  `forced-colors`, Textzoom und Screenreaderpfade verifiziert sind;
- Desktop-Sync entweder den vollständigen End-to-End-Nachweis besitzt oder in
  UI, README und Release Notes weiterhin unmissverständlich als experimentell
  gekennzeichnet ist;
- die reale Plattformgrenze „native Hülle, hybride Inhalte“ nirgends als
  vollständige AppKit-/SwiftUI-Implementierung dargestellt wird.
