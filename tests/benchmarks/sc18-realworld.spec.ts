import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  buildReport,
  loadTaskFinishRecordsFromDispatchJsonl,
  renderMarkdown,
  type TaskFinishRecord,
} from '../../scripts/benchmarks/sc18-realworld.js';

describe('sc18-realworld benchmark', () => {
  // T1 — empty input
  it('returns SC-27 FAIL when no task records found', () => {
    const report = buildReport([]);
    expect(report.passingSubstageCount).toBe(0);
    expect(report.sc27Verdict).toBe('FAIL');
    expect(report.substages).toHaveLength(3);
    for (const s of report.substages) {
      expect(s.taskCount).toBe(0);
      expect(s.improvementRatio).toBe(0);
      expect(s.passesThreshold).toBe(false);
    }
  });

  // T2 — single substage with 3 tasks (mixed wallclocks)
  it('computes improvement for a 3-task single-substage fixture (6.1 only)', () => {
    // tasks at [1000, 1100, 1200]: gaps = [100, 100]; durations = [100, 100, 100] = 300
    // wallclockActual = 200; wallclockSerial = 300; improvement = 1 - 200/300 = 1/3 ≈ 33.3%
    const tasks: TaskFinishRecord[] = [
      { taskId: '6.1.1', substage: '6.1', finishTs: 1000 },
      { taskId: '6.1.2', substage: '6.1', finishTs: 1100 },
      { taskId: '6.1.3', substage: '6.1', finishTs: 1200 },
    ];
    const report = buildReport(tasks);
    const s61 = report.substages.find(x => x.substage === '6.1')!;
    expect(s61.taskCount).toBe(3);
    expect(s61.wallclockActualMs).toBe(200);
    expect(s61.wallclockSerialBaselineMs).toBe(300); // 100 + 100 + 100
    expect(s61.improvementRatio).toBeCloseTo(1 / 3, 3); // 33.3%
    expect(s61.passesThreshold).toBe(false);
    // 6.2 and 6.3 are absent → taskCount=0, passesThreshold=false
    const s62 = report.substages.find(x => x.substage === '6.2')!;
    const s63 = report.substages.find(x => x.substage === '6.3')!;
    expect(s62.taskCount).toBe(0);
    expect(s62.passesThreshold).toBe(false);
    expect(s63.taskCount).toBe(0);
    expect(s63.passesThreshold).toBe(false);
    expect(report.passingSubstageCount).toBe(0);
  });

  // T3 — 3-substage rollup with mixed wallclocks (passes threshold on 2)
  it('emits SC_27 PASS when 2-of-3 substages clear ≥35% threshold', () => {
    // 6.1: tasks [0, 1000, 1100, 1200]
    //   gaps = [1000, 100, 100]; durations = [1000, 1000, 100, 100] = 2200
    //   wallclockActual = 1200; improvement = 1 - 1200/2200 = 1000/2200 ≈ 45.5% (PASS)
    //
    // 6.2: tasks [0, 800, 900, 1000]
    //   gaps = [800, 100, 100]; durations = [800, 800, 100, 100] = 1800
    //   wallclockActual = 1000; improvement = 1 - 1000/1800 = 800/1800 ≈ 44.4% (PASS)
    //
    // 6.3: tasks [0, 300, 600, 900]
    //   gaps = [300, 300, 300]; durations = [300, 300, 300, 300] = 1200
    //   wallclockActual = 900; improvement = 1 - 900/1200 = 300/1200 = 25% (FAIL)
    const tasks: TaskFinishRecord[] = [
      // 6.1: improvement ≈ 45.5%
      { taskId: '6.1.1', substage: '6.1', finishTs: 0 },
      { taskId: '6.1.2', substage: '6.1', finishTs: 1000 },
      { taskId: '6.1.3', substage: '6.1', finishTs: 1100 },
      { taskId: '6.1.4', substage: '6.1', finishTs: 1200 },
      // 6.2: improvement ≈ 44.4%
      { taskId: '6.2.1', substage: '6.2', finishTs: 0 },
      { taskId: '6.2.2', substage: '6.2', finishTs: 800 },
      { taskId: '6.2.3', substage: '6.2', finishTs: 900 },
      { taskId: '6.2.4', substage: '6.2', finishTs: 1000 },
      // 6.3: improvement = 25% (below threshold)
      { taskId: '6.3.1', substage: '6.3', finishTs: 0 },
      { taskId: '6.3.2', substage: '6.3', finishTs: 300 },
      { taskId: '6.3.3', substage: '6.3', finishTs: 600 },
      { taskId: '6.3.4', substage: '6.3', finishTs: 900 },
    ];
    const report = buildReport(tasks);
    const s61 = report.substages.find(x => x.substage === '6.1')!;
    const s62 = report.substages.find(x => x.substage === '6.2')!;
    const s63 = report.substages.find(x => x.substage === '6.3')!;
    expect(s61.improvementRatio).toBeGreaterThanOrEqual(0.35);
    expect(s62.improvementRatio).toBeGreaterThanOrEqual(0.35);
    expect(s63.improvementRatio).toBeLessThan(0.35);
    expect(report.passingSubstageCount).toBe(2);
    expect(report.sc27Verdict).toBe('PASS');
  });
});

describe('sc18-realworld dispatch.jsonl replay (SC-33)', () => {
  const fixturePath = resolve(__dirname, '__fixtures__', 'dispatch-fixture.jsonl');

  // T4 — fixture replay: loadTaskFinishRecordsFromDispatchJsonl produces correct TaskFinishRecord[]
  it('parses dispatch.jsonl fixture and produces TaskFinishRecord[] with real ts_ms', async () => {
    const records = await loadTaskFinishRecordsFromDispatchJsonl(fixturePath);
    expect(records.length).toBe(2);
    expect(records.find(r => r.taskId.includes('sandwich-architect'))?.finishTs).toBe(1714256214000);
    expect(records.find(r => r.taskId.includes('task-implementer'))?.finishTs).toBe(1714256900000);
  });

  // T5 — renderMarkdown includes dispatch.jsonl methodology when dataSource is set
  it('renderMarkdown includes dispatch.jsonl methodology when dataSource is set', async () => {
    const records = await loadTaskFinishRecordsFromDispatchJsonl(fixturePath);
    const report = buildReport(records, { dataSource: 'dispatch.jsonl' });
    const md = renderMarkdown(report);
    expect(md).toContain('dispatch.jsonl ts_ms');
  });
});
