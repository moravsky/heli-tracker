# Agent guide for heli-tracker

Read this before changing anything. It is short on purpose.

## What this is

A three-tier demo of a single-axis solar tracker fleet: Arduino row controller,
.NET 8 gateway, React dashboard. See `README.md` for how to run it and
`ARCHITECTURE.md` for how the pieces fit. One physical row is attached over USB serial;
the rest are simulated.

## Layout

- `tracker/tracker.ino` — firmware. Serial line protocol: `A <deg>`, `Z`, `S`; emits
  `T <angle> <volts>` every 200 ms.
- `gateway/` — ASP.NET Core minimal API. `IDeviceLink` is the hardware seam;
  `RowRegistry` owns rows, clamps targets, keeps the telemetry ring, feeds the SignalR hub.
- `dashboard/` — Vite + React + TypeScript. `useTelemetry` (hub + polling fallback) and
  `useFindSun` (sweep) hold the logic; components are thin.
- `run.sh` — builds the dashboard, copies it to `gateway/wwwroot`, starts the gateway.

## Build and run

```sh
./run.sh            # hardware on the port in gateway/appsettings.json
./run.sh --sim      # everything simulated
```

Dev loop: `cd gateway && dotnet run -- --sim` on :5080, `cd dashboard && npm run dev`
on :5173 (Vite proxies `/api` and `/hub`).

Checks before you call something done:

```sh
cd dashboard && npx tsc -b && npm run build
cd gateway && dotnet build
```

There is no test suite. Verify behaviour by running it: curl the API, or start the
gateway in `--sim` mode and exercise the dashboard.

## Environment gotchas

- .NET 8 comes from Homebrew's keg-only `dotnet@8`. If `dotnet` is not on PATH:
  `export PATH="/opt/homebrew/opt/dotnet@8/bin:$PATH" DOTNET_ROOT="/opt/homebrew/opt/dotnet@8/libexec"`.
  `run.sh` does this itself.
- Only one process can own the serial port. A second gateway, or a serial monitor, makes
  the first one's link fail. Check `pgrep -fl gateway/bin` before starting another.
- Port 5080 is fixed in `gateway/appsettings.json`. "Address already in use" means a
  gateway is already running; kill it rather than changing the port.
- Opening the serial port resets the Uno. It prints `READY` and its angle counter goes
  back to 0. That is expected, not a bug.
- `gateway/wwwroot` is a build artifact and is gitignored. Dashboard changes are only
  visible through the gateway after `npm run build` and a copy, which `run.sh` does.
- The panel is currently not wired to A0. Panel volts on the hardware row are 0 (pin tied
  to GND) or noise (pin floating). Do not "fix" that in software by faking a value.

## Rules

- Do not change the serial protocol in `tracker/tracker.ino` without saying so
  explicitly; the gateway's `SerialDeviceLink` and the docs depend on it.
- Angle limits (±90°) are enforced in `RowRegistry.SetTarget`. Keep safety logic in the
  gateway, not the UI. The UI may mirror limits for usability but must not be the only place.
- Anything above `IDeviceLink` must keep working against `SimulatedDeviceLink`. If a
  change only works with hardware attached, it is wrong.
- Read serial bytes from `SerialPort.BaseStream` and split lines manually. Do not
  reintroduce `SerialPort.ReadLine`; on macOS it replayed buffered data after timeouts.
- Keep dependencies minimal. No auth, no database, no Docker. This runs on one laptop.
- Commits are authored by the repository owner only. Do not add yourself as an author or
  co-author, and do not append tool, model, or session trailers to commit messages or pull
  request descriptions. A commit message is the change and why, nothing else.
- Prefer small, verifiable edits. Rebuild and run after each change; do not hand back
  untested code.
