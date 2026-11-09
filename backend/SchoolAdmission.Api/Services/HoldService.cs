using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Services;

public enum HoldCreationStatus
{
    Created,
    ClassNotFound,
    DuplicateApplication,
    NoSeats
}

public record HoldCreationResult(
    HoldCreationStatus Status,
    HoldCreatedResponse? Data = null
);

public class HoldService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public HoldService(
        AppDbContext db, 
        IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public async Task<HoldCreationResult> CreateAsync(
        Guid classId, 
        string studentId, 
        CancellationToken cancellationToken)
    {
        var duration = _configuration.GetValue<int?>("HOLD_DURATION_SECONDS") ?? 600;

        if(duration < 0)
        {
            throw new InvalidOperationException(
                "HOLD_DURATION_SECONDS must be positive.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);

        var classes = await _db.Classes.FromSqlInterpolated(
            $"SELECT * FROM classes WHERE id = {classId} FOR UPDATE")
                .ToListAsync(cancellationToken);

        var admissionClass = classes.SingleOrDefault();

        if(admissionClass is null)
        {
            return new HoldCreationResult(
                HoldCreationStatus.ClassNotFound);
        }

        var now = DateTime.UtcNow;

        await _db.Holds.Where(h =>
            h.ClassId == classId &&
            h.Status == HoldStatus.HELD &&
            h.ExpiresAt <= now)
                .ExecuteUpdateAsync(
                    updates => updates.SetProperty(
                        h => h.Status, HoldStatus.EXPIRED
                    ), cancellationToken
                );
        
        var alreadyApplied = await _db.Holds.AnyAsync(
            h => 
                h.ClassId == classId &&
                h.StudentId == studentId &&
                (
                    h.Status == HoldStatus.CONFIRMED ||
                    (
                        h.Status == HoldStatus.HELD &&
                        h.ExpiresAt > now
                    )
                ),
            cancellationToken
        );

        if (alreadyApplied)
        {
            return new HoldCreationResult(
                HoldCreationStatus.DuplicateApplication);
        }

        var occupiedSeats = await _db.Holds.CountAsync(
            h =>
                h.ClassId == classId && 
                (
                    h.Status == HoldStatus.CONFIRMED || 
                    (
                        h.Status == HoldStatus.HELD &&
                        h.ExpiresAt > now
                    )
                ),
            cancellationToken
        );

        if (occupiedSeats >= admissionClass.TotalSeats)
        {
            return new HoldCreationResult(
                HoldCreationStatus.NoSeats);
        }

        var hold = new SeatHold
        {
            ClassId = classId,
            StudentId = studentId,
            Status = HoldStatus.HELD,
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(duration)
        };

        _db.Holds.Add(hold);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException dex)
            when (dex.InnerException is PostgresException pg && 
                pg.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return new HoldCreationResult(HoldCreationStatus.DuplicateApplication);
        }

        return new HoldCreationResult(
            HoldCreationStatus.Created,
            new HoldCreatedResponse(
                hold.Id,
                hold.ClassId,
                hold.StudentId,
                hold.Status.ToString(),
                hold.ExpiresAt
            )
        );
    }
}