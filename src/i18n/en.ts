/**
 * English source dictionary. Every other language must define exactly
 * these keys (enforced by `Record<TranslationKey, string>` and a test).
 */
export const en = {
  // App chrome
  appLoading: 'Loading Walk Planner...',
  routePlannerTitle: 'Route Planner',
  routeInformationTitle: 'Route Information',
  statusInitial: 'Click on the map to add waypoints...',

  // Address search
  addressSearchLabel: 'Address Search',
  addressSearchPlaceholder: 'Enter address...',
  addressSearchButton: 'Go',
  statusSearchEmptyQuery: 'Enter an address to search.',
  statusSearching: 'Searching for "{query}"...',
  statusNoResults: 'No results found for "{query}".',
  statusFound: 'Found: {name}',
  statusSearchError: 'Error: address search failed. Check your connection and try again.',

  // Waypoint form
  startPointLabel: 'Start Point (Click on map)',
  endPointLabel: 'End Point (Click on map)',
  waypointAutoPlaceholder: 'Will be auto-filled',

  calculateRouteButton: 'Calculate Route',
  clearAllButton: 'Clear All',

  routeNameLabel: 'Route Name',
  routeNamePlaceholder: 'Enter route name...',
  saveRouteButton: 'Save Route',

  savedRoutesLabel: 'Saved Routes',
  noSavedRoutesOption: 'No saved routes',
  loadRouteButton: 'Load Route',
  deleteRouteButton: 'Delete Route',

  // Status messages
  statusCleared: 'Map cleared. Click on the map to add waypoints...',
  statusWaypointsCount:
    '{n} waypoint(s). Drag markers to move, use marker popup to delete. Click "Calculate Route" to update.',
  statusAddedWaypoints:
    'Added {n} waypoint(s). Drag markers to move, use popup on marker to delete. Click "Calculate Route" to update.',
  statusNeedTwoWaypoints: 'Need at least 2 waypoints to calculate a route.',
  statusNoRouteInfo: 'No route information available.',
  statusCalculateError: 'Error: Could not calculate route. Please try again.',
  statusRouteSaved: 'Route "{name}" saved successfully!',
  statusSaveRouteError: 'Error: Could not save route.',
  statusRouteDeleted: 'Route deleted.',
  statusDeleteRouteError: 'Error: Could not delete route.',
  statusRouteLoaded: 'Loaded "{name}".',
  statusLoadRouteMissing: 'Error: selected route could not be found.',
  statusLoadRouteError: 'Error: Could not load route.',

  // Settings panel
  settingsTitle: 'Settings',
  unitsLabel: 'Units',
  unitsMetric: 'Metric (km)',
  unitsImperial: 'Imperial (mi)',
  languageLabel: 'Language',
  activityTypeLabel: 'Activity Type',
  activityWalking: 'Walking',
  activityJogging: 'Jogging',
  activityRunning: 'Running',
  activityBicycling: 'Bicycling',
  customSpeedLabel: 'Custom Speed (optional — leave blank)',
  customSpeedPlaceholder: 'km/h or mph',
  customPaceLabel: 'Custom Pace (optional — leave blank)',
  customPacePlaceholder: 'min per km or min per mi',
  darkModeLabel: 'Dark Mode',
  homeLatLabel: 'Home Location Latitude',
  homeLngLabel: 'Home Location Longitude',
  homeZoomLabel: 'Home Zoom',
  useCurrentViewButton: 'Use Current Map View',
  saveSettingsButton: 'Save Settings',

  statusCapturedView: 'Captured current map view. Click "Save Settings" to persist.',
  errorLatitudeRange: 'Latitude must be a number between -90 and 90.',
  errorLongitudeRange: 'Longitude must be a number between -180 and 180.',
  errorZoomRange: 'Zoom must be a number between 1 and 19.',
  errorCustomSpeed: 'Custom speed must be a positive number.',
  errorCustomPace: 'Custom pace must be a positive number.',
  statusSettingsSaved: 'Settings saved successfully!',
  statusSettingsSaveError: 'Error: Could not save settings.',

  // Route info
  distanceLabel: 'Distance:',
  durationLabel: 'Duration:',

  // Speed basis descriptions
  basisYourPace: 'at your pace {pace} {unit}',
  basisYourSpeed: 'at your speed {speed}',
  basisActivityPace: 'at {speed} {activity} pace',
  basisDefaultSpeed: 'at default {speed}',

  // Map popups
  popupWaypoint: 'Waypoint',
  popupStartPoint: 'Start Point',
  popupEndPoint: 'End Point',
  popupWaypointN: 'Waypoint {n}',
  popupDeletePoint: 'Delete this point',
};
