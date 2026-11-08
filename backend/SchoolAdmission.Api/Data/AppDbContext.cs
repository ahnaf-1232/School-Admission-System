using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<AdmissionClass> Classes { get; set; }
    public DbSet<SeatHold> Holds { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AdmissionClass>(entity => {
            entity.ToTable("classes");

            entity.HasKey(c => c.Id);

            entity.Property(c => c.Id).HasColumnName("id");
            entity.Property(c => c.Name).HasColumnName("name");
            entity.Property(c => c.TotalSeats).HasColumnName("total_seats");
        });

        modelBuilder.Entity<SeatHold>(entity => {
            entity.ToTable("seat_holds");

            entity.HasKey(h => h.Id);

            entity.Property(h => h.Id).HasColumnName("id");
            entity.Property(h => h.ClassId).HasColumnName("class_id");
            entity.Property(h => h.StudentId).HasColumnName("student_id").IsRequired().HasMaxLength(17);
            entity.Property(h => h.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20);
            entity.Property(h => h.CreatedAt).HasColumnName("created_at");
            entity.Property(h => h.ExpiresAt).HasColumnName("expires_at");

            entity.HasOne(h => h.Class)
                .WithMany(c => c.Holds)
                .HasForeignKey(h => h.ClassId)
                .OnDelete(DeleteBehavior.Restrict);
            
            entity.HasIndex(h => new { h.ClassId, h.Status, h.ExpiresAt });
        });
    }
}