# syntax=docker/dockerfile:1

# TurboToys on its own: the MatGame host (../MatGame, a named build context) with only the game TurboToys compiled in – for an own server,
# a LAN party or offline use without the other Mat games. Port 2773. The same plugin is also part of MatGame's image (port 2770, every game).
#   docker build --build-context matgame=../MatGame -t turbotoys:local .
# (docker-compose.local.yml and the CI pass the context; the folder layout /src/MatGame, /src/TurboToys keeps the relative ProjectReferences.)

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG Channel=local
ARG BuildNumber=0
ARG BuildDate=
WORKDIR /src

COPY --from=matgame . MatGame/
COPY . TurboToys/
# build output of a developer's machine (Windows paths in obj/) must never reach the restore
RUN find . -type d \( -name bin -o -name obj -o -name node_modules -o -name .git \) -prune -exec rm -rf {} + && \
    dotnet restore "MatGame/src/MatGame/MatGame.csproj" -p:MatGameGames=turbotoys

# Fall back to today's date when BuildDate is not supplied, so the version never ends in "-".
RUN BUILD_DATE="${BuildDate:-$(date -u +%Y%m%d)}" && \
    dotnet publish "MatGame/src/MatGame/MatGame.csproj" \
    -c Release -o /app/publish --no-restore \
    -p:UseAppHost=false -p:MatGameGames=turbotoys \
    -p:Channel=$Channel -p:BuildNumber=$BuildNumber -p:BuildDate=$BUILD_DATE

# ---------------------------------------------------------------------------
# Runtime stage (ASP.NET Core base image)
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

LABEL org.opencontainers.image.title="TurboToys" \
      org.opencontainers.image.description="TurboToys – ferngesteuerte Autos im Comic-Look: Rennen, Tuning, Pokale und Mehrspieler (MatGame-Server mit nur diesem Spiel)" \
      org.opencontainers.image.source="https://github.com/Real-TTX/TurboToys"

WORKDIR /app

# MATGAME_PORT: the host listens on 2773 (and asks the same port in its health check); MATGAME_GAMES: only TurboToys
ENV HTTP_PORTS="" \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_gcServer=0 \
    TZ=Europe/Berlin \
    MATGAME_PORT=2773 \
    MATGAME_GAMES=turbotoys

EXPOSE 2773

COPY --from=build /app/publish .

# One volume for the files of the host (sign-in keys, the game's folder). The database is the other container of the stack.
RUN mkdir -p /data/keys /data/games && chown -R $APP_UID:$APP_UID /data
VOLUME /data
USER $APP_UID

HEALTHCHECK --interval=30s --timeout=8s --start-period=40s --retries=3 \
    CMD ["dotnet", "MatGame.dll", "--healthcheck"]

ENTRYPOINT ["dotnet", "MatGame.dll"]
