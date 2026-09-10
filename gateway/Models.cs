namespace Gateway;

/// One telemetry sample from a row controller.
public record Telemetry(string RowId, double Angle, double Volts, DateTimeOffset Ts);

/// Snapshot of a row as exposed by the REST API.
public record RowDto(
    string Id, string Name, double Angle, double TargetAngle, double Volts,
    bool Online, DateTimeOffset? LastSeen, bool Simulated);

public record TargetRequest(double Angle);

/// Fixed-size ring buffer of telemetry samples (the "ingestion buffer" of the gateway).
public sealed class TelemetryRing
{
    private readonly Telemetry[] _buf;
    private int _head, _count;
    private readonly object _lock = new();

    public TelemetryRing(int capacity) => _buf = new Telemetry[capacity];

    public void Add(Telemetry t)
    {
        lock (_lock)
        {
            _buf[_head] = t;
            _head = (_head + 1) % _buf.Length;
            if (_count < _buf.Length) _count++;
        }
    }

    public IReadOnlyList<Telemetry> Since(DateTimeOffset from)
    {
        lock (_lock)
        {
            var list = new List<Telemetry>(_count);
            int start = (_head - _count + _buf.Length) % _buf.Length;
            for (int i = 0; i < _count; i++)
            {
                var t = _buf[(start + i) % _buf.Length];
                if (t.Ts >= from) list.Add(t);
            }
            return list;
        }
    }
}
