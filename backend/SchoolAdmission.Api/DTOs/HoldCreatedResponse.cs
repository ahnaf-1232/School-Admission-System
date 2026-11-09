namespace SchoolAdmission.Api.DTOs;

public record HoldCreatedResponse(
    Guid HoldId,
    Guid ClassId,
    string StudentId,
    string Status,
    DateTime ExpiresAt    
);