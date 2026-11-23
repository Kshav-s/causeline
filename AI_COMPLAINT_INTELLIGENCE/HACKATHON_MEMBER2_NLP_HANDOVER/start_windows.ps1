# Start the Member 2 NLP service on Windows.
# Run from the folder that contains src\  ->  .\start_windows.ps1
$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\src\api.py")) {
    throw "Run this from the package root (the folder containing src\)."
}
if (Test-Path ".\.venv\Scripts\Activate.ps1") { . .\.venv\Scripts\Activate.ps1 }
Write-Host "==> http://127.0.0.1:8000/docs   (Ctrl+C to stop)"
uvicorn src.api:app --host 127.0.0.1 --port 8000
