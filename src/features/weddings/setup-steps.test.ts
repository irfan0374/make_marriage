import { describe, expect, it } from 'vitest';
import { firstName, greetingFor, setupSteps } from './setup-steps';

describe('setupSteps', () => {
  it('lists the six steps, with only built features linked', () => {
    const steps = setupSteps({ weddingId: 'w1', teamSize: 1, eventCount: 0, guestCount: 0 });
    expect(steps.map((s) => s.title)).toEqual([
      'Add events',
      'Add guests',
      'Upload invitation',
      'Send invitations',
      'Invite your family',
      'Publish website',
    ]);
    expect(steps.filter((s) => s.href).map((s) => s.href)).toEqual([
      '/app/w1/events',
      '/app/w1/guests',
      '/app/w1/team',
    ]);
    expect(steps.some((s) => s.done)).toBe(false);
  });

  it('counts the family step as done once someone has joined', () => {
    const team = setupSteps({ weddingId: 'w1', teamSize: 2, eventCount: 0, guestCount: 0 }).find(
      (s) => s.key === 'team',
    );
    expect(team?.done).toBe(true);
  });

  it('counts guests as done once a family is added', () => {
    const steps = setupSteps({ weddingId: 'w1', teamSize: 1, eventCount: 0, guestCount: 1 });
    expect(steps.find((s) => s.key === 'guests')?.done).toBe(true);
  });

  it('counts events as done once one is added', () => {
    const steps = setupSteps({ weddingId: 'w1', teamSize: 1, eventCount: 1, guestCount: 0 });
    expect(steps.find((s) => s.key === 'events')?.done).toBe(true);
  });
});

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(6)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(16)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good evening');
  });
});

describe('firstName', () => {
  it('uses the first word', () => {
    expect(firstName('  Nafiya Begum ')).toBe('Nafiya');
    expect(firstName('Irfan')).toBe('Irfan');
  });
});
