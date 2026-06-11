$ErrorActionPreference = 'SilentlyContinue'

# Check if there are changes
git diff --exit-code >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    # Stage all changes
    git add -A

    # Create commit with multi-line message
    $commitMessage = @"
feat: auto-commit changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
"@

    git commit -m $commitMessage

    # Push to main
    git push origin main

    Write-Output '{"systemMessage": "Changes committed and pushed to main"}'
} else {
    Write-Output '{"systemMessage": "No changes to commit"}'
}
