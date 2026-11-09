namespace SchoolAdmission.Api.DTOs;

public record HoldStatusResponse(
    Guid HoldId,
    Guid ClassId,
    string Status,
    DateTime ExpiresAt
);