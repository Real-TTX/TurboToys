using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TurboToys.Data.Migrations
{
    /// <inheritdoc />
    public partial class TrackDesigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Design",
                schema: "turbotoys",
                table: "Track",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "OwnerId",
                schema: "turbotoys",
                table: "Track",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Track_OwnerId",
                schema: "turbotoys",
                table: "Track",
                column: "OwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_Track_Player_OwnerId",
                schema: "turbotoys",
                table: "Track",
                column: "OwnerId",
                principalSchema: "turbotoys",
                principalTable: "Player",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Track_Player_OwnerId",
                schema: "turbotoys",
                table: "Track");

            migrationBuilder.DropIndex(
                name: "IX_Track_OwnerId",
                schema: "turbotoys",
                table: "Track");

            migrationBuilder.DropColumn(
                name: "Design",
                schema: "turbotoys",
                table: "Track");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                schema: "turbotoys",
                table: "Track");
        }
    }
}
