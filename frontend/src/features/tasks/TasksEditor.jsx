import React, { useEffect, useMemo, useState } from 'react';
import { fetchTasksFile, updateTasksFile } from '../../services/api';

const statusOptions = ['in-progress', 'completed', 'postponed', 'blocked', 'leave', 'weekoff'];
const PUBLISH_PASSWORD = '3232';
const footnotesTemplate = `Footnotes
- Leave reason: Paternity leave, Sick leave, etc.
- Status: completed, in-progress, postponed, blocked, leave, weekoff`;
const TODO_HEADER_REGEX = /^\s*#?\s*TODO\b.*$/i;
const TODO_DATE_REGEX = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;

const parseTodoDate = (headerLine) => {
  const match = headerLine.match(TODO_DATE_REGEX);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isTodoHeader = (line) => TODO_HEADER_REGEX.test(line) && TODO_DATE_REGEX.test(line);
const dateKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const todayKey = () => dateKey(new Date());
const toDayTime = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const toHeaderDate = (date) => `${`${date.getDate()}`.padStart(2, '0')}/${`${date.getMonth() + 1}`.padStart(2, '0')}/${date.getFullYear()}`;
const toInputDate = (date) => `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
const createBlockId = () => `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizeTaskKey = (task) => (task || '').trim().toLowerCase().replace(/\s+/g, ' ');
const CARRY_FORWARD_REMARK = 'working on other priority tasks as per requirement';
const atMidnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const countCheckboxes = (markdown) => {
  const total = (markdown.match(/\[[xX ]\]/g) || []).length;
  const done = (markdown.match(/\[[xX]\]/g) || []).length;
  return { total, done, inProgress: Math.max(0, total - done) };
};

const splitTodoSections = (markdown) => {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;
  const flushCurrent = () => {
    if (!current) return;
    current.content = current.lines.join('\n').trimEnd();
    sections.push(current);
    current = null;
  };

  lines.forEach((line) => {
    if (isTodoHeader(line)) {
      flushCurrent();
      const parsedDate = parseTodoDate(line);
      current = {
        header: line,
        parsedDate,
        key: parsedDate ? dateKey(parsedDate) : null,
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    }
  });

  flushCurrent();
  return sections;
};

const parseRows = (sectionContent) => {
  const rows = [];
  sectionContent.split('\n').forEach((line) => {
    if (!line.trim().startsWith('|')) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 6) return;
    const [_, doneCell, taskCell, statusCell, remarkCell] = parts;
    if (!taskCell || taskCell.toLowerCase() === 'task' || taskCell === '---') return;
    if (statusCell === '---') return;
    rows.push({
      done: doneCell.toLowerCase().includes('[x]'),
      task: taskCell,
      status: statusCell || 'in-progress',
      remark: remarkCell || '',
    });
  });
  return rows;
};

const toBlock = (section) => {
  const lines = section.content.split('\n');
  const headerLine = lines.find((line) => isTodoHeader(line)) || section.header || `# TODO -----${toHeaderDate(new Date())}`;
  const dayNoteLine = lines.find((line) => line.trim().toLowerCase().startsWith('**day note:**')) || '';
  return {
    id: createBlockId(),
    dateKey: section.key,
    parsedDate: section.parsedDate || parseTodoDate(headerLine) || new Date(),
    headerLine,
    dayNoteLine,
    rows: parseRows(section.content),
  };
};

const blockToMarkdown = (block) => {
  const out = [`# TODO -----${toHeaderDate(block.parsedDate)}`];
  if (block.dayNoteLine?.trim()) out.push(block.dayNoteLine.trim());
  out.push('');
  out.push('| Done | Task | Status | Remark |');
  out.push('| --- | --- | --- | --- |');
  block.rows.forEach((row) => {
    out.push(`| ${row.done ? '[x]' : '[ ]'} | ${row.task || 'New task'} | ${row.status || 'in-progress'} | ${row.remark || ''} |`);
  });
  return out.join('\n').trim();
};

const buildTodaySectionTemplate = () => `# TODO -----${toHeaderDate(new Date())}

| Done | Task | Status | Remark |
| --- | --- | --- | --- |
| [ ] | New task (office) | in-progress | |`;

const buildFocusedEditorView = (fullMarkdown) => {
  const sections = splitTodoSections(fullMarkdown);
  if (!sections.length) {
    return { editorContent: buildTodaySectionTemplate(), editableKeys: [] };
  }
  const today = new Date();
  const tKey = todayKey();
  const todayTime = toDayTime(today);
  let latestPreviousWithTasks = null;
  let latestPreviousAny = null;
  let todaySection = null;

  sections.forEach((sec) => {
    if (!sec.parsedDate) return;
    const secTime = toDayTime(sec.parsedDate);
    if (sec.key === tKey) todaySection = sec;
    if (secTime < todayTime && (!latestPreviousAny || secTime > toDayTime(latestPreviousAny.parsedDate))) {
      latestPreviousAny = sec;
    }
    const n = sec.content.toLowerCase();
    const hasTask = n.includes('|') && (n.includes('| in-progress |') || n.includes('| completed |') || n.includes('| postponed |') || n.includes('| blocked |'));
    if (secTime < todayTime && hasTask && (!latestPreviousWithTasks || secTime > toDayTime(latestPreviousWithTasks.parsedDate))) {
      latestPreviousWithTasks = sec;
    }
  });

  const anchor = latestPreviousWithTasks || latestPreviousAny;
  const chunks = [];
  const keys = new Set();
  const inProgressSectionKeys = new Set();

  // Always include sections that still have in-progress work
  // so no active tasks are missed due to date-window focus.
  sections.forEach((sec) => {
    if (!sec.key) return;
    const n = sec.content.toLowerCase();
    if (n.includes('| in-progress |')) {
      inProgressSectionKeys.add(sec.key);
    }
  });

  if (anchor?.parsedDate) {
    const anchorTime = toDayTime(anchor.parsedDate);
    sections.forEach((sec) => {
      if (!sec.parsedDate) return;
      const secTime = toDayTime(sec.parsedDate);
      const shouldIncludeByDateWindow = secTime >= anchorTime && secTime <= todayTime;
      const shouldIncludeByInProgress = sec.key && inProgressSectionKeys.has(sec.key);
      if (shouldIncludeByDateWindow || shouldIncludeByInProgress) {
        chunks.push(sec.content);
        if (sec.key) keys.add(sec.key);
      }
    });
  }
  if (!todaySection) {
    chunks.push(buildTodaySectionTemplate());
    keys.add(tKey);
  }
  return { editorContent: chunks.join('\n\n'), editableKeys: Array.from(keys) };
};

const injectMissingDateBlocks = (sectionBlocks, sourceMarkdown) => {
  if (!sectionBlocks.length) return sectionBlocks;

  // Determine latest date from source markdown only (actual file content),
  // not from any auto-created "today" editor template block.
  const sourceSections = splitTodoSections(sourceMarkdown || '');
  const sourceDates = sourceSections
    .map((s) => s.parsedDate)
    .filter(Boolean)
    .map((d) => atMidnight(d));
  if (!sourceDates.length) return sectionBlocks;
  const latestDate = sourceDates.sort((a, b) => a.getTime() - b.getTime())[sourceDates.length - 1];
  const todayDate = atMidnight(new Date());
  if (latestDate.getTime() >= todayDate.getTime()) return sectionBlocks;

  const existingKeys = new Set(sectionBlocks.map((b) => b.dateKey));
  const added = [];
  for (
    let cursor = new Date(latestDate.getFullYear(), latestDate.getMonth(), latestDate.getDate() + 1);
    cursor.getTime() < todayDate.getTime();
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  ) {
    const key = dateKey(cursor);
    if (existingKeys.has(key)) continue;
    added.push({
      id: createBlockId(),
      dateKey: key,
      parsedDate: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      headerLine: `# TODO -----${toHeaderDate(cursor)}`,
      dayNoteLine: '',
      rows: [{ done: false, task: 'New task (office)', status: 'in-progress', remark: '' }],
    });
  }
  if (!added.length) return sectionBlocks;
  return [...sectionBlocks, ...added];
};

const mergeFocusedEditsIntoFullContent = (fullContent, editorContent, editableKeys) => {
  if (!editableKeys.length) return fullContent || editorContent;
  const fullSections = splitTodoSections(fullContent);
  const editedSections = splitTodoSections(editorContent);
  const editedByKey = new Map();
  editedSections.forEach((sec) => { if (sec.key) editedByKey.set(sec.key, sec.content); });
  const editableSet = new Set(editableKeys);
  const used = new Set();
  const ordered = [];

  fullSections.forEach((sec) => {
    if (sec.key && editableSet.has(sec.key)) {
      const updated = editedByKey.get(sec.key);
      if (updated) {
        ordered.push(updated);
        used.add(sec.key);
      }
    } else {
      ordered.push(sec.content);
    }
  });

  editedSections.forEach((sec) => {
    if (!sec.key || used.has(sec.key) || !editableSet.has(sec.key)) return;
    ordered.push(sec.content);
    used.add(sec.key);
  });

  return ordered.filter(Boolean).join('\n\n').trim() + '\n';
};

const applyTaskWorkflowRules = (markdown) => {
  const sections = splitTodoSections(markdown).map(toBlock);
  if (!sections.length) return markdown;

  // Ensure checkbox matches status everywhere first.
  sections.forEach((section) => {
    section.rows = section.rows.map((row) => ({
      ...row,
      done: row.status === 'completed',
    }));
  });

  // Feature 1/2 work only on active task statuses, excluding leave/weekoff rows.
  const taskRows = [];
  sections.forEach((section, sectionIdx) => {
    const sectionTime = toDayTime(section.parsedDate);
    section.rows.forEach((row, rowIdx) => {
      if (['leave', 'weekoff'].includes(row.status)) return;
      taskRows.push({
        sectionIdx,
        rowIdx,
        sectionTime,
        dateStr: toHeaderDate(section.parsedDate),
        key: normalizeTaskKey(row.task),
        row,
      });
    });
  });

  const byTask = new Map();
  taskRows.forEach((entry) => {
    if (!entry.key) return;
    if (!byTask.has(entry.key)) byTask.set(entry.key, []);
    byTask.get(entry.key).push(entry);
  });

  // Feature 2: if same task is completed later, convert earlier in-progress to postponed with completion trace.
  byTask.forEach((entries) => {
    const completedEntries = entries
      .filter((e) => e.row.status === 'completed')
      .sort((a, b) => a.sectionTime - b.sectionTime || a.sectionIdx - b.sectionIdx || a.rowIdx - b.rowIdx);

    if (!completedEntries.length) return;

    entries.forEach((entry) => {
      if (entry.row.status !== 'in-progress') return;
      const laterCompletion = completedEntries.find((c) => c.sectionTime > entry.sectionTime);
      if (!laterCompletion) return;
      const completionNote = `carry forwarded to next day; completed on ${laterCompletion.dateStr}`;
      const existingRemark = (entry.row.remark || '').trim();
      entry.row.status = 'postponed';
      entry.row.done = false;
      if (!existingRemark) {
        entry.row.remark = completionNote;
      } else if (!existingRemark.toLowerCase().includes(`completed on ${laterCompletion.dateStr.toLowerCase()}`)) {
        entry.row.remark = `${existingRemark}; ${completionNote}`;
      }
    });
  });

  // Feature 1: single active in-progress per task (latest only).
  byTask.forEach((entries) => {
    const inProgressEntries = entries
      .filter((e) => e.row.status === 'in-progress')
      .sort((a, b) => a.sectionTime - b.sectionTime || a.sectionIdx - b.sectionIdx || a.rowIdx - b.rowIdx);
    if (inProgressEntries.length <= 1) return;
    const latest = inProgressEntries[inProgressEntries.length - 1];
    inProgressEntries.forEach((entry) => {
      if (entry === latest) return;
      entry.row.status = 'postponed';
      entry.row.done = false;
      if (!(entry.row.remark || '').trim()) {
        entry.row.remark = CARRY_FORWARD_REMARK;
      }
    });
  });

  // Final checkbox/status sync pass.
  sections.forEach((section) => {
    section.rows = section.rows.map((row) => ({
      ...row,
      done: row.status === 'completed',
    }));
  });

  return sections.map(blockToMarkdown).join('\n\n').trim() + '\n';
};

const TasksEditor = () => {
  const [blocks, setBlocks] = useState([]);
  const [fullContent, setFullContent] = useState('');
  const [editableKeys, setEditableKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pathInfo, setPathInfo] = useState('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchTasksFile();
        const source = data.content || '';
        setFullContent(source);
        const focused = buildFocusedEditorView(source);
        const sectionBlocks = splitTodoSections(focused.editorContent).map(toBlock);
        const enrichedBlocks = injectMissingDateBlocks(sectionBlocks, source);
        setBlocks(enrichedBlocks);
        const allEditableKeys = [
          ...new Set([
            ...focused.editableKeys,
            ...enrichedBlocks.map((b) => b.dateKey).filter(Boolean),
          ]),
        ];
        setEditableKeys(allEditableKeys);
        setPathInfo(`${data.path} @ ${data.branch}`);
      } catch (err) {
        setError(err.message || 'Failed to load tasks file.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const editorContent = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => toDayTime(a.parsedDate) - toDayTime(b.parsedDate));
    return sorted.map(blockToMarkdown).join('\n\n').trim();
  }, [blocks]);
  const metrics = useMemo(() => countCheckboxes(editorContent), [editorContent]);
  const todayMidnight = toDayTime(new Date());
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => toDayTime(a.parsedDate) - toDayTime(b.parsedDate)),
    [blocks],
  );
  const historyBlocks = useMemo(
    () => [...sortedBlocks.filter((b) => toDayTime(b.parsedDate) < todayMidnight)]
      .sort((a, b) => toDayTime(b.parsedDate) - toDayTime(a.parsedDate)),
    [sortedBlocks, todayMidnight],
  );
  const todayAndFutureBlocks = sortedBlocks.filter((b) => toDayTime(b.parsedDate) >= todayMidnight);

  const updateBlock = (id, updater) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? updater(b) : b)));
  };

  const addRow = (id) => updateBlock(id, (b) => ({ ...b, rows: [...b.rows, { done: false, task: 'New task', status: 'in-progress', remark: '' }] }));
  const duplicateRow = (id, idx) => updateBlock(id, (b) => {
    const row = b.rows[idx];
    if (!row) return b;
    const rows = [...b.rows];
    rows.splice(idx + 1, 0, { ...row });
    return { ...b, rows };
  });
  const deleteRow = (id, idx) => updateBlock(id, (b) => ({ ...b, rows: b.rows.filter((_, i) => i !== idx) }));
  const updateRow = (id, idx, field, value) => updateBlock(id, (b) => ({
    ...b,
    rows: b.rows.map((r, i) => {
      if (i !== idx) return r;

      // Keep checkbox/status in sync:
      // - status -> completed means done checked
      // - done checked means status completed
      // - done unchecked from completed falls back to in-progress
      if (field === 'status') {
        const nextStatus = value;
        return {
          ...r,
          status: nextStatus,
          done: nextStatus === 'completed' ? true : r.done,
        };
      }

      if (field === 'done') {
        const nextDone = Boolean(value);
        return {
          ...r,
          done: nextDone,
          status: nextDone ? 'completed' : (r.status === 'completed' ? 'in-progress' : r.status),
        };
      }

      return { ...r, [field]: value };
    }),
  }));
  const copyRowToToday = (id, idx) => {
    const tKey = todayKey();
    const tDate = new Date();
    setBlocks((prev) => {
      const source = prev.find((b) => b.id === id);
      const row = source?.rows?.[idx];
      if (!source || !row) return prev;
      if (['completed', 'leave', 'weekoff'].includes(row.status)) return prev;

      const next = [...prev];

      const todayIdx = next.findIndex((b) => b.dateKey === tKey);
      if (todayIdx >= 0) {
        const todayBlock = next[todayIdx];
        next[todayIdx] = { ...todayBlock, rows: [...todayBlock.rows, { ...row }] };
        return next;
      }

      const todayBlock = {
        id: createBlockId(),
        headerLine: `# TODO -----${toHeaderDate(tDate)}`,
        parsedDate: new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate()),
        dateKey: tKey,
        dayNoteLine: '',
        rows: [{ ...row }],
        rawLines: [],
      };
      return [...next, todayBlock];
    });
    setEditableKeys((prev) => [...new Set([...prev, tKey])]);
    setStatus('Row copied to today block.');
    setError('');
  };

  const changeDate = (id, value) => {
    if (!value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    const newKey = dateKey(parsed);
    if (blocks.some((b) => b.id !== id && dateKey(b.parsedDate) === newKey)) {
      setError('A block for this date already exists.');
      return;
    }
    setError('');
    updateBlock(id, (b) => ({ ...b, parsedDate: parsed, dateKey: newKey, headerLine: `# TODO -----${toHeaderDate(parsed)}` }));
    setEditableKeys((prev) => {
      const withoutDup = prev.filter((k) => k !== newKey);
      const old = blocks.find((b) => b.id === id)?.dateKey;
      return withoutDup.map((k) => (k === old ? newKey : k));
    });
  };

  const insertTodayBlock = () => {
    const section = toBlock(splitTodoSections(buildTodaySectionTemplate())[0]);
    setBlocks((prev) => [...prev, section]);
    setEditableKeys((prev) => [...new Set([...prev, section.dateKey])]);
  };
  const addLeaveDay = () => {
    const section = toBlock(splitTodoSections(buildTodaySectionTemplate())[0]);
    section.dayNoteLine = '**Day Note:** Leave';
    section.rows = [{ done: false, task: 'Leave', status: 'leave', remark: 'Sick leave' }];
    setBlocks((prev) => [...prev, section]);
    setEditableKeys((prev) => [...new Set([...prev, section.dateKey])]);
  };
  const addWeekoffDay = () => {
    const section = toBlock(splitTodoSections(buildTodaySectionTemplate())[0]);
    section.dayNoteLine = '**Day Note:** Week Off';
    section.rows = [{ done: false, task: 'Week Off', status: 'weekoff', remark: 'Weekend' }];
    setBlocks((prev) => [...prev, section]);
    setEditableKeys((prev) => [...new Set([...prev, section.dateKey])]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const mergedContent = mergeFocusedEditsIntoFullContent(fullContent, editorContent, editableKeys);
      const finalContent = applyTaskWorkflowRules(mergedContent);
      const result = await updateTasksFile({
        content: finalContent,
        message: `chore(tasks): update daily tasks ${new Date().toISOString().slice(0, 10)}`,
      });
      setFullContent(finalContent);
      setStatus(result.mode === 'local'
        ? 'Saved locally. Static page is updated in local markdown source.'
        : `Saved and pushed. Commit: ${result.commit_sha?.slice(0, 7) || 'created'}`);
    } catch (err) {
      setError(err.message || 'Failed to save tasks file.');
    } finally {
      setIsSaving(false);
    }
  };

  const openPasswordModal = () => {
    setPasswordInput('');
    setShowPassword(false);
    setPasswordError('');
    setIsPasswordModalOpen(true);
  };
  const closePasswordModal = () => { if (!isSaving) setIsPasswordModalOpen(false); };
  const handlePasswordConfirm = async () => {
    if (passwordInput !== PUBLISH_PASSWORD) {
      setPasswordError('Invalid password.');
      return;
    }
    setIsPasswordModalOpen(false);
    await handleSave();
  };

  const copyFootnotes = async () => {
    try {
      await navigator.clipboard.writeText(footnotesTemplate);
      setStatus('Footnotes copied. Paste into your daily notes if needed.');
    } catch {
      setError('Unable to copy footnotes. Please copy manually from the box below.');
    }
  };

  return (
    <section className="tasks-shell">
      <header className="tasks-topbar">
        <div className="tasks-title-wrap">
          <h2>Daily Tasks Editor</h2>
          <p>Blocks are table-form and save as markdown.</p>
          {pathInfo && <span className="tasks-path">{pathInfo}</span>}
        </div>
        <div className="tasks-actions">
          <button type="button" className="tasks-btn ghost" onClick={insertTodayBlock} disabled={isLoading || isSaving}>+ Today Block</button>
          <button type="button" className="tasks-btn ghost" onClick={addLeaveDay} disabled={isLoading || isSaving}>+ Leave Day</button>
          <button type="button" className="tasks-btn ghost" onClick={addWeekoffDay} disabled={isLoading || isSaving}>+ Weekoff Day</button>
          <button type="button" className="tasks-btn" onClick={openPasswordModal} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving...' : 'Save & Publish'}
          </button>
        </div>
      </header>

      <div className="tasks-metrics">
        <div><strong>{metrics.total}</strong><span>Total</span></div>
        <div><strong>{metrics.done}</strong><span>Done</span></div>
        <div><strong>{metrics.inProgress}</strong><span>In-Progress</span></div>
      </div>

      {status && <p className="tasks-status ok">{status}</p>}
      {error && <p className="tasks-status err">{error}</p>}

      <div className="tasks-editing-area">
        {isLoading ? (
          <div className="tasks-panel"><p className="tasks-loading">Loading tasks markdown...</p></div>
        ) : (
          <div className="tasks-editor-split">
            {todayAndFutureBlocks.length > 0 && (
              <div className="tasks-section-label">Today / Upcoming</div>
            )}
            {todayAndFutureBlocks.map((block) => {
              const hasRows = block.rows.length > 0;
              const allRowsLeaveOrWeekoff = hasRows && block.rows.every((row) => row.status === 'leave' || row.status === 'weekoff');
              return (
                <div key={block.id} className="tasks-panel tasks-panel-today">
                  <div className="tasks-panel-head">
                    <span>Task Block</span>
                    <small>Auto markdown output</small>
                  </div>
                  <div className="tasks-form-table-wrap">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: '#9fb2cc', fontSize: '0.85rem' }}>Date</span>
                      <input type="date" value={toInputDate(block.parsedDate)} onChange={(e) => changeDate(block.id, e.target.value)} />
                    </label>
                    <table className="tasks-form-table">
                      <thead>
                        <tr>
                          <th>Done</th>
                          <th>Task</th>
                          <th>Status</th>
                          <th>Remark</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, idx) => (
                          <tr key={`${block.id}-${idx}`}>
                            <td><input type="checkbox" checked={row.done} onChange={(e) => updateRow(block.id, idx, 'done', e.target.checked)} /></td>
                            <td><input type="text" value={row.task} onChange={(e) => updateRow(block.id, idx, 'task', e.target.value)} /></td>
                            <td>
                              <select value={row.status} onChange={(e) => updateRow(block.id, idx, 'status', e.target.value)}>
                                {statusOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </td>
                            <td><input type="text" value={row.remark} onChange={(e) => updateRow(block.id, idx, 'remark', e.target.value)} /></td>
                            <td className="tasks-row-actions">
                              <button type="button" className="tasks-btn ghost" onClick={() => duplicateRow(block.id, idx)}>Duplicate</button>
                              <button type="button" className="tasks-btn ghost" onClick={() => deleteRow(block.id, idx)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="tasks-btn ghost"
                        onClick={() => addRow(block.id)}
                        disabled={allRowsLeaveOrWeekoff}
                      >
                        {allRowsLeaveOrWeekoff ? 'Rows locked for Leave/Week Off' : '+ Add Row'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {historyBlocks.length > 0 && (
              <div className="tasks-section-label">History</div>
            )}
            {historyBlocks.map((block) => {
              const visibleHistoryRows = block.rows.filter(
                (row) => ['in-progress', 'blocked', 'weekoff', 'leave'].includes(row.status),
              );
              if (!visibleHistoryRows.length) return null;
              return (
                <div key={block.id} className="tasks-panel tasks-panel-history">
                  <div className="tasks-panel-head tasks-panel-head-history">
                    <span>Task Block</span>
                    <small>Previous dated block</small>
                  </div>
                  <div className="tasks-form-table-wrap">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: '#9fb2cc', fontSize: '0.85rem' }}>Date</span>
                      <input type="date" value={toInputDate(block.parsedDate)} onChange={(e) => changeDate(block.id, e.target.value)} />
                    </label>
                    <table className="tasks-form-table">
                      <thead>
                        <tr>
                          <th>Done</th>
                          <th>Task</th>
                          <th>Status</th>
                          <th>Remark</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleHistoryRows.map((row, idx) => (
                          <tr key={`${block.id}-${idx}`}>
                            <td><input type="checkbox" checked={row.done} onChange={(e) => updateRow(block.id, idx, 'done', e.target.checked)} /></td>
                            <td><input type="text" value={row.task} onChange={(e) => updateRow(block.id, idx, 'task', e.target.value)} /></td>
                            <td>
                              <select value={row.status} onChange={(e) => updateRow(block.id, idx, 'status', e.target.value)}>
                                {statusOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </td>
                            <td><input type="text" value={row.remark} onChange={(e) => updateRow(block.id, idx, 'remark', e.target.value)} /></td>
                            <td className="tasks-row-actions">
                              <button
                                type="button"
                                className="tasks-btn ghost"
                                onClick={() => copyRowToToday(block.id, idx)}
                                disabled={['completed', 'leave', 'weekoff'].includes(row.status)}
                                title={['completed', 'leave', 'weekoff'].includes(row.status)
                                  ? 'Completed/Leave/Weekoff rows are not copied to today.'
                                  : 'Copy this task to today block'}
                              >
                                {['completed', 'leave', 'weekoff'].includes(row.status) ? 'Not allowed' : 'Copy to Today'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className="tasks-footnotes">
          <div className="tasks-footnotes-head">
            <strong>Footnotes (Copy/Paste)</strong>
            <button type="button" className="tasks-btn ghost" onClick={copyFootnotes}>Copy</button>
          </div>
          <pre>{footnotesTemplate}</pre>
        </section>
      </div>

      {isPasswordModalOpen && (
        <div className="tasks-modal-backdrop" onClick={closePasswordModal}>
          <div className="tasks-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Publish</h3>
            <p>Enter password to Save & Publish changes.</p>
            <div className="tasks-modal-input-row">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Enter password"
                autoFocus
              />
              <button type="button" className="tasks-btn ghost" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {passwordError && <p className="tasks-status err">{passwordError}</p>}
            <div className="tasks-modal-actions">
              <button type="button" className="tasks-btn ghost" onClick={closePasswordModal} disabled={isSaving}>Cancel</button>
              <button type="button" className="tasks-btn" onClick={handlePasswordConfirm} disabled={isSaving}>
                {isSaving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TasksEditor;
