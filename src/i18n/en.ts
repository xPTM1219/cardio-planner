/**
 * English source dictionary. Every other language must define exactly
 * these keys (enforced by `Record<TranslationKey, string>` and a test).
 */
export const en = {
  // App chrome
  appLoading: 'Loading Cardio Planner...',
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
  defaultRouteName: 'Route {date}',
  plannedRouteName: 'Planned route ({n} points)',

  // Saved routes modal
  savedRoutesButton: 'Saved Routes ({n})',
  savedRoutesModalTitle: 'Saved Routes',
  savedRoutesEmpty: 'No saved routes yet. Calculate a route and click "Save Route".',
  colName: 'Name',
  colDistance: 'Distance ({unit})',
  colTime: 'Est. time',
  colPoints: 'Points',
  colSavedOn: 'Saved on',
  colActions: 'Actions',
  loadRouteButton: 'Load',
  deleteRouteButton: 'Delete',
  confirmDeleteRoute: 'Delete the route "{name}"? You cannot undo this.',

  // Status messages
  statusCleared: 'Map cleared. Click on the map to add waypoints...',
  statusWaypointsCount:
    '{n} waypoint(s). Drag markers to move, use marker popup to delete. Click "Calculate Route" to update.',
  statusMaxWaypoints: 'You can add a maximum of {max} points.',
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

  // Activity panel
  activityPanelTitle: 'Activity',
  activityTypeLabel: 'Activity Type',
  activityWalking: 'Walking',
  activityJogging: 'Jogging',
  activityRunning: 'Running',
  activityBicycling: 'Bicycling',
  customSpeedLabel: 'Custom Speed ({unit})',
  customPaceLabel: 'Custom Pace ({unit})',
  customValuePlaceholder: 'Optional — leave blank',
  errorCustomSpeed: 'Custom speed must be a positive number.',
  errorCustomPace: 'Custom pace must be a positive number.',
  settingsButton: 'Settings',

  // Settings modal
  settingsTitle: 'Settings',
  languageLabel: 'Language',
  unitsLabel: 'Units',
  unitsMetric: 'Metric (km)',
  unitsImperial: 'Imperial (mi)',
  themeLabel: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  homeLocationTitle: 'Home Location',
  homeLocationHint: 'The map opens at this place.',
  homeLatLabel: 'Latitude',
  homeLngLabel: 'Longitude',
  homeZoomLabel: 'Zoom (1–19)',
  useCurrentViewButton: 'Use Current Map View',
  homeViewCaptured: 'Current map view copied. Click "Save" to keep it.',
  errorLatitudeRange: 'Latitude must be a number between -90 and 90.',
  errorLongitudeRange: 'Longitude must be a number between -180 and 180.',
  errorZoomRange: 'Zoom must be a whole number between 1 and 19.',
  statusSettingsSaved: 'Settings saved successfully!',
  statusSettingsSaveError: 'Error: Could not save settings.',

  // Shared buttons
  cancelButton: 'Cancel',
  saveButton: 'Save',
  closeButton: 'Close',

  // Route info
  distanceLabel: 'Distance:',
  durationLabel: 'Duration:',
  durationMinutes: '{m} min',
  durationHoursMinutes: '{h} h {m} min',

  // Speed basis descriptions
  basisYourPace: 'at your pace {pace} {unit}',
  basisYourSpeed: 'at your speed {speed}',
  basisActivityPace: 'at {speed} {activity} pace',
  basisDefaultSpeed: 'at default {speed}',
  activityBasisWalking: 'walk',
  activityBasisJogging: 'jog',
  activityBasisRunning: 'run',
  activityBasisBicycling: 'bike',

  // Map popups
  popupWaypoint: 'Waypoint',
  popupStartPoint: 'Start Point',
  popupEndPoint: 'End Point',
  popupWaypointN: 'Waypoint {n}',
  popupDeletePoint: 'Delete this point',
  popupLat: 'Lat:',
  popupLng: 'Lng:',
};
