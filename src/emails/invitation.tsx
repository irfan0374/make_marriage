import type { ReactNode } from 'react';
import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// The wedding invitation (PRD INV-6): the couple's card image, their message and a button to the
// family's personal page. Also sent as the "Send test to myself" preview. Same table layout as
// the other emails.

export interface InvitationEmailProps {
  coupleNames: string;
  familyName: string;
  message: string;
  /** The card image; a short-lived signed URL. Omitted when no card is uploaded. */
  imageUrl?: string;
  /** e.g. "Kindly reply by 31 Mar 2028"; omitted without a deadline. */
  deadlineLine?: string;
  buttonUrl: string;
  /** The test send: a note at the top saying this is what guests will get. */
  isTest?: boolean;
}

function Paragraphs({ text }: { text: string }): ReactNode {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== '')
    .map((p, i) => (
      <p
        key={i}
        style={{ margin: '14px 0 0', fontSize: 15, lineHeight: '24px', whiteSpace: 'pre-line' }}
      >
        {p.trim()}
      </p>
    ));
}

export function InvitationEmail({
  coupleNames,
  familyName,
  message,
  imageUrl,
  deadlineLine,
  buttonUrl,
  isTest = false,
}: InvitationEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${coupleNames} invite you to their wedding`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`${coupleNames} invite ${familyName} to their wedding. Please let them know if you can come.`}
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
                {isTest && (
                  <p
                    style={{
                      margin: '0 0 16px',
                      maxWidth: 520,
                      fontFamily: t.bodyFont,
                      fontSize: 13,
                      lineHeight: '20px',
                      color: t.textMuted,
                    }}
                  >
                    This is a test. Your guests will get this email with their own family name and
                    personal link.
                  </p>
                )}
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
                    overflow: 'hidden',
                  }}
                >
                  <tbody>
                    {imageUrl && (
                      <tr>
                        <td>
                          {/* Emails need a plain <img>; next/image doesn't work in email clients. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt={`Wedding invitation from ${coupleNames}`}
                            width={520}
                            style={{ display: 'block', width: '100%', height: 'auto', border: 0 }}
                          />
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td
                        style={{ padding: '32px 32px 36px', fontFamily: t.bodyFont, color: t.text }}
                      >
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
                            fontSize: 28,
                            lineHeight: '36px',
                            color: t.text,
                          }}
                        >
                          {coupleNames}
                        </h1>
                        <Paragraphs text={message} />
                        {deadlineLine && (
                          <p style={{ margin: '18px 0 0', fontSize: 14, color: t.textMuted }}>
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
                                  href={buttonUrl}
                                  style={{
                                    display: 'inline-block',
                                    padding: '12px 28px',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.primaryForeground,
                                    textDecoration: 'none',
                                  }}
                                >
                                  View invitation &amp; reply
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
                  {`Sent by ${APP_NAME} for ${coupleNames}. This link is personal to your family; please don't forward it.`}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
