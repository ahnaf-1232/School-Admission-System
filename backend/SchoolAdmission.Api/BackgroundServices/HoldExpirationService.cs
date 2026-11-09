
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.BackgroundServices;

public class HoldExpirationService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HoldExpirationService> _logger;

    public HoldExpirationService(
        IServiceScopeFactory scopeFactory,
        ILogger<HoldExpirationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(1));

        try
        {
            await ExpireHoldsAsync(stoppingToken);

            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await ExpireHoldsAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested) {}
    }

    private async Task ExpireHoldsAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();

            var db = scope.ServiceProvider
                .GetRequiredService<AppDbContext>();

            var now = DateTime.UtcNow;

            var expiredCount = await db.Holds
                .Where(h =>
                    h.Status == HoldStatus.HELD &&
                    h.ExpiresAt <= now)
                .ExecuteUpdateAsync(
                    updates => updates.SetProperty(
                        h => h.Status,
                        HoldStatus.EXPIRED),
                    cancellationToken);

            if (expiredCount > 0)
            {
                _logger.LogInformation(
                    "Expired {Count} seat holds.",
                    expiredCount);
            }
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to expire seat holds.");
        }
    }
}