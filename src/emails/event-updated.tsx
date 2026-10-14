import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// "The details for Mehendi have changed" (PRD NOTIF-1, api-spec §10.8): the event's latest date,
// time and place, sent when the couple chooses to tell invited families.

export interface EventUpdatedEmailProps {
  coupleNames: string;
  familyName: string;
  eventName: string;
  /** e.g. "Friday, 12 Apr 2028 · 4:00 PM onwards". */
  whenLine: string;
  /** Venue and address; omitted when neither is set. */
  whereLine?: string;
  mapUrl?: string;
  pageUrl: string;
}

export function EventUpdatedEmail({
  coupleNames,
  familyName,
  eventName,
  whenLine,
  whereLine,
  mapUrl,
  pageUrl,
}: EventUpdatedEmailProps) {
  const detail = { margin: '8px 0 0', fontSize: 15, lineHeight: '22px' } as const;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Update: ${eventName}`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`The details for ${eventName} have changed. Here are the latest.`}
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
                          {`${eventName}: updated details`}
                        </h1>
                        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`${coupleNames} have changed the details for ${eventName}. Here are the latest:`}
                        </p>
                        <p style={{ ...detail, fontWeight: 600 }}>{whenLine}</p>
                        {whereLine && <p style={detail}>{whereLine}</p>}
                        {mapUrl && (
                          <p style={detail}>
                            <a href={mapUrl} style={{ color: t.primary }}>
                              Open in Google Maps
                            </a>
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
                                  See your invitation
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
