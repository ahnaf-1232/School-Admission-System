using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.Services;
using SchoolAdmission.Api.Validation;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("me/holds")]
public class MyHoldsController : ControllerBase
{
    private readonly HoldService _holdService;
    
    public MyHoldsController(HoldService holdService)
    {
        _holdService = holdService;
    }

    [HttpGet]
    public async Task<IActionResult> GetMyHolds(
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken
    )
    {
        if (!StudentIdValidator.IsValid(studentId))
        {
            return BadRequest(new
            {
                message = "X-Student-Id must contain exactly 17 digits."
            });
        }

        var holds = await _holdService.GetMyHoldsAsync(studentId!, cancellationToken);

        return Ok(holds);
    }
}