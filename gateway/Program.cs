using Gateway;

var builder = WebApplication.CreateBuilder(args);
if (args.Contains("--sim")) builder.Configuration["Simulate"] = "true";

builder.Services.AddSignalR();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyHeader().AllowAnyMethod().SetIsOriginAllowed(_ => true).AllowCredentials()));
builder.Services.AddSingleton<RowRegistry>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RowRegistry>());

var app = builder.Build();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

api.MapGet("/rows", (RowRegistry reg) => Results.Ok(reg.All()));

api.MapPost("/rows/{id}/target", async (string id, TargetRequest req, RowRegistry reg) =>
{
    var row = reg.Get(id);
    if (row is null) return Results.NotFound();
    var applied = await reg.SetTarget(row, req.Angle);
    return Results.Ok(new { rowId = id, requested = req.Angle, targetAngle = applied });
});

api.MapPost("/rows/{id}/stow", async (string id, RowRegistry reg) =>
{
    var row = reg.Get(id);
    if (row is null) return Results.NotFound();
    await reg.SetTarget(row, 0);
    return Results.Ok(row.ToDto());
});

api.MapPost("/rows/{id}/zero", async (string id, RowRegistry reg) =>
{
    var row = reg.Get(id);
    if (row is null) return Results.NotFound();
    await reg.Zero(row);
    return Results.Ok(row.ToDto());
});

api.MapPost("/rows/{id}/stop", async (string id, RowRegistry reg) =>
{
    var row = reg.Get(id);
    if (row is null) return Results.NotFound();
    await reg.Stop(row);
    return Results.Ok(row.ToDto());
});

api.MapGet("/rows/{id}/history", (string id, int seconds, RowRegistry reg) =>
{
    var row = reg.Get(id);
    if (row is null) return Results.NotFound();
    var from = DateTimeOffset.UtcNow.AddSeconds(-Math.Clamp(seconds <= 0 ? 120 : seconds, 1, 300));
    return Results.Ok(row.History.Since(from).Select(t => new { angle = t.Angle, volts = t.Volts, ts = t.Ts }));
});

app.MapHub<TelemetryHub>("/hub/telemetry");
app.MapFallbackToFile("index.html");

app.Run();
