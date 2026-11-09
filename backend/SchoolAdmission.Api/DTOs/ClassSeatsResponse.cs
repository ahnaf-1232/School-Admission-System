namespace SchoolAdmission.Api.DTOs;

public record ClassSeatsResponse(
    Guid Id,
    string Name,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats
);