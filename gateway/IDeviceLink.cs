namespace Gateway;

public record DeviceSample(double Angle, double Volts);

/// The seam between the gateway and a physical (or simulated) row controller.
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
