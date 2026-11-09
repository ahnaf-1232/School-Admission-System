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

public enum HoldActionOutcome
{
    Success,
    NotFound,
    Conflict
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

    public async Task<HoldStatusResponse?> GetByIdAsync(
        Guid holdId,
        CancellationToken cancellationToken = default
    )
    {
        var hold = await _db.Holds
            .AsNoTracking()
            .Where(h => h.Id == holdId)
            .Select(
                h => new
                {
                    h.Id,
                    h.ClassId,
                    h.Status,
                    h.ExpiresAt
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (hold is null) return null;

        return new HoldStatusResponse(
            hold.Id,
            hold.ClassId,
            GetEffectiveStatus(
                hold.Status,
                hold.ExpiresAt,
                DateTime.UtcNow
            ),
            hold.ExpiresAt
        );
    }

    public async Task<List<MyHoldResponse>> GetMyHoldsAsync(
        string studentId,
        CancellationToken cancellationToken = default
    )
    {
        var holds = await _db.Holds
            .AsNoTracking()
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new
            {
                h.Id,
                h.ClassId,
                ClassName = h.Class.Name,
                h.Status,
                h.ExpiresAt
            })
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;

        return holds.Select(h => new MyHoldResponse(
            h.Id,
            h.ClassId,
            h.ClassName,
            GetEffectiveStatus(
                h.Status,
                h.ExpiresAt,
                now
            ),
            h.ExpiresAt
        )).ToList();
    }

    public async Task<HoldActionOutcome> ConfirmAsync(
        Guid holdId,
        string studentId,
        CancellationToken cancellationToken = default
    )
    {
        var affectedRows = await _db.Database
            .ExecuteSqlInterpolatedAsync(
                $@"
                UPDATE seat_holds
                SET status = 'CONFIRMED'
                WHERE id = {holdId}
                AND student_id = {studentId}
                AND status = 'HELD'
                AND expires_at > clock_timestamp()
                ",
                cancellationToken
            );

            if (affectedRows == 1) return HoldActionOutcome.Success;

            var existingStatus = await _db.Holds
                .AsNoTracking()
                .Where(h => h.Id == holdId && h.StudentId == studentId)
                .Select(h => (HoldStatus?)h.Status)
                .SingleOrDefaultAsync(cancellationToken);

            if (existingStatus == null) return HoldActionOutcome.NotFound;
            
            if (existingStatus == HoldStatus.CONFIRMED) return HoldActionOutcome.Success;

            return HoldActionOutcome.Conflict;
    }

    public async Task<HoldActionOutcome> CancelAsync(
        Guid holdId,
        string studentId,
        CancellationToken cancellationToken = default
    )
    {
        var affectedRows = await _db.Database
            .ExecuteSqlInterpolatedAsync(
                $@"
                UPDATE seat_holds
                SET status = 'CANCELLED'
                WHERE id = {holdId}
                AND student_id = {studentId}
                AND status = 'HELD'
                AND expires_at > clock_timestamp()
                ",
                cancellationToken
            );

            if (affectedRows == 1) return HoldActionOutcome.Success;

            var existingStatus = await _db.Holds
                .AsNoTracking()
                .Where(h => h.Id == holdId && h.StudentId == studentId)
                .Select(h => (HoldStatus?)h.Status)
                .SingleOrDefaultAsync(cancellationToken);

            if (existingStatus == null) return HoldActionOutcome.NotFound;

            if (existingStatus == HoldStatus.CANCELLED) return HoldActionOutcome.Success;

            return HoldActionOutcome.Conflict;
    }

    private static string GetEffectiveStatus(
        HoldStatus status,
        DateTime expiresAt,
        DateTime now
    )
    {
        if (status == HoldStatus.HELD && expiresAt <= now) return HoldStatus.EXPIRED.ToString();

        return status.ToString();
    }
}