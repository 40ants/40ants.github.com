# OAuth setup

Use a user-owned Yandex OAuth application. Do not provide or reuse organization-wide credentials.

1. Sign in to Yandex OAuth with the account that can access the intended Webmaster hosts.
2. Create an application **for API access or debugging**.
3. Enable the Yandex Webmaster permissions identified as `webmaster:hostinfo` and `webmaster:verify`.
4. Use `https://oauth.yandex.ru/verification_code` as the confirmation-code redirect URI. API-access applications use this URI automatically.
5. Copy the application ID and secret into environment variables without putting them in shell history or a repository:

   ```bash
   export YANDEX_CLIENT_ID="..."
   export YANDEX_CLIENT_SECRET="..."
   node "$SKILL_DIR/scripts/yandex-webmaster.mjs" configure --from-env
   unset YANDEX_CLIENT_ID YANDEX_CLIENT_SECRET
   ```

6. Run `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" doctor`, then run `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" auth` in an interactive terminal.

The CLI uses a confirmation-code flow with PKCE and intentionally omits `scope` from the authorization URL. Yandex therefore applies the permissions registered for the OAuth application. The saved client and renewable token files use owner-only permissions and must remain outside every Git repository.

Never paste the application secret, confirmation code, access token, or refresh token into chat, issues, logs, pull requests, or automation prompts. If a credential is exposed, revoke or rotate it in Yandex OAuth and remove it from every Git revision and log sink.

Use Yandex's current documentation when portal labels differ:

- [Register an app for API access](https://yandex.com/dev/id/doc/en/register-api)
- [Receive a confirmation code](https://yandex.com/dev/id/doc/en/codes/screen-code)
- [Exchange a confirmation code for a token](https://yandex.com/dev/id/doc/en/codes/code-and-token)
