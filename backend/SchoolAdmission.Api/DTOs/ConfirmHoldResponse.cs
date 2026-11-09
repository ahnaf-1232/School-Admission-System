
namespace SchoolAdmission.Api.DTOs;

public record ConfirmHoldResponse(
    Guid HoldId,
    string Status
);
