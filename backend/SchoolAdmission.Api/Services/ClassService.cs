using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Services;

public class ClassService {
    private readonly AppDbContext _db;

    public ClassService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<CreatedClassResponse> CreateAsync(
        CreateClassRequest request, 
        CancellationToken cancellationToken = default)
    {
        var admissionClass = new AdmissionClass{
            Name = request.Name.Trim(),
            TotalSeats = request.TotalSeats
        };

        _db.Classes.Add(admissionClass);

        await _db.SaveChangesAsync(cancellationToken);

        return new CreatedClassResponse(
            admissionClass.Id,
            admissionClass.Name,
            admissionClass.TotalSeats
        );
    }

    public async Task<List<ClassSeatsResponse>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;

        var rows = await BuildSeatQuery(now).ToListAsync(cancellationToken);

        return rows.Select(ToResponse).ToList();
    }

    public async Task<ClassSeatsResponse?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;

        var rows = await BuildSeatQuery(now, id).SingleOrDefaultAsync(cancellationToken);

        return rows is null ? null : ToResponse(rows);
    }

    private IQueryable<ClassSeatCounts> BuildSeatQuery(
        DateTime now, 
        Guid? classId = null)
    {
        var classes = _db.Classes.AsNoTracking();

        if (classId.HasValue)
        {
            classes = classes.Where(c => c.Id == classId);
        }

        return classes.Select(c => new ClassSeatCounts(
            c.Id,
            c.Name,
            c.TotalSeats,
            c.Holds.Count(h => h.Status == HoldStatus.HELD && h.ExpiresAt > now),
            c.Holds.Count(h => h.Status == HoldStatus.CONFIRMED)
        ));
    }

    private static ClassSeatsResponse ToResponse(ClassSeatCounts row)
    {
        var available = Math.Max(0, row.TotalSeats - row.HeldSeats - row.ConfirmedSeats);

        return new ClassSeatsResponse(
            row.Id,
            row.Name,
            row.TotalSeats,
            row.HeldSeats,
            row.ConfirmedSeats,
            available
        );
    }
     
    private sealed record ClassSeatCounts(
        Guid Id,
        string Name,
        int TotalSeats,
        int HeldSeats,
        int ConfirmedSeats
    );
}   