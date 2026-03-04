# Security Guide

## Sensitive Data Management

### Configuration Files

The project uses `web/config.json` for local configuration. This file **must never be committed** to the repository as it may contain sensitive information such as:

- Database credentials (DATABASE_URL)
- Admin tokens (ADMIN_TOKEN)
- API keys

#### Setup

1. Copy the template file:
   ```bash
   cp web/config.json.template web/config.json
   ```

2. Edit `web/config.json` with your actual values:
   ```json
   {
     "DATABASE_URL": "postgresql://your_user:your_password@localhost:5432/your_db",
     "API_PORT": 8080,
     "CLIENT_DEV_PORT": 5173,
     "MAX_LOCAL_ITEMS": 100,
     "ADMIN_TOKEN": "your-secure-random-token"
   }
   ```

3. Ensure the file is ignored by Git (already configured in `.gitignore`)

### Git History Cleanup (COMPLETED)

**Status**: The file `web/config.json` has been successfully removed from Git history using `git-filter-repo`.

#### What was done:
- Installed `git-filter-repo` tool
- Removed `web/config.json` from entire Git history
- Repacked and cleaned the repository

#### Post-Cleanup Actions Required:

1. **Re-add remote repository**:
   ```bash
   git remote add origin git@github.com:yelanyanyu/ad-fontes-manager.git
   ```

2. **Force push to remote** (requires coordination with team):
   ```bash
   git push origin --force --all
   ```

3. **Rotate all credentials** that may have been exposed:
   - Database passwords
   - API keys
   - Admin tokens

4. **Notify the team**:
   - Everyone must re-clone the repository
   - Any open PRs may need to be recreated

### Prevention Measures

1. **Pre-commit hooks**: Install hooks to prevent committing sensitive files
   ```bash
   # Using husky
   npx husky add .husky/pre-commit "git diff --cached --name-only | grep -E 'config\\.json|\\.env' && exit 1 || exit 0"
   ```

2. **GitHub Secret Scanning**: Enable in repository settings

3. **Regular audits**:
   ```bash
   # Check for large files that might contain data
   git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(restpath)' | awk '/^blob/ {print $3" "$4}' | sort -rn | head -20
   ```

## Security Checklist

- [x] `web/config.json` is in `.gitignore`
- [x] `web/config.json.template` exists with placeholder values
- [x] `web/config.json` removed from Git history
- [ ] Database passwords are strong and rotated
- [ ] ADMIN_TOKEN is a cryptographically secure random string
- [ ] Production uses environment variables instead of config.json
- [ ] Team members are aware of the security policy

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** create a public issue
2. Contact the maintainers directly
3. Allow time for the issue to be resolved before disclosure

## Additional Resources

- [GitHub Docs: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Git filter-repo documentation](https://github.com/newren/git-filter-repo)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
