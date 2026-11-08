namespace SchoolAdmission.Api.Models
{
    public class AdmissionClass
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public int TotalSeats { get; set; }
        public List<SeatHold> Holds {get; set; } = new List<SeatHold>();
    }
}