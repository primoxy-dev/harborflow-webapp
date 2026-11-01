# Outlook Email setup

Create a Microsoft Entra application for the intended Microsoft 365 tenant. Add a web redirect URI for each environment, such as `https://harborflow-webapp.vercel.app/api/mail?action=callback`. Configure delegated Microsoft Graph permissions `User.Read` and `Mail.Read`, and provide the required user or administrator consent according to tenant policy. Register a client secret and configure the following server-side environment variables:

- `MICROSOFT_CLIENT_ID`: application (client) ID.
- `MICROSOFT_CLIENT_SECRET`: confidential client secret.
- `MICROSOFT_TENANT_ID`: tenant ID, or omit to use `organizations`.
- `HARBORFLOW_SESSION_SECRET`: existing HarborFlow session secret.

Never place credentials in frontend code or version control. Each HarborFlow user connects their own Microsoft account. The application only requests read access; composing, replying, and handling attachments open Outlook. Mail access expires with the short-lived token and the user can reconnect. Production tenant policy may require an administrator to grant consent.
