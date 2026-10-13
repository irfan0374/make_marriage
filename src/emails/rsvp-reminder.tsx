import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// "Please let us know if you can come" (PRD INV-18): a gentle reminder to a family that hasn't
// answered every event, with a way to stop reminders.

export interface RsvpReminderEmailProps {
  coupleNames: string;
  familyName: string;
  /** Events still waiting for an answer, e.g. "Mehendi · 12 Apr 2028". */
  waiting: string[];
  /** e.g. "Kindly reply by 31 Mar 2028"; omitted without a deadline. */
  deadlineLine?: string;
  pageUrl: string;
  /** The family's page, at its "Stop reminders" button. */
  stopUrl: string;
}

export function RsvpReminderEmail({
  coupleNames,
  familyName,
  waiting,
  deadlineLine,
  pageUrl,
  stopUrl,
}: RsvpReminderEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`A reminder from ${coupleNames}`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`${coupleNames} would love to know if you can come.`}
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
                          <span style={{ color: t.gold }}>●</span>&nbsp; {`Dear ${familyName}`}
                        </p>
                        <h1
                          style={{
                            margin: '12px 0 0',
                            fontFamily: t.headingFont,
                            fontWeight: 500,
                            fontSize: 26,
                            lineHeight: '34px',
                          }}
                        >
                          Will you be joining us?
                        </h1>
                        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`${coupleNames} are getting everything ready and would love to know if you can come to:`}
                        </p>
                        {waiting.map((line) => (
                          <p
                            key={line}
                            style={{ margin: '8px 0 0', fontSize: 15, lineHeight: '22px' }}
                          >
                            {line}
                          </p>
                        ))}
                        {deadlineLine && (
                          <p style={{ margin: '16px 0 0', fontSize: 14, color: t.textMuted }}>
                            {deadlineLine}
                          </p>
                        )}
                        <table
                          role="presentation"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ margin: '28px 0 0' }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ backgroundColor: t.primary, borderRadius: 9999 }}>
                                <a
                                  href={pageUrl}
                                  style={{
                                    display: 'inline-block',
                                    padding: '12px 28px',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.primaryForeground,
                                    textDecoration: 'none',
                                  }}
                                >
                                  Reply now
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p
                  style={{
                    margin: '20px 0 0',
                    maxWidth: 520,
                    fontFamily: t.bodyFont,
                    fontSize: 12,
                    lineHeight: '18px',
                    color: t.textMuted,
                  }}
                >
                  {`Sent by ${APP_NAME} for ${coupleNames}. `}
                  <a href={stopUrl} style={{ color: t.textMuted }}>
                    Stop reminder emails
                  </a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
