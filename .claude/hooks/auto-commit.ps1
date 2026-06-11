$ErrorActionPreference = 'Stop'

# Check if there are changes
git diff --exit-code >$null 2>&1
$hasChanges = $LASTEXITCODE -ne 0

git diff --cached --exit-code >$null 2>&1
$hasStagedChanges = $LASTEXITCODE -ne 0

if ($hasChanges -or $hasStagedChanges) {
    # Get list of changed files (modified/added, exclude deleted for now)
    $changedFiles = git diff --name-only --diff-filter=d

    if ($changedFiles) {
        # Stage only the changed files (not untracked files like .exe)
        $changedFiles | ForEach-Object { git add $_ }

        # Generate commit message based on files changed
        $commitMessage = @"
feat: auto-commit changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
"@

        git commit -m $commitMessage 2>&1 | Out-Null
        git push origin main 2>&1 | Out-Null

        Write-Output '{"systemMessage": "Changes committed and pushed to main"}'
    } else {
        Write-Output '{"systemMessage": "No tracked file changes to commit"}'
    }
} else {
    Write-Output '{"systemMessage": "No changes to commit"}'
}
