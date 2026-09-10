# Architecture

heli-tracker is a three-tier control stack for a fleet of single-axis solar tracker rows,
scaled down to one desk. Each tier mirrors a layer in a production tracker system:

| Tier | Production role | Here |
|---|---|---|
| Row controller | Per-row embedded controller driving the actuator, reading local sensors | Arduino Uno + 28BYJ-48 stepper, `tracker/tracker.ino` |
| Network controller | Field gateway aggregating many rows into one uplink, enforcing safety | .NET 8 service, `gateway/` |
| Operator dashboard | Cloud-hosted fleet view and control | React + TypeScript SPA, `dashboard/` |

```
            serial, 115200 8N1               HTTP + WebSocket
 ┌──────────────┐   A <deg> / Z / S   ┌────────────────────┐   POST /api/rows/{id}/…   ┌───────────────┐
 │ row controller│ ◀────────────────── │      gateway       │ ◀──────────────────────── │   dashboard   │
 │  tracker.ino  │ ──────────────────▶ │                    │ ────────────────────────▶ │               │
 └──────────────┘  T <angle> <volts>  │  RowRegistry       │  SignalR /hub/telemetry   └───────────────┘
                     every 200 ms     │   ├ SerialDeviceLink   {rowId, angle, volts, ts}
                                      │   └ SimulatedDeviceLink (rows 2..n, or all with --sim)
                                      └────────────────────┘
```

Control flows down: dashboard → gateway → row. Telemetry flows up: row → gateway → dashboard.
The gateway is the only component that talks to hardware and the only place safety limits live.

## Row controller (`tracker/tracker.ino`)

A deliberately small firmware with no state beyond a step counter.

- **Protocol**: newline-terminated ASCII. `A <deg>` sets an absolute target angle,
  `Z` declares the current position to be 0°, `S` stops by setting the target to the
  current position. Telemetry is one line every 200 ms: `T <angleDeg> <panelVolts>`.
- **Motion**: the main loop steps toward the target in chunks of at most 8 steps so the
  serial port stays responsive mid-move. The 28BYJ-48 has 2048 full steps per revolution,
  so resolution is about 0.18°. Coils are switched off when the target is reached so the
  motor does not heat up while parked.
- **Sensing**: A0 reads the panel voltage under a 100 Ω load, scaled to volts. If nothing
  is wired to A0 the pin floats and reports noise; tie it to GND for a clean 0.
- **Reset behaviour**: opening the USB serial port resets the Uno. It prints `READY` after
  boot and the step counter restarts at 0. The gateway logs that event; it does not try to
  hide it.

The firmware knows nothing about limits, fleets, or the dashboard. Limits are enforced one
layer up.

## Gateway (`gateway/`)

ASP.NET Core minimal API on .NET 8, one process, no database.

### `IDeviceLink`: the seam

```csharp
public interface IDeviceLink : IDisposable
{
    bool IsSimulated { get; }
    bool Online { get; }
    event Action<DeviceSample>? SampleReceived;
    Task StartAsync(CancellationToken ct);
    Task MoveToAsync(double deg);
    Task ZeroAsync();
    Task StopAsync();
}
```

Everything above this interface is hardware-agnostic. Two implementations:

- **`SerialDeviceLink`** owns one serial port. A background loop reads raw bytes from the
  port's base stream and splits lines itself, rather than using `SerialPort.ReadLine`,
  because on macOS `ReadLine` was observed replaying buffered data after a read timeout.
  Any I/O error closes the port and retries every 2 s. `Online` is true only if the port
  is open and a sample arrived in the last 2 s, so a silent board shows as offline.
- **`SimulatedDeviceLink`** ticks every 200 ms, slews toward its target at 60°/s, and
  reports `2.2 · max(0, cos(angle − sunAngle))` volts plus a little noise. Each simulated
  row gets its own sun angle so a sweep finds different peaks on different rows.

The gateway falls back to simulation for row 1 if the configured serial port does not
exist, or when started with `--sim`. The rest of the stack cannot tell the difference,
which is what lets the dashboard, the hub, and the find-sun logic be exercised in CI or on
a laptop with nothing plugged in.

### `RowRegistry`: the network controller

A singleton hosted service that owns every `Row` (id, name, link, state, history).

- **Safety envelope**: every target passes through `SetTarget`, which clamps to
  [−90°, +90°] before the command reaches a link. The UI also limits its inputs, but the
  gateway does not trust it; the clamp is logged when it fires.
- **Telemetry path**: each link raises `SampleReceived` on its own thread. The registry
  stamps the sample with the row id and UTC time, updates the row's live state, appends to
  the row's `TelemetryRing`, and broadcasts to the SignalR hub. There is no queue between
  device and hub; at 5 Hz per row this is well within what one process handles.
- **`TelemetryRing`**: a fixed-size circular buffer (1500 samples, 5 min at 200 ms) with a
  lock, so history queries and appends do not race. This stands in for the ingestion
  buffer a real gateway keeps while its uplink is down.

### HTTP surface

| Method | Path | Effect |
|---|---|---|
| GET | `/api/rows` | All rows with live state |
| POST | `/api/rows/{id}/target` `{angle}` | Clamp and move. Returns requested and applied angle |
| POST | `/api/rows/{id}/stow` | Move to 0° |
| POST | `/api/rows/{id}/zero` | Declare current position 0° |
| POST | `/api/rows/{id}/stop` | Halt at current angle |
| GET | `/api/rows/{id}/history?seconds=N` | Samples from the ring buffer, capped at 300 s |
| WS | `/hub/telemetry` | SignalR hub, method `telemetry`, one message per sample |

The built dashboard is served from `wwwroot` with an SPA fallback, so `dotnet run` is the
whole demo. CORS is wide open for local development and would be locked down in a real
deployment.

## Dashboard (`dashboard/`)

Vite + React 19 + TypeScript. No state library; two hooks carry the logic.

- **`useTelemetry`** connects to the hub with automatic reconnect and keeps a per-row
  rolling history in a ref. It flushes to React state at 4 Hz rather than on every message
  so the chart re-renders at a bounded rate. If the hub is down it polls `/api/rows` at
  2 Hz and synthesizes history from the poll, so the UI degrades instead of freezing.
  The history accessor returns copies because Recharts freezes the arrays it is given.
- **`useFindSun`** is a client-side hill-climb: step the row from −90° to +90° in 15°
  increments, wait for the reported angle to settle at each stop, average a few samples of
  panel voltage, then park at the best angle. It reads the freshest row state through a ref
  so it is not tied to render timing. It only produces a meaningful result where voltage
  actually depends on angle, which means the simulated rows unless the panel is mounted on
  the motor and wired to A0.
- **Components**: `FleetPanel` (one card per row with a voltage sparkline),
  `PanelSchematic` (SVG panel on a pivot rotated by the live angle, with the target shown
  as a dashed ghost), `RowDetail` (readouts, slider, step controls, sweep progress),
  `TelemetryChart` (Recharts, volts on the left axis, angle on the right).
- **Controls**: the slider sends on release, not on every tick. West/East move relative to
  the current target by the amount in the Step box; Flat 0° is absolute.

## Failure modes and what happens

| Failure | Behaviour |
|---|---|
| Serial port absent at start | Row 1 becomes simulated; log says so |
| Board unplugged mid-run | Link goes offline within 2 s, reconnects every 2 s; commands are dropped and logged |
| Board resets (port opened, brown-out) | `READY` logged, angle counter restarts at 0; operator re-zeroes |
| Hub connection lost | Dashboard shows "polling fallback" and continues from REST |
| Out-of-range target | Gateway clamps and logs; response shows both requested and applied |
| Two processes want the port | Second one fails to open and keeps retrying; only one may own the Uno |

## What would change at real scale

- Rows would talk LoRa to the gateway instead of USB; `IDeviceLink` is where that swap
  happens, with the registry unchanged.
- The gateway would forward the telemetry stream to a cloud ingestion endpoint and buffer
  locally during outages; `TelemetryRing` is the seed of that buffer.
- Stow would become a latched state driven by weather inputs, not just a move to 0°.
- Auth, TLS, and per-row command audit logs would sit in front of the API.
