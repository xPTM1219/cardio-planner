import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  Polyline,
  TileLayer,
  useMapEvents,
} from 'react-leaflet'
import './App.css'

type ActivityType =
  | 'Run'
  | 'Walk'
  | 'Bike'
  | 'Skateboard'
  | 'Scooter'
  | 'Boating'

type TrackingStatus = 'idle' | 'tracking' | 'paused'

type LatLngPoint = {
  lat: number
  lng: number
  ts: number
}

type Workout = {
  id: string
  activity: ActivityType
  startedAt: number
  endedAt: number
  durationSec: number
  distanceM: number
  points: LatLngPoint[]
}

const WORKOUTS_STORAGE_KEY = 'run-walk-tracker.workouts.v1'
const activityOptions: ActivityType[] = [
  'Run',
  'Walk',
  'Bike',
  'Skateboard',
  'Scooter',
  'Boating',
]

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusM = 6371e3
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return earthRadiusM * c
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${meters.toFixed(0)} m`
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`
  }
  return `${mins}m ${secs}s`
}

function loadWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(WORKOUTS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as Workout[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
  } catch {
    return []
  }
}

function saveWorkouts(workouts: Workout[]): void {
  localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts))
}

function RoutePlannerClicks({
  enabled,
  onMapClick,
}: {
  enabled: boolean
  onMapClick: (point: LatLngPoint) => void
}): null {
  useMapEvents({
    click(event) {
      if (!enabled) {
        return
      }
      onMapClick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        ts: Date.now(),
      })
    },
  })
  return null
}

function App() {
  const [tab, setTab] = useState<'track' | 'plan' | 'history'>('track')
  const [activity, setActivity] = useState<ActivityType>('Run')
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [distanceM, setDistanceM] = useState(0)
  const [trackPoints, setTrackPoints] = useState<LatLngPoint[]>([])
  const [planPoints, setPlanPoints] = useState<LatLngPoint[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>(() => loadWorkouts())
  const [error, setError] = useState<string | null>(null)

  const mapCenter = useMemo<[number, number]>(() => {
    const mostRecentTrackPoint = trackPoints.at(-1)
    if (mostRecentTrackPoint) {
      return [mostRecentTrackPoint.lat, mostRecentTrackPoint.lng]
    }
    return [40.7128, -74.006]
  }, [trackPoints])

  const watchIdRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status !== 'tracking') {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSec((value) => value + 1)
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [status])

  useEffect(() => {
    saveWorkouts(workouts)
  }, [workouts])

  function stopWatchingPosition(): void {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  function appendTrackPoint(next: LatLngPoint): void {
    setTrackPoints((existing) => {
      const previous = existing.at(-1)
      if (previous) {
        setDistanceM((current) => current + distanceMeters(previous, next))
      }
      return [...existing, next]
    })
  }

  function startWatch(): void {
    const geolocation = navigator.geolocation
    watchIdRef.current = geolocation.watchPosition(
      (position) => {
        appendTrackPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          ts: Date.now(),
        })
      },
      (geoError) => {
        setError(geoError.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      },
    )
  }

  function startWorkout(): void {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      return
    }

    stopWatchingPosition()
    setError(null)
    setTrackPoints([])
    setDistanceM(0)
    setElapsedSec(0)
    startedAtRef.current = Date.now()

    navigator.geolocation.getCurrentPosition(
      (position) => {
        appendTrackPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          ts: Date.now(),
        })
        startWatch()
        setStatus('tracking')
      },
      (geoError) => {
        setError(geoError.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      },
    )
  }

  function pauseWorkout(): void {
    stopWatchingPosition()
    setStatus('paused')
  }

  function resumeWorkout(): void {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      return
    }
    setError(null)
    startWatch()
    setStatus('tracking')
  }

  function stopWorkout(): void {
    stopWatchingPosition()
    const startTs = startedAtRef.current
    const endTs = Date.now()

    if (startTs && trackPoints.length > 1) {
      const workout: Workout = {
        id: crypto.randomUUID(),
        activity,
        startedAt: startTs,
        endedAt: endTs,
        durationSec: elapsedSec,
        distanceM,
        points: trackPoints,
      }
      setWorkouts((existing) => [workout, ...existing])
    }

    setStatus('idle')
    startedAtRef.current = null
  }

  const planDistance = useMemo(() => {
    if (planPoints.length < 2) {
      return 0
    }

    let total = 0
    for (let i = 1; i < planPoints.length; i += 1) {
      total += distanceMeters(planPoints[i - 1], planPoints[i])
    }
    return total
  }, [planPoints])

  const canStart = status === 'idle'
  const canPause = status === 'tracking'
  const canResume = status === 'paused'
  const canStop = status === 'tracking' || status === 'paused'

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>Run/Walk/Bike Tracker</h1>
        <p>Offline-first workout tracking and route planning</p>
      </header>

      <nav className="tabs" aria-label="Primary tabs">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
          Track
        </button>
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
          Plan
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </nav>

      <section className="map-panel">
        <MapContainer center={mapCenter} zoom={15} className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RoutePlannerClicks
            enabled={tab === 'plan'}
            onMapClick={(point) => setPlanPoints((existing) => [...existing, point])}
          />
          {trackPoints.length > 1 && (
            <Polyline
              positions={trackPoints.map((point) => [point.lat, point.lng])}
              color="#16a34a"
            />
          )}
          {planPoints.length > 1 && (
            <Polyline
              positions={planPoints.map((point) => [point.lat, point.lng])}
              color="#2563eb"
            />
          )}
        </MapContainer>
      </section>

      {tab === 'track' && (
        <section className="panel">
          <div className="row">
            <label htmlFor="activity-type">Activity</label>
            <select
              id="activity-type"
              value={activity}
              onChange={(event) => setActivity(event.target.value as ActivityType)}
              disabled={status !== 'idle'}
            >
              {activityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="stats-grid">
            <article>
              <h3>Status</h3>
              <strong>{status.toUpperCase()}</strong>
            </article>
            <article>
              <h3>Duration</h3>
              <strong>{formatDuration(elapsedSec)}</strong>
            </article>
            <article>
              <h3>Distance</h3>
              <strong>{formatDistance(distanceM)}</strong>
            </article>
          </div>

          <div className="actions">
            <button onClick={startWorkout} disabled={!canStart}>
              Start
            </button>
            <button onClick={pauseWorkout} disabled={!canPause}>
              Pause
            </button>
            <button onClick={resumeWorkout} disabled={!canResume}>
              Resume
            </button>
            <button onClick={stopWorkout} disabled={!canStop}>
              Stop & Save
            </button>
          </div>
          {error && <p className="error">GPS error: {error}</p>}
        </section>
      )}

      {tab === 'plan' && (
        <section className="panel">
          <h2>Route Planner</h2>
          <p>Tap the map to add waypoints. Distance is estimated by straight-line segments.</p>
          <div className="stats-grid">
            <article>
              <h3>Waypoints</h3>
              <strong>{planPoints.length}</strong>
            </article>
            <article>
              <h3>Estimated Distance</h3>
              <strong>{formatDistance(planDistance)}</strong>
            </article>
          </div>
          <div className="actions">
            <button
              onClick={() => setPlanPoints((existing) => existing.slice(0, Math.max(existing.length - 1, 0)))}
              disabled={planPoints.length === 0}
            >
              Undo Last Point
            </button>
            <button onClick={() => setPlanPoints([])} disabled={planPoints.length === 0}>
              Clear Route
            </button>
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="panel">
          <h2>Workout History</h2>
          {workouts.length === 0 ? (
            <p>No saved workouts yet.</p>
          ) : (
            <ul className="history-list">
              {workouts.map((workout) => (
                <li key={workout.id}>
                  <div>
                    <h3>{workout.activity}</h3>
                    <p>{new Date(workout.startedAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <strong>{formatDistance(workout.distanceM)}</strong>
                    <p>{formatDuration(workout.durationSec)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export default App
