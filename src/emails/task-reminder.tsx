import { APP_NAME } from '@/config/app';
import { emailTheme as t } from './theme';

// The morning task reminder (PRD NOTIF-4): one email a day listing a person's open tasks that
// are overdue, due today or due tomorrow. Same table layout as the other emails.

export interface TaskReminderLine {
  title: string;
  /** e.g. "High priority · For the Sangeet"; omitted when there's nothing to add. */
  detail?: string;
}

export interface TaskReminderEmailProps {
  name: string;
  coupleNames: string;
  overdue: TaskReminderLine[];
  today: TaskReminderLine[];
  tomorrow: TaskReminderLine[];
  tasksUrl: string;
}

function Group({ title, lines }: { title: string; lines: TaskReminderLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <p
        style={{
          margin: '22px 0 0',
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: t.textMuted,
        }}
      >
        {title}
      </p>
      {lines.map((line, i) => (
        <p key={i} style={{ margin: '8px 0 0', fontSize: 15, lineHeight: '22px' }}>
          <strong>{line.title}</strong>
          {line.detail && <span style={{ color: t.textMuted }}>{` · ${line.detail}`}</span>}
        </p>
      ))}
    </>
  );
}

export function TaskReminderEmail({
  name,
  coupleNames,
  overdue,
  today,
  tomorrow,
  tasksUrl,
}: TaskReminderEmailProps) {
  const count = overdue.length + today.length + tomorrow.length;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Your tasks for ${coupleNames}'s wedding`}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: t.background }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {`${count} ${count === 1 ? 'task needs' : 'tasks need'} your attention for ${coupleNames}'s wedding.`}
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
                          <span style={{ color: t.gold }}>●</span>&nbsp; Task reminder
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
                          {`Good morning, ${name}`}
                        </h1>
                        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '24px' }}>
                          {`Here's what's coming up for ${coupleNames}'s wedding:`}
                        </p>
                        <Group title="Overdue" lines={overdue} />
                        <Group title="Due today" lines={today} />
                        <Group title="Due tomorrow" lines={tomorrow} />
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
