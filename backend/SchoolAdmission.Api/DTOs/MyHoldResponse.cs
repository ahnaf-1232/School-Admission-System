
namespace SchoolAdmission.Api.DTOs;

public record MyHoldResponse(
    Guid HoldId,
    Guid ClassId,
    string ClassName,
    string Status,
    DateTime ExpiresAt
);
