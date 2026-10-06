import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// "You're invited to help plan the wedding" (PRD AUTH-4). Plain table layout and inline styles,
// which every email client (Gmail, Outlook, Apple Mail) renders the same way.

export interface MemberInviteEmailProps {
  inviterName: string;
  coupleNames: string;
  roleLabel: string;
  /** e.g. "Groom side"; omitted when sides are off or for admins. */
  sideLabel?: string;
  joinUrl: string;
  /** e.g. "13 Oct 2026". */
  expiresOn: string;
}

export function MemberInviteEmail({
  inviterName,
  coupleNames,
  roleLabel,
  sideLabel,
  joinUrl,
  expiresOn,
}: MemberInviteEmailProps) {
  const role = sideLabel ? `${roleLabel} (${sideLabel})` : roleLabel;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Join ${coupleNames}'s wedding team`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        {/* Inbox preview line. */}
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`${inviterName} invited you to help plan ${coupleNames}'s wedding.`}
        </div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: t.background, padding: '32px 16px' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    maxWidth: 520,
                    backgroundColor: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 16,
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '36px 32px', fontFamily: t.bodyFont, color: t.text }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: t.textMuted,
                          }}
                        >
                          <span style={{ color: t.gold }}>●</span>&nbsp; You&apos;re invited
                        </p>
                        <h1
                          style={{
                            margin: '16px 0 0',
                            fontFamily: t.headingFont,
                            fontWeight: 500,
                            fontSize: 28,
                            lineHeight: '36px',
                            color: t.text,
                          }}
                        >
                          {`Join ${coupleNames}'s wedding team`}
                        </h1>
                        <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`${inviterName} invited you to help plan the wedding on ${APP_NAME}, as `}
                          <strong>{role}</strong>.
                        </p>
                        <table
                          role="presentation"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ margin: '28px 0' }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ backgroundColor: t.primary, borderRadius: 9999 }}>
                                <a
                                  href={joinUrl}
                                  style={{
                                    display: 'inline-block',
                                    padding: '12px 28px',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.primaryForeground,
                                    textDecoration: 'none',
                                  }}
                                >
                                  Join the wedding team
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            lineHeight: '20px',
                            color: t.textMuted,
                          }}
                        >
                          {`This link works until ${expiresOn} and only for this email address. If the button doesn't work, copy this link into your browser:`}
                        </p>
                        <p
                          style={{
                            margin: '8px 0 0',
                            fontSize: 13,
                            lineHeight: '20px',
                            wordBreak: 'break-all',
                          }}
                        >
                          <a href={joinUrl} style={{ color: t.primary }}>
                            {joinUrl}
                          </a>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p
                  style={{
                    margin: '20px 0 0',
                    fontFamily: t.bodyFont,
                    fontSize: 12,
                    color: t.textMuted,
                  }}
                >
                  {`You received this because ${inviterName} entered your email on ${APP_NAME}. If you weren't expecting it, you can ignore this email.`}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
