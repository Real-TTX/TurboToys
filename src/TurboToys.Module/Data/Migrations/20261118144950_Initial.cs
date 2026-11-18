using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TurboToys.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "turbotoys");

            migrationBuilder.CreateTable(
                name: "Car",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Key = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Body = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Drive = table.Column<int>(type: "integer", nullable: false),
                    Speed = table.Column<int>(type: "integer", nullable: false),
                    Acceleration = table.Column<int>(type: "integer", nullable: false),
                    Grip = table.Column<int>(type: "integer", nullable: false),
                    Armor = table.Column<int>(type: "integer", nullable: false),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    TurboCapacity = table.Column<int>(type: "integer", nullable: false),
                    Price = table.Column<int>(type: "integer", nullable: false),
                    UnlockLevel = table.Column<int>(type: "integer", nullable: false),
                    DefaultPaint = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Car", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Cup",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    TrackIds = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Laps = table.Column<int>(type: "integer", nullable: false),
                    EntryFee = table.Column<int>(type: "integer", nullable: false),
                    Prize = table.Column<int>(type: "integer", nullable: false),
                    Opponents = table.Column<int>(type: "integer", nullable: false),
                    BotSkill = table.Column<int>(type: "integer", nullable: false),
                    UnlockLevel = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cup", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Player",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    IsGuest = table.Column<bool>(type: "boolean", nullable: false),
                    Money = table.Column<int>(type: "integer", nullable: false),
                    Xp = table.Column<int>(type: "integer", nullable: false),
                    AvatarFace = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    AvatarHair = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    AvatarHelmet = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    AvatarColor = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    AvatarSkin = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    SelectedGarageCarId = table.Column<long>(type: "bigint", nullable: true),
                    RacesPlayed = table.Column<int>(type: "integer", nullable: false),
                    RacesWon = table.Column<int>(type: "integer", nullable: false),
                    Podiums = table.Column<int>(type: "integer", nullable: false),
                    Kills = table.Column<int>(type: "integer", nullable: false),
                    Wrecks = table.Column<int>(type: "integer", nullable: false),
                    CupsWon = table.Column<int>(type: "integer", nullable: false),
                    MoneyEarned = table.Column<int>(type: "integer", nullable: false),
                    LastRaceDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Player", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Setting",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Value = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Setting", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Track",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Layout = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Laps = table.Column<int>(type: "integer", nullable: false),
                    TimeOfDay = table.Column<int>(type: "integer", nullable: false),
                    UnlockLevel = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Track", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Weapon",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Damage = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<int>(type: "integer", nullable: false),
                    CooldownMs = table.Column<int>(type: "integer", nullable: false),
                    CrateWeight = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Weapon", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CupRun",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Token = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayerId = table.Column<long>(type: "bigint", nullable: false),
                    CupId = table.Column<long>(type: "bigint", nullable: false),
                    RaceIndex = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Standings = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Place = table.Column<int>(type: "integer", nullable: true),
                    PrizeWon = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CupRun", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CupRun_Cup_CupId",
                        column: x => x.CupId,
                        principalSchema: "turbotoys",
                        principalTable: "Cup",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GarageCar",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlayerId = table.Column<long>(type: "bigint", nullable: false),
                    CarId = table.Column<long>(type: "bigint", nullable: false),
                    Engine = table.Column<int>(type: "integer", nullable: false),
                    Tires = table.Column<int>(type: "integer", nullable: false),
                    Armor = table.Column<int>(type: "integer", nullable: false),
                    Turbo = table.Column<int>(type: "integer", nullable: false),
                    Weapons = table.Column<int>(type: "integer", nullable: false),
                    Paint = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Decal = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GarageCar", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GarageCar_Car_CarId",
                        column: x => x.CarId,
                        principalSchema: "turbotoys",
                        principalTable: "Car",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GarageCar_Player_PlayerId",
                        column: x => x.PlayerId,
                        principalSchema: "turbotoys",
                        principalTable: "Player",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Race",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Token = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    TrackId = table.Column<long>(type: "bigint", nullable: true),
                    Laps = table.Column<int>(type: "integer", nullable: false),
                    Weapons = table.Column<bool>(type: "boolean", nullable: false),
                    HostPlayerId = table.Column<long>(type: "bigint", nullable: true),
                    CupRunId = table.Column<long>(type: "bigint", nullable: true),
                    Humans = table.Column<int>(type: "integer", nullable: false),
                    Bots = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Race", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Race_Track_TrackId",
                        column: x => x.TrackId,
                        principalSchema: "turbotoys",
                        principalTable: "Track",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "RaceEntry",
                schema: "turbotoys",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RaceId = table.Column<long>(type: "bigint", nullable: false),
                    Seat = table.Column<int>(type: "integer", nullable: false),
                    PlayerId = table.Column<long>(type: "bigint", nullable: true),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    IsBot = table.Column<bool>(type: "boolean", nullable: false),
                    CarName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    CarBody = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Place = table.Column<int>(type: "integer", nullable: false),
                    Finished = table.Column<bool>(type: "boolean", nullable: false),
                    TimeMs = table.Column<int>(type: "integer", nullable: true),
                    BestLapMs = table.Column<int>(type: "integer", nullable: true),
                    Kills = table.Column<int>(type: "integer", nullable: false),
                    Wrecks = table.Column<int>(type: "integer", nullable: false),
                    MoneyGained = table.Column<int>(type: "integer", nullable: false),
                    XpGained = table.Column<int>(type: "integer", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaceEntry", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaceEntry_Race_RaceId",
                        column: x => x.RaceId,
                        principalSchema: "turbotoys",
                        principalTable: "Race",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Car_Key",
                schema: "turbotoys",
                table: "Car",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CupRun_CupId",
                schema: "turbotoys",
                table: "CupRun",
                column: "CupId");

            migrationBuilder.CreateIndex(
                name: "IX_CupRun_PlayerId_Status",
                schema: "turbotoys",
                table: "CupRun",
                columns: new[] { "PlayerId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CupRun_Token",
                schema: "turbotoys",
                table: "CupRun",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GarageCar_CarId",
                schema: "turbotoys",
                table: "GarageCar",
                column: "CarId");

            migrationBuilder.CreateIndex(
                name: "IX_GarageCar_PlayerId_CarId",
                schema: "turbotoys",
                table: "GarageCar",
                columns: new[] { "PlayerId", "CarId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Player_Xp",
                schema: "turbotoys",
                table: "Player",
                column: "Xp");

            migrationBuilder.CreateIndex(
                name: "IX_Race_Status",
                schema: "turbotoys",
                table: "Race",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Race_Token",
                schema: "turbotoys",
                table: "Race",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Race_TrackId",
                schema: "turbotoys",
                table: "Race",
                column: "TrackId");

            migrationBuilder.CreateIndex(
                name: "IX_RaceEntry_PlayerId",
                schema: "turbotoys",
                table: "RaceEntry",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_RaceEntry_RaceId_Seat",
                schema: "turbotoys",
                table: "RaceEntry",
                columns: new[] { "RaceId", "Seat" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Setting_Key",
                schema: "turbotoys",
                table: "Setting",
                column: "Key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CupRun",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "GarageCar",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "RaceEntry",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Setting",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Weapon",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Cup",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Car",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Player",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Race",
                schema: "turbotoys");

            migrationBuilder.DropTable(
                name: "Track",
                schema: "turbotoys");
        }
    }
}
