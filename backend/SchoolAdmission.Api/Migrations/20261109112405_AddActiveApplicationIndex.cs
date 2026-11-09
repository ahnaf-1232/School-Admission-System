using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchoolAdmission.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddActiveApplicationIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "pux_seat_holds_class_student_active",
                table: "seat_holds",
                columns: new[] { "class_id", "student_id" },
                unique: true,
                filter: "status IN ('HELD', 'CONFIRMED')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "pux_seat_holds_class_student_active",
                table: "seat_holds");
        }
    }
}
