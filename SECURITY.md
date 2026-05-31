# Security notes

This project controls a real browser profile. Treat that profile like a logged-in browser, because that is exactly what it is.

Before pushing or sharing anything:

```powershell
npm run security-check
git status --ignored
```

Do not commit or share:

- `.env`
- anything inside `profiles/`
- anything inside `stuff/`
- screenshots, generated media, browser profile folders, cookies, or exported Claude config files
- any token/password/API key

The repo includes `.gitignore` rules and a local `security-check` script, but still look at `git status` before pushing. Scripts help, eyes still matter.

If you find a security issue in the project code, open a private report if the repo host supports it. Do not post someone else's cookies, tokens, logs, screenshots, prompts, or browser profile files in a public issue.
