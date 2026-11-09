using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Services;
using SchoolAdmission.Api.Validation;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("holds")]
public class HoldsController : ControllerBase
{
    private readonly HoldService _holdService;

    public HoldsController(HoldService holdService)
    {
        _holdService = holdService;
    }

    [HttpGet("{holdId:guid}")]
    public async Task<IActionResult> GetById(
        Guid holdId,
        CancellationToken cancellationToken)
    {
        var hold = await _holdService.GetByIdAsync(holdId, cancellationToken);

        if(hold is null)
            return NotFound(new
            {
                message = "Hold not found."
            });

        return Ok(hold);
    }

    [HttpPost("{holdId:guid}/confirm")]
    public async Task<IActionResult> Confirm(
        Guid holdId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (!StudentIdValidator.IsValid(studentId))
        {
            return BadRequest(new
            {
                message = "X-Student-Id must contain exactly 17 digits."
            });
        }

        var result = await _holdService.ConfirmAsync(holdId, studentId!, cancellationToken);

        if(result == HoldActionOutcome.NotFound)
            return NotFound(new
            {
                message = "Hold not found."
            });
        
        if(result == HoldActionOutcome.Conflict)
        {
            return Conflict(new
            {
                messsage = "This hold cannot be confirmed. It may be expired or cancelled."
            });
        }

        return Ok(new ConfirmHoldResponse(
            holdId,
            "CONFIRMED"
        ));
    }

    [HttpDelete("{holdId:guid}")]
    public async Task<IActionResult> Cancel(
        Guid holdId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (!StudentIdValidator.IsValid(studentId))
        {
            return BadRequest(new
            {
                message = "X-Student-Id must contain exactly 17 digits."
            });
        }

        var result = await _holdService.CancelAsync(holdId, studentId!, cancellationToken);

        if(result == HoldActionOutcome.NotFound)
            return NotFound(new
            {
                message = "Hold not found."
            });
        
        if(result == HoldActionOutcome.Conflict)
        {
            return Conflict(new
            {
                messsage = "Only an active HELD application can be cancelled."
            });
        }

        return NoContent();
    }
}