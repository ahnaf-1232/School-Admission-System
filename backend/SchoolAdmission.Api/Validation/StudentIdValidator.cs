
namespace SchoolAdmission.Api.Validation;

public static class StudentIdValidator
{
    public static bool IsValid(string? studentId)
    {
        return studentId is { Length: 17 } &&
               studentId.All(c => c >= '0' && c <= '9');
    }
}
