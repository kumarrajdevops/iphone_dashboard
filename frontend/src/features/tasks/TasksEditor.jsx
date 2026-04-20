import React, { useEffect, useMemo, useState } from 'react';
import { fetchTasksFile, updateTasksFile } from '../../services/api';

const starterTemplate = `# TODO -----20/04/2026

| Done | Task | Status | Remark |
| --- | --- | --- | --- |
| [ ] | First office task (office) | in-progress | morning plan |
| [x] | Learning task (learning) | completed | completed and documented |
| [ ] | Personal follow-up (personal) | in-progress | to do by EOD |
`;

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
    return { editorContent: `${starterTemplate}\n\n${buildTodaySectionTemplate()}`, editableKeys: [] };
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
  if (anchor?.parsedDate) {
    const anchorTime = toDayTime(anchor.parsedDate);
    sections.forEach((sec) => {
      if (!sec.parsedDate) return;
      const secTime = toDayTime(sec.parsedDate);
      if (secTime >= anchorTime && secTime <= todayTime) {
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
        const source = data.content || starterTemplate;
        setFullContent(source);
        const focused = buildFocusedEditorView(source);
        const sectionBlocks = splitTodoSections(focused.editorContent).map(toBlock);
        setBlocks(sectionBlocks);
        setEditableKeys(focused.editableKeys);
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
  const historyBlocks = sortedBlocks.filter((b) => toDayTime(b.parsedDate) < todayMidnight);
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
    rows: b.rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
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
      const finalContent = mergeFocusedEditsIntoFullContent(fullContent, editorContent, editableKeys);
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
