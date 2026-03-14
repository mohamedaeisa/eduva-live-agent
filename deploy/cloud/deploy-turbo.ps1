# AI Private Tutor Turbo Deploy Script
# Skips slow cloud builds by building locally.

# Ensure we are running from project root
while (!(Test-Path "package.json") -and $PWD.Path -ne $PWD.Root.Path) {
    cd ..
}

Write-Host "Starting Turbo Deploy for AI Private Tutor..." -ForegroundColor Cyan

# 1. Build locally
Write-Host "Step 1: Building frontend locally..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Local build failed! Deployment aborted." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Swap Dockerfiles temporarily
Write-Host "Step 2: Preparing container configuration..." -ForegroundColor Yellow
if (Test-Path "Dockerfile") { Rename-Item "Dockerfile" "Dockerfile.bak" }
if (Test-Path ".gcloudignore") { Rename-Item ".gcloudignore" ".gcloudignore.bak" }

Copy-Item "deploy/cloud/Dockerfile.turbo" "Dockerfile"
Copy-Item "deploy/cloud/.gcloudignore" ".gcloudignore"

# 3. Deploy to Cloud Run
Write-Host "Step 3: Deploying to Google Cloud Run..." -ForegroundColor Yellow
try {
    gcloud run deploy ai-private-tutor `
      --source . `
      --project gen-lang-client-0336604604 `
      --region me-central1 `
      --allow-unauthenticated
}
finally {
    # Restore original Dockerfile and ignore file
    Write-Host "Step 4: Cleaning up..." -ForegroundColor Yellow
    if (Test-Path "Dockerfile") { Remove-Item "Dockerfile" }
    if (Test-Path ".gcloudignore") { Remove-Item ".gcloudignore" }
    
    if (Test-Path "Dockerfile.bak") { Rename-Item "Dockerfile.bak" "Dockerfile" }
    if (Test-Path ".gcloudignore.bak") { Rename-Item ".gcloudignore.bak" ".gcloudignore" }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "[OK] Deployment Successful!" -ForegroundColor Green
