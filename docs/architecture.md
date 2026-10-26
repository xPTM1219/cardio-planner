# Cardio Planner App - Architecture

## Project Overview
A TypeScript web app for planning walking, jogging, running, and cycling routes on an OpenStreetMap map. All data stays in the browser (localStorage); no account or server is needed.

## Technology Stack
- **Frontend**: TypeScript, HTML5, CSS3 (no UI framework)
- **Mapping**: Leaflet.js with OpenStreetMap tiles
- **Tables**: Tabulator (saved-routes table, modular import)
- **Address search**: Nominatim (OpenStreetMap geocoding, no API key)
- **Storage**: localStorage
- **Routing**: local straight-line (Haversine) distances between waypoints
- **Route transfer**: JSON export/import files (no server)
- **Build/test**: Vite, Vitest + jsdom, ESLint (typescript-eslint)

## Project Structure

```
cardio-planner/
├── index.html                 # Page shell: header (title + version), sidebars, map, #modals
├── src/
│   ├── main.ts                # Wiring: panels, events, settings, routes, export/import
│   ├── components/
│   │   ├── MapComponent.ts    # Leaflet map, click-to-add, line insert, markers, selection, route line
│   │   ├── BoxSelect.ts       # Ctrl/Cmd+drag selection box on the map
│   │   ├── RoutePlanner.ts    # Waypoints, distance/duration, route info text
│   │   ├── StorageManager.ts  # Settings + routes in localStorage, validation, import merge
│   │   └── GeocodingService.ts# Nominatim address search
│   ├── ui/
│   │   ├── modal.ts           # Native <dialog> modal helper
│   │   ├── settingsModal.ts   # Language, units, theme, home location
│   │   ├── savedRoutesModal.ts# Tabulator table: load / delete, import / export
│   │   └── download.ts        # Save a text file from the browser
│   ├── utils/
│   │   ├── speeds.ts          # Activity speeds, unit conversions, speed basis text
│   │   ├── format.ts          # escapeHtml, formatDuration, date formatting
│   │   ├── geo.ts             # Haversine distance of a point pair and of a path
│   │   ├── waypoints.ts       # Waypoint limit, click rules, nearest segment, box, longitude wrap
│   │   ├── savedRoutes.ts     # Stored routes -> table rows, route validation
│   │   ├── routeTransfer.ts   # Export file: build, parse, check, merge
│   │   └── version.ts         # App version from package.json
│   ├── i18n/                  # en, es, zh-CN, zh-TW dictionaries + t()
│   ├── types/index.ts         # Shared types (UserSettings, Route, ...)
│   └── styles/global.css      # Theme tokens (light/dark), layout, modals
└── docs/
```

Unit tests (`*.test.ts`) sit next to the code they test.

## Components

### MapComponent
- Creates the Leaflet map at the stored home location (`worldCopyJump` on).
- Owns click-to-add: one map click handler, attached once in `init()`.
- `decideMapClick()` sets the click rules: ignore the click after a marker drag or a selection box, ignore Ctrl/Cmd clicks, clear the selection when points are selected, and stop at the waypoint limit.
- Draggable markers (green start, blue middle, red end; CSS classes `waypoint-dot--*`). One shared popup opens on click or Enter, with a delete link. Markers do not use `bindPopup`, so a Ctrl/Cmd+click can select instead.
- **Line insert**: a wide, invisible line (pane `waypointLinePane`, z-index 450) on the waypoint line gets the clicks. A click adds a point on the nearest segment, snapped onto the line (`nearestSegment()`).
- **Selection**: Ctrl/Cmd+click toggles a point; Ctrl/Cmd+drag draws a box (`BoxSelect`) that adds the points in it. A drag of a selected point moves all selected points by the same pixel offset. Delete/Backspace deletes the selection, Esc clears it, and a map control (top right) shows the count with Delete and Clear buttons.
- Reports every waypoint change through one change handler (the single source of truth). The handler always gets longitudes from -180 to 180 (`wrapLatLng()`); markers on a repeated world copy stay where the user put them, and routes that cross 180° are drawn in one piece (`unwrapPath()`).
- Draws the calculated route (GeoJSON `[lon, lat]` converted to Leaflet `[lat, lng]`). The route line gets no clicks; its popup opens one time when the route is drawn.

### RoutePlanner
- Keeps the waypoint list and the current calculated route.
- Any waypoint change clears the current route, so a stale route is never saved.
- Distance = sum of Haversine segments; duration = distance / effective speed.

### StorageManager
- Loads settings with per-field validation and migration (corrupt data falls back to defaults).
- `updateSettings()` merges, normalizes, and saves partial changes.
- Saves, loads, and deletes routes; corrupt route lists load as empty.
- `importRoutes()` adds imported routes with one write. A route whose id is already saved is skipped.

### GeocodingService
- Nominatim search on explicit user action only (button or Enter), with `accept-language` set to the UI language.

### UI modals
- **Settings modal**: language, units, theme (light/dark), home location. Changes apply on Save; Cancel/Esc discard.
- **Saved Routes modal**: sortable Tabulator table (name, distance, estimated time at the current speed, points, date) with Load and Delete (with confirmation). The footer has **Import…** and **Export**; the result message shows in the modal.

### Version label
- `src/utils/version.ts` imports `version` from `package.json` (Vite keeps only that field in the bundle). The header shows `v{version}` at the top right, with a translated tooltip.

## Data Flow

```mermaid
graph TD
    A[Map click / drag / delete] --> B[MapComponent]
    B -->|waypoint change handler| C[main.ts]
    C -->|setWaypoints| D[RoutePlanner]
    E[Calculate / Save / Load] --> D
    D -->|Route| B
    F[Activity panel] -->|updateSettings| G[StorageManager]
    H[Settings modal] -->|updateSettings| G
    G --> I[(localStorage)]
    J[Saved Routes modal] -->|load / delete / import| G
    J -->|export| M[(JSON file)]
    M -->|import| J
    K[Address search] --> L[GeocodingService] -->|flyTo| B
```

## Storage Schema

Settings key: `walk_planner_settings`

```typescript
interface UserSettings {
  name: string;
  units: 'metric' | 'imperial';
  language: 'en' | 'es' | 'zh-CN' | 'zh-TW';
  activityType: 'walking' | 'jogging' | 'running' | 'bicycling';
  customSpeed?: number;   // km/h
  customPace?: number;    // min/km, overrides customSpeed and activityType
  homeLocation: { lat: number; lng: number; zoom: number };
  darkMode: boolean;
}
```

Routes key: `walk_planner_routes` (array)

```typescript
interface Route {
  id: string;
  name: string;
  waypoints: { location: [number, number]; name?: string }[]; // [lat, lon]
  distance: number;   // meters
  duration: number;   // seconds, at the speed used when saved
  geometry: { type: 'LineString'; coordinates: [number, number][] }; // [lon, lat]
  createdAt: string;  // ISO-8601
}
```

## Export File Format

Export and import use one JSON file, for example `cardio-planner-routes-2026-10-25.json`:

```typescript
interface RoutesExport {
  format: 'cardio-planner-routes';
  formatVersion: 1;      // a file with a higher version is refused
  appVersion: string;    // version of the app that made the file
  exportedAt: string;    // ISO-8601
  routes: Route[];       // same shape as in storage
}
```

- A plain array of routes (a copy of the `walk_planner_routes` value) is accepted too.
- Each imported route is built again from its waypoints: the geometry and the distance are calculated again, and other fields are removed. Routes with fewer than 2 or more than 500 valid waypoints are skipped and counted.
- Import merges by `id`: a saved route never changes after it is saved, so a route with an id that is already saved is skipped.
- Files larger than 5 MB are refused before they are read.

## Speed Resolution
Custom pace > custom speed > activity default (walking 5, jogging 8, running 12, bicycling 20 km/h) > fallback 5 km/h. Values are stored in canonical units and converted for display.
