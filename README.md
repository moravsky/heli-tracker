# heli-tracker

A single-axis solar tracker fleet in miniature: an Arduino row controller turning a small
PV panel, a .NET gateway that aggregates rows and streams telemetry, and a React operator
dashboard. Same shape as a production tracker control stack (row controller → network
controller → cloud → dashboard), minus the LoRa and the cloud.

```
 ┌───────────────────────┐   serial 115200    ┌──────────────────────────┐   REST + SignalR   ┌────────────────────┐
 │ Arduino Uno           │ ─────────────────▶ │ gateway/  (.NET 8)       │ ─────────────────▶ │ dashboard/ (React) │
 │ controller/           │ ◀───────────────── │  IDeviceLink             │ ◀───────────────── │  fleet panel       │
 │  controller.ino       │   A <deg> / Z / S  │   ├ SerialDeviceLink     │  /api/rows         │  row detail + SVG  │
 │  28BYJ-48 + A0 volts  │                    │   └ SimulatedDeviceLink  │  /hub/telemetry    │  2-min chart       │
 └───────────────────────┘                    │  RowRegistry (clamp,     │                    │  find-sun sweep    │
                                              │   ring buffer, hub fan-out)                   └────────────────────┘
                                              └──────────────────────────┘
```

## Run it

One command builds the dashboard, copies it into the gateway, and starts everything on
<http://localhost:5080>:

```sh
./run.sh          # real hardware on the port in gateway/appsettings.json
./run.sh --sim    # no hardware: row-1 is simulated too
```

If the serial port is not present the gateway falls back to simulation on its own.
Row 2 is always simulated so the fleet view has something to show.

For development with hot reload:

```sh
cd gateway   && dotnet run -- --sim     # API + hub on :5080
cd dashboard && npm run dev             # Vite on :5173, proxies /api and /hub to :5080
```

Requirements: .NET 8 SDK (`brew install dotnet@8`), Node 20+. The serial port can only be
held by one process, so close any serial monitor before starting the gateway.

## Pieces

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and why.

**`controller/controller.ino`** — row controller. Line protocol over USB serial:
`A <deg>` move to absolute angle, `Z` zero, `S` stop. Emits `T <angle> <volts>` every
200 ms. Coils are de-energised when idle so the motor does not heat up.

**`gateway/`** — the network controller role.
- `IDeviceLink` is the seam between the fleet logic and a row. `SerialDeviceLink` speaks
  the line protocol with reconnect; `SimulatedDeviceLink` slews at 60°/s and models panel
  output as a cosine of the angle to a fixed sun. Everything above the seam runs identically
  against either, which is what makes the stack testable without hardware.
- `RowRegistry` owns every row, enforces the ±90° envelope before a command reaches a motor,
  keeps a 5-minute telemetry ring buffer per row, and fans samples out over SignalR.
- Endpoints: `GET /api/rows`, `POST /api/rows/{id}/target {angle}`, `/stow`, `/zero`,
  `/stop`, `GET /api/rows/{id}/history?seconds=120`. Hub: `/hub/telemetry` emits
  `{rowId, angle, volts, ts}` at device rate.

**`dashboard/`** — operator view. Fleet cards with sparklines on the left; selected row on
the right with a live schematic of the panel on its pivot, slider and preset buttons, a
two-minute volts/angle chart, and a client-side "Find sun" sweep that samples voltage every
15° and parks at the peak. Uses the SignalR hub and falls back to polling if it drops.
