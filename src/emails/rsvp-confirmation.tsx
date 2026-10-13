import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// "Thanks, we've got your reply" (PRD INV-14), sent after a guest saves replies on their page.

export interface RsvpConfirmationEmailProps {
  coupleNames: string;
  familyName: string;
  /** One line per answered event, e.g. "Mehendi · 12 Apr 2028: Attending (3)". */
  lines: string[];
  /** Events still waiting for an answer. */
  waiting: number;
  pageUrl: string;
}

export function RsvpConfirmationEmail({
  coupleNames,
  familyName,
  lines,
  waiting,
  pageUrl,
}: RsvpConfirmationEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Your reply to ${coupleNames}`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
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
                          <span style={{ color: t.gold }}>●</span>&nbsp; Reply saved
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
                          {`Thank you, ${familyName}`}
                        </h1>
                        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`${coupleNames} have your reply:`}
                        </p>
                        {lines.map((line) => (
                          <p
                            key={line}
                            style={{ margin: '8px 0 0', fontSize: 15, lineHeight: '22px' }}
                          >
                            {line}
                          </p>
                        ))}
                        {waiting > 0 && (
                          <p style={{ margin: '14px 0 0', fontSize: 14, color: t.textMuted }}>
                            {`${waiting} ${waiting === 1 ? 'event is' : 'events are'} still waiting for your answer.`}
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
                                  View or change your reply
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
                    fontFamily: t.bodyFont,
                    fontSize: 12,
                    color: t.textMuted,
                  }}
                >
                  {`Sent by ${APP_NAME} for ${coupleNames}.`}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
