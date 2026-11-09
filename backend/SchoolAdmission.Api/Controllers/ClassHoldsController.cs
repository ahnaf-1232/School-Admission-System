
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("classes/{classId:guid}/holds")]
public class ClassHoldsController : ControllerBase
{
    private readonly HoldService _holdService;

    public ClassHoldsController(HoldService holdService)
    {
        _holdService = holdService;
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        Guid classId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (studentId is null ||
            !Regex.IsMatch(studentId, @"\A[0-9]{17}\z"))
        {
            return BadRequest(new
            {
                message = "X-Student-Id must contain exactly 17 digits."
            });
        }

        var result = await _holdService.CreateAsync(
            classId,
            studentId,
            cancellationToken);

        return result.Status switch
        {
            HoldCreationStatus.Created =>
                Created(
                    $"/holds/{result.Data!.HoldId}",
                    result.Data),

            HoldCreationStatus.ClassNotFound =>
                NotFound(new
                {
                    message = "Class not found."
                }),

            HoldCreationStatus.DuplicateApplication =>
                Conflict(new
                {
                    message = "Student already has an active application or confirmed admission in this class."
                }),

            HoldCreationStatus.NoSeats =>
                Conflict(new
                {
                    message = "No seats available."
                }),

            _ => throw new InvalidOperationException(
                "Unexpected hold creation result.")
        };
    }
}