$ErrorActionPreference = 'Continue'

# Get changed files excluding worktrees
$changedFiles = git diff --name-only --diff-filter=d | Where-Object { $_ -notmatch '^\.claude/worktrees/' }

if ($changedFiles) {
    # Stage files
    $changedFiles | ForEach-Object { git add $_ }

    # Generate smart commit message
    $fileList = $changedFiles -join ', '
    $commitMessage = if ($changedFiles.Count -eq 1) {
        "update: $fileList"
    } elseif ($changedFiles.Count -le 3) {
        "update: $fileList"
    } else {
        "update: multiple files ($($changedFiles.Count) files)"
    }

    git commit -m $commitMessage 2>&1 | Out-Null

    # Push with error handling
    git push origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Output '{"systemMessage": "✓ Committed and pushed to main"}'
    } else {
        Write-Output '{"systemMessage": "⚠ Committed locally but push failed"}'
    }
} else {
    Write-Output '{"systemMessage": "No changes to commit"}'
}
