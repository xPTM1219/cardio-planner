# cardio-planner
This app helps you plan a route to run, jog or walk ahead of time. All in your browser.

## Usage

### Install dependencies

```bash
npm install
```

### Building the app

```bash
npm run build
```

### Running the app

```bash
npm run dev
```

### Checking the code

```bash
npm run lint
```

```bash
npm test
```

Use `npm run test:watch` to run the tests again on each change.

## Editing a route on the map

* Click the map to add a point at the end of the route.
* Click the line between two points to add a point between them.
* Drag a point to move it. Click a point to open its popup, which can delete it.
* Ctrl+click a point, or Ctrl+drag a box on the map, to select several points
  (use ⌘ instead of Ctrl on a Mac). Drag a selected point to move all of them.
  Press Delete (or Backspace) to delete them, or Esc to clear the selection.

## Moving your routes to another device

Your routes stay in the browser. To use them on another device:

1. Open **Saved Routes** and click **Export**. The browser saves a file named
   `cardio-planner-routes-<date>.json`.
2. Move the file to the other device.
3. On the other device, open **Saved Routes**, click **Import…**, and pick the
   file. Routes that are already saved there are skipped.

## Resources

* See the published app, [Cardio Planner](https://xptm1219.github.io/cardio-planner/)
