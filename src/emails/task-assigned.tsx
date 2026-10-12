import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// "Riya assigned you a task" (PRD TASK-5). Same plain table layout as the member invite.

export interface TaskAssignedEmailProps {
  assignerName: string;
  coupleNames: string;
  title: string;
  /** e.g. "Due 14 Aug 2027"; omitted when the task has no due date. */
  dueLine?: string;
  /** e.g. "For the Sangeet"; omitted when the task has no event. */
  eventLine?: string;
  tasksUrl: string;
}

export function TaskAssignedEmail({
  assignerName,
  coupleNames,
  title,
  dueLine,
  eventLine,
  tasksUrl,
}: TaskAssignedEmailProps) {
  const details = [dueLine, eventLine].filter(Boolean).join(' · ');
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`New task: ${title}`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`${assignerName} assigned you a task for ${coupleNames}'s wedding.`}
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
                          <span style={{ color: t.gold }}>●</span>&nbsp; A task for you
                        </p>
                        <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`${assignerName} assigned you a task for ${coupleNames}'s wedding:`}
                        </p>
                        <h1
                          style={{
                            margin: '12px 0 0',
                            fontFamily: t.headingFont,
                            fontWeight: 500,
                            fontSize: 26,
                            lineHeight: '34px',
                            color: t.text,
                          }}
                        >
                          {title}
                        </h1>
                        {details && (
                          <p
                            style={{
                              margin: '8px 0 0',
                              fontSize: 14,
                              lineHeight: '22px',
                              color: t.textMuted,
                            }}
                          >
                            {details}
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
                                  href={tasksUrl}
                                  style={{
                                    display: 'inline-block',
                                    padding: '12px 28px',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.primaryForeground,
                                    textDecoration: 'none',
                                  }}
                                >
                                  See your tasks
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
                  {`Sent by ${APP_NAME} because you're on ${coupleNames}'s wedding team.`}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
