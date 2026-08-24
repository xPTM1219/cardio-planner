# TODO

## List

* ~~Add TypeDoc documentation throughout the code where is not present~~ (DONE: all modules, public methods, and interfaces documented with TSDoc)
* ~~Load saved settings and routes. The app saves the routes but there is no way to retrive it in a later use, same for settings.~~ (DONE: settings load with per-field validation/migration; saved-routes dropdown can load or delete entries)
  * ~~For the settings, if they exist it should be loaded~~ (DONE: loaded on boot, normalized field-by-field, corrupt JSON falls back to defaults)
  * ~~For the routes, non should be loaded, but a dropdown list with available routes should be available to the user~~ (DONE: "Saved Routes" dropdown with name/distance/date, plus Load Route / Delete Route buttons)
  * ~~Fix home location setting, you can set it but if the page is reloaded it doesn't set it.~~ (DONE: home location is deep-validated on load and passed to map init before rendering)
* ~~Add different speeds (running, walking, jogging, bicycle)~~ (DONE: Activity Type setting with walking/jogging/running/bicycling average speeds of 5/8/12/20 km/h)
  * ~~Currently the app calculates the time at 3 miles per hour (MPH) if I remember correctly. The idea is to allow the user to enter the desired speed, if the user doesn't set anything then the speeds should the average that (running, walking, jogging, bicycle) covers.~~ (DONE: optional Custom Speed input; imperial users enter mph; blank uses the activity default)
* ~~Add the ability to let the user add their pace so that the calculation
  is more accurate. If it doesn't add it, don't count it.~~ (DONE: optional Custom Pace input (min/km or min/mi) which overrides speed and activity when set)
* ~~Change default home location to North America, zoomed out.~~ (DONE: default is lat 45, lng -100, zoom 3; existing stored homes are respected)
* ~~Add the ability to have the user enter an address to go straight to it.~~ (DONE: address search via Nominatim flies the map to the first result; fired only on button press/Enter)
* ~~Add Spanish and Chinese language.~~ (DONE: full UI in English, Spanish, Simplified Chinese, and Traditional Chinese with browser-locale detection)
* ~~Add testing~~ (DONE: Vitest + jsdom unit tests for storage, route planning, speeds/units, geocoding, and i18n)
* ~~Add linting~~ (DONE: ESLint flat config with typescript-eslint type-checked rules; `npm run lint`)
* After setting the address, the dots are not placeable again
* The addres textbox is too small and you cannot see what is being written
* Verify dots because sometimes when dragging some dots it creates another dot and I have to delete it afterwards
* 
