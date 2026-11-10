FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src

COPY backend/SchoolAdmission.Api/ backend/SchoolAdmission.Api/

RUN rm -rf backend/SchoolAdmission.Api/bin \
    backend/SchoolAdmission.Api/obj

RUN dotnet publish \
    backend/SchoolAdmission.Api/SchoolAdmission.Api.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app

COPY --from=build /app/publish ./

ENV ASPNETCORE_HTTP_PORTS=8080

EXPOSE 8080

USER $APP_UID

ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]
