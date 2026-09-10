using System.Globalization;
using System.IO.Ports;

namespace Gateway;

/// Talks the tracker.ino line protocol over a serial port.
///   A <deg> | Z | S   →   telemetry "T <angle> <volts>" every 200 ms.
public sealed class SerialDeviceLink : IDeviceLink
{
    private readonly string _portName;
    private readonly ILogger _log;
    private readonly object _writeLock = new();
    private SerialPort? _port;
    private DateTimeOffset _lastSample = DateTimeOffset.MinValue;
    private CancellationTokenSource? _cts;

    public SerialDeviceLink(string portName, ILogger log)
    {
        _portName = portName;
        _log = log;
    }

    public bool IsSimulated => false;
    public bool Online => _port?.IsOpen == true && DateTimeOffset.UtcNow - _lastSample < TimeSpan.FromSeconds(2);
    public event Action<DeviceSample>? SampleReceived;

    public Task StartAsync(CancellationToken ct)
    {
        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _ = Task.Run(() => ReadLoop(_cts.Token), _cts.Token);
        return Task.CompletedTask;
    }

    private async Task ReadLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var port = new SerialPort(_portName, 115200)
                {
                    NewLine = "\n",
                    ReadTimeout = 1000,
                    WriteTimeout = 500,
                    DtrEnable = true,
                };
                port.Open();
                _port = port;
                _log.LogInformation("Serial open on {Port}", _portName);

                // Read raw bytes and split lines ourselves: SerialPort.ReadLine on Unix can
                // replay buffered data after a ReadTimeout, which showed up as a READY storm.
                var stream = port.BaseStream;
                var buf = new byte[256];
                var sb = new System.Text.StringBuilder();
                while (!ct.IsCancellationRequested)
                {
                    int n = await stream.ReadAsync(buf, ct);
                    if (n == 0) throw new IOException("serial stream closed");
                    for (int i = 0; i < n; i++)
                    {
                        char c = (char)buf[i];
                        if (c != '\n') { if (c != '\r') sb.Append(c); continue; }
                        var line = sb.ToString().Trim();
                        sb.Clear();
                        HandleLine(line);
                    }
                }
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _log.LogWarning("Serial link error on {Port}: {Msg}. Reconnecting in 2 s.", _portName, ex.Message);
            }
            finally
            {
                var p = _port; _port = null;
                try { p?.Close(); p?.Dispose(); } catch { }
            }
            try { await Task.Delay(2000, ct); } catch (OperationCanceledException) { }
        }
    }

    private void HandleLine(string line)
    {
        if (line == "READY") { _log.LogInformation("Row controller reset (READY)"); return; }
        if (!line.StartsWith("T ")) return;

        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3
            && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var ang)
            && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
        {
            _lastSample = DateTimeOffset.UtcNow;
            SampleReceived?.Invoke(new DeviceSample(ang, v));
        }
    }

    private Task Send(string cmd)
    {
        var port = _port;
        if (port is null || !port.IsOpen)
        {
            _log.LogWarning("Dropping command '{Cmd}': serial port not open", cmd);
            return Task.CompletedTask;
        }
        lock (_writeLock) { port.WriteLine(cmd); }
        return Task.CompletedTask;
    }

    public Task MoveToAsync(double deg) => Send($"A {deg.ToString("F1", CultureInfo.InvariantCulture)}");
    public Task ZeroAsync() => Send("Z");
    public Task StopAsync() => Send("S");

    public void Dispose()
    {
        _cts?.Cancel();
        try { _port?.Close(); } catch { }
    }
}
