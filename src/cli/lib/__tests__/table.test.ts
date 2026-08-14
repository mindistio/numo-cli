import { describe, it, expect } from 'vitest';
import { renderTable } from '../table';

/** Cell text of one rendered row, borders and padding removed. */
function cells(line: string): string[] {
  return line.split(/[|│]/).slice(1, -1).map((c) => c.trim());
}

const bodyLines = (table: string) => table.split('\n').filter((l) => /[|│]/.test(l));

describe('renderTable', () => {
  it('says so when there is nothing to show, rather than drawing an empty frame', () => {
    expect(renderTable(['ID'], [])).toContain('(no results)');
    expect(renderTable(['ID'], [], 'no tasks today')).toContain('no tasks today');
  });

  it('keeps every cell in the column it belongs to', () => {
    const table = renderTable(['ID', 'TEXT'], [['t1', 'Buy milk'], ['t2', 'Pay rent']]);

    expect(bodyLines(table).map(cells)).toEqual([
      ['ID', 'TEXT'],
      ['t1', 'Buy milk'],
      ['t2', 'Pay rent'],
    ]);
  });

  // Contract: a column is as wide as its widest cell, header included. Sizing on the
  // header alone is the version that looks right until real data arrives.
  it('sizes a column to its widest cell, whichever row that is in', () => {
    const table = renderTable(['ID'], [['short'], ['a much longer value']]);
    const widths = bodyLines(table).map((l) => l.length);

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeGreaterThan('a much longer value'.length);
  });

});
