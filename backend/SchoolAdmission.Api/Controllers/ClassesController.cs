using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("classes")]

public class ClassesController : ControllerBase
{
    private readonly ClassService _classService;

    public ClassesController(ClassService classService)
    {
        _classService = classService;
    }

    [HttpPost]
    public async Task<ActionResult<CreatedClassResponse>> Create (
        [FromBody] CreateClassRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(
                new
                {
                    message = "Class name cannot be empty."
                }
            );
        }

        var created = await _classService.CreateAsync(request, cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { classId = created.Id },
            created
        );
    }

    [HttpGet] 
    public async Task<ActionResult<CreatedClassResponse>> GetAll (
        CancellationToken cancellationToken)
    {
        var classes = await _classService.GetAllAsync(cancellationToken);

        return Ok(classes);
    }

    [HttpGet("{classId:guid}")]
    public async Task<ActionResult<CreatedClassResponse>> GetById (
        Guid classId,
        CancellationToken cancellationToken)
    {
        var admissionClass = await _classService.GetByIdAsync(classId, cancellationToken);

        if (admissionClass is null)
        {
            return NotFound (
                new
                {
                    message = "Class not found."
                }
            );
        }

        return Ok(admissionClass);
    }
}