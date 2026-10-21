import { describe, expect, it } from 'vitest';
import { timeToMinutes } from './NewGoal';

describe('timeToMinutes', () => {
  it.each([['52:30', 52.5], ['1:05:00', 65], ['52', 52], ['52.30', 52.5], ['52,30', 52.5], ['52m30', 52.5], ['1h05', 65], ['1 h 05', 65], ['1h', 60], ['25:00', 25]])('%s', (s, min) => {
    expect(timeToMinutes(s)).toBeCloseTo(min, 5);
  });
  it.each(['', 'abc', '0', '-5:00', '1:2:3:4'])('refuse « %s »', (s) => expect(timeToMinutes(s)).toBeNull());
});
