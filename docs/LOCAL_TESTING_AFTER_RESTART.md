# Local Testing After Restart

Node.js LTS was installed with [`winget install OpenJS.NodeJS.LTS`](docs/LOCAL_TESTING_AFTER_RESTART.md:3).

## 1) Restart VS Code

Close and reopen VS Code so the new Node/npm PATH is picked up by the integrated terminal.

## 2) Verify tools in a new terminal

Run:

```cmd
node -v
npm -v
```

If both commands print versions, continue.

## 3) Install dependencies

From the project root:

```cmd
npm ci
```

## 4) Start local dev server

```cmd
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## 5) Test the new features

1. Click on the map to add waypoints, then click **Calculate Route**.
2. Drag waypoint markers and confirm the planned route redraws.
3. Click **Start Route** and move around; confirm the green actual path appears.
4. Click **Stop Route**; confirm the recorded route is saved.
5. Select a saved route in the dropdown and click **Load as Planned Route**.
6. Confirm **Planned vs Actual** stats appear when both routes are present.

## 6) Pre-PR build check

```cmd
npm run build
```

If the build passes, you are ready to open a pull request.
