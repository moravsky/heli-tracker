namespace Gateway;

/// A fake row: slews toward its target at ~60°/s and reports a cosine-law panel voltage
/// relative to a fixed "sun" angle. Lets the whole stack run with no hardware attached.
public sealed class SimulatedDeviceLink : IDeviceLink
{
    private const double SlewDegPerSec = 60.0;
    private const double PeriodMs = 200;
    private readonly double _sunAngle;
    private readonly Random _rng = new();
    private double _angle, _target;
    private PeriodicTimer? _timer;
    private CancellationTokenSource? _cts;

    public SimulatedDeviceLink(double sunAngle) => _sunAngle = sunAngle;

    public bool IsSimulated => true;
    public bool Online => true;
    public event Action<DeviceSample>? SampleReceived;

    public Task StartAsync(CancellationToken ct)
    {
        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _timer = new PeriodicTimer(TimeSpan.FromMilliseconds(PeriodMs));
        _ = Task.Run(async () =>
        {
            try
            {
                while (await _timer.WaitForNextTickAsync(_cts.Token))
                {
                    double maxStep = SlewDegPerSec * PeriodMs / 1000.0;
                    double diff = _target - _angle;
                    _angle += Math.Clamp(diff, -maxStep, maxStep);

                    double rad = (_angle - _sunAngle) * Math.PI / 180.0;
                    double volts = 2.2 * Math.Max(0, Math.Cos(rad)) + (_rng.NextDouble() - 0.5) * 0.04;
                    SampleReceived?.Invoke(new DeviceSample(Math.Round(_angle, 1), Math.Round(Math.Max(0, volts), 3)));
                }
            }
            catch (OperationCanceledException) { }
        }, _cts.Token);
        return Task.CompletedTask;
    }

    public Task MoveToAsync(double deg) { _target = deg; return Task.CompletedTask; }
    public Task ZeroAsync() { _angle = 0; _target = 0; return Task.CompletedTask; }
    public Task StopAsync() { _target = _angle; return Task.CompletedTask; }

    public void Dispose() { _cts?.Cancel(); _timer?.Dispose(); }
}
