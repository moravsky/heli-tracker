using Microsoft.AspNetCore.SignalR;

namespace Gateway;

public sealed class Row
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required IDeviceLink Link { get; init; }
    public double Angle;
    public double TargetAngle;
    public double Volts;
    public DateTimeOffset? LastSeen;
    public TelemetryRing History { get; } = new(capacity: 1500);   // 5 min at 200 ms

    public RowDto ToDto() => new(Id, Name, Angle, TargetAngle, Volts, Link.Online, LastSeen, Link.IsSimulated);
}

/// The "network controller": owns every row link, aggregates their telemetry into one
/// stream, and enforces the safety envelope before anything reaches a motor.
public sealed class RowRegistry : IHostedService
{
    public const double MinAngle = -90, MaxAngle = 90;

    private readonly Dictionary<string, Row> _rows = new();
    private readonly IHubContext<TelemetryHub> _hub;
    private readonly ILogger<RowRegistry> _log;

    public RowRegistry(IConfiguration cfg, IHubContext<TelemetryHub> hub, ILogger<RowRegistry> log, ILoggerFactory lf)
    {
        _hub = hub;
        _log = log;

        bool simulate = cfg.GetValue<bool>("Simulate");
        string port = cfg["SerialPort"] ?? "";
        if (!simulate && !File.Exists(port))
        {
            _log.LogWarning("Serial port {Port} not found; falling back to simulation for row-1", port);
            simulate = true;
        }

        IDeviceLink link1 = simulate
            ? new SimulatedDeviceLink(sunAngle: 35)
            : new SerialDeviceLink(port, lf.CreateLogger<SerialDeviceLink>());
        Add(new Row { Id = "row-1", Name = simulate ? "Row 1 (simulated)" : "Row 1 (hardware)", Link = link1 });

        int extra = cfg.GetValue<int>("ExtraSimulatedRows");
        double[] suns = { -20, 10, 55, -45 };
        for (int i = 0; i < extra; i++)
        {
            string id = $"row-{i + 2}";
            Add(new Row { Id = id, Name = $"Row {i + 2} (simulated)", Link = new SimulatedDeviceLink(suns[i % suns.Length]) });
        }
    }

    private void Add(Row row)
    {
        _rows[row.Id] = row;
        row.Link.SampleReceived += s => OnSample(row, s);
    }

    private void OnSample(Row row, DeviceSample s)
    {
        var t = new Telemetry(row.Id, s.Angle, s.Volts, DateTimeOffset.UtcNow);
        row.Angle = s.Angle; row.Volts = s.Volts; row.LastSeen = t.Ts;
        row.History.Add(t);
        _ = _hub.Clients.All.SendAsync("telemetry", new { rowId = t.RowId, angle = t.Angle, volts = t.Volts, ts = t.Ts });
    }

    public IEnumerable<RowDto> All() => _rows.Values.Select(r => r.ToDto());
    public Row? Get(string id) => _rows.GetValueOrDefault(id);

    public async Task<double> SetTarget(Row row, double angle)
    {
        double clamped = Math.Clamp(angle, MinAngle, MaxAngle);
        if (clamped != angle) _log.LogInformation("Clamped {Row} target {A} -> {C}", row.Id, angle, clamped);
        row.TargetAngle = clamped;
        await row.Link.MoveToAsync(clamped);
        return clamped;
    }

    public Task Zero(Row row) { row.TargetAngle = 0; return row.Link.ZeroAsync(); }
    public Task Stop(Row row) { row.TargetAngle = row.Angle; return row.Link.StopAsync(); }

    public async Task StartAsync(CancellationToken ct)
    {
        foreach (var r in _rows.Values) await r.Link.StartAsync(CancellationToken.None);
    }

    public Task StopAsync(CancellationToken ct)
    {
        foreach (var r in _rows.Values) r.Link.Dispose();
        return Task.CompletedTask;
    }
}

public sealed class TelemetryHub : Hub { }
